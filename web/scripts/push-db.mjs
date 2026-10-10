// Upload the local pipeline database (../db/pmw.sqlite) to the hosted Turso database.
// Usage: npm run db:push   (needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, e.g. from `vercel env pull .env.local`)
// This REPLACES everything online, including PM decisions made on the hosted demo.
import { createClient } from "@libsql/client";
import path from "node:path";
import { pathToFileURL } from "node:url";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("TURSO_DATABASE_URL is not set. Run `vercel env pull .env.local` first.");
  process.exit(1);
}

const local = createClient({ url: pathToFileURL(path.resolve("..", "db", "pmw.sqlite")).href });
const remote = createClient({ url, authToken });

const objects = (
  await local.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC")
).rows;
const tables = objects.filter((o) => o.type === "table");
const indexes = objects.filter((o) => o.type === "index");

console.log(`Replacing ${tables.length} tables on ${url}`);
await remote.batch(
  [...tables.map((t) => `DROP TABLE IF EXISTS "${t.name}"`), ...tables.map((t) => String(t.sql)), ...indexes.map((i) => String(i.sql))],
  "write",
);

const CHUNK = 400;
for (const t of tables) {
  const res = await local.execute(`SELECT * FROM "${t.name}"`);
  const cols = res.columns;
  const insert = `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  for (let i = 0; i < res.rows.length; i += CHUNK) {
    const chunk = res.rows.slice(i, i + CHUNK).map((row) => ({ sql: insert, args: cols.map((_, j) => row[j]) }));
    await remote.batch(chunk, "write");
  }
  console.log(`  ${t.name}: ${res.rows.length} rows`);
}
console.log("Done. The hosted demo now matches your local database.");
