import { MARKET_LABEL } from "@/lib/regions";
import type { HappinessRow } from "@/lib/types";

const pct = (x: number) => Math.round(x * 1000) / 10;

/**
 * Customer pain addressed: per market, the share of in-scope negative comments covered by approved requirements.
 * Markets without comments (China) show "unknown", never 0% or 100%. The total weights each known market by its
 * share of 2025 sales and states how much of sales it cannot see.
 */
export function HappinessMeter({ data }: { data: HappinessRow[] }) {
  if (!data.length) return <p className="text-[14px] text-ink-3">No markets in your region.</p>;

  const known = data.filter((r) => r.share !== null && r.salesWeight);
  const knownWeight = known.reduce((s, r) => s + (r.salesWeight ?? 0), 0);
  const total = knownWeight > 0 ? known.reduce((s, r) => s + (r.share ?? 0) * (r.salesWeight ?? 0), 0) / knownWeight : null;
  const unknown = data.filter((r) => r.share === null && (r.salesWeight ?? 0) > 0);
  const unknownWeight = unknown.reduce((s, r) => s + (r.salesWeight ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {data.map((r) => {
          const label = MARKET_LABEL[r.market] ?? r.market;
          const p = r.share === null ? null : pct(r.share);
          return (
            <li key={r.market} data-testid={`happiness-${r.market}`} className="flex flex-col gap-1 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{label}</span>
                <span className="tabular-nums text-ink-2" data-testid={`happiness-${r.market}-value`}>{p === null ? "unknown" : `${p}%`}</span>
              </div>
              <div className="h-2 bg-mist">
                {p !== null && (
                  <div className="h-full bg-blue" style={{ width: `${Math.min(p, 100)}%` }}
                    role="progressbar" aria-label={`${label}: customer pain addressed`} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} />
                )}
              </div>
              <p className="text-[12px] text-ink-3">
                {p === null
                  ? "No customer comments from this market, so coverage cannot be measured."
                  : `${r.coveredComments} of ${r.negativeComments} negative comment${r.negativeComments === 1 ? "" : "s"} addressed`}
              </p>
            </li>
          );
        })}
      </ul>

      {data.length > 1 && (
        <div className="border-t border-line pt-3" data-testid="happiness-total">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-ink">Total, weighted by 2025 sales</span>
            <span className="font-semibold tabular-nums text-ink">{total === null ? "unknown" : `${pct(total)}%`}</span>
          </div>
          {unknownWeight > 0 && (
            <p className="mt-1 text-[12px] text-ink-3">
              Covers markets with comments only. Unknown for {unknown.map((r) => MARKET_LABEL[r.market] ?? r.market).join(", ")}: {pct(unknownWeight)}% of sales.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
