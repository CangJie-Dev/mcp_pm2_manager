/**
 * PM2 ecosystem file (CommonJS).
 *
 * Note:
 * - This MCP server uses stdio transport. For Cursor integration, Cursor typically
 *   needs to spawn the process itself (so it can own stdio). PM2 is mainly useful
 *   for keeping a standalone instance running and for log/process management.
 */
module.exports = {
  apps: [
    {
      name: "mcp-mysql-query",
      script: "dist/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      time: true,
      env: {
        NODE_ENV: "production",
        MYSQL_HOST: "127.0.0.1",
        MYSQL_PORT: "3306",
        MYSQL_USER: "root",
        MYSQL_PASSWORD: "****"
        // MYSQL_CONNECTION_LIMIT: "10",
      },
      out_file: "logs/pm2.out.log",
      error_file: "logs/pm2.err.log",
      merge_logs: true,
    },
  ],
};
