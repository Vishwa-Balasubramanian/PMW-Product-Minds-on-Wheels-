import { expect, test, type APIRequestContext } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const base = "http://127.0.0.1:3107";
const database = path.resolve("..", "db", "pmw-smoke-run.sqlite");
function read(sql: string, ...args: (string | number)[]) {
  const db = new DatabaseSync(database, { readOnly: true });
  try { return db.prepare(sql).all(...args) as Record<string, string | number>[]; } finally { db.close(); }
}
function write(sql: string, ...args: (string | number)[]) {
  const db = new DatabaseSync(database);
  try { db.prepare(sql).run(...args); } finally { db.close(); }
}
const req = () => read("SELECT * FROM requirements WHERE vehicle='G70' AND kind='signal' ORDER BY id DESC LIMIT 1")[0];
const call = (request: APIRequestContext, tool: string, params: Record<string, unknown>, spokenRequest = `Voice test: ${tool}`) =>
  request.post("/api/voice/tools", { headers: { origin: base }, data: { tool, params, spokenRequest } });
const confirm = (request: APIRequestContext, token: string, choice: boolean) =>
  request.post("/api/voice/confirm", { headers: { origin: base }, data: { token, confirm: choice } });

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "pmw_region", value: "ALL", url: base }]);
});

test("without an OpenAI key the mic runs the local voice mode: spoken commands navigate and are audited", async ({ page }) => {
  // Fake browser speech: recognition hands back the phrase the test says; the browser voice finishes at once.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null; onerror: unknown = null; onend: (() => void) | null = null; onspeechstart: unknown = null;
      start() { w.__rec = this; w.__listening = true; }
      abort() { w.__listening = false; }
    }
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    w.__say = (text: string) => { const r = w.__rec as FakeRecognition; w.__listening = false; r.onresult?.({ results: [[{ transcript: text }]] }); };
    const synth = { speak: (u: { onend?: () => void }) => setTimeout(() => u.onend?.(), 10), cancel: () => {} };
    Object.defineProperty(window, "speechSynthesis", { value: synth });
    w.SpeechSynthesisUtterance = class { onend?: () => void; constructor(public text: string) {} };
  });
  await page.goto("/vehicles/G70");
  const mic = page.getByRole("button", { name: "Start PMW voice" });
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await mic.click();
  await expect(page.locator(".voice-mic")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __listening?: boolean }).__listening)).toBe(true);
  await page.evaluate(() => (window as unknown as { __say: (t: string) => void }).__say("open the 5 series"));
  await expect(page).toHaveURL(/\/vehicles\/G60/);
  const audit = read("SELECT rationale FROM audit_events WHERE entity_type='voice' AND action='voice: navigate' ORDER BY id DESC LIMIT 1");
  expect(audit[0].rationale).toBe("open the 5 series");
  // Hands-free: after replying, PMW listens again.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __listening?: boolean }).__listening)).toBe(true);
  await page.locator(".voice-mic").click();
  await expect(page.locator(".voice-mic")).toHaveAttribute("aria-pressed", "false");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`voice microphone is a small control in the bottom-right corner at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/vehicles/G70");
    const mic = (await page.getByRole("button", { name: "Start PMW voice" }).boundingBox())!;
    expect(viewport.width - (mic.x + mic.width)).toBeLessThan(40);
    expect(mic.width).toBeLessThanOrEqual(56);
    expect(viewport.height - (mic.y + mic.height)).toBeLessThan(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("voice opens evidence/scoring, returns actual quotes and logs source provenance", async ({ page }) => {
  const id = String(req().id);
  const open = await (await call(page.request, "open_requirement", { id }, "Open the evidence for this requirement")).json();
  expect(open.ok).toBe(true);
  await page.goto(open.href);
  await expect(page.getByRole("tab", { name: "Evidence", exact: true })).toHaveAttribute("aria-selected", "true");
  const score = await (await call(page.request, "explain_score", { id })).json();
  expect(score.data.priority_factors.impact.value).toBeGreaterThanOrEqual(0);
  expect(score.sources.length).toBeGreaterThan(0);
  expect(score.sources.length).toBeLessThanOrEqual(3);
  await page.goto(score.href);
  await expect(page.getByRole("tab", { name: "Scoring", exact: true })).toHaveAttribute("aria-selected", "true");
  const result = await (await call(page.request, "read_customer_quotes", { id, n: 3 })).json();
  expect(result.quoteLabel).toBe("AI voice reading a real customer comment");
  expect(result.quotes.length).toBeGreaterThan(0);
  for (const q of result.quotes) expect(q.text).toBe(read("SELECT text FROM feedback WHERE id=?", q.id)[0].text);
  const events = read("SELECT * FROM audit_events WHERE actor='PM (voice)' AND entity_id=? ORDER BY id DESC", id);
  expect(events.some((e) => e.rationale === "Open the evidence for this requirement")).toBe(true);
  expect(String(events[0].after)).toContain(result.quotes[0].id);
  expect(String(events[0].ts)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  const invalid = await call(page.request, "read_customer_quotes", { id, n: -2 });
  expect(invalid.status()).toBe(400);
});

test("voice previews a challenge; it applies only after the PM clicks Confirm", async ({ page }) => {
  const original = req(); const id = String(original.id);
  try {
    const result = await (await call(page.request, "run_challenge", { id }, "Challenge this evidence")).json();
    expect(result.ok).toBe(true);
    expect(result.data.preview.issues).toBeInstanceOf(Array);
    expect(result.data.status).toBe("awaiting_confirmation");
    // Voice alone changed nothing.
    expect(read("SELECT challenged FROM requirements WHERE id=?", id)[0].challenged).toBe(0);
    const done = await (await confirm(page.request, result.confirmation.token, true)).json();
    expect(done.ok).toBe(true);
    const after = read("SELECT challenged, confidence FROM requirements WHERE id=?", id)[0];
    expect(after.challenged).toBe(1);
    expect(after.confidence).toBe(result.data.preview.confidence_after);
    // A second request reports the existing result instead of proposing again.
    const second = await (await call(page.request, "run_challenge", { id })).json();
    expect(second.data.status).toBe("already_challenged");
    await page.goto(second.href);
    await expect(page.getByRole("heading", { name: "Challenge result" })).toBeVisible();
  } finally {
    write("UPDATE requirements SET challenged=?, confidence=?, quadrant=?, updated_at=? WHERE id=?", original.challenged, original.confidence, original.quadrant, original.updated_at, id);
  }
});

test("voice reaches the whole workspace through existing data and navigation", async ({ page }) => {
  const nav = await (await call(page.request, "navigate", { page: "vehicle", model: "G60", view: "matrix" }, "Show me the 5 Series matrix")).json();
  expect(nav.href).toBe("/vehicles/G60?view=matrix");
  expect((await call(page.request, "navigate", { page: "elsewhere" })).status()).toBe(400);
  expect((await (await call(page.request, "navigate", { page: "audit" })).json()).href).toBe("/audit");

  const vehicles = await (await call(page.request, "list_vehicles", {})).json();
  expect(vehicles.data.vehicles.map((v: { code: string }) => v.code).sort()).toEqual(["F70", "G60", "G70"]);

  const found = await (await call(page.request, "find_requirements", { model: "G70", filter: "pending" })).json();
  expect(found.ok).toBe(true);
  for (const r of found.data.requirements) expect(["proposed", "edited", "validate"]).toContain(r.status);
  const ids = found.data.requirements.map((r: { id: string }) => r.id);
  expect(read(`SELECT id FROM requirements WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)).toHaveLength(ids.length);
  await page.goto(found.href);
  await expect(page.locator(`[data-requirement-id="${ids[0]}"]`)).toBeAttached();

  const critical = await (await call(page.request, "critical_issues", { model: "G70" })).json();
  expect(critical.ok).toBe(true);
  for (const r of critical.data.urgent) expect(r.quadrant).toBe("act");

  const feedback = await (await call(page.request, "summarize_feedback", { model: "G70" })).json();
  expect(feedback.data.topics.length).toBeGreaterThan(0);
  expect(feedback.href).toBe("/vehicles/G70?view=signals");

  const portfolio = await (await call(page.request, "portfolio_overview", {})).json();
  expect(portfolio.data.themes.length).toBeGreaterThan(0);

  const audit = await (await call(page.request, "audit_trail", { model: "G70" })).json();
  expect(audit.data.events.every((e: { action: string }) => !e.action.startsWith("voice:"))).toBe(true);
  const logged = read("SELECT after FROM audit_events WHERE actor='PM (voice)' AND action='voice: navigate' AND rationale=? ORDER BY id", "Show me the 5 Series matrix");
  expect(logged.map((e) => e.after)).toEqual(["Requested", expect.stringContaining("Opened G60 (matrix)")]);
});

