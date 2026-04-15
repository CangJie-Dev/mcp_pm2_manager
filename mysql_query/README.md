# mcp-mysql-query

一个用于 **MySQL** 的 MCP Server，提供两个工具：

1. `mysql_describe_table`：查询表结构（`INFORMATION_SCHEMA.COLUMNS`，可选 `SHOW CREATE TABLE`）
2. `mysql_select`：查询数据（仅支持简单 `where` 等值/NULL 条件，使用参数化查询避免注入）

## 业务库名约定

在调用工具时，`database` 参数请按业务归属选择：

- **datacenter 相关**：使用库名 **`datacenter`**
- **其余业务**：一律使用库名 **`smartcloud`**

示例：`mysql_select` 里 `"database": "smartcloud"` 或 `"database": "datacenter"`，与表所在库一致即可。

## 环境变量

- `MYSQL_HOST`：默认 `127.0.0.1`
- `MYSQL_PORT`：默认 `3306`
- `MYSQL_USER`：默认 `root`
- `MYSQL_PASSWORD`：可选
- `MYSQL_CONNECTION_LIMIT`：默认 `10`

## 本地运行

```bash
npm i
npm run dev
```

## 构建与启动

```bash
npm run build
npm run start
```

## 使用 PM2 管理（常驻 / 日志）

本 MCP 使用 **stdio** 传输；在 **Cursor** 场景下通常仍建议用下方「Cursor 配置」由客户端直接拉起进程。PM2 更适合在服务器上**常驻**、统一看日志与进程状态。

### 子项目目录（`mysql_query/ecosystem.config.cjs`）

进程名：`mcp-mysql-query`。先构建再启动：

```bash
npm run build
npm run pm2:start
npm run pm2:status
npm run pm2:logs
```

停止 / 删除：

```bash
npm run pm2:stop
npm run pm2:delete
```

日志默认写在子项目 `logs/pm2.out.log`、`logs/pm2.err.log`（可在 `ecosystem.config.cjs` 中改路径）。

在 `ecosystem.config.cjs` 的 `env` 里配置 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD` 等（与上文环境变量一致）。

### 仓库根目录（统一管理多个 MCP）

根目录 `ecosystem.config.cjs` 里已包含 `mcp-mysql-query`（`cwd` 指向 `./mysql_query`），日志在仓库根 `logs/mcp-mysql-query.*.log`。

```bash
# 在仓库根目录执行
npm run mysql:build
npm run mysql:start
npm run mysql:restart
npm run mysql:stop
npm run mysql:logs
```

或只启动 MySQL 这一项：

```bash
npm run mysql:build
pm2 start ecosystem.config.cjs --only mcp-mysql-query
```

## Cursor 配置示例（`mcp.json`）

项目级：仓库根目录 `.cursor/mcp.json`（优先），或全局 `~/.cursor/mcp.json`。

```json
{
  "mcpServers": {
    "mysql-query": {
      "command": "node",
      "args": ["E:\\\\work_space\\\\mcp_pm2_manager\\\\mysql_query\\\\dist\\\\server.js"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "******"
      }
    }
  }
}
```

## 入参示例

### 1) 查询表结构

工具：`mysql_describe_table`

```json
{
  "database": "smartcloud",
  "table": "order",
  "includeCreateTable": true
}
```

### 2) 查询数据

工具：`mysql_select`

```json
{
  "select": "*",
  "database": "smartcloud",
  "table": "order",
  "where": {
    "user_id": 123
  },
  "limit": 10
}
```

> 注意：`database` / `table` / `select` 列名 / `where` 字段名仅允许 `[A-Za-z0-9_]`，其它字符会被拒绝，以降低注入风险。

