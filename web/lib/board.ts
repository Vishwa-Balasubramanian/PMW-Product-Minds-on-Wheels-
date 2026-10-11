// Kanban board rules shared by the server page and the client board.
// Columns are the stored decision status; quadrants stay AI recommendation labels.
import { moscowFor } from "./moscow";
import type { Quadrant, Status } from "./types";

export type BoardCard = {
  id: string;
  title: string;
  vehicle: string;
  vehicleName: string;
  status: Status;
  quadrant: Quadrant;
  priority: number;
  confidence: number;
  kind: "signal" | "quick_win" | "market_conflict";
  challenged: boolean;
  /** Customer comments visible in the viewer's markets; null when the requirement rests on surveys only. */
  comments: number | null;
  /** Red-team findings about market representation (computed by the pipeline). */
  representation: string[];
  updatedAt: string;
};

export type BoardVehicle = { code: string; name: string; available: boolean; thin: boolean };

export const COLUMNS: { status: Status; title: string; hint: string }[] = [
  { status: "proposed", title: "To Review", hint: "AI-proposed, waiting for your decision" },
  { status: "validate", title: "Needs Validation", hint: "You asked for more evidence" },
  { status: "edited", title: "Edited / Re-review", hint: "Revised, waiting for another decision" },
  { status: "approved", title: "Approved", hint: "Approved for the successor generation" },
  { status: "rejected", title: "Rejected", hint: "Will not shape the successor generation" },
];

export type Move =
  | { kind: "action"; action: "approve" | "reject" | "validate" | "reopen"; title: string; prompt: string; required: boolean; submit: string }
  | { kind: "edit" }
  | { kind: "blocked"; message: string };

/** Map a column move onto the existing decision actions. Nothing here writes; the API validates again. */
export function moveFor(from: Status, to: Status): Move | null {
  if (from === to) return null;
  const decided = from === "approved" || from === "rejected";
  if (decided && to === "proposed") {
    return { kind: "action", action: "reopen", title: "Reopen this requirement?", prompt: "Note (optional)", required: false, submit: "Reopen" };
  }
  if (decided) return { kind: "blocked", message: "This requirement is decided. Move it to To Review (Reopen) before changing the decision." };
  switch (to) {
    case "approved":
      return { kind: "action", action: "approve", title: "Approve this requirement?", prompt: "Note (optional)", required: false, submit: "Confirm approval" };
    case "rejected":
      return { kind: "action", action: "reject", title: "Reject this requirement?", prompt: "Reason", required: true, submit: "Confirm rejection" };
    case "validate":
      return { kind: "action", action: "validate", title: "Request validation?", prompt: "What needs validating?", required: true, submit: "Request validation" };
    case "edited":
      return { kind: "edit" };
    case "proposed":
      return { kind: "blocked", message: "There is no action that returns an open requirement to To Review. Approve, reject, edit or request validation instead." };
  }
}

export type ConfidenceLevel = "high" | "medium" | "low";
export const HIGH_CONFIDENCE = 70;

/** Low = below the evidence threshold used by the quadrants. */
export function confidenceLevel(confidence: number, threshold: number): ConfidenceLevel {
  return confidence >= HIGH_CONFIDENCE ? "high" : confidence >= threshold ? "medium" : "low";
}

export const SORTS = {
  priority: "Highest priority",
  confidence: "Lowest evidence confidence",
  comments: "Most customer comments",
  updated: "Recently updated",
} as const;
export type SortKey = keyof typeof SORTS;

export type BoardFilters = {
  vehicle: string; // "all" or a vehicle code
  moscow: string | null; // must | should | could | wont
  conf: ConfidenceLevel | null;
  rec: Quadrant | "quick" | null;
  q: string;
  sort: SortKey;
  layout: "board" | "list";
};

export function applyFilters(cards: BoardCard[], f: BoardFilters, threshold: number): BoardCard[] {
  const q = f.q.trim().toLowerCase();
  const out = cards.filter((c) =>
    (f.vehicle === "all" || c.vehicle === f.vehicle)
    && (!f.moscow || moscowFor(c.priority).key === f.moscow)
    && (!f.conf || confidenceLevel(c.confidence, threshold) === f.conf)
    && (!f.rec || (f.rec === "quick" ? c.kind === "quick_win" : c.quadrant === f.rec))
    && (!q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
  const by: Record<SortKey, (a: BoardCard, b: BoardCard) => number> = {
    priority: (a, b) => b.priority - a.priority || b.confidence - a.confidence,
    confidence: (a, b) => a.confidence - b.confidence || b.priority - a.priority,
    comments: (a, b) => (b.comments ?? -1) - (a.comments ?? -1) || b.priority - a.priority,
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.priority - a.priority,
  };
  return out.sort(by[f.sort]);
}

/** Plain-language reason for the AI recommendation, from the same thresholds the quadrant uses. */
export function recommendationReason(priority: number, confidence: number, t: { priority: number; confidence: number }): string {
  const p = priority >= t.priority, c = confidence >= t.confidence;
  const pTxt = `priority ${priority} ${p ? "≥" : "<"} ${t.priority}`;
  const cTxt = `confidence ${confidence} ${c ? "≥" : "<"} ${t.confidence}`;
  if (p && c) return `Act: ${pTxt} and ${cTxt}. Important and well proven.`;
  if (p) return `Validate first: ${pTxt} but ${cTxt}. Important, but strengthen the evidence before deciding.`;
  if (c) return `Monitor: ${cTxt} but ${pTxt}. Well proven, lower importance.`;
  return `Park: ${pTxt} and ${cTxt}. Revisit if new evidence appears.`;
}

/** Red-team issue texts that describe market representation (see pipeline score.challenge_issues). */
export const isRepresentationIssue = (text: string) => /^No comments from |of the comments come from /.test(text);
