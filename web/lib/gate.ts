// The gatekeeper. Every read of customer data goes through this file, and it filters by the viewer's region.
// Rule for the team: no SQL in pages or components. Add a function here instead.
// In production the region comes from BMW single sign-on; in this prototype it is a cookie set by the region picker.
import type { InStatement } from "@libsql/client";
import { cookies } from "next/headers";
import { all, nowIso, one, parse, writeBatch } from "./db";
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

type Row = Record<string, unknown>;
const n = async (sql: string, args: (string | number)[]) => Number((await one<{ n: number }>(sql, args))?.n ?? 0);

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

export async function listVehicles(viewer: Viewer): Promise<VehicleCard[]> {
  const mk = viewer.markets;
  const vehicles = await all<{ code: string; name: string; short: string; image: string }>(
    "SELECT code, name, short, image FROM vehicles ORDER BY code",
  );
  return Promise.all(
    vehicles.map(async (v) => {
      const [comments, sales2025, sales2030, reqs] = await Promise.all([
        n(`SELECT COUNT(*) n FROM feedback WHERE vehicle = ? AND market IN ${inList(mk)}`, [v.code, ...mk]),
        n(`SELECT COALESCE(SUM(volume),0) n FROM sales WHERE vehicle = ? AND year = 2025 AND market IN ${inList(mk)}`, [v.code, ...mk]),
        n(`SELECT COALESCE(SUM(volume),0) n FROM sales WHERE vehicle = ? AND year = 2030 AND market IN ${inList(mk)}`, [v.code, ...mk]),
        listRequirements(viewer, v.code),
      ]);
      return {
        ...v,
        comments,
        sales2025,
        sales2030,
        requirements: reqs.length,
        awaiting: reqs.filter((r) => r.status === "proposed" || r.status === "edited").length,
        available: sales2025 > 0,
        thin: sales2025 > 0 && comments === 0,
      };
    }),
  );
}

export async function getVehicle(code: string) {
  return one<{ code: string; name: string; short: string; image: string }>(
    "SELECT code, name, short, image FROM vehicles WHERE code = ?",
    [code],
  );
}

// ---------- requirements ----------

function toRequirement(r: Row): Requirement {
  return {
    ...(r as unknown as Requirement),
    markets: parse(r.markets, []),
    assumptions: parse(r.assumptions, []),
    uncertainties: parse(r.uncertainties, []),
    contradictions: parse(r.contradictions, []),
    survey: parse(r.survey, []),
    conflicts: parse(r.conflicts, []),
    already_exists: parse(r.already_exists, []),
    priority_factors: parse(r.priority_factors, {}),
    confidence_factors: parse(r.confidence_factors, {}),
    challenge: parse(r.challenge, { issues: [], revised_confidence: 0 }),
    challenged: Boolean(r.challenged),
  };
}

/** Requirements with evidence in at least one of the viewer's markets. */
function restrictRawEvidence(viewer: Viewer, r: Requirement): Requirement {
  if (viewer.region === "ALL") return r;
  // Lists are also serialized into client component props. Raw quotes must not
  // survive there just because the visible quote list is region-filtered.
  return { ...r, customer_voice: null,
    contradictions: r.contradictions.map((text) => text.split(" For example ")[0]) };
}

export async function listRequirements(viewer: Viewer, vehicle: string): Promise<Requirement[]> {
  const rows = await all("SELECT * FROM requirements WHERE vehicle = ? ORDER BY priority DESC, confidence DESC", [vehicle]);
  return rows.map(toRequirement).filter((r) => r.markets.some((m) => viewer.markets.includes(m as Market)))
    .map((r) => restrictRawEvidence(viewer, r));
}

export async function getRequirementRow(id: string): Promise<Requirement | undefined> {
  const r = await one("SELECT * FROM requirements WHERE id = ?", [id]);
  return r ? toRequirement(r) : undefined;
}

export type RequirementView = {
  requirement: Requirement;
  quotes: Quote[];
  hidden: Record<string, number>; // market -> number of comments the viewer may not see
};

/** One requirement with the customer evidence the viewer may see. Logs the access. */
export async function getRequirement(viewer: Viewer, id: string): Promise<RequirementView | undefined> {
  const req = await getRequirementRow(id);
  if (!req || !req.markets.some((m) => viewer.markets.includes(m as Market))) return undefined;
  const allQuotes = await all<Quote>(
    `SELECT f.id, f.text, f.source, f.market, f.country, f.powertrain, f.severity, e.role
     FROM signal_evidence e JOIN feedback f ON f.id = e.feedback_id WHERE e.signal_id = ?`,
    [req.signal_id],
  );
  const quotes = allQuotes.filter((q) => viewer.markets.includes(q.market as Market));
  const hidden: Record<string, number> = {};
  for (const q of allQuotes) if (!viewer.markets.includes(q.market as Market)) hidden[q.market] = (hidden[q.market] ?? 0) + 1;
  await logAccess(viewer, id, Object.keys(hidden).length > 0);
  const requirement = restrictRawEvidence(viewer, req);
  if (viewer.region !== "ALL") {
    const voice = quotes.find((q) => q.role === "supports");
    requirement.customer_voice = voice ? `“${voice.text.slice(0, 260)}” (${voice.id})` : null;
  }
  return { requirement, quotes, hidden };
}

