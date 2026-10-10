// The structured requirement list BMW asks for (deliverable 2): ID, description, linked findings and sources,
// priority, prioritisation rationale, evidence level, assumptions and uncertainties, decision status.
import type { ExportBundle } from "./gate";
import { moscowFor } from "./moscow";
import { MARKET_LABEL } from "./regions";
import { QUADRANT, STATUS_LABEL, type Factors, type SurveyRow } from "./types";

export type ExportRow = {
  id: string;
  vehicle: string;
  kind: string;
  title: string;
  description: string;
  customer_need: string;
  root_cause: string;
  customer_voice: string;
  findings_and_sources: string;
  comment_ids: string[];
  survey_evidence: string[];
  priority: number;
  moscow: string;
  priority_rationale: string[];
  confidence: number;
  quadrant: string;
  evidence_level: string;
  assumptions: string[];
  uncertainties: string[];
  contradictions: string[];
  already_exists: string[];
  decision_status: string;
  last_decision: string;
  markets: string[];
  drafted_by: string;
};

const MAX_IDS = 10;
const PENDING = "Pending AI analysis";

function factorLines(f: Factors, labels: Record<string, string>): string[] {
  return Object.entries(f).map(
    ([k, v]) => `${labels[k] ?? k}: ${v.value.toFixed(2)} × weight ${Math.round(v.weight * 100)}% (${v.note})`,
  );
}

function surveyLine(s: SurveyRow): string {
  const where = `${MARKET_LABEL[s.market] ?? s.market}${s.variant ? `, ${s.variant}` : ""}`;
  const value = s.scale === 7 ? `${Math.round((s.bottom3 ?? 0) * 1000) / 10}% negative` : `mean ${s.mean} / 10`;
  const study = s.study === "US_2025" ? "US study 2025" : "CN/EU study 2025";
  return `${s.attribute} (${where}, ${study}): ${value}`;
}

const MATCH_LABEL: Record<string, string> = {
  option_same_vehicle: "Option on this car",
  package_same_vehicle: "Inside a package on this car",
  standard_other_vehicle: "Standard on another BMW",
  standard_but_failing: "Standard, but customers report problems",
};

export function buildRows(bundle: ExportBundle, labels: Record<string, string>): ExportRow[] {
  return bundle.requirements.map((r) => {
    const ev = bundle.evidence.get(r.signal_id) ?? { visible: [], hidden: {} };
    const hidden = Object.entries(ev.hidden).map(([m, n]) => `${n} comment${n === 1 ? "" : "s"} from ${MARKET_LABEL[m] ?? m} restricted`);
    const ids = ev.visible.slice(0, MAX_IDS);
    const more = ev.visible.length - ids.length;
    const survey = r.survey.map(surveyLine);
    const d = bundle.lastDecision.get(r.id);
    const findings = [
      r.signal_text ?? "",
      ids.length ? `Comments: ${ids.join(", ")}${more > 0 ? ` (+${more} more)` : ""}` : "",
      survey.length ? `Survey: ${survey.join("; ")}` : "",
      ...hidden,
    ].filter(Boolean);
    const c = r.confidence_factors;
    const evidenceLevel =
      `${QUADRANT[r.quadrant].label} (${QUADRANT[r.quadrant].hint.toLowerCase()}). Confidence ${r.confidence}` +
      (r.challenged ? " after challenge" : "") +
      `: ${Object.entries(c).map(([k, v]) => `${labels[k] ?? k} ${v.value.toFixed(2)}`).join(", ")}.`;
    return {
      id: r.id,
      vehicle: r.vehicle,
      kind: r.kind ?? "signal",
      title: r.title,
      description: r.requirement,
      customer_need: r.customer_need ?? PENDING,
      root_cause: r.root_cause ?? PENDING,
      customer_voice: r.customer_voice ?? "",
      findings_and_sources: findings.join(" | "),
      comment_ids: ids,
      survey_evidence: survey,
      priority: r.priority,
      moscow: moscowFor(r.priority).label,
      priority_rationale: factorLines(r.priority_factors, labels),
      confidence: r.confidence,
      quadrant: QUADRANT[r.quadrant].label,
      evidence_level: evidenceLevel,
      assumptions: r.assumptions,
      uncertainties: r.uncertainties,
      contradictions: r.contradictions,
      already_exists: (r.already_exists ?? []).map(
        (m) => `${MATCH_LABEL[m.match_type] ?? m.match_type}: ${m.equipment_name}${m.code ? ` (${m.code}` : ""}${m.price_eur ? `, €${m.price_eur.toLocaleString("en-US")}` : ""}${m.code ? ")" : ""}${m.source_vehicle && m.source_vehicle !== r.vehicle ? ` on ${m.source_vehicle}` : ""}`,
      ),
      decision_status: STATUS_LABEL[r.status],
      last_decision: d ? `${d.action} by ${d.actor} on ${d.ts}${d.rationale ? `: “${d.rationale}”` : ""}` : "No decision yet",
      markets: r.markets.map((m) => MARKET_LABEL[m] ?? m),
      drafted_by: r.generated_by,
    };
  });
}

/** CSV for Excel: UTF-8 with BOM, every field quoted, lists joined with " | ". */
export function toCsv(rows: ExportRow[]): string {
  const columns = Object.keys(rows[0] ?? { id: "" }) as (keyof ExportRow)[];
  const cell = (v: unknown) => `"${(Array.isArray(v) ? v.join(" | ") : String(v ?? "")).replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => cell(c)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
