"use client";

import { useEffect, useState } from "react";
import { MARKET_LABEL } from "@/lib/regions";
import type { HappinessRow } from "@/lib/types";

export function HappinessMeter({
  data,
  loading,
}: {
  data: HappinessRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-ink-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-r-blue" />
        Calculating…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-[14px] text-ink-3">No data available yet.</div>
    );
  }

  // Calculate global total (sales-weighted)
  const withWeight = data.filter((r) => r.salesWeight !== null);
  const totalSalesWeight = withWeight.reduce((s, r) => s + (r.salesWeight ?? 0), 0);
  const totalCovered = data.reduce((s, r) => s + r.coveredComments, 0);
  const totalNegative = data.reduce((s, r) => s + r.negativeComments, 0);

  const globalShare =
    totalNegative === 0
      ? null
      : totalSalesWeight > 0
        ? Math.round((totalCovered / totalNegative) * 1000) / 10
        : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Per-market breakdown */}
      <div className="space-y-2">
        {data.map((row) => {
          const pct =
            row.negativeComments === 0
              ? null
              : Math.round((row.coveredComments / row.negativeComments) * 1000) / 10;
          const label = MARKET_LABEL[row.market] ?? row.market;

          return (
            <div key={row.market} className="space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-ink">
                  {label}
                </span>
                <span className="font-mono text-ink-2">
                  {pct === null ? "unknown" : `${pct}%`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                {pct !== null ? (
                  <div
                    className="h-full bg-monitor transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    role="progressbar"
                  />
                ) : (
                  <div
                    className="h-full bg-line-2"
                    title="No customer comments available for this market"
                  />
                )}
              </div>
              {pct !== null && (
                <p className="text-[12px] text-ink-3">
                  {row.coveredComments} of {row.negativeComments} negative comment{row.negativeComments === 1 ? "" : "s"} addressed
                </p>
              )}
              {pct === null && (
                <p className="text-[12px] text-ink-3">
                  No customer comments available
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Global total */}
      {globalShare !== null && totalNegative > 0 && (
        <div className="border-t border-line pt-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-ink">Global total (sales-weighted)</span>
            <span className="font-mono font-semibold text-ink">{globalShare}%</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            {totalCovered} of {totalNegative} negative comment{totalNegative === 1 ? "" : "s"} addressed across all markets
          </p>
        </div>
      )}
    </div>
  );
}
