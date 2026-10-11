import Link from "next/link";
import { MOSCOW, moscowFor } from "@/lib/moscow";
import { QUADRANT, STATUS_LABEL, type Quadrant, type Requirement } from "@/lib/types";

type Filter = Quadrant | "quick" | null;

export function requirementBoardHref(vehicle: string, filter: Filter, search: string, requirement?: string) {
  const params = new URLSearchParams();
  if (filter) params.set("q", filter);
  if (search) params.set("search", search);
  if (requirement) params.set("req", requirement);
  const query = params.toString();
  return `/vehicles/${vehicle}${query ? `?${query}` : ""}${requirement ? "#decision-card" : "#requirements-board"}`;
}

/** Priority bands come from the same MoSCoW rules as exports; the board never changes scores. */
export function RequirementsBoard({ all, items, vehicle, filter, search, selected }: {
  all: Requirement[];
  items: Requirement[];
  vehicle: string;
  filter: Filter;
  search: string;
  selected?: string;
}) {
  return (
    <section id="requirements-board" aria-label="Requirements board" data-testid="requirements-board" className="min-w-0 scroll-mt-[145px]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter requirements">
          {([null, "act", "validate", "monitor", "park", "quick"] as const).map((q) => (
            <Link key={q ?? "all"} href={requirementBoardHref(vehicle, q, search)} scroll={false} aria-current={filter === q ? "true" : undefined}
              className={`inline-flex min-h-9 items-center gap-2 border px-3 text-[12px] ${filter === q ? "border-blue bg-blue text-white" : "border-line bg-white text-ink-2 hover:border-blue hover:text-blue"}`}>
              {q === "quick" ? "Quick wins" : q ? QUADRANT[q].label : "All"}
              <span className="tabular-nums">{q === "quick" ? all.filter((r) => r.kind === "quick_win").length : q ? all.filter((r) => r.quadrant === q).length : all.length}</span>
            </Link>
          ))}
        </div>
        <form action={`/vehicles/${vehicle}#requirements-board`} method="get" role="search" aria-label="Search requirements" className="flex min-w-0 flex-wrap items-center gap-2">
          {filter && <input type="hidden" name="q" value={filter} />}
          <label className="sr-only" htmlFor="requirement-search">Search requirements</label>
          <input id="requirement-search" name="search" type="search" defaultValue={search} maxLength={256} placeholder="Search requirements" className="min-h-10 min-w-0 flex-1 border border-line bg-white px-3 text-[13px] lg:w-56" />
          <button type="submit" className="min-h-10 border border-ink bg-white px-4 text-[12px] font-semibold hover:bg-ink hover:text-white">Search</button>
          {search && <Link href={requirementBoardHref(vehicle, filter, "")} scroll={false} className="inline-flex min-h-10 items-center px-2 text-[13px] text-blue hover:underline">Clear search</Link>}
        </form>
      </div>
      {items.length === 0 && (
        <p role="status" className="mb-4 border border-line px-4 py-3 text-[14px] text-ink-2">
          {search ? "No requirements match your search." : "No requirements match this filter in your selected region."}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MOSCOW.map((group) => {
          const rows = items.filter((r) => moscowFor(r.priority).key === group.key);
          return (
            <section key={group.key} aria-label={group.label} data-testid={`kanban-${group.key}`} className="min-w-0 bg-mist p-3 sm:p-4">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-semibold leading-tight">{group.label}</h2>
                <span className="text-[14px] tabular-nums text-ink-3" aria-label={`${rows.length} requirements`}>{rows.length}</span>
              </div>
              <ul className="flex flex-col gap-3 xl:max-h-[520px] xl:overflow-y-auto xl:pr-1">
                {rows.map((r) => {
                  const on = r.id === selected;
                  return (
                    <li key={r.id}>
                      <Link href={requirementBoardHref(vehicle, filter, search, r.id)} prefetch={false}
                        data-testid="requirement-card" data-requirement-id={r.id} data-priority={r.priority}
                        aria-label={`${r.title}. Priority ${r.priority} of 100; confidence ${r.confidence} of 100. Review evidence.`} aria-current={on ? "true" : undefined}
                        className={`group block border bg-white p-4 transition-colors hover:border-blue ${on ? "border-blue shadow-[inset_3px_0_0_var(--color-blue)]" : "border-line"}`}>
                        {(r.kind === "quick_win" || r.status !== "proposed") && (
                          <p className="mb-2 text-[11px] font-medium text-ink-3">{r.kind === "quick_win" ? "Quick win" : STATUS_LABEL[r.status]}{r.kind === "quick_win" && r.status !== "proposed" ? ` · ${STATUS_LABEL[r.status]}` : ""}</p>
                        )}
                        <p data-card-title className="text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{r.title}</p>
                        <dl className="mt-4 grid grid-cols-2 gap-3 tabular-nums">
                          <div><dt className="text-[11px] text-ink-3">Priority</dt><dd className="text-[20px] font-medium leading-tight">{r.priority}<span className="ml-0.5 text-[11px] font-normal text-ink-3">/100</span></dd></div>
                          <div><dt className="text-[11px] text-ink-3">Confidence</dt><dd className="text-[20px] font-medium leading-tight">{r.confidence}<span className="ml-0.5 text-[11px] font-normal text-ink-3">/100</span></dd></div>
                        </dl>
                        <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-blue group-hover:underline">Review evidence <span aria-hidden="true">↗</span></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {rows.length === 0 && <p className="border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">No requirements</p>}
            </section>
          );
        })}
      </div>
    </section>
  );
}
