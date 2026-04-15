/**
 * HTTP 网关：AI 应用只调本服务，不直连 Elasticsearch。
 * 鉴权可选：设置 ES_LOG_SEARCH_API_KEY 后需在请求头携带。
 */
import http from "node:http";
import { URL } from "node:url";
import {
  ELK_LOG_FIELD_HINTS,
  getEnv,
  runEsLogSearch,
  TEXT_QUERY_FIELDS,
  toolInputSchema,
} from "./elkSearch.js";

const MAX_BODY_BYTES = 256 * 1024;

function logJson(level: "info" | "error", event: string, payload: Record<string, unknown>) {
  const rec = {
    ts: new Date().toISOString(),
    level,
    service: "es-log-search-http",
    event,
    ...payload,
  };
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : console.log)(JSON.stringify(rec));
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer | string) => {
      const buf = typeof c === "string" ? Buffer.from(c, "utf8") : c;
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-api-key",
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s, "utf8"),
    ...corsHeaders(),
  });
  res.end(s);
}

function sendNoContent(res: http.ServerResponse) {
  res.writeHead(204, corsHeaders());
  res.end();
}

function checkApiKey(req: http.IncomingMessage): boolean {
  const key = getEnv("ES_LOG_SEARCH_API_KEY");
  if (!key) return true;
  const auth = req.headers.authorization?.trim();
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerKey = (req.headers["x-api-key"] as string | undefined)?.trim() ?? "";
  return bearer === key || headerKey === key;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
    sendJson(res, 200, { ok: true, service: "es-log-search-http" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/meta") {
    sendJson(res, 200, {
      ok: true,
      levelField: "level",
      levelFilterDsl: "term on level.keyword",
      messageFields: ["msg"],
      textQueryFields: [...TEXT_QUERY_FIELDS],
      fieldHints: ELK_LOG_FIELD_HINTS,
      searchEndpoint: "POST /v1/search",
      bodySchemaNote: "与 MCP 工具 es_log_search 参数相同（JSON），见仓库 README",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/search") {
    const startedAt = Date.now();
    if (!checkApiKey(req)) {
      logJson("error", "http_search.unauthorized", {
        method: req.method,
        path: url.pathname,
        remote: req.socket.remoteAddress,
      });
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    let raw: unknown;
    try {
      raw = await readJsonBody(req);
    } catch (e) {
      const msg = e instanceof Error && e.message === "body_too_large" ? "body_too_large" : "invalid_json";
      logJson("error", "http_search.bad_request", {
        method: req.method,
        path: url.pathname,
        remote: req.socket.remoteAddress,
        error: msg,
      });
      sendJson(res, 400, { ok: false, error: msg });
      return;
    }
    const parsed = toolInputSchema.safeParse(raw);
    if (!parsed.success) {
      logJson("error", "http_search.validation_failed", {
        method: req.method,
        path: url.pathname,
        remote: req.socket.remoteAddress,
        details: parsed.error.flatten(),
      });
      sendJson(res, 400, { ok: false, error: "validation_failed", details: parsed.error.flatten() });
      return;
    }
    try {
      logJson("info", "http_search.request", {
        method: req.method,
        path: url.pathname,
        remote: req.socket.remoteAddress,
        args: parsed.data,
      });
      const data = await runEsLogSearch(parsed.data);
      logJson("info", "http_search.response", {
        method: req.method,
        path: url.pathname,
        remote: req.socket.remoteAddress,
        durationMs: Date.now() - startedAt,
        data: {
          index: data.index,
          took: data.took,
          total: data.total,
          size: data.size,
          minutes: data.minutes,
          levelFilter: data.levelFilter,
          textQuery: data.textQuery,
          returned: data.returned,
        },
      });
      sendJson(res, 200, { ok: true, data });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logJson("error", "http_search.upstream_es_failed", {
        method: req.method,
        path: url.pathname,
        remote: req.socket.remoteAddress,
        durationMs: Date.now() - startedAt,
        message,
      });
      sendJson(res, 502, { ok: false, error: "upstream_es_failed", message });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "not_found" });
}

const port = Number(getEnv("ES_LOG_SEARCH_HTTP_PORT") ?? "3847");

const server = http.createServer((req, res) => {
  void handle(req, res).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    sendJson(res, 500, { ok: false, error: "internal_error" });
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`es-log-search HTTP listening on :${port} (POST /v1/search, GET /v1/meta)`);
});