test("voice cannot change team strategy weights", async ({ page }) => {
  expect((await call(page.request, "set_strategy", { preset: "Premium" })).status()).toBe(400);
});

test("approval is pending until confirmation, tied to the browser, and single-use", async ({ page, browser }) => {
  const original = req(); const id = String(original.id);
  const other = await browser.newContext({ baseURL: base });
  await other.addCookies([{ name: "pmw_region", value: "ALL", url: base }]);
  try {
    const result = await (await call(page.request, "request_decision", { id, decision: "approve" }, "Please approve this requirement")).json();
    const token = result.confirmation.token;
    expect(read("SELECT status FROM requirements WHERE id=?", id)[0].status).toBe(original.status);
    expect((await call(page.request, "approve", { id })).status()).toBe(400);
    expect((await confirm(other.request, token, true)).status()).toBe(409);
    expect((await confirm(page.request, token, true)).status()).toBe(200);
    expect(read("SELECT status FROM requirements WHERE id=?", id)[0].status).toBe("approved");
    expect((await confirm(page.request, token, true)).status()).toBe(409);
    const event = read("SELECT * FROM audit_events WHERE action='voice: confirm_approve' AND entity_id=? ORDER BY id DESC LIMIT 1", id)[0];
    expect(event.actor).toBe("PM (voice)");
    expect(event.rationale).toBe("Please approve this requirement");
    expect(event.after).toBe("Approved after the PM clicked Confirm.");
  } finally {
    await other.close();
    write("UPDATE requirements SET status=?,updated_at=? WHERE id=?", original.status, original.updated_at, id);
  }
});

