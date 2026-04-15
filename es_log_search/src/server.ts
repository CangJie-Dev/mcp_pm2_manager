/**
 * MCP 工具 `es_log_search`：调用方（Agent / 用户）只需按 schema 组装查询参数；
 * 本进程负责拼 index、构建 ES DSL、并通过 **HTTP**（Node 全局 `fetch`）请求
 * `POST {ES_BASE_URL}/{index}/_search`，不使用 shell/curl，在 Windows 上同样可用。
 *
 * 若需给「非 MCP」的 AI 应用调用，请使用 `httpServer.ts`（HTTP 网关），避免应用直连 ES。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getEnv, runEsLogSearch, toolInputSchema } from "./elkSearch.js";

function logJson(level: "info" | "error", event: string, payload: Record<string, unknown>) {
  const rec = {
    ts: new Date().toISOString(),
    level,
    service: "mcp-es-log-search",
    event,
    ...payload,
  };
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : console.log)(JSON.stringify(rec));
}

const server = new Server(
  {
    name: "mcp-es-log-search",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "es_log_search",
        description:
          "【必须用本工具查日志，不要用终端 curl】在 Elasticsearch 中检索 smartcloud 日志（与当前索引 _doc mapping 对齐）。通过 MCP 调用本工具即可；服务端用 Node fetch 发 HTTP POST 到 ES _search，不经过 shell。传入 environment、module、date、时间窗口 minutes、可选 level、textQuery、sourceFields。Index：[环境前缀 test- 可选][模块]-[日期]。level 用 level.keyword；正文 msg；全文搜 msg、logger、class、thread、tags、date、fields.jar_name。",
        inputSchema: zodToJsonSchema(toolInputSchema, { $refStrategy: "none" }),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "es_log_search") {
    return {
      content: [{ type: "text", text: `未知工具：${req.params.name}` }],
      isError: true,
    };
  }

  const parsed = toolInputSchema.safeParse(req.params.arguments ?? {});
  if (!parsed.success) {
    logJson("error", "tool_call.validation_failed", {
      tool: req.params.name,
      error: parsed.error.flatten(),
    });
    return {
      content: [{ type: "text", text: `参数校验失败：\n${parsed.error.message}` }],
      isError: true,
    };
  }

  const startedAt = Date.now();
  try {
    const args = parsed.data;
    const baseUrl = getEnv("ES_BASE_URL") ?? "http://127.0.0.1:9200";
    logJson("info", "tool_call.request", {
      tool: req.params.name,
      args,
    });
    const result = await runEsLogSearch(args);
    logJson("info", "tool_call.response", {
      tool: req.params.name,
      durationMs: Date.now() - startedAt,
      result: {
        index: result.index,
        took: result.took,
        total: result.total,
        size: result.size,
        minutes: result.minutes,
        levelFilter: result.levelFilter,
        textQuery: result.textQuery,
        returned: result.returned,
      },
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              baseUrl,
              ...result,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logJson("error", "tool_call.upstream_failed", {
      tool: req.params.name,
      durationMs: Date.now() - startedAt,
      message,
    });
    return {
      content: [{ type: "text", text: `ES 查询失败：${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
