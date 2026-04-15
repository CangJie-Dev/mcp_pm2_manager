# mcp_pm2_manager

一个“同级目录”的 PM2 管理项目，用来统一管理/启动多个 MCP Server。

当前已内置管理：

- `./es_log_search`（进程名：`mcp-es-log-search`）
- `./mysql_query`（进程名：`mcp-mysql-query`）

## 安装

在本目录执行：

```bash
npm i
```

## 管理当前 es_log_search

首次启动（会先 build 再启动）：

```bash
npm run es:start
```

常用命令：

```bash
npm run es:restart
npm run es:stop
npm run es:logs
```

## 管理 mysql_query

首次启动（会先 build 再只启动该项）：

```bash
npm run mysql:start
```

常用命令：

```bash
npm run mysql:restart
npm run mysql:stop
npm run mysql:logs
```

子项目内也可单独使用 `mysql_query/ecosystem.config.cjs`，详见 `./mysql_query/README.md`。

调用 MySQL 工具时的 **`database` 参数**：**datacenter** 相关业务用库名 **`datacenter`**，**其余**一律用 **`smartcloud`**（详见 `./mysql_query/README.md`「业务库名约定」）。

## 管理全部（ecosystem）

```bash
npm run pm2:start
npm run pm2:restart
npm run pm2:stop
npm run pm2:status
npm run pm2:logs
```

## 环境变量

你可以在 `ecosystem.config.cjs` 的 `env` 里配置：

**es_log_search**

- `ES_BASE_URL`
- `ES_USERNAME` / `ES_PASSWORD`（可选）

**mysql_query**

- `MYSQL_HOST` / `MYSQL_PORT`
- `MYSQL_USER` / `MYSQL_PASSWORD`（可选）
- `MYSQL_CONNECTION_LIMIT`（可选）

## 说明（非常重要）

这个 MCP server 使用 `stdio` 传输；如果你要在 Cursor 里用 MCP，一般仍建议让 Cursor 直接拉起进程（由 Cursor 绑定 stdio）。
PM2 主要用于“常驻 + 日志/重启管理”的场景。

