import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { applyAction } from "@/lib/actions";
import { one, parse, writeBatch } from "@/lib/db";
import {
  auditFor, auditLog, auditStatement, dataIssues, getRequirement, getVehicle, getWeights, happiness, listRequirements,
  listSignals, listVehicles, missingVoices, portfolio, representation, voiceBriefing, type Viewer,
} from "@/lib/gate";
import type { Quote, Requirement } from "@/lib/types";
import { isRepresentationIssue, recommendationReason } from "@/lib/board";
import { QUADRANT } from "@/lib/types";
import { noVoiceData, REQUIREMENT_FILTERS, VEHICLE_VIEWS, type ConfirmableAction, type VoiceResult, type VoiceSource, type VoiceTool } from "./config";

const QUADRANT_LABEL = Object.fromEntries(Object.entries(QUADRANT).map(([k, v]) => [k, v.label])) as Record<keyof typeof QUADRANT, string>;

export const voiceActor = (viewer: Viewer): Viewer => ({ ...viewer, actor: "PM (voice)" });
const BROWSER_COOKIE = "pmw_voice_browser";
const COOKIE_AGE = 60 * 60;
const MAX_QUOTES = 10;

export async function logVoice(viewer: Viewer, tool: string, spoken: string, result: string, entity = "voice") {
  await writeBatch([auditStatement({
    actor_type: "pm", actor: "PM (voice)", region: viewer.region,
    entity_type: "voice", entity_id: entity, action: `voice: ${tool}`,
    field: "voice result", after: result, rationale: spoken || "[No user transcript received]",
  })]);
}

function requireText(value: unknown, name: string, limit = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`Invalid ${name}.`);
  return value.trim();
}

function rankedQuotes(quotes: Quote[]) {
  return [...quotes].sort((a, b) => Number(b.role === "supports") - Number(a.role === "supports")
    || Number(["serious", "very serious"].includes(b.severity ?? "")) - Number(["serious", "very serious"].includes(a.severity ?? ""))
    || a.id.localeCompare(b.id));
}

function sourcesFor(r: Requirement, quotes: Quote[]): VoiceSource[] {
  const sources: VoiceSource[] = rankedQuotes(quotes).map((q) => ({ id: q.id, source: q.source, market: q.market, role: q.role }));
  for (const s of r.survey) sources.push({ id: `${s.study}:${s.market}:${s.attribute}`, source: `BMW customer study ${s.study}`, market: s.market });
  for (const e of r.already_exists) sources.push({ id: e.code ?? e.equipment_name, source: `BMW ${e.source_vehicle ?? r.vehicle} price list` });
  return sources.filter((s, i) => sources.findIndex((other) => other.id === s.id) === i).slice(0, 3);
}

async function confidenceFor(r: Requirement) {
  return { value: r.confidence, level: r.confidence >= (await getWeights()).thresholds.confidence ? "high" : "limited" };
}

const NOT_APPLICABLE = { value: null, level: "not applicable" };
const PENDING = ["proposed", "edited", "validate"];
const byPriority = (a: Requirement, b: Requirement) => b.priority - a.priority;
const compact = (r: Requirement) => ({ id: r.id, title: r.title, priority: r.priority, confidence: r.confidence, quadrant: r.quadrant, status: r.status, kind: r.kind, markets: r.markets });
const isConflict = (r: Requirement) => r.kind === "market_conflict" || r.conflicts.length > 0;

function modelCode(value: unknown) {
  const model = requireText(value, "model").toUpperCase().replace(/^BMW /, "");
  return ({ "7 SERIES": "G70", "5 SERIES": "G60", "1 SERIES": "F70" } as Record<string, string>)[model] ?? model;
}

function matchesFilter(r: Requirement, filter: string, confidenceThreshold: number) {
  switch (filter) {
    case "all": return true;
    case "pending": return PENDING.includes(r.status);
    case "approved": case "rejected": return r.status === filter;
    case "quick_win": return r.kind === "quick_win";
    case "conflict": return isConflict(r);
    case "weak_evidence": return r.confidence < confidenceThreshold;
    default: return r.quadrant === filter;
  }
}

// Opens the requirement's Decision Card on the vehicle's Requirements board, on the given tab.
const requirementHref = (r: Requirement, tab = "evidence") =>
  `/vehicles/${encodeURIComponent(r.vehicle)}?req=${encodeURIComponent(r.id)}&tab=${tab}#decision-card`;

