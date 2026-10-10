// The gatekeeper. Every read of customer data goes through this file, and it filters by the viewer's region.
// Rule for the team: no SQL in pages or components. Add a function here instead.
// In production the region comes from BMW single sign-on; in this prototype it is a cookie set by the region picker.
import { cookies } from "next/headers";
import { db, nowIso, parse } from "./db";
import { DEFAULT_REGION, MARKET_LABEL, MARKETS, REGIONS, REGION_COOKIE, isRegion, marketsFor, type Market, type RegionCode } from "./regions";
import type { AuditEvent, Quote, Requirement, Signal, Weights } from "./types";

export type Viewer = { region: RegionCode; markets: Market[]; label: string; actor: string };

export async function getViewer(): Promise<Viewer> {
  const store = await cookies();
  const v = store.get(REGION_COOKIE)?.value;
  const region: RegionCode = isRegion(v) ? v : DEFAULT_REGION;
  const r = REGIONS.find((x) => x.code === region)!;
  return {
    region,
    markets: marketsFor(region),
    label: r.label,
    actor: region === "ALL" ? "Head of product" : `Product manager · ${r.label}`,
  };
}

function inList(markets: readonly string[]) {
  return `(${markets.map(() => "?").join(",")})`;
}

// ---------- vehicles ----------

export type VehicleCard = {
  code: string;
  name: string;
  short: string;
  image: string;
  comments: number;
  sales2025: number;
  sales2030: number;
  requirements: number;
  awaiting: number;
  available: boolean; // sold in the viewer's region
  thin: boolean; // sold, but no customer comments in the region
};

export function listVehicles(viewer: Viewer): VehicleCard[] {
  const d = db();
  const mk = viewer.markets;
  const vehicles = d.prepare("SELECT code, name, short, image FROM vehicles ORDER BY code").all() as {
    code: string; name: string; short: string; image: string;
  }[];
  return vehicles.map((v) => {
    const comments = (d.prepare(`SELECT COUNT(*) n FROM feedback WHERE vehicle = ? AND market IN ${inList(mk)}`).get(v.code, ...mk) as { n: number }).n;
    const s = (year: number) =>
      (d.prepare(`SELECT COALESCE(SUM(volume),0) n FROM sales WHERE vehicle = ? AND year = ? AND market IN ${inList(mk)}`).get(v.code, year, ...mk) as { n: number }).n;
    const reqs = listRequirements(viewer, v.code);
    const sales2025 = s(2025);
    return {
      ...v,
      comments,
      sales2025,
      sales2030: s(2030),
      requirements: reqs.length,
      awaiting: reqs.filter((r) => r.status === "proposed" || r.status === "edited").length,
      available: sales2025 > 0,
      thin: sales2025 > 0 && comments === 0,
    };
  });
}

export function getVehicle(code: string) {
  return db().prepare("SELECT code, name, short, image FROM vehicles WHERE code = ?").get(code) as
    | { code: string; name: string; short: string; image: string }
    | undefined;
}

// ---------- requirements ----------

type Row = Record<string, unknown>;

function toRequirement(r: Row): Requirement {
  return {
    ...(r as unknown as Requirement),
    markets: parse(r.markets as string, []),
    assumptions: parse(r.assumptions as string, []),
    uncertainties: parse(r.uncertainties as string, []),
    contradictions: parse(r.contradictions as string, []),
    survey: parse(r.survey as string, []),
    conflicts: parse(r.conflicts as string, []),
    priority_factors: parse(r.priority_factors as string, {}),
    confidence_factors: parse(r.confidence_factors as string, {}),
    challenge: parse(r.challenge as string, { issues: [], revised_confidence: 0 }),
    challenged: Boolean(r.challenged),
  };
}

/** Requirements with evidence in at least one of the viewer's markets. */
export function listRequirements(viewer: Viewer, vehicle: string): Requirement[] {
  const rows = db().prepare("SELECT * FROM requirements WHERE vehicle = ? ORDER BY priority DESC, confidence DESC").all(vehicle) as Row[];
  return rows.map(toRequirement).filter((r) => r.markets.some((m) => viewer.markets.includes(m as Market)));
}

export function getRequirementRow(id: string): Requirement | undefined {
  const r = db().prepare("SELECT * FROM requirements WHERE id = ?").get(id) as Row | undefined;
  return r ? toRequirement(r) : undefined;
}

export type RequirementView = {
  requirement: Requirement;
  quotes: Quote[];
  hidden: Record<string, number>; // market -> number of comments the viewer may not see
};

/** One requirement with the customer evidence the viewer may see. Logs the access. */
export function getRequirement(viewer: Viewer, id: string): RequirementView | undefined {
  const req = getRequirementRow(id);
  if (!req) return undefined;
  const all = db()
    .prepare(
      `SELECT f.id, f.text, f.source, f.market, f.country, f.powertrain, f.severity, e.role
       FROM signal_evidence e JOIN feedback f ON f.id = e.feedback_id WHERE e.signal_id = ?`,
    )
    .all(req.signal_id) as Quote[];
  const quotes = all.filter((q) => viewer.markets.includes(q.market as Market));
  const hidden: Record<string, number> = {};
  for (const q of all) if (!viewer.markets.includes(q.market as Market)) hidden[q.market] = (hidden[q.market] ?? 0) + 1;
  logAccess(viewer, id, Object.keys(hidden).length > 0);
  return { requirement: req, quotes, hidden };
}

