// PM decisions. Every change writes an audit event with who, when, before, after and why.
import { db, nowIso } from "./db";
import { getRequirementRow, getWeights, logEvent, type Viewer } from "./gate";
import type { Quadrant, Status } from "./types";

export type Action = "approve" | "reject" | "validate" | "edit" | "challenge" | "reopen";
export type EditableField = "title" | "requirement" | "customer_need";

export type ActionInput = {
  action: Action;
  rationale?: string;
  fields?: Partial<Record<EditableField, string>>;
};

const NEEDS_RATIONALE: Action[] = ["reject", "validate", "edit"];

export function quadrantFor(priority: number, confidence: number): Quadrant {
  const t = getWeights().thresholds;
  const hp = priority >= t.priority;
  const hc = confidence >= t.confidence;
  return hp && hc ? "act" : hp ? "validate" : hc ? "monitor" : "park";
}

export function applyAction(viewer: Viewer, id: string, input: ActionInput): { ok: true } | { ok: false; error: string } {
  const req = getRequirementRow(id);
  if (!req) return { ok: false, error: "Requirement not found." };
  if (!req.markets.some((m) => viewer.markets.includes(m as never))) {
    return { ok: false, error: "This requirement has no evidence in your region." };
  }
  const rationale = input.rationale?.trim() || null;
  if (NEEDS_RATIONALE.includes(input.action) && !rationale) {
    return { ok: false, error: "Add a short reason. It goes into the audit trail." };
  }

  const d = db();
  const base = { actor_type: "pm" as const, actor: viewer.actor, region: viewer.region, entity_type: "requirement", entity_id: id };
  const setStatus = (status: Status, action: string) => {
    d.prepare("UPDATE requirements SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
    logEvent({ ...base, action, field: "status", before: req.status, after: status, rationale });
  };

  const tx = d.transaction(() => {
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
        for (const [field, value] of Object.entries(input.fields ?? {}) as [EditableField, string][]) {
          const before = (req[field] ?? "") as string;
          const after = value.trim();
          if (!after || after === before) continue;
          d.prepare(`UPDATE requirements SET ${field} = ?, updated_at = ? WHERE id = ?`).run(after, nowIso(), id);
          logEvent({ ...base, action: `edited ${field.replace("_", " ")}`, field, before, after, rationale });
          changed++;
        }
        if (changed && req.status !== "approved") {
          d.prepare("UPDATE requirements SET status = 'edited' WHERE id = ?").run(id);
        }
        break;
      }
      case "challenge": {
        logEvent({ ...base, action: "challenged requirement", rationale });
        if (req.challenged) {
          logEvent({ actor_type: "ai", actor: "Red-team check", region: viewer.region, entity_type: "requirement", entity_id: id, action: "already challenged, no further change" });
          break;
        }
        const revised = req.challenge.revised_confidence;
        const q = quadrantFor(req.priority, revised);
        d.prepare("UPDATE requirements SET confidence = ?, quadrant = ?, challenged = 1, updated_at = ? WHERE id = ?").run(revised, q, nowIso(), id);
        logEvent({
          actor_type: "ai", actor: "Red-team check", region: viewer.region, entity_type: "requirement", entity_id: id,
          action: `found ${req.challenge.issues.length} issue${req.challenge.issues.length === 1 ? "" : "s"}`,
          rationale: req.challenge.issues.map((i) => i.text).join(" "),
        });
        logEvent({ actor_type: "ai", actor: "Scoring engine", region: viewer.region, entity_type: "requirement", entity_id: id, action: "revised confidence", field: "confidence", before: String(req.confidence), after: String(revised) });
        if (q !== req.quadrant) {
          logEvent({ actor_type: "ai", actor: "Scoring engine", region: viewer.region, entity_type: "requirement", entity_id: id, action: "moved quadrant", field: "quadrant", before: req.quadrant, after: q });
        }
        break;
      }
    }
  });
  tx();
  return { ok: true };
}