// Board filters that show a find_requirements result set (columns already separate decision status).
const BOARD_FILTER: Record<string, string> = {
  act: "q=act", validate: "q=validate", monitor: "q=monitor", park: "q=park", quick_win: "q=quick", conflict: "q=conflict",
};

type Decision = ConfirmableAction;
type PendingDecision = {
  id: string; title: string; decision: Decision; spoken: string;
  /** The agent's evidence-backed reason, when proposed by the agentic workflow. */
  rationale?: string;
  browser: string; region: string; expiresAt: number; updatedAt: string; status: string;
};
const DECISION_LABEL: Record<Decision, { done: string; past: string }> = {
  approve: { done: "Approved", past: "approved" },
  reject: { done: "Rejected", past: "rejected" },
  validate: { done: "Validation requested", past: "sent for validation" },
  challenge: { done: "Challenged", past: "challenged" },
};
const MAX_PROPOSALS = 5;

async function prepareDecision(viewer: Viewer, r: Requirement, decision: unknown, spoken: string, rationale?: string): Promise<NonNullable<VoiceResult["confirmation"]>> {
  if (decision !== "approve" && decision !== "reject" && decision !== "validate" && decision !== "challenge") throw new Error("Choose approve, reject or validate.");
  // Same rule as the board: a decided requirement must be reopened by the PM before a new decision.
  if (decision !== "challenge" && (r.status === "approved" || r.status === "rejected")) throw new Error(`This requirement is already ${r.status}. Reopen it on screen first.`);
  const store = await cookies();
  let browser = store.get(BROWSER_COOKIE)?.value;
  if (!browser) {
    browser = randomUUID();
    store.set(BROWSER_COOKIE, browser, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" && !!process.env.VERCEL, maxAge: COOKIE_AGE, path: "/api/voice" });
  }
  const token = randomUUID();
  const expiresAt = Date.now() + 5 * 60_000;
  const pending: PendingDecision = { id: r.id, title: r.title, decision, spoken, rationale, browser, region: viewer.region, expiresAt, updatedAt: r.updated_at, status: r.status };
  await writeBatch([
    { sql: "DELETE FROM settings WHERE key LIKE 'voice_decision:%' AND json_extract(value, '$.expiresAt') < ?", args: [Date.now()] },
    { sql: "INSERT INTO settings (key, value) VALUES (?, ?)", args: [`voice_decision:${token}`, JSON.stringify(pending)] },
  ]);
  return { token, id: r.id, title: r.title, decision, expiresAt, rationale };
}

export async function executeVoiceTool(viewer: Viewer, tool: VoiceTool, params: Record<string, unknown>, spoken: string): Promise<VoiceResult> {
  const actor = voiceActor(viewer);
  if (tool === "navigate") {
    const page = requireText(params.page, "page");
    if (page === "vehicle") {
      const code = modelCode(params.model);
      if (!await getVehicle(code)) throw new Error("Unknown vehicle model.");
      const view = VEHICLE_VIEWS.find((v) => v === params.view) ?? "inbox";
      return { ok: true, summary: `Opened ${code} (${view}).`, confidence: NOT_APPLICABLE, sources: [], href: `/vehicles/${code}?view=${view}` };
    }
    const href = ({ home: "/", portfolio: "/portfolio", workflow: "/workflow", audit: "/audit" } as Record<string, string>)[page];
    if (!href) throw new Error("Unknown page.");
    return { ok: true, summary: `Opened ${page}.`, confidence: NOT_APPLICABLE, sources: [], href };
  }
  if (tool === "list_vehicles") {
    const vehicles = await listVehicles(viewer);
    return {
      ok: true, summary: `${vehicles.length} vehicle programs.`, confidence: NOT_APPLICABLE, sources: [{ id: "vehicles", source: "PMW vehicle register" }], href: "/",
      data: { region: viewer.region, vehicles: vehicles.map(({ code, name, comments, requirements, awaiting, available, thin }) => ({ code, name, comments, requirements, awaiting_review: awaiting, sold_in_region: available, no_comments_in_region: thin })) },
    };
  }
  if (tool === "find_requirements") {
    const code = modelCode(params.model);
    const filter = typeof params.filter === "string" ? params.filter : "all";
    if (!REQUIREMENT_FILTERS.includes(filter as never)) throw new Error("Invalid filter.");
    const query = typeof params.query === "string" ? params.query.trim().toLowerCase().slice(0, 100) : "";
    const threshold = (await getWeights()).thresholds.confidence;
    const matches = (await listRequirements(viewer, code))
      .filter((r) => matchesFilter(r, filter, threshold) && (!query || [r.title, r.requirement, r.aspect, r.part, r.customer_need].some((t) => t?.toLowerCase().includes(query))))
      .sort(byPriority);
    if (!matches.length) return noVoiceData();
    // A keyword search opens the best match; a filter shows the matching cards on the board.
    const href = query ? requirementHref(matches[0], "overview")
      : `/vehicles/${code}${BOARD_FILTER[filter] ? `?${BOARD_FILTER[filter]}` : ""}`;
    return {
      ok: true, summary: `${matches.length} matching requirements for ${code}.`, confidence: { value: null, level: "per requirement; see results" },
      sources: [{ id: code, source: "PMW requirement register" }], href,
      data: { model: code, filter, query, total: matches.length, requirements: matches.slice(0, 10).map(compact) },
    };
  }
  if (tool === "critical_issues") {
    const only = params.model ? modelCode(params.model) : null;
    const vehicles = (await listVehicles(viewer)).filter((v) => v.available && (!only || v.code === only));
    if (!vehicles.length) return noVoiceData();
    const groups = await Promise.all(vehicles.map(async (v) => {
      const [requirements, gap, issues] = await Promise.all([listRequirements(viewer, v.code), missingVoices(v.code), dataIssues(v.code)]);
      return { code: v.code, requirements, gap, issues };
    }));
    const open = groups.flatMap((g) => g.requirements).filter((r) => PENDING.includes(r.status)).sort(byPriority);
    const urgent = open.filter((r) => r.quadrant === "act");
    const challenged = open.filter((r) => r.challenge.issues.length > 0);
    const conflicts = open.filter(isConflict);
    const gaps = groups.filter((g) => g.gap).map((g) => ({ model: g.code, warning: g.gap }));
    const critical = [...new Map(groups.flatMap((g) => g.issues).filter((i) => i.severity === "critical").map((i) => [i.id, i])).values()]
      .map(({ dataset, vehicle, description, handling }) => ({ dataset, vehicle, description, handling }));
    return {
      ok: true, summary: `${urgent.length} high-priority undecided requirements, ${challenged.length} with challenged evidence, ${conflicts.length} market conflicts, ${gaps.length} coverage gaps, ${critical.length} critical data issues.`,
      confidence: { value: null, level: "per requirement; see results" }, sources: [{ id: "requirements", source: "PMW requirement register" }, { id: "data_issues", source: "PMW data health" }],
      href: only ? `/vehicles/${only}?q=act` : "/",
      data: {
        urgent: urgent.slice(0, 5).map(compact), conflicts: conflicts.slice(0, 5).map(compact), gaps, critical_data_issues: critical.slice(0, 5),
        challenged: challenged.slice(0, 5).map((r) => ({ ...compact(r), issues: r.challenge.issues.slice(0, 2).map((i) => i.text) })),
      },
    };
  }
  if (tool === "summarize_feedback") {
    const code = modelCode(params.model);
    if (!await getVehicle(code)) return noVoiceData();
    const [signals, coverage] = await Promise.all([listSignals(code), happiness(viewer, code)]);
    const topics = signals.filter((s) => s.in_scope).slice(0, 6).map((s) => ({
      topic: s.topic, comments: s.n_comments, negative: s.n_negative, likes: s.n_likes, defects: s.n_defect, wants: s.n_wants,
      dominant_issue: s.dominant_issue, by_market: s.by_market, requirement_id: s.requirement_id,
    }));
    if (!topics.length) return noVoiceData();
    return {
      ok: true, summary: `Top customer topics for ${code}: ${topics.slice(0, 3).map((t) => `${t.topic} (${t.negative} negative of ${t.comments})`).join("; ")}.`,
      confidence: { value: null, level: "aggregate counts from loaded feedback" }, sources: [{ id: code, source: "PMW customer feedback signals" }], href: `/vehicles/${code}?view=signals`,
      data: { model: code, topics, approval_coverage: coverage, note: "Approval coverage is the share of negative comments addressed by approved requirements, not satisfaction." },
    };
  }
  if (tool === "audit_trail") {
    const requirementId = typeof params.id === "string" && params.id.trim() ? requireText(params.id, "requirement ID") : null;
    const code = params.model ? modelCode(params.model) : requirementId?.match(/^[RS]-([A-Z0-9]+)-/)?.[1];
    const events = requirementId ? await auditFor(viewer, requirementId) : await auditLog(viewer, { vehicle: code, limit: 60 });
    // Voice request bookkeeping would crowd out the decisions the PM asks about.
    const recent = events.filter((e) => e.entity_type !== "voice").slice(0, 10).map((e) => ({
      ts: e.ts, actor: e.actor, actor_type: e.actor_type, entity: e.entity_id, action: e.action, field: e.field,
      before: e.before?.slice(0, 160) ?? null, after: e.after?.slice(0, 160) ?? null, rationale: e.rationale?.slice(0, 200) ?? null,
    }));
    if (!recent.length) return noVoiceData();
    return {
      ok: true, summary: `${recent.length} most recent audit events${requirementId ? ` for ${requirementId}` : code ? ` for ${code}` : ""}.`, confidence: NOT_APPLICABLE,
      sources: [{ id: "audit_events", source: "PMW audit trail" }], href: `/audit${code ? `?vehicle=${code}` : ""}`, data: { events: recent },
    };
  }
  if (tool === "portfolio_overview") {
    const { themes, recurring } = await portfolio();
    if (!themes.length) return noVoiceData();
    return {
      ok: true, summary: `${recurring} customer themes recur across vehicle programs.`, confidence: { value: null, level: "aggregate counts from loaded feedback" },
      sources: [{ id: "signals", source: "PMW Cross-Model Radar" }], href: "/portfolio",
      data: { recurring, themes: themes.slice(0, 8).map((t) => ({ theme: t.theme, recurring: t.recurring, by_vehicle: t.cells.map((c) => ({ vehicle: c.vehicle, comments: c.comments, negative: c.negative, negative_share: c.share === null ? null : Math.round(c.share * 100) })) })) },
    };
  }
  if (tool === "show_missing_voices") {
    const code = modelCode(params.model);
    if (!await getVehicle(code)) return noVoiceData();
    const [warning, rows] = await Promise.all([missingVoices(code), representation(code)]);
    if (!rows.length) return noVoiceData();
    return { ok: true, summary: warning ?? "No missing-voices alert is currently flagged for this model.", confidence: { value: null, level: warning ? "limited by missing voices" : "not scored at model level" }, sources: [{ id: code, source: "PMW feedback coverage and BMW 2025 sales" }], href: `/vehicles/${code}?view=data#missing-voices`, data: { model: code, warning, representation: rows } };
  }
  if (tool === "daily_briefing") {
    const key = `voice_briefing:${viewer.region}`;
    const last = await one<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
    const since = last && Number.isFinite(Date.parse(last.value)) ? last.value : null;
    const data = await voiceBriefing(viewer, since);
    await writeBatch([{ sql: "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [key, data.as_of] }]);
    return { ok: true, summary: `${data.pending_count} pending decisions; ${data.existing_conflicts} existing conflicts; ${data.gaps.length} models with coverage gaps. ${since ? `${data.new_conflicts.length} new conflicts since the previous briefing.` : "First briefing: this establishes the baseline for new conflicts."}`, confidence: { value: null, level: "varies by requirement; see pending decisions" }, sources: [{ id: "requirements", source: "PMW requirement register" }, { id: "representation", source: "BMW feedback and sales coverage" }], data };
  }
  if (tool === "propose_decisions") {
    const items = Array.isArray(params.items) ? params.items : [];
    if (!items.length || items.length > MAX_PROPOSALS) throw new Error(`Invalid proposals: send 1 to ${MAX_PROPOSALS} items.`);
    const confirmations: NonNullable<VoiceResult["confirmations"]> = [];
    const failed: { id: string; error: string }[] = [];
    for (const item of items as Record<string, unknown>[]) {
      const itemId = requireText(item?.id, "requirement ID");
      const rationale = requireText(item?.rationale, "rationale", 600);
      const found = await getRequirement(actor, itemId);
      if (!found) { failed.push({ id: itemId, error: "I don't have data for that" }); continue; }
      try {
        const c = await prepareDecision(viewer, found.requirement, item.action, spoken, rationale);
        confirmations.push(c);
        // AI recommendations are logged separately from the PM's later confirmation.
        await logVoice(viewer, `recommended ${c.decision}`, spoken, `Proposed for PM confirmation: ${rationale}`, itemId);
      } catch (e) {
        failed.push({ id: itemId, error: e instanceof Error ? e.message : "Could not prepare this proposal." });
      }
    }
    if (!confirmations.length) throw new Error(`Invalid proposals: ${failed.map((f) => `${f.id}: ${f.error}`).join("; ")}`);
    return {
      ok: true, summary: `${confirmations.length} proposal${confirmations.length === 1 ? "" : "s"} awaiting the PM's click on screen. Nothing has been applied.`,
      confidence: NOT_APPLICABLE, sources: confirmations.map((c) => ({ id: c.id, source: "PMW confirmation dialog" })),
      confirmations, data: { status: "awaiting_confirmation", proposed: confirmations.map(({ id, decision }) => ({ id, decision })), failed },
    };
  }
  const id = requireText(params.id, "requirement ID");
  const detail = await getRequirement(actor, id);
  if (!detail) return noVoiceData();
  const r = detail.requirement;
  const base = { ok: true, confidence: await confidenceFor(r), sources: sourcesFor(r, detail.quotes), href: requirementHref(r) };
  switch (tool) {
    case "open_requirement":
      return { ...base, summary: `Opened ${r.id}: ${r.title}.`, data: { id, title: r.title, requirement: r.requirement, customer_need: r.customer_need, status: r.status, priority: r.priority, quadrant: r.quadrant, kind: r.kind, markets: r.markets } };
    case "explain_score":
      return { ...base, href: requirementHref(r, "scoring"), summary: `Priority ${r.priority}/100; confidence ${r.confidence}/100.`, data: { id, priority: r.priority, priority_factors: r.priority_factors, confidence_factors: r.confidence_factors, evidence_mix: r.evidence_mix, source_selection: "Supporting evidence first, then serious comments, then source ID; survey and equipment sources fill remaining slots." } };
    case "run_challenge": {
      // Preview only: the challenge is precomputed, so voice can read it out; applying it needs the PM's click.
      if (r.challenged) return { ...base, href: requirementHref(r, "overview"), summary: `${r.id} was already challenged; confidence is ${r.confidence}/100.`, data: { id, challenge: r.challenge, status: "already_challenged" } };
      const { issues, revised_confidence } = r.challenge;
      return {
        ...base, href: requirementHref(r, "overview"),
        summary: `Evidence Challenger preview: ${issues.length} issue${issues.length === 1 ? "" : "s"}; confidence would go from ${r.confidence} to ${revised_confidence}/100. Awaiting a click to apply. Nothing has changed.`,
        confirmation: await prepareDecision(viewer, r, "challenge", spoken),
        data: { id, preview: { issues: issues.map((i) => i.text), confidence_now: r.confidence, confidence_after: revised_confidence }, status: "awaiting_confirmation" },
      };
    }
    case "read_customer_quotes": {
      const count = params.n ?? 1;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_QUOTES) throw new Error(`Quote count must be between 1 and ${MAX_QUOTES}.`);
      const quotes = rankedQuotes(detail.quotes).slice(0, count).map(({ id, text, source, market, role }) => ({ id, text, source, market, role }));
      if (!quotes.length) return noVoiceData();
      return { ...base, summary: `${quotes.length} real customer comments available${quotes.length < count ? ` (fewer than the ${count} requested)` : ""}.`, quotes, quoteLabel: "AI voice reading a real customer comment", sources: quotes.map(({ id, source, market, role }) => ({ id, source, market, role })) };
    }
    case "investigate_requirement": {
      const weights = await getWeights();
      const quotes = rankedQuotes(detail.quotes);
      const pick = (role: string, n: number) => quotes.filter((q) => q.role === role).slice(0, n).map(({ id, text, source, market, severity }) => ({ id, text: text.slice(0, 300), source, market, severity }));
      const events = (await auditFor(actor, id)).filter((e) => e.entity_type !== "voice").slice(0, 5)
        .map((e) => ({ ts: e.ts, actor: e.actor, action: e.action, rationale: e.rationale?.slice(0, 160) ?? null }));
      const hint = ({ act: "approve", validate: "validate", monitor: "validate or approve", park: "validate or reject" } as const)[r.quadrant];
      return {
        ...base, href: requirementHref(r, "evidence"),
        summary: `${r.id}: priority ${r.priority}, confidence ${r.confidence}, ${QUADRANT_LABEL[r.quadrant]}, status ${r.status}.`,
        data: {
          id, title: r.title, status: r.status, kind: r.kind, requirement: r.requirement, customer_need: r.customer_need, root_cause: r.root_cause,
          priority: r.priority, confidence: r.confidence, quadrant: r.quadrant,
          recommendation_reason: recommendationReason(r.priority, r.confidence, weights.thresholds),
          quadrant_hint: hint,
          priority_factors: Object.fromEntries(Object.entries(r.priority_factors).map(([k, f]) => [k, { value: f.value, note: f.note }])),
          confidence_factors: Object.fromEntries(Object.entries(r.confidence_factors).map(([k, f]) => [k, { value: f.value, note: f.note }])),
          supporting_quotes: pick("supports", 5), contradicting_quotes: pick("contradicts", 2), hidden_comments_by_market: detail.hidden,
          survey: r.survey.slice(0, 6), conflicts: r.conflicts,
          // Precomputed red-team check, shown read-only; run_challenge would apply it.
          challenge_preview: { applied: r.challenged, issues: r.challenge.issues, revised_confidence: r.challenge.revised_confidence },
          market_representation: r.challenge.issues.map((i) => i.text).filter(isRepresentationIssue),
          assumptions: r.assumptions, uncertainties: r.uncertainties, recent_decisions: events,
        },
      };
    }
    case "request_decision":
      return { ...base, summary: "Awaiting a click in the confirmation dialog. No decision has been applied.", confirmation: await prepareDecision(viewer, r, params.decision, spoken), data: { status: "awaiting_confirmation" } };
  }
}

export async function confirmVoiceDecision(viewer: Viewer, token: string, confirm: boolean): Promise<VoiceResult> {
  const browser = (await cookies()).get(BROWSER_COOKIE)?.value ?? "";
  // Atomic claim: parallel/repeated confirmation requests cannot reuse a proposal.
  const row = await one<{ value: string }>(
    "DELETE FROM settings WHERE key = ? AND json_extract(value, '$.browser') = ? AND json_extract(value, '$.region') = ? RETURNING value",
    [`voice_decision:${token}`, browser, viewer.region],
  );
  const pending = parse<PendingDecision | null>(row?.value, null);
  if (!pending) throw new Error("This confirmation is invalid, already used, or belongs to another session.");
  const audit = (result: string) => logVoice(viewer, `confirm_${pending.decision}`, pending.spoken, result, pending.id);
  if (!confirm) {
    await audit("Cancelled by the PM. No decision applied.");
    return { ...noVoiceData(), ok: true, summary: "Decision cancelled. No change applied.", sources: [{ id: pending.id, source: "PMW confirmation dialog" }] };
  }
  const detail = await getRequirement(voiceActor(viewer), pending.id);
  if (pending.expiresAt < Date.now() || !detail || detail.requirement.updated_at !== pending.updatedAt || detail.requirement.status !== pending.status) {
    await audit("Expired or stale confirmation. No decision applied.");
    throw new Error("This confirmation expired or the requirement changed. Please request the decision again.");
  }
  const rationale = pending.rationale ? `AI proposal confirmed by PM: ${pending.rationale}` : pending.spoken;
  const result = await applyAction(voiceActor(viewer), pending.id, { action: pending.decision, rationale });
  await audit(result.ok ? `${DECISION_LABEL[pending.decision].done} after the PM clicked Confirm.` : result.error);
  if (!result.ok) throw new Error(result.error);
  return { ok: true, summary: `${pending.id} ${DECISION_LABEL[pending.decision].past} after your confirmation.`, data: { id: pending.id, decision: pending.decision }, confidence: await confidenceFor(detail.requirement), sources: [{ id: pending.id, source: "PMW decision audit" }], href: requirementHref(detail.requirement, "activity") };
}
