import { z } from "zod";
import { getPool, assertIdent, qIdent } from "./mysql.js";

export const describeTableInputSchema = z.object({
  database: z.string().min(1),
  table: z.string().min(1),
  includeCreateTable: z.boolean().optional().default(false),
});

export type DescribeTableInput = z.infer<typeof describeTableInputSchema>;

export async function describeTable(input: DescribeTableInput) {
  const db = assertIdent("database", input.database);
  const table = assertIdent("table", input.table);

  const pool = getPool();
  const [cols] = await pool.query(
    `
      SELECT
        COLUMN_NAME as columnName,
        COLUMN_TYPE as columnType,
        IS_NULLABLE as isNullable,
        COLUMN_KEY as columnKey,
        COLUMN_DEFAULT as columnDefault,
        EXTRA as extra,
        COLUMN_COMMENT as columnComment,
        ORDINAL_POSITION as ordinalPosition
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION ASC
    `,
    [db, table]
  );

  let createTableSql: string | undefined;
  if (input.includeCreateTable) {
    const [rows] = await pool.query(
      `SHOW CREATE TABLE ${qIdent(db)}.${qIdent(table)}`,
      []
    );
    const r = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    const v = r ? (Object.values(r).find((x) => typeof x === "string") as string | undefined) : undefined;
    createTableSql = v;
  }

  return {
    database: db,
    table,
    columns: cols,
    createTableSql,
  };
}

const whereValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const selectDataInputSchema = z.object({
  select: z.union([z.literal("*"), z.string().min(1), z.array(z.string().min(1)).min(1)]).optional().default("*"),
  database: z.string().min(1),
  table: z.string().min(1),
  where: z.record(whereValueSchema).optional(),
  limit: z.number().int().min(1).max(1000).optional().default(10),
  offset: z.number().int().min(0).max(1000000).optional().default(0),
});

export type SelectDataInput = z.infer<typeof selectDataInputSchema>;

function normalizeSelect(sel: SelectDataInput["select"]): "*" | string[] {
  if (sel === "*") return "*";
  if (Array.isArray(sel)) return sel;
  return [sel];
}

export async function selectData(input: SelectDataInput) {
  const db = assertIdent("database", input.database);
  const table = assertIdent("table", input.table);

  const select = normalizeSelect(input.select);
  const selectSql =
    select === "*"
      ? "*"
      : select
          .map((c) => qIdent(assertIdent("column", c)))
          .join(", ");

  const where = input.where ?? {};
  const whereKeys = Object.keys(where);
  const whereSql =
    whereKeys.length === 0
      ? ""
      : " WHERE " +
        whereKeys
          .map((k) => {
            const col = qIdent(assertIdent("column", k));
            const v = where[k];
            return v === null ? `${col} IS NULL` : `${col} = ?`;
          })
          .join(" AND ");

  const values: Array<string | number | boolean> = [];
  for (const k of whereKeys) {
    const v = where[k];
    if (v === null) continue;
    values.push(v as string | number | boolean);
  }
  values.push(input.limit, input.offset);

  const sql = `SELECT ${selectSql} FROM ${qIdent(db)}.${qIdent(table)}${whereSql} LIMIT ? OFFSET ?`;
  const pool = getPool();
  const [rows] = await pool.query(sql, values);

  return {
    database: db,
    table,
    sqlPreview: sql,
    limit: input.limit,
    offset: input.offset,
    rows,
  };
}