test("cancelled, expired and stale rejection proposals do not change the requirement", async ({ page }) => {
  const original = req(); const id = String(original.id);
  try {
    const prepare = async () => (await (await call(page.request, "request_decision", { id, decision: "reject" })).json()).confirmation.token;
    const cancelled = await prepare();
    expect((await confirm(page.request, cancelled, false)).status()).toBe(200);
    const expired = await prepare();
    write("UPDATE settings SET value=json_set(value,'$.expiresAt',0) WHERE key=?", `voice_decision:${expired}`);
    expect((await confirm(page.request, expired, true)).status()).toBe(409);
    const stale = await prepare();
    write("UPDATE requirements SET updated_at='2099-01-01T00:00:00Z' WHERE id=?", id);
    expect((await confirm(page.request, stale, true)).status()).toBe(409);
    expect(read("SELECT status FROM requirements WHERE id=?", id)[0].status).toBe(original.status);
  } finally { write("UPDATE requirements SET updated_at=? WHERE id=?", original.updated_at, id); }
});

test("quotes and voice audit text stay within the selected region; no-data is explicit", async ({ context, page }) => {
  const id = String(req().id);
  const privateText = "Voice request restricted to the global viewer";
  await call(page.request, "explain_score", { id }, privateText);
  await context.addCookies([{ name: "pmw_region", value: "US", url: base }]);
  const result = await (await call(page.request, "read_customer_quotes", { id, n: 10 })).json();
  if (result.ok) for (const quote of result.quotes) expect(quote.market).toBe("US");
  else expect(result.summary).toBe("I don't have data for that");
  const absent = await (await call(page.request, "open_requirement", { id: "R-DOES-NOT-EXIST" })).json();
  expect(absent.summary).toBe("I don't have data for that");
  expect(absent.sources).toEqual([]);
  await page.goto("/audit");
  await expect(page.getByText(privateText)).toHaveCount(0);
});

test("briefing distinguishes baseline and new conflicts; gaps navigate to data health", async ({ page }) => {
  write("DELETE FROM settings WHERE key='voice_briefing:ALL'");
  const first = await (await call(page.request, "daily_briefing", {})).json();
  expect(first.data.first_briefing).toBe(true);
  expect(first.data.pending_count).toBeGreaterThan(0);
  expect(first.data.new_conflicts).toEqual([]);
  const second = await (await call(page.request, "daily_briefing", {})).json();
  expect(second.data.first_briefing).toBe(false);
  expect(second.data.new_conflicts).toEqual([]);
  const gap = await (await call(page.request, "show_missing_voices", { model: "G70" })).json();
  expect(gap.data.representation.length).toBeGreaterThan(0);
  await page.goto(gap.href);
  await expect(page.getByRole("link", { name: "Data health", exact: true })).toHaveAttribute("aria-current", "page");
});

