import { createClient, type Client, type InArgs, type InStatement } from "@libsql/client";
import path from "node:path";
import { pathToFileURL } from "node:url";

// One code path for both places the app runs:
// - Locally: the SQLite file the pipeline writes (../db/pmw.sqlite, `cd pipeline && uv run pmw build`).
// - On Vercel: the hosted Turso database (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, set by the Vercel integration).
//   Upload the local database there with `npm run db:push`.
// Locally you can point at the hosted database with PMW_USE_REMOTE=1.
function makeClient(): Client {
  const remote = process.env.TURSO_DATABASE_URL;
  if (remote && (process.env.VERCEL || process.env.PMW_USE_REMOTE === "1")) {
    return createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const file = process.env.PMW_DB ?? path.join(process.cwd(), "..", "db", "pmw.sqlite");
  return createClient({ url: pathToFileURL(path.resolve(file)).href });
}

const g = globalThis as unknown as { __pmwDb?: Client };

export function db(): Client {
  if (!g.__pmwDb) g.__pmwDb = makeClient();
  return g.__pmwDb;
}

type Row = Record<string, unknown>;

/** All rows as plain objects keyed by column name. */
export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await db().execute({ sql, args });
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) as T[];
}

export async function one<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

/** Run several writes atomically. */
export async function writeBatch(statements: InStatement[]): Promise<void> {
  if (statements.length) await db().batch(statements, "write");
}

export function parse<T>(json: unknown, fallback: T): T {
  if (typeof json !== "string" || !json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
