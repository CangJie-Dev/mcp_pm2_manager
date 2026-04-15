/**
 * 共享：index 规则、Zod 入参、拼 DSL、HTTP 调 ES _search。
 * MCP（stdio）与 HTTP API 共用，避免 AI/应用直连 Elasticsearch。
 */
import { z } from "zod";

/** 与业务 index 命名一致的模块名（不含环境与日期） */
export const LOG_MODULES = [
  "smartcloud-modules-wx-jar",
  "smartcloud-modules-train-jar",
  "smartcloud-modules-datacenter-jar",
  "smartcloud-modules-datasupport-jar",
  "smartcloud-modules-pay-jar",
] as const;

export type LogModule = (typeof LOG_MODULES)[number];

/** 与当前 smartcloud 日志索引 `_doc` mapping 对齐的默认 _source */
export const DEFAULT_SOURCE_FIELDS = [
  "@timestamp",
  "level",
  "msg",
  "logger",
  "class",
  "thread",
  "tags",
  "date",
  "@version",
  "fields.jar_name",
  "throttled_time",
  "throttled_time_out",
] as const;

/** query_string 检索字段（mapping 中的 text；msg 略提高权重） */
export const TEXT_QUERY_FIELDS = [
  "msg^2",
  "logger^1.5",
  "class^1.2",
  "thread",
  "tags",
  "date^0.5",
  "fields.jar_name^1",
] as const;

const dateRegex = /^\d{4}\.\d{2}\.\d{2}$/;

export const toolInputSchema = z.object({
  environment: z
    .enum(["production", "test"])
    .default("production")
    .describe("环境：production=生产（index 无前缀）；test=测试（index 前缀 test-）"),
  module: z
    .enum(LOG_MODULES)
    .default("smartcloud-modules-datacenter-jar")
    .describe("模块（index 中间段，不含环境与日期）"),
  date: z
    .string()
    .regex(dateRegex, "日期须为 YYYY.MM.DD，例如 2026.04.10")
    .describe("日志日期后缀，与 index 最后一段一致，例如 2026.04.10"),
  size: z.number().int().min(1).max(1000).default(100).describe("返回条数"),
  minutes: z.number().int().min(1).max(24 * 60).default(15).describe("@timestamp 相对时间窗口（分钟），从当前往前"),
  level: z
    .string()
    .optional()
    .describe("可选：按日志级别过滤（term level.keyword，常见于 logback/json 日志）"),
  textQuery: z
    .string()
    .optional()
    .describe(
      "可选：全文检索（query_string，默认匹配 msg、logger、class、thread、tags、date、fields.jar_name，与当前索引 mapping 一致）"
    ),
  sourceFields: z
    .array(z.string())
    .default([...DEFAULT_SOURCE_FIELDS])
    .describe("返回的 _source 字段列表"),
});

export type EsLogSearchInput = z.infer<typeof toolInputSchema>;

/** 与索引 `_doc.properties` 一致，供 AI/应用理解与 GET /v1/meta 展示 */
export const ELK_LOG_FIELD_HINTS = {
  "@timestamp": "date；时间范围与排序字段",
  "@version": "text（含 .keyword）；事件版本号类信息",
  class: "text（含 .keyword）；类名相关",
  date: "text（含 .keyword）；日志中的日期字符串（与 @timestamp 不同）",
  "fields.jar_name": "text（含 .keyword）；jar 名，位于对象 fields 下",
  level: "text（含 .keyword）；日志级别；过滤使用 level.keyword",
  logger: "text（含 .keyword）；Logger 名称",
  msg: "text（含 .keyword）；日志正文",
  tags: "text（含 .keyword）；标签",
  thread: "text（含 .keyword）；线程名",
  throttled_time: "float",
  throttled_time_out: "boolean",
} as const;

export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export function buildIndexName(environment: "production" | "test", module: LogModule, date: string): string {
  const envPrefix = environment === "test" ? "test-" : "";
  return `${envPrefix}${module}-${date.trim()}`;
}

export function buildEsSearchBody(args: EsLogSearchInput) {
  const filters: object[] = [{ range: { "@timestamp": { gte: `now-${args.minutes}m`, lte: "now" } } }];

  const lv = args.level?.trim();
  if (lv) {
    filters.push({ term: { "level.keyword": lv } });
  }

  const bool: Record<string, unknown> = { filter: filters };

  const q = args.textQuery?.trim();
  if (q) {
    bool.must = [
      {
        query_string: {
          query: q,
          fields: [...TEXT_QUERY_FIELDS],
          default_operator: "and",
        },
      },
    ];
  }

  return {
    size: args.size,
    _source: args.sourceFields,
    query: { bool },
    sort: [{ "@timestamp": "desc" }],
  };
}

/** 对 ES 执行 `_search`：原生 HTTP POST（fetch），无 curl/子进程依赖。 */
export async function esSearch(baseUrl: string, index: string, body: unknown) {
  const url = `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(index)}/_search`;

  const username = getEnv("ES_USERNAME");
  const password = getEnv("ES_PASSWORD");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (username && password) {
    const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    headers.authorization = `Basic ${token}`;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ES 请求失败：HTTP ${resp.status} ${resp.statusText}${text ? `; body=${text}` : ""}`);
  }
  return (await resp.json()) as any;
}

export function mapHits(esJson: any) {
  const hits = esJson?.hits?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h: any) => ({
    _id: h?._id,
    _index: h?._index,
    _score: h?._score,
    _source: h?._source,
  }));
}

export async function runEsLogSearch(args: EsLogSearchInput) {
  const baseUrl = getEnv("ES_BASE_URL") ?? "http://127.0.0.1:9200";
  const index = buildIndexName(args.environment, args.module, args.date);
  const body = buildEsSearchBody(args);

  const esJson = await esSearch(baseUrl, index, body);
  const hits = mapHits(esJson);
  const total = esJson?.hits?.total;

  return {
    index,
    took: esJson?.took,
    total: typeof total === "object" && total?.value != null ? total.value : total,
    size: args.size,
    minutes: args.minutes,
    levelFilter: args.level?.trim() || null,
    textQuery: args.textQuery?.trim() || null,
    returned: hits.length,
    hits,
  };
}