test("agent investigation is read-only, region-safe and grounded in stored evidence", async ({ context, page }) => {
  const r = req();
  const id = String(r.id);
  const before = read("SELECT status, confidence, challenged, updated_at FROM requirements WHERE id=?", id)[0];
  const result = await (await call(page.request, "investigate_requirement", { id }, "Investigate this requirement")).json();
  expect(result.ok).toBe(true);
  expect(result.data.priority).toBe(r.priority);
  expect(result.data.recommendation_reason).toContain(String(r.priority));
  expect(result.data.challenge_preview.issues.length).toBe(JSON.parse(String(r.challenge)).issues.length);
  for (const q of result.data.supporting_quotes) expect(read("SELECT text FROM feedback WHERE id=?", q.id)[0].text).toContain(q.text.slice(0, 60));
  expect(read("SELECT status, confidence, challenged, updated_at FROM requirements WHERE id=?", id)[0]).toEqual(before);
  await context.addCookies([{ name: "pmw_region", value: "US", url: base }]);
  const us = await (await call(page.request, "investigate_requirement", { id })).json();
  if (us.ok) for (const q of us.data.supporting_quotes) expect(q.market).toBe("US");
});

test("agent proposals create one-use tokens and audit rows; only a confirmation changes status", async ({ page }) => {
  const rows = read("SELECT id, status, updated_at FROM requirements WHERE vehicle='G70' AND kind='signal' AND status='proposed' ORDER BY priority DESC LIMIT 3");
  const spoken = "Agent test: investigate the top requirements and take the necessary actions";
  try {
    const items = rows.map((r, i) => ({ id: r.id, action: ["approve", "validate", "reject"][i], rationale: `Agent test rationale ${i + 1}.` }));
    const result = await (await call(page.request, "propose_decisions", { items }, spoken)).json();
    expect(result.confirmations).toHaveLength(3);
    expect(rows.map((r) => read("SELECT status FROM requirements WHERE id=?", r.id)[0].status)).toEqual(["proposed", "proposed", "proposed"]);
    for (const [i, r] of rows.entries()) {
      const rec = read("SELECT * FROM audit_events WHERE entity_id=? AND action=? ORDER BY id DESC LIMIT 1", r.id, `voice: recommended ${items[i].action}`)[0];
      expect(rec.rationale).toBe(spoken);
      expect(String(rec.after)).toContain(`Agent test rationale ${i + 1}.`);
    }
    // Confirm the validate proposal: the requirement moves to Needs Validation with the AI rationale in its audit.
    const validate = result.confirmations.find((c: { decision: string }) => c.decision === "validate");
    expect((await confirm(page.request, validate.token, true)).status()).toBe(200);
    expect(read("SELECT status FROM requirements WHERE id=?", validate.id)[0].status).toBe("validate");
    const pm = read("SELECT rationale FROM audit_events WHERE entity_id=? AND action='requested validation before deciding' ORDER BY id DESC LIMIT 1", validate.id)[0];
    expect(pm.rationale).toBe("AI proposal confirmed by PM: Agent test rationale 2.");
    expect((await confirm(page.request, validate.token, true)).status()).toBe(409);
    // Skipping leaves the rest unchanged.
    for (const c of result.confirmations.filter((x: { decision: string }) => x.decision !== "validate")) {
      expect((await confirm(page.request, c.token, false)).status()).toBe(200);
      expect(read("SELECT status FROM requirements WHERE id=?", c.id)[0].status).toBe("proposed");
    }
    // A decided requirement cannot be proposed again until the PM reopens it.
    write("UPDATE requirements SET status='approved' WHERE id=?", String(rows[0].id));
    const blocked = await call(page.request, "propose_decisions", { items: [{ id: rows[0].id, action: "reject", rationale: "Agent test." }] });
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).summary).toContain("Reopen");
  } finally {
    for (const r of rows) write("UPDATE requirements SET status=?, updated_at=? WHERE id=?", String(r.status), String(r.updated_at), String(r.id));
  }
});

test("voice APIs reject cross-origin requests", async ({ page }) => {
  for (const endpoint of ["session", "tools", "confirm"]) {
    const response = await page.request.post(`/api/voice/${endpoint}`, { headers: { origin: "https://another.example" }, data: {} });
    expect(response.status()).toBe(403);
  }
});
