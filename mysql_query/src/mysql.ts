import mysql from "mysql2/promise";

export type MysqlEnv = Readonly<{
  host: string;
  port: number;
  user: string;
  password?: string;
  connectionLimit: number;
}>;

export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function getMysqlEnv(): MysqlEnv {
  const host = getEnv("MYSQL_HOST") ?? "127.0.0.1";
  const port = Number(getEnv("MYSQL_PORT") ?? "3306");
  const user = getEnv("MYSQL_USER") ?? "root";
  const password = getEnv("MYSQL_PASSWORD");
  const connectionLimit = Number(getEnv("MYSQL_CONNECTION_LIMIT") ?? "10");
  if (!Number.isFinite(port) || port <= 0) throw new Error("invalid MYSQL_PORT");
  if (!Number.isFinite(connectionLimit) || connectionLimit <= 0) throw new Error("invalid MYSQL_CONNECTION_LIMIT");
  return { host, port, user, password, connectionLimit };
}

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (pool) return pool;
  const env = getMysqlEnv();
  pool = mysql.createPool({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    waitForConnections: true,
    connectionLimit: env.connectionLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    decimalNumbers: true,
  });
  return pool;
}

const IDENT_RE = /^[A-Za-z0-9_]+$/;

export function assertIdent(kind: "database" | "table" | "column", name: string): string {
  if (!name || !IDENT_RE.test(name)) {
    throw new Error(`invalid ${kind}: ${name}`);
  }
  return name;
}

export function qIdent(name: string): string {
  return `\`${name}\``;
}

