// Run with: node --test scripts/test-equipment-evidence.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@libsql/client";
import ts from "typescript";

// Compile the actual gate with its database adapter injected; queries run on SQLite.
function loadTs(file, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loadedModule = { exports: {} };
  const require = (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  };
  new Function("require", "module", "exports", outputText)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

test("quick wins show their own wishes, preserve region restrictions, and do not duplicate signals", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.executeMultiple(`
      CREATE TABLE requirements (id TEXT, vehicle TEXT, signal_id TEXT, kind TEXT, already_exists TEXT,
        markets TEXT DEFAULT '["US","EU"]', customer_voice TEXT);
      CREATE TABLE feedback (id TEXT, vehicle TEXT, text TEXT, source TEXT, market TEXT, country TEXT, powertrain TEXT, severity TEXT);
      CREATE TABLE signal_evidence (signal_id TEXT, feedback_id TEXT, role TEXT);
      CREATE TABLE feedback_scope (feedback_id TEXT,in_scope INTEGER,reason TEXT);
      CREATE TABLE signals (id TEXT, vehicle TEXT, n_negative INTEGER, in_scope INTEGER, by_market TEXT, by_source TEXT);
      CREATE TABLE audit_events (ts TEXT, actor_type TEXT, actor TEXT, region TEXT, entity_type TEXT, entity_id TEXT,
        action TEXT, field TEXT, before TEXT, after TEXT, rationale TEXT);
      INSERT INTO signals VALUES ('S-G60-001','G60',100,1,'{}','{}');
      INSERT INTO feedback VALUES
        ('wish-us','G60','I want ventilated seats','Source A','US',NULL,NULL,NULL),
        ('wish-eu','G60','I want cooled seats','Source B','EU',NULL,NULL,NULL),
        ('unrelated','G60','The seat control broke','Source C','US',NULL,NULL,NULL),
        ('other-car','G70','A different vehicle','Source A','US',NULL,NULL,NULL);
      INSERT INTO signal_evidence VALUES ('S-G60-001','unrelated','supports');
      INSERT INTO feedback_scope VALUES ('wish-us',0,'Pricing content'),('wish-eu',0,'Regulatory content');
      INSERT INTO requirements (id,vehicle,signal_id,kind,already_exists) VALUES ('R-main','G60','S-G60-001','signal','[]');
      INSERT INTO requirements (id,vehicle,signal_id,kind,already_exists) VALUES ('R-empty','G60','S-G60-001','quick_win','[]');
    `);
    await client.execute({
      sql: "INSERT INTO requirements (id,vehicle,signal_id,kind,already_exists) VALUES ('R-quick','G60','S-G60-001','quick_win',?)",
      args: [JSON.stringify([
        { feedback_ids: ["wish-us", "wish-eu"] },
        { feedback_ids: ["wish-us", "other-car"] },
      ])],
    });
    const all = async (sql, args = []) => (await client.execute({ sql, args })).rows;
    const gate = loadTs("../lib/gate.ts", {
      "next/headers": { cookies: () => { throw new Error("Viewer is explicit in this test"); } },
      "./regions": loadTs("../lib/regions.ts"),
      "./db": {
        all,
        one: async (sql, args) => (await all(sql, args))[0],
        parse: (value, fallback) => value ? JSON.parse(value) : fallback,
        nowIso: () => new Date().toISOString(),
        writeBatch: (statements) => client.batch(statements, "write"),
      },
    });
    const viewer = { region: "US", markets: ["US"], label: "United States", actor: "Test PM" };
    assert.deepEqual(await gate.feedbackScope(viewer, 'G60'), [
      { feedback_id: 'wish-us', in_scope: false, reason: 'Pricing content' },
    ]);
    const view = await gate.getRequirement(viewer, "R-quick");
    assert.deepEqual(view.quotes.map((q) => q.id), ["wish-us"]);
    assert.equal(view.quotes[0].role, "supports");
    assert.deepEqual(view.hidden, { EU: 1 });
    assert.match(view.requirement.customer_voice, /wish-us/);
    assert.doesNotMatch(view.requirement.customer_voice, /wish-eu/);
    assert.equal(await gate.getRequirement({ ...viewer, region: "CN", markets: ["CN"] }, "R-quick"), undefined);
    assert.equal((await all("SELECT action FROM audit_events WHERE entity_id='R-quick'"))[0].action,
      "viewed evidence (other markets restricted)");
    const allView = await gate.getRequirement({ ...viewer, region: "ALL", markets: ["US", "EU", "CN", "ROW"] }, "R-quick");
    assert.deepEqual(allView.quotes.map((q) => q.id), ["wish-eu", "wish-us"]);
    assert.deepEqual(allView.hidden, {});
    assert.deepEqual((await gate.getRequirement(viewer, "R-main")).quotes.map((q) => q.id), ["unrelated"]);
    assert.deepEqual((await gate.getRequirement(viewer, "R-empty")).quotes, []);
    const signals = await gate.listSignals("G60");
    assert.equal(signals.length, 1);
    assert.equal(signals[0].requirement_id, "R-main");
  } finally {
    client.close();
  }
});
