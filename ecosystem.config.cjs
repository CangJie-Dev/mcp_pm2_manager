/**
 * PM2 manager (sibling project).
 *
 * Add more MCP servers by appending to `apps`.
 * Each app can point to a different project via `cwd`.
 */
module.exports = {
  apps: [
    {
      name: "mcp-es-log-search",
      cwd: require("path").resolve(__dirname, "./es_log_search"),
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      time: true,
      env: {
        NODE_ENV: "production",
        // ES_BASE_URL: "http://127.0.0.1:9200",
        // ES_USERNAME: "",
        // ES_PASSWORD: "",
      },
      out_file: require("path").resolve(__dirname, "logs/mcp-es-log-search.out.log"),
      error_file: require("path").resolve(__dirname, "logs/mcp-es-log-search.err.log"),
      merge_logs: true
    },
    {
      name: "mcp-mysql-query",
      cwd: require("path").resolve(__dirname, "./mysql_query"),
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      time: true,
      env: {
        NODE_ENV: "production",
        // MYSQL_HOST: "127.0.0.1",
        // MYSQL_PORT: "3306",
        // MYSQL_USER: "root",
        // MYSQL_PASSWORD: "",
        // MYSQL_CONNECTION_LIMIT: "10"
      },
      out_file: require("path").resolve(__dirname, "logs/mcp-mysql-query.out.log"),
      error_file: require("path").resolve(__dirname, "logs/mcp-mysql-query.err.log"),
      merge_logs: true,
    }
  ]
};

