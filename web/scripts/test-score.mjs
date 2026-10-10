// Run with: node --test scripts/test-score.mjs   (after `cd pipeline && uv run pmw build`)
// Proves that web/lib/score.ts reproduces pipeline/pmw/score.py: with the default weights stored in the settings
// table, every requirement's recomputed priority, quadrant and sensitivity equal the stored values.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function loadTs(file) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", outputText)(() => { throw new Error("score.ts must not import"); }, mod, mod.exports);
  return mod.exports;
}

const score = loadTs("../lib/score.ts");
const dbPath = path.resolve(process.env.PMW_DB ?? fileURLToPath(new URL("../../db/pmw.sqlite", import.meta.url)));

function load() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const weights = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'weights'").get().value);
    const rows = db.prepare("SELECT id, priority, confidence, quadrant, priority_factors, challenge, challenged FROM requirements").all();
    return { weights, rows };
  } finally {
    db.close();
  }
}

test("default weights reproduce every stored priority, quadrant and sensitivity", () => {
  const { weights, rows } = load();
  assert.ok(rows.length > 0, "database has requirements");
  assert.deepEqual(Object.keys(weights.priority), [...score.PRIORITY_FACTORS], "factor order matches score.py");
  let checked = 0;
  for (const r of rows) {
    const values = score.factorValues(JSON.parse(r.priority_factors));
    const p = score.weightedScore(values, weights.priority);
    assert.equal(p, r.priority, `${r.id} priority`);
    assert.equal(score.quadrantOf(p, r.confidence, weights.thresholds), r.quadrant, `${r.id} quadrant`);
    const stored = JSON.parse(r.challenge).priority_sensitivity;
    if (stored) assert.deepEqual(score.sensitivity(values, weights.priority, weights.thresholds.priority), stored, `${r.id} sensitivity`);
    checked++;
  }
  console.log(`checked ${checked} requirements`);
});

test("presets are valid weight sets and actually re-rank the 7 Series", () => {
  const { rows } = load();
  const g70 = rows.filter((r) => r.id.startsWith("R-G70-"));
  const rank = (w) => g70.map((r) => ({ id: r.id, p: score.weightedScore(score.factorValues(JSON.parse(r.priority_factors)), w) }))
    .sort((a, b) => b.p - a.p).map((x) => x.id).join();
  const base = g70.slice().sort((a, b) => b.priority - a.priority).map((r) => r.id).join();
  for (const preset of score.PRESETS) {
    const sum = score.PRIORITY_FACTORS.reduce((s, k) => s + preset.weights[k], 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${preset.key} sums to 1`);
    assert.notEqual(rank(preset.weights), base, `${preset.key} changes the 7 Series order`);
  }
});

test("python rounding sends exact halves to the even integer", () => {
  assert.equal(score.pyRound(62.5), 62);
  assert.equal(score.pyRound(63.5), 64);
  assert.equal(score.pyRound(62.4999), 62);
  assert.equal(score.pyRound(62.5001), 63);
  assert.equal(score.quadrantOf(55, 58, { priority: 55, confidence: 58 }), "act");
  assert.equal(score.quadrantOf(54, 58, { priority: 55, confidence: 58 }), "monitor");
  assert.equal(score.quadrantOf(55, 57, { priority: 55, confidence: 58 }), "validate");
  assert.equal(score.quadrantOf(54, 57, { priority: 55, confidence: 58 }), "park");
});