async function logAccess(viewer: Viewer, id: string, restricted: boolean) {
  const recent = await one(
    `SELECT 1 FROM audit_events WHERE entity_type = 'requirement' AND entity_id = ? AND region = ?
     AND action LIKE 'viewed%' AND ts > ? LIMIT 1`,
    [id, viewer.region, new Date(Date.now() - 10 * 60 * 1000).toISOString()],
  );
  if (recent) return;
  await writeBatch([
    auditStatement({
      actor_type: "system",
      actor: viewer.actor,
      region: viewer.region,
      entity_type: "requirement",
      entity_id: id,
      action: restricted ? "viewed evidence (other markets restricted)" : "viewed evidence",
    }),
  ]);
}

// ---------- audit ----------

export type NewAuditEvent = Omit<AuditEvent, "id" | "ts" | "field" | "before" | "after" | "rationale"> & Partial<AuditEvent>;

/** An audit insert, to run inside a batch with the change it records. */
export function auditStatement(e: NewAuditEvent): InStatement {
  return {
    sql: `INSERT INTO audit_events (ts, actor_type, actor, region, entity_type, entity_id, action, field, before, after, rationale)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [nowIso(), e.actor_type, e.actor, e.region ?? null, e.entity_type, e.entity_id ?? null, e.action, e.field ?? null, e.before ?? null, e.after ?? null, e.rationale ?? null],
  };
}

export async function auditFor(entityId: string): Promise<AuditEvent[]> {
  return all<AuditEvent>("SELECT * FROM audit_events WHERE entity_id = ? ORDER BY id DESC", [entityId]);
}

export async function auditLog(opts: { vehicle?: string; limit?: number } = {}): Promise<AuditEvent[]> {
  const lim = opts.limit ?? 400;
  if (opts.vehicle) {
    return all<AuditEvent>(
      "SELECT * FROM audit_events WHERE entity_id LIKE ? OR entity_id = ? OR entity_id LIKE ? ORDER BY id DESC LIMIT ?",
      [`R-${opts.vehicle}-%`, opts.vehicle, `S-${opts.vehicle}-%`, lim],
    );
  }
  return all<AuditEvent>("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?", [lim]);
}

// ---------- vehicle-level evidence ----------

export async function getWeights(): Promise<Weights> {
  const r = await one<{ value: string }>("SELECT value FROM settings WHERE key = 'weights'");
  return parse(r?.value, { priority: {}, confidence: {}, thresholds: { priority: 55, confidence: 62 } });
}

export async function getFactorLabels(): Promise<Record<string, string>> {
  const r = await one<{ value: string }>("SELECT value FROM settings WHERE key = 'factor_labels'");
  return parse(r?.value, {});
}

export type RepresentationRow = { market: string; feedback_n: number; feedback_share: number; sales_2025: number; sales_share: number; sales_2030: number };

export async function representation(vehicle: string): Promise<RepresentationRow[]> {
  const rows = await all<RepresentationRow>("SELECT * FROM representation WHERE vehicle = ?", [vehicle]);
  return MARKETS.map((m) => rows.find((r) => r.market === m)).filter(Boolean) as RepresentationRow[];
}

/** One-sentence missing-voices warning, or null when evidence roughly matches sales. */
export async function missingVoices(vehicle: string): Promise<string | null> {
  const rep = await representation(vehicle);
  const top = [...rep].sort((a, b) => b.feedback_share - a.feedback_share)[0];
  const silent = rep.filter((r) => r.sales_share >= 0.15 && r.feedback_n === 0);
  if (!top || top.feedback_share - top.sales_share < 0.25) return null;
  let s = `${Math.round(top.feedback_share * 100)}% of customer comments come from ${MARKET_LABEL[top.market]}, which buys ${Math.round(top.sales_share * 100)}% of these cars.`;
  if (silent.length) s += ` ${silent.map((r) => `${MARKET_LABEL[r.market]} (${Math.round(r.sales_share * 100)}% of sales)`).join(" and ")} ${silent.length > 1 ? "have" : "has"} no comments at all.`;
  return s;
}

export async function marketConflicts(vehicle: string) {
  return all<{ attribute: string; cn: number; eu: number; delta: number; in_scope: number; scope_reason: string | null }>(
    "SELECT * FROM market_conflicts WHERE vehicle = ? ORDER BY in_scope DESC, abs(delta) DESC",
    [vehicle],
  );
}

export async function dataIssues(vehicle?: string) {
  return all<{ id: number; dataset: string; vehicle: string | null; severity: string; description: string; handling: string }>(
    "SELECT * FROM data_issues WHERE vehicle IS NULL OR vehicle = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END",
    [vehicle ?? ""],
  );
}

export async function listSignals(vehicle: string): Promise<Signal[]> {
  const rows = await all(
    `SELECT s.*, r.id AS requirement_id FROM signals s LEFT JOIN requirements r ON r.signal_id = s.id
     WHERE s.vehicle = ? ORDER BY s.n_negative DESC`,
    [vehicle],
  );
  return rows.map((r) => ({
    ...(r as unknown as Signal),
    by_market: parse(r.by_market, {}),
    by_source: parse(r.by_source, {}),
    in_scope: Boolean(r.in_scope),
  }));
}

export async function vehicleTotals(vehicle: string) {
  const [comments, unlabelled, signals, outOfScope] = await Promise.all([
    n("SELECT COUNT(*) n FROM feedback WHERE vehicle = ?", [vehicle]),
    n("SELECT COUNT(*) n FROM feedback f WHERE vehicle = ? AND NOT EXISTS (SELECT 1 FROM feedback_labels l WHERE l.feedback_id=f.id AND l.topic IS NOT NULL)", [vehicle]),
    n("SELECT COUNT(*) n FROM signals WHERE vehicle = ?", [vehicle]),
    n("SELECT COUNT(*) n FROM signals WHERE vehicle = ? AND in_scope = 0", [vehicle]),
  ]);
  return { comments, unlabelled, signals, outOfScope };
}