function logAccess(viewer: Viewer, id: string, restricted: boolean) {
  const d = db();
  const recent = d
    .prepare(
      `SELECT 1 FROM audit_events WHERE entity_type = 'requirement' AND entity_id = ? AND region = ?
       AND action LIKE 'viewed%' AND ts > ? LIMIT 1`,
    )
    .get(id, viewer.region, new Date(Date.now() - 10 * 60 * 1000).toISOString());
  if (recent) return;
  logEvent({
    actor_type: "system",
    actor: viewer.actor,
    region: viewer.region,
    entity_type: "requirement",
    entity_id: id,
    action: restricted ? "viewed evidence (other markets restricted)" : "viewed evidence",
  });
}

// ---------- audit ----------

export function logEvent(e: Omit<AuditEvent, "id" | "ts" | "field" | "before" | "after" | "rationale"> & Partial<AuditEvent>) {
  db()
    .prepare(
      `INSERT INTO audit_events (ts, actor_type, actor, region, entity_type, entity_id, action, field, before, after, rationale)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(nowIso(), e.actor_type, e.actor, e.region ?? null, e.entity_type, e.entity_id ?? null, e.action, e.field ?? null, e.before ?? null, e.after ?? null, e.rationale ?? null);
}

export function auditFor(entityId: string): AuditEvent[] {
  return db().prepare("SELECT * FROM audit_events WHERE entity_id = ? ORDER BY id DESC").all(entityId) as AuditEvent[];
}

export function auditLog(opts: { vehicle?: string; limit?: number } = {}): AuditEvent[] {
  const lim = opts.limit ?? 400;
  if (opts.vehicle) {
    return db()
      .prepare(
        `SELECT * FROM audit_events WHERE entity_id LIKE ? OR entity_id = ? OR entity_id LIKE ? ORDER BY id DESC LIMIT ?`,
      )
      .all(`R-${opts.vehicle}-%`, opts.vehicle, `S-${opts.vehicle}-%`, lim) as AuditEvent[];
  }
  return db().prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?").all(lim) as AuditEvent[];
}

// ---------- vehicle-level evidence ----------

export function getWeights(): Weights {
  const r = db().prepare("SELECT value FROM settings WHERE key = 'weights'").get() as { value: string } | undefined;
  return parse(r?.value, { priority: {}, confidence: {}, thresholds: { priority: 55, confidence: 62 } });
}

export function getFactorLabels(): Record<string, string> {
  const r = db().prepare("SELECT value FROM settings WHERE key = 'factor_labels'").get() as { value: string } | undefined;
  return parse(r?.value, {});
}

export type RepresentationRow = { market: string; feedback_n: number; feedback_share: number; sales_2025: number; sales_share: number; sales_2030: number };

export function representation(vehicle: string): RepresentationRow[] {
  const rows = db().prepare("SELECT * FROM representation WHERE vehicle = ?").all(vehicle) as RepresentationRow[];
  return MARKETS.map((m) => rows.find((r) => r.market === m)).filter(Boolean) as RepresentationRow[];
}

/** One-sentence missing-voices warning, or null when evidence roughly matches sales. */
export function missingVoices(vehicle: string): string | null {
  const rep = representation(vehicle);
  const top = [...rep].sort((a, b) => b.feedback_share - a.feedback_share)[0];
  const silent = rep.filter((r) => r.sales_share >= 0.15 && r.feedback_n === 0);
  if (!top || top.feedback_share - top.sales_share < 0.25) return null;
  let s = `${Math.round(top.feedback_share * 100)}% of customer comments come from ${MARKET_LABEL[top.market]}, which buys ${Math.round(top.sales_share * 100)}% of these cars.`;
  if (silent.length) s += ` ${silent.map((r) => `${MARKET_LABEL[r.market]} (${Math.round(r.sales_share * 100)}% of sales)`).join(" and ")} ${silent.length > 1 ? "have" : "has"} no comments at all.`;
  return s;
}

export function marketConflicts(vehicle: string) {
  return db().prepare("SELECT * FROM market_conflicts WHERE vehicle = ? ORDER BY in_scope DESC, abs(delta) DESC").all(vehicle) as {
    attribute: string; cn: number; eu: number; delta: number; in_scope: number; scope_reason: string | null;
  }[];
}

export function dataIssues(vehicle?: string) {
  return db()
    .prepare("SELECT * FROM data_issues WHERE vehicle IS NULL OR vehicle = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END")
    .all(vehicle ?? "") as { id: number; dataset: string; vehicle: string | null; severity: string; description: string; handling: string }[];
}

export function listSignals(vehicle: string): Signal[] {
  const rows = db()
    .prepare(
      `SELECT s.*, r.id AS requirement_id FROM signals s LEFT JOIN requirements r ON r.signal_id = s.id
       WHERE s.vehicle = ? ORDER BY s.n_negative DESC`,
    )
    .all(vehicle) as Row[];
  return rows.map((r) => ({
    ...(r as unknown as Signal),
    by_market: parse(r.by_market as string, {}),
    by_source: parse(r.by_source as string, {}),
    in_scope: Boolean(r.in_scope),
  }));
}

export function vehicleTotals(vehicle: string) {
  const d = db();
  const one = (sql: string, ...a: unknown[]) => (d.prepare(sql).get(...a) as { n: number }).n;
  return {
    comments: one("SELECT COUNT(*) n FROM feedback WHERE vehicle = ?", vehicle),
    unlabelled: one("SELECT COUNT(*) n FROM feedback WHERE vehicle = ? AND classified = 0", vehicle),
    signals: one("SELECT COUNT(*) n FROM signals WHERE vehicle = ?", vehicle),
    outOfScope: one("SELECT COUNT(*) n FROM signals WHERE vehicle = ? AND in_scope = 0", vehicle),
  };
}
