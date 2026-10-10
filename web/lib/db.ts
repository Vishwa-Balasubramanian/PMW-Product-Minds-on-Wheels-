import Database from "better-sqlite3";
import path from "node:path";

// The pipeline writes this file: `cd pipeline && uv run pmw build`.
const DB_PATH = process.env.PMW_DB ?? path.join(process.cwd(), "..", "db", "pmw.sqlite");

const g = globalThis as unknown as { __pmwDb?: Database.Database };

export function db(): Database.Database {
  if (!g.__pmwDb) {
    const d = new Database(DB_PATH, { fileMustExist: true });
    d.pragma("journal_mode = WAL");
    g.__pmwDb = d;
  }
  return g.__pmwDb;
}

export function parse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
