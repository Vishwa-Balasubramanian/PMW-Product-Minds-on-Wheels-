// PM decisions. Every change writes an audit event with who, when, before, after and why,
// in the same atomic batch as the change itself.
import type { InStatement } from "@libsql/client";
import { nowIso, writeBatch } from "./db";
import { auditStatement, getActiveWeights, getRequirementRow, getWeights, type ActiveWeights, type Viewer } from "./gate";
import { PRESETS, PRIORITY_FACTORS, normalise, presetLabel, type PriorityWeights } from "./score";
import type { Quadrant, Status } from "./types";

export type Action = "approve" | "reject" | "validate" | "edit" | "challenge" | "reopen";
export type EditableField = "title" | "requirement" | "customer_need";

export type ActionInput = {
  action: Action;
  rationale?: string;
  fields?: Partial<Record<EditableField, string>>;
};

const NEEDS_RATIONALE: Action[] = ["reject", "validate", "edit"];
const EDITABLE: EditableField[] = ["title", "requirement", "customer_need"];

export async function quadrantFor(priority: number, confidence: number): Promise<Quadrant> {
  const t = (await getWeights()).thresholds;
  const hp = priority >= t.priority;
  const hc = confidence >= t.confidence;
  return hp && hc ? "act" : hp ? "validate" : hc ? "monitor" : "park";
}

export async function applyAction(viewer: Viewer, id: string, input: ActionInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const req = await getRequirementRow(id);
  if (!req) return { ok: false, error: "Requirement not found." };
  if (!req.markets.some((m) => viewer.markets.includes(m as never))) {
    return { ok: false, error: "This requirement has no evidence in your region." };
  }
  const rationale = input.rationale?.trim() || null;
  if (NEEDS_RATIONALE.includes(input.action) && !rationale) {
    return { ok: false, error: "Add a short reason. It goes into the audit trail." };
  }

  const base = { actor_type: "pm" as const, actor: viewer.actor, region: viewer.region, entity_type: "requirement", entity_id: id };
  const ai = (actor: string) => ({ actor_type: "ai" as const, actor, region: viewer.region, entity_type: "requirement", entity_id: id });
  const stmts: InStatement[] = [];
  const setStatus = (status: Status, action: string) => {
    stmts.push({ sql: "UPDATE requirements SET status = ?, updated_at = ? WHERE id = ?", args: [status, nowIso(), id] });
    stmts.push(auditStatement({ ...base, action, field: "status", before: req.status, after: status, rationale }));
  };

  switch (input.action) {
    case "approve":
      setStatus("approved", "approved requirement");
      break;
    case "reject":
      setStatus("rejected", "rejected requirement");
      break;
    case "validate":
      setStatus("validate", "requested validation before deciding");
      break;
    case "reopen":
      setStatus("proposed", "reopened requirement");
      break;
    case "edit": {
      let changed = 0;
      for (const field of EDITABLE) {
        const value = input.fields?.[field];
        if (typeof value !== "string") continue;
        const before = (req[field] ?? "") as string;
        const after = value.trim();
        if (!after || after === before) continue;
        stmts.push({ sql: `UPDATE requirements SET ${field} = ?, updated_at = ? WHERE id = ?`, args: [after, nowIso(), id] });
        stmts.push(auditStatement({ ...base, action: `edited ${field.replace("_", " ")}`, field, before, after, rationale }));
        changed++;
      }
      if (changed) {
        setStatus("edited", "marked requirement for review after edit");
      }
      break;
    }
    case "challenge": {
      stmts.push(auditStatement({ ...base, action: "challenged requirement", rationale }));
      if (req.challenged) {
        stmts.push(auditStatement({ ...ai("Red-team check"), action: "already challenged, no further change" }));
        break;
      }
      const revised = req.challenge.revised_confidence;
      const q = await quadrantFor(req.priority, revised);
      const issues = req.challenge.issues;
      stmts.push({ sql: "UPDATE requirements SET confidence = ?, quadrant = ?, challenged = 1, updated_at = ? WHERE id = ?", args: [revised, q, nowIso(), id] });
      stmts.push(auditStatement({ ...ai("Red-team check"), action: `found ${issues.length} issue${issues.length === 1 ? "" : "s"}`, rationale: issues.map((i) => i.text).join(" ") }));
      stmts.push(auditStatement({ ...ai("Scoring engine"), action: "revised confidence", field: "confidence", before: String(req.confidence), after: String(revised) }));
      if (q !== req.quadrant) {
        stmts.push(auditStatement({ ...ai("Scoring engine"), action: "moved quadrant", field: "quadrant", before: req.quadrant, after: q }));
      }
      break;
    }
  }
  await writeBatch(stmts);
  return { ok: true };
}

