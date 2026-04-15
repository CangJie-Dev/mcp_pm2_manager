# mcp-es-log-search

一个用于在 **Elasticsearch** 中检索**通用 ELK 风格日志**的 MCP Server。

## Index 命名规则

`[环境前缀（仅测试环境为 test-）][模块名]-[日期]`

- **生产**：无前缀，例如 `smartcloud-modules-datacenter-jar-2026.04.10`
- **测试**：前缀 `test-`，例如 `test-smartcloud-modules-datacenter-jar-2026.04.10`

### 支持的模块（`module` 参数）

- `smartcloud-modules-wx-jar`
- `smartcloud-modules-train-jar`
- `smartcloud-modules-datacenter-jar`
- `smartcloud-modules-datasupport-jar`
- `smartcloud-modules-pay-jar`

日期参数 `date` 须为 `YYYY.MM.DD`（与 index 最后一段一致）。

## 查询行为

- 默认按 `@timestamp` 倒序，时间范围为「当前时间往前 `minutes` 分钟」。
- `level` 可选：`term` 过滤 `level.keyword`。
- `textQuery` 可选：`query_string`，默认字段为 `msg`、`logger`、`class`、`thread`、`tags`、`date`、`fields.jar_name`（与当前索引 `_doc` mapping 一致）。
- 默认 `_source`：`@timestamp`、`level`、`msg`、`logger`、`class`、`thread`、`tags`、`date`、`@version`、`fields.jar_name`、`throttled_time`、`throttled_time_out`（可用 `sourceFields` 覆盖）。
- 返回每条 hit 的 `_id`、`_index`、`_score`、`_source`（由 `sourceFields` 控制）。

## 环境变量

- `ES_BASE_URL`：例如 `http://127.0.0.1:9200`
- `ES_USERNAME` / `ES_PASSWORD`：如 ES 开了 Basic Auth（可选）

### HTTP 网关（给 AI 应用 / 后端调用，不直连 ES）

- `ES_LOG_SEARCH_HTTP_PORT`：监听端口，默认 `3847`
- `ES_LOG_SEARCH_API_KEY`：可选；若设置则请求须带 `Authorization: Bearer <key>` 或头 `X-Api-Key: <key>`

启动：

```bash
npm run build
npm run start:http
# 或开发：npm run dev:http
```

- `GET /v1/health`：存活检查
- `GET /v1/meta`：返回当前服务使用的字段说明（如 `level`、`msg`）与检索字段列表
- `POST /v1/search`：`Content-Type: application/json`，**请求体与 MCP 工具 `es_log_search` 的参数相同**；响应为 `{ ok, data }`，其中 `data.hits` 为日志列表（不返回 `ES_BASE_URL`，避免把集群地址暴露给调用方）

示例：

```bash
curl -s -X POST http://127.0.0.1:3847/v1/search -H "content-type: application/json" -d "{\"date\":\"2026.04.10\",\"size\":5}"
```

## 本地运行

```bash
npm i
npm run dev
```

## 使用 PM2 管理（常驻/观测）

先确保已构建产物：

```bash
npm run build
```

启动/重启/停止：

```bash
npm run pm2:start
npm run pm2:restart
npm run pm2:stop
```

查看状态与日志：

```bash
npm run pm2:status
npm run pm2:logs
```

说明：

- 该 MCP server 使用 `stdio` 传输；在 **Cursor 的 MCP 集成场景**下，通常仍建议按下方「Cursor 配置示例」由 Cursor 直接拉起进程（这样 Cursor 才能绑定 stdio）。
- PM2 更适合用于 **本地/服务器常驻运行**、统一管理进程与日志（日志默认写到 `logs/`）。

## MCP 工具

工具名：`es_log_search`

常用参数：

- `environment`: `"production"` | `"test"`（默认 `"production"`）
- `module`: 见上文模块列表（默认 `smartcloud-modules-datacenter-jar`）
- `date`: 例如 `"2026.04.10"`（必填）
- `size`: 返回条数（默认 `100`）
- `minutes`: 时间窗口分钟数（默认 `15`）
- `level`: 可选，例如 `"ERROR"`
- `textQuery`: 可选，全文检索表达式
- `sourceFields`: 默认见上文「查询行为」

### Cursor 里模型仍用 `curl` 时

本 MCP **实现上从未调用 curl**，访问 ES 的是 **Node `fetch`（HTTP）**。若在 Cursor 里仍看到 `curl`，通常是 **Agent 走了终端**而不是 **MCP 工具**。请：① 确认 `es_log_search` 已在 Tools & MCP 中启用；② 使用仓库根目录 **`.cursor/rules/es-log-search-mcp.mdc`**（已约束必须用 MCP）；③ 重新加载 MCP 后优先通过工具面板调用 `es_log_search`。

## Cursor 配置示例（`mcp.json`）

配置文件位置（二选一，项目级优先于全局）：

- **项目级**：仓库根目录 `.cursor/mcp.json`（仅当前工程）
- **全局**：用户目录 `~/.cursor/mcp.json`（所有工程）

在 `mcp.json` 里增加一个 server（示例路径请改成你本机实际路径；Windows 下路径里的 `\` 须写成 `\\\\`）：

```json
{
  "mcpServers": {
    "es-log-search": {
      "command": "node",
      "args": [
        "E:\\\\work_space\\\\mcp_pm2_manager\\\\es_log_search\\\\node_modules\\\\tsx\\\\dist\\\\cli.mjs",
        "E:\\\\work_space\\\\mcp_pm2_manager\\\\es_log_search\\\\src\\\\server.ts"
      ],
      "env": {
        "ES_BASE_URL": "http://127.0.0.1:9200"
      }
    }
  }
}
```

若已执行 `npm run build`，也可用编译后的入口（不依赖 tsx）：

```json
{
  "mcpServers": {
    "es-log-search": {
      "command": "node",
      "args": ["E:\\\\work_space\\\\mcp_pm2_manager\\\\es_log_search\\\\dist\\\\server.js"],
      "env": {
        "ES_BASE_URL": "http://127.0.0.1:9200"
      }
    }
  }
}
```

### 与 Tools 的对应关系

- Cursor 的 JSON **只负责声明如何启动 MCP Server**（`command` / `args` / `env`）；**不需要、也不支持**在 `mcp.json` 里再手写一层 `tools` 列表。
- Server 连上后，会通过 MCP 协议上报工具列表；你在 Cursor **Settings → Tools & MCP** 里选中该 server 并启用后，应能看到下表中的工具（名称须与代码一致）：

| Tool 名称 | 说明 |
|-----------|------|
| `es_log_search` | 按环境、模块、日期与时间窗口检索 ES 日志；可选 `level`、`textQuery`、`sourceFields`（参数见上文「MCP 工具」） |

若界面里显示 **「No tools, prompts, or resources」**：

1. **先确认进程能起来**：`mcp.json` 里 `command` / `args` 路径是否正确（尤其 Windows 反斜杠要写成 `\\\\`）；改完配置后 **重载 MCP**（在 Tools & MCP 里对该 server 点刷新/重启）。
2. **工具列表依赖合法的 `inputSchema`**：若客户端无法解析带根级 `$ref` + `definitions` 的 JSON Schema，会表现为没有 tools；本仓库已对 `zodToJsonSchema` 使用 **`$refStrategy: "none"`** 生成内联 schema，请拉取最新代码并执行 `npm run build` 后再用 `dist/server.js`。
3. 仍异常时查看 Cursor 的 **MCP / 输出** 日志，或在本目录用 `npm run dev` 手动启动 server 看是否有报错。
