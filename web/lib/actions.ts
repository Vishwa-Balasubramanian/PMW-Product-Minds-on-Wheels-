// PM decisions. Every change writes an audit event with who, when, before, after and why,
// in the same atomic batch as the change itself.
import type { InStatement } from "@libsql/client";
import { nowIso, writeBatch } from "./db";
import { auditStatement, getRequirementRow, getWeights, type Viewer } from "./gate";
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
