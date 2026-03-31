import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = path.join(process.cwd(), "shop.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(
        `Database not found at ${dbPath}. Make sure shop.db is in the project root.`
      );
    }
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

/** Run a SELECT and return all matching rows. */
export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

/** Run a SELECT and return the first row (or undefined). */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

/** Run an INSERT / UPDATE / DELETE and return the result info. */
export function run(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).run(...params);
}

/** Run a callback inside a transaction (auto-rolled-back on throw). */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/** Check whether a table exists in the database. */
export function tableExists(name: string): boolean {
  const row = queryOne<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name]
  );
  return (row?.cnt ?? 0) > 0;
}

export default getDb;
