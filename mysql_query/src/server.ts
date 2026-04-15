import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { describeTable, describeTableInputSchema, selectData, selectDataInputSchema } from "./tools.js";
import { getMysqlEnv } from "./mysql.js";

function logJson(level: "info" | "error", event: string, payload: Record<string, unknown>) {
  const rec = {
    ts: new Date().toISOString(),
    level,
    service: "mcp-mysql-query",
    event,
    ...payload,
  };
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : console.log)(JSON.stringify(rec));
}

const server = new Server(
  { name: "mcp-mysql-query", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mysql_describe_table",
        description:
          "查询 MySQL 表结构（来自 INFORMATION_SCHEMA.COLUMNS，可选 SHOW CREATE TABLE）。入参：database, table, includeCreateTable。业务库名：datacenter 相关用 database=datacenter，其余用 database=smartcloud。",
        inputSchema: zodToJsonSchema(describeTableInputSchema, { $refStrategy: "none" }),
      },
      {
        name: "mysql_select",
        description:
          "查询 MySQL 数据（仅支持简单等值/NULL where，自动参数化避免注入）。入参：select（'*' 或列名/列名数组）、database、table、where、limit、offset。业务库名：datacenter 相关用 database=datacenter，其余用 database=smartcloud。",
        inputSchema: zodToJsonSchema(selectDataInputSchema, { $refStrategy: "none" }),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = req.params.name;
  const args = req.params.arguments ?? {};
  const startedAt = Date.now();

  try {
    if (tool === "mysql_describe_table") {
      const parsed = describeTableInputSchema.safeParse(args);
      if (!parsed.success) {
        return { content: [{ type: "text", text: `参数校验失败：\n${parsed.error.message}` }], isError: true };
      }
      logJson("info", "tool_call.request", { tool, args: parsed.data });
      const data = await describeTable(parsed.data);
      logJson("info", "tool_call.response", { tool, durationMs: Date.now() - startedAt });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, data }, null, 2) }] };
    }

    if (tool === "mysql_select") {
      const parsed = selectDataInputSchema.safeParse(args);
      if (!parsed.success) {
        return { content: [{ type: "text", text: `参数校验失败：\n${parsed.error.message}` }], isError: true };
      }
      logJson("info", "tool_call.request", { tool, args: parsed.data });
      const data = await selectData(parsed.data);
      logJson("info", "tool_call.response", { tool, durationMs: Date.now() - startedAt, returned: Array.isArray(data.rows) ? data.rows.length : undefined });
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, data }, null, 2) }] };
    }

    return { content: [{ type: "text", text: `未知工具：${tool}` }], isError: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logJson("error", "tool_call.failed", { tool, durationMs: Date.now() - startedAt, message });
    return { content: [{ type: "text", text: `执行失败：${message}` }], isError: true };
  }
});

async function main() {
  // 触发一次 env 校验，提前暴露明显配置错误
  const env = getMysqlEnv();
  logJson("info", "boot", { mysql: { host: env.host, port: env.port, user: env.user, connectionLimit: env.connectionLimit } });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

