import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@libsql/client";
import ts from "typescript";

function loadTs(file, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

test("live happiness deduplicates signals, follows approvals, respects regions and preserves unknowns", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.executeMultiple(`
      CREATE TABLE signals (id TEXT,vehicle TEXT,in_scope INTEGER);
      CREATE TABLE feedback (id TEXT,vehicle TEXT,market TEXT);
      CREATE TABLE signal_feedback (signal_id TEXT,feedback_id TEXT);
      CREATE TABLE requirements (id TEXT,vehicle TEXT,signal_id TEXT,kind TEXT,status TEXT,already_exists TEXT);
      CREATE TABLE sales (vehicle TEXT,market TEXT,year INTEGER,volume INTEGER);
      INSERT INTO signals VALUES ('seat','G70',1),('controls','G70',1),('price','G70',0);
      INSERT INTO feedback VALUES ('one','G70','US'),('two','G70','US'),('three','G70','EU'),('excluded','G70','US');
      INSERT INTO signal_feedback VALUES ('seat','one'),('controls','one'),('controls','two'),('seat','three'),('price','excluded');
      INSERT INTO requirements VALUES ('seat-req','G70','seat','signal','proposed','[]'),
        ('controls-req','G70','controls','signal','proposed','[]'),('price-req','G70','price','signal','approved','[]');
      INSERT INTO sales VALUES ('G70','US',2025,12),('G70','EU',2025,13),('G70','CN',2025,10),('G70','ROW',2025,7);
    `);
    const all = async (sql, args) => (await client.execute({ sql, args })).rows;
    const { happiness } = loadTs('../lib/gate.ts', {
      'next/headers': {}, './regions': loadTs('../lib/regions.ts'), './db': { all },
    });
    const viewer = { region: 'ALL', markets: ['US', 'EU', 'CN', 'ROW'] };
    let rows = await happiness(viewer, 'G70');
    assert.equal(rows[0].negativeComments, 2);
    assert.equal(rows[0].share, 0);
    assert.equal(rows[2].share, null);
    assert.equal(rows[3].share, null);
    assert.equal(rows[2].salesWeight, 10 / 42);
    await client.execute("UPDATE requirements SET status='approved' WHERE id='seat-req'");
    rows = await happiness(viewer, 'G70');
    assert.equal(rows[0].share, .5);
    assert.equal(rows[1].share, 1);
    await client.execute("UPDATE requirements SET status='approved' WHERE id='controls-req'");
    assert.equal((await happiness(viewer, 'G70'))[0].coveredComments, 2);
    await client.execute("UPDATE requirements SET status='rejected' WHERE id IN ('seat-req','controls-req')");
    await client.execute({ sql: "INSERT INTO requirements VALUES ('quick','G70','controls','quick_win','approved',?)",
      args: [JSON.stringify([{ feedback_ids: ['one', 'one'] }])] });
    assert.equal((await happiness(viewer, 'G70'))[0].share, .5);
    await client.execute("INSERT INTO requirements VALUES ('survey','G70','controls','market_conflict','approved','[]')");
    assert.equal((await happiness(viewer, 'G70'))[0].share, .5);
    rows = await happiness({ region: 'EU', markets: ['EU'] }, 'G70');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].market, 'EU');
    assert.equal(rows[0].salesWeight, 13 / 42);
    assert.equal((await happiness(viewer, 'unknown'))[0].salesWeight, null);
    assert.equal((await happiness(viewer, 'unknown'))[0].share, null);
  } finally { client.close(); }
});