// ---------- priority weights ----------
// Strategy weights are global for the team: any region may change them, and every change is logged with who,
// which region and why. The settings row and its audit event are written in one batch. The stored priority and
// quadrant columns are never rewritten; reads in gate.ts recompute them while weights_active exists.

export type WeightsInput = {
  weights: Record<string, unknown>;
  preset?: string;
  rationale?: string;
};

type Result = { ok: true } | { ok: false; error: string };

/** Five known factors, numbers 0..1 (or 0..100 as percentages), not all zero. Normalised to sum to 1. */
export function normaliseWeights(input: Record<string, unknown>): PriorityWeights | string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Weights are missing.";
  const keys = Object.keys(input);
  const unknown = keys.filter((k) => !(PRIORITY_FACTORS as readonly string[]).includes(k));
  if (unknown.length) return `Unknown factor: ${unknown.join(", ")}.`;
  const missing = PRIORITY_FACTORS.filter((k) => !keys.includes(k));
  if (missing.length) return `Missing factor: ${missing.join(", ")}.`;
  const raw = PRIORITY_FACTORS.map((k) => input[k]);
  if (!raw.every((v): v is number => typeof v === "number" && Number.isFinite(v))) return "Every weight must be a number.";
  if (raw.some((v) => v < 0 || v > 100)) return "Weights must be between 0 and 1, or 0 and 100 as percentages.";
  const percent = raw.some((v) => v > 1);
  const values = raw.map((v) => (percent ? v / 100 : v));
  if (values.reduce((a, b) => a + b, 0) <= 0) return "At least one weight must be above zero.";
  return normalise(Object.fromEntries(PRIORITY_FACTORS.map((k, i) => [k, values[i]])) as PriorityWeights);
}

const describeWeights = (w: Record<string, number>) => JSON.stringify(Object.fromEntries(PRIORITY_FACTORS.map((k) => [k, w[k]])));

export async function setWeights(viewer: Viewer, input: WeightsInput): Promise<Result> {
  const rationale = input.rationale?.trim();
  if (!rationale) return { ok: false, error: "Add a short reason. It goes into the audit trail." };
  const weights = normaliseWeights(input.weights);
  if (typeof weights === "string") return { ok: false, error: weights };
  // A preset name is kept only if the weights really are that preset; anything else is "custom".
  const match = PRESETS.find((p) => p.key === input.preset && PRIORITY_FACTORS.every((k) => Math.abs(p.weights[k] - weights[k]) < 1e-9));
  const preset = match?.key ?? "custom";
  const [before, defaults] = await Promise.all([getActiveWeights(), getWeights()]);
  const active: ActiveWeights = { priority: weights, preset, changed_by: viewer.actor, region: viewer.region, changed_at: nowIso() };
  await writeBatch([
    {
      sql: "INSERT INTO settings (key, value) VALUES ('weights_active', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [JSON.stringify(active)],
    },
    auditStatement({
      actor_type: "pm", actor: viewer.actor, region: viewer.region, entity_type: "weights", entity_id: "priority",
      action: `set priority weights: ${presetLabel(preset)}`, field: "weights",
      before: describeWeights(before?.priority ?? defaults.priority), after: describeWeights(weights), rationale,
    }),
  ]);
  return { ok: true };
}

export async function resetWeights(viewer: Viewer, input: { rationale?: string }): Promise<Result> {
  const rationale = input.rationale?.trim();
  if (!rationale) return { ok: false, error: "Add a short reason. It goes into the audit trail." };
  const [before, defaults] = await Promise.all([getActiveWeights(), getWeights()]);
  if (!before) return { ok: false, error: "The default weights are already active." };
  await writeBatch([
    { sql: "DELETE FROM settings WHERE key = 'weights_active'", args: [] },
    auditStatement({
      actor_type: "pm", actor: viewer.actor, region: viewer.region, entity_type: "weights", entity_id: "priority",
      action: "reset priority weights to the defaults", field: "weights",
      before: describeWeights(before.priority), after: describeWeights(defaults.priority), rationale,
    }),
  ]);
  return { ok: true };
}
