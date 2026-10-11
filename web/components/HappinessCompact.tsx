import { MARKET_LABEL } from "@/lib/regions";
import type { HappinessRow } from "@/lib/types";

/** Compact "customer pain addressed" strip for the board: one bar per market, "unknown" without comments. */
export function HappinessCompact({ rows, scope }: { rows: HappinessRow[]; scope: string }) {
  if (!rows.length) return null;
  return (
    <section aria-label="Customer pain addressed" data-testid="happiness-compact" className="border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink">Customer pain addressed</h2>
        <span className="text-[11px] text-ink-3">{scope} · share of negative comments covered by approved requirements</span>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => {
          const pct = r.share === null ? null : Math.round(r.share * 1000) / 10;
          const label = MARKET_LABEL[r.market] ?? r.market;
          return (
            <li key={r.market} data-testid={`happiness-compact-${r.market}`} className="text-[12px]">
              <div className="flex justify-between"><span className="text-ink-2">{label}</span><span className="tabular-nums">{pct === null ? "unknown" : `${pct}%`}</span></div>
              <div className="mt-1 h-1.5 bg-mist" title={pct === null ? "No customer comments from this market" : `${r.coveredComments} of ${r.negativeComments} negative comments addressed`}>
                {pct !== null && <div className="h-full bg-blue" style={{ width: `${Math.min(pct, 100)}%` }} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Combine per-vehicle rows into one row per market (comment counts add up; shares are recomputed). */
export function combineHappiness(perVehicle: HappinessRow[][]): HappinessRow[] {
  const by = new Map<string, HappinessRow>();
  for (const rows of perVehicle) for (const r of rows) {
    const cur = by.get(r.market) ?? { market: r.market, negativeComments: 0, coveredComments: 0, share: null, salesWeight: null };
    cur.negativeComments += r.negativeComments;
    cur.coveredComments += r.coveredComments;
    by.set(r.market, cur);
  }
  return [...by.values()].map((r) => ({ ...r, share: r.negativeComments > 0 ? r.coveredComments / r.negativeComments : null }));
}
