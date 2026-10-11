import Link from "next/link";
import { MOSCOW, moscowFor } from "@/lib/moscow";
import { QUADRANT, type Quadrant, type Requirement } from "@/lib/types";
import { ConflictBadge, QuadrantBadge, QuickWinBadge, StatusBadge } from "./ui";

export type BoardFilter = Quadrant | "quick" | "conflict" | null;

export function requirementBoardHref(vehicle: string, filter: BoardFilter, search: string, requirement?: string) {
  const params = new URLSearchParams();
  if (filter) params.set("q", filter);
  if (search) params.set("search", search);
  if (requirement) params.set("req", requirement);
  const query = params.toString();
  return `/vehicles/${vehicle}${query ? `?${query}` : ""}${requirement ? "#decision-card" : ""}`;
}

const LANE_BORDER: Record<string, string> = { must: "border-must", should: "border-should", could: "border-could", wont: "border-wont" };

const chip = "inline-flex h-8 items-center gap-1.5 border px-2.5 text-[13px]";

/** Filters and search. Same chip style as the rest of the app; quick wins in blue, conflicts in orange. */
export function BoardToolbar({ all, vehicle, filter, search }: { all: Requirement[]; vehicle: string; filter: BoardFilter; search: string }) {
  const count = (q: BoardFilter) =>
    q === "quick" ? all.filter((r) => r.kind === "quick_win").length
      : q === "conflict" ? all.filter((r) => r.kind === "market_conflict").length
        : q ? all.filter((r) => r.quadrant === q).length : all.length;
  const tone = (q: BoardFilter) => {
    const on = filter === q;
    if (q === "quick") return on ? "border-blue bg-blue text-white" : "border-blue text-blue hover:bg-monitor-soft";
    if (q === "conflict") return on ? "border-validate bg-validate text-white" : "border-validate text-validate hover:bg-validate-soft";
    return on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-ink";
  };
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter requirements">
        {([null, "act", "validate", "monitor", "park", "quick", "conflict"] as const).map((q) => (
          <Link key={q ?? "all"} href={requirementBoardHref(vehicle, q, search)} scroll={false} aria-current={filter === q ? "true" : undefined}
            title={q === "quick" ? "Customers ask for equipment BMW already sells" : q === "conflict" ? "China and Europe rate this differently: global or market-specific requirement?" : undefined}
            className={`${chip} ${tone(q)}`}>
            {q === "quick" ? "Quick wins" : q === "conflict" ? "Conflicts" : q ? QUADRANT[q].label : "All"}
            <span className="tabular-nums opacity-70">{count(q)}</span>
          </Link>
        ))}
      </div>
      <form action={`/vehicles/${vehicle}`} method="get" role="search" aria-label="Search requirements" className="flex min-w-0 items-center gap-2">
        {filter && <input type="hidden" name="q" value={filter} />}
        <label className="sr-only" htmlFor="requirement-search">Search requirements</label>
        <input id="requirement-search" name="search" type="search" defaultValue={search} maxLength={256} placeholder="Search requirements"
          className="h-10 min-w-0 flex-1 border border-line bg-white px-3 text-[14px] focus:border-ink lg:w-60 lg:flex-none" />
        <button type="submit" className="btn-outline btn-sm">Search</button>
        {search && <Link href={requirementBoardHref(vehicle, filter, "")} scroll={false} className="whitespace-nowrap text-[13px] text-blue hover:underline">Clear search</Link>}
      </form>
    </div>
  );
}

/**
 * MoSCoW board: four lanes from the same rules as the export, so the board never changes scores.
 * Desktop: a 2x2 grid that stays in view next to the Decision Card; each lane scrolls on its own.
 */
export function RequirementsBoard({ items, vehicle, filter, search, selected, region }: {
  items: Requirement[];
  region: string;
  vehicle: string;
  filter: BoardFilter;
  search: string;
  selected?: string;
}) {
  return (
    <section id="requirements-board" aria-label="Requirements board" data-testid="requirements-board" className="flex min-w-0 flex-col gap-3 scroll-mt-[145px]">
      {items.length === 0 && (
        <p role="status" className="border border-line px-4 py-3 text-[14px] text-ink-2">
          {search ? "No requirements match your search."
            : `No ${filter === "quick" ? "quick wins" : filter === "conflict" ? "market conflicts" : "requirements"} with evidence in ${region}.`}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-rows-2">
        {MOSCOW.map((group) => {
          const rows = items.filter((r) => moscowFor(r.priority).key === group.key);
          return (
            <section key={group.key} aria-label={group.label} data-testid={`kanban-${group.key}`}
              className={`flex min-h-0 min-w-0 flex-col border-t-[3px] bg-mist ${LANE_BORDER[group.key]}`}>
              <div className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-2">
                <h3 className={`text-[12px] font-bold uppercase tracking-[0.1em] ${group.text}`}>{group.label}</h3>
                <span className="text-[12px] tabular-nums text-ink-3" aria-label={`${rows.length} requirements`}>{rows.length}</span>
              </div>
              <p className="px-3 pb-2 text-[12px] text-ink-3">{group.hint}</p>
              <ul className="flex flex-col gap-2 px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {rows.map((r) => {
                  const on = r.id === selected;
                  return (
                    <li key={r.id}>
                      <Link href={requirementBoardHref(vehicle, filter, search, r.id)} scroll={false} prefetch={false}
                        data-testid="requirement-card" data-requirement-id={r.id} data-priority={r.priority}
                        aria-label={`${group.label}, priority ${r.priority}: ${r.title}`} aria-current={on ? "true" : undefined}
                        className={`block border bg-white p-3 transition-colors hover:border-ink ${on ? "border-blue shadow-[inset_3px_0_0_var(--color-blue)]" : "border-line"}`}>
                        <span className="grid grid-cols-[1fr_auto] items-start gap-x-3">
                          <span data-card-title className="text-[14px] leading-snug text-ink [overflow-wrap:anywhere]">{r.title}</span>
                          <span className="text-right">
                            <span className="block text-[18px] font-semibold leading-none tabular-nums">{r.priority}</span>
                            <span className="text-[11px] text-ink-3">Priority</span>
                          </span>
                        </span>
                        {r.aspect && <span className="mt-1.5 block text-[12px] text-ink-3">{r.aspect} · {r.part}</span>}
                        <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                          <QuadrantBadge q={r.quadrant} />
                          {r.kind === "quick_win" && <QuickWinBadge />}
                          {r.kind === "market_conflict" && <ConflictBadge />}
                          {r.status !== "proposed" && <StatusBadge s={r.status} />}
                          <span className="ml-auto tabular-nums">Confidence {r.confidence}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {rows.length === 0 && <li className="border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-3">No requirements</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
