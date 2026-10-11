import { DecisionCard } from "@/components/DecisionCard";
import { HappinessCompact, combineHappiness } from "@/components/HappinessCompact";
import { RequirementDrawer } from "@/components/RequirementDrawer";
import { WorkflowBoard } from "@/components/WorkflowBoard";
import { SORTS, applyFilters, type BoardFilters, type ConfidenceLevel, type SortKey } from "@/lib/board";
import { auditFor, boardCards, happiness, getActiveWeights, getFactorLabels, getRequirement, getWeights, listRequirements, vehicleNames, type Viewer } from "@/lib/gate";
import { MOSCOW } from "@/lib/moscow";
import { presetLabel } from "@/lib/score";
import { QUADRANT, type Quadrant } from "@/lib/types";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const fmt = (n: number) => n.toLocaleString("en-US");

/** The Kanban workspace: KPIs, filters, board or list, and the requirement drawer. Used by / and /vehicles/[code]. */
export async function BoardWorkspace({ sp, viewer, basePath, fixedVehicle, heading }: {
  sp: SearchParams; viewer: Viewer; basePath: string; fixedVehicle: string | null; heading: "h1" | "h2";
}) {
  const vehicles = await vehicleNames(viewer);
  const scope = fixedVehicle ? vehicles.filter((v) => v.code === fixedVehicle) : vehicles;
  const [cards, weights, active] = await Promise.all([boardCards(viewer, scope), getWeights(), getActiveWeights()]);
  const threshold = weights.thresholds.confidence;

  const vehicle = fixedVehicle ?? (vehicles.some((v) => v.code === sp.vehicle) ? one(sp.vehicle) : "all");
  const selected = vehicles.find((v) => v.code === vehicle);
  const filters: BoardFilters = {
    vehicle,
    moscow: MOSCOW.some((m) => m.key === sp.priority) ? one(sp.priority) : null,
    conf: ["high", "medium", "low"].includes(one(sp.conf)) ? (one(sp.conf) as ConfidenceLevel) : null,
    rec: sp.rec === "quick" || sp.rec === "conflict" ? sp.rec : Object.hasOwn(QUADRANT, one(sp.rec)) ? (one(sp.rec) as Quadrant) : null,
    q: one(sp.search).slice(0, 100),
    sort: Object.hasOwn(SORTS, one(sp.sort)) ? (one(sp.sort) as SortKey) : "priority",
    layout: sp.layout === "list" ? "list" : "board",
  };

  // KPIs follow the vehicle and region scope only, so they always add up to the board totals.
  const scoped = cards.filter((c) => vehicle === "all" || c.vehicle === vehicle);
  const count = (...s: string[]) => scoped.filter((c) => s.includes(c.status)).length;
  const shown = applyFilters(cards, filters, threshold);
  const meterScope = vehicle === "all" ? scope : scope.filter((v) => v.code === vehicle);
  const pain = combineHappiness(await Promise.all(meterScope.map((v) => happiness(viewer, v.code))));

  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  );
  const close = new URLSearchParams(query);
  close.delete("open");
  close.delete("tab");
  const closeHref = `${basePath}${close.size ? `?${close}` : ""}`;

  const openId = one(sp.open);
  const detail = openId ? await getRequirement(viewer, openId) : undefined;
  const inScope = detail && (!fixedVehicle || detail.requirement.vehicle === fixedVehicle);
  const [events, siblings, labels] = inScope
    ? await Promise.all([auditFor(viewer, detail.requirement.id), listRequirements(viewer, detail.requirement.vehicle), getFactorLabels()])
    : [[], [], {}];

  const H = heading;
  return (
    <section className="board-page" aria-labelledby="board-heading">
      <WorkflowBoard
        cards={shown} filters={filters} query={query.toString()} basePath={basePath}
        vehicles={vehicles} region={viewer.label} fixedVehicle={fixedVehicle} threshold={threshold}
        heading={
          <div className="board-heading">
            <H id="board-heading">Product Requirements Board</H>
            <p>AI proposes; you decide.</p>
            <ul className="board-legend" aria-label="Card side line shows the AI recommendation">
              {(Object.keys(QUADRANT) as Quadrant[]).map((q) => <li key={q} className={`rec-dot-${q}`}>{QUADRANT[q].label}</li>)}
            </ul>
            {active && <p className="board-ranking" data-testid="ranking-note"><b>Ranking: {presetLabel(active.preset)}</b> · changed by {active.changed_by}</p>}
            {selected && !selected.available && <p className="board-availability">{selected.name} is not sold in {viewer.label}, so there is no evidence to review here.</p>}
            {selected?.thin && <p className="board-availability"><b>Thin evidence.</b> No customer comments from {viewer.label} for the {selected.name}. Requirements rest on survey means only.</p>}
          </div>
        }
        summary={<>
          <dl className="board-kpis" aria-label="Requirement counts">
            <div><dt>Awaiting Review</dt><dd className="text-blue">{fmt(count("proposed", "edited"))}</dd></div>
            <div><dt>Needs Validation</dt><dd>{fmt(count("validate"))}</dd></div>
            <div><dt>Approved</dt><dd>{fmt(count("approved"))}</dd></div>
            <div><dt>Total Requirements</dt><dd>{fmt(scoped.length)}</dd></div>
          </dl>
          <HappinessCompact rows={pain} scope={selected ? selected.name : "All vehicles"} />
        </>}
      />
      {inScope && (
        <RequirementDrawer closeHref={closeHref} title={`${detail.requirement.id}: ${detail.requirement.title}`}>
          <DecisionCard
            r={detail.requirement} quotes={detail.quotes} hidden={detail.hidden} events={events}
            labels={labels} thresholds={weights.thresholds} viewer={viewer} siblings={siblings}
          />
        </RequirementDrawer>
      )}
    </section>
  );
}
