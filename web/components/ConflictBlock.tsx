"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { MARKET_LABEL } from "@/lib/regions";
import type { AuditEvent, Conflict, Requirement } from "@/lib/types";

// "Global or market-specific?": the decision block for market conflict cards (kind === "market_conflict").
// Survey means and sales shares only; no customer text reaches this client component.

const SCOPE_PREFIX = "Scope decision:";
const fmt = (n: number) => n.toFixed(2);
const pct = (x: number | null | undefined) => (typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "unknown");

function MarketBar({ market, mean, share, low, year }: { market: "CN" | "EU"; mean: number; share: number | null | undefined; low: boolean; year: number }) {
  const label = MARKET_LABEL[market];
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">{label}</span>
        <span className="text-[22px] font-light leading-none tabular-nums text-ink" data-testid={`conflict-mean-${market}`}>
          {fmt(mean)}<span className="text-[13px] text-ink-3"> / 10</span>
        </span>
      </div>
      <div
        className="mt-2 h-2.5 bg-white ring-1 ring-line ring-inset"
        role="img"
        aria-label={`${label}: mean score ${fmt(mean)} of 10`}
      >
        <span className={`block h-full ${low ? "bg-validate" : "bg-ink"}`} style={{ width: `${Math.max(0, Math.min(10, mean)) * 10}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">
        Share of {year} sales: <b className="font-semibold tabular-nums text-ink-2">{pct(share)}</b>
      </p>
    </div>
  );
}

function ConflictRow({ c }: { c: Conflict }) {
  const lower: "CN" | "EU" = c.cn <= c.eu ? "CN" : "EU";
  const year = c.sales_year ?? 2025;
  return (
    <li className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Attribute</div>
          <div className="text-[16px] text-ink">{c.attribute}</div>
        </div>
        <div className="text-[13px] text-ink-2">
          Gap <b className="font-semibold tabular-nums text-ink" data-testid="conflict-gap">{fmt(Math.abs(c.cn - c.eu))}</b> points,{" "}
          {MARKET_LABEL[lower]} lower
        </div>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6">
        <MarketBar market="CN" mean={c.cn} share={c.sales_weights?.CN} low={lower === "CN"} year={year} />
        <MarketBar market="EU" mean={c.eu} share={c.sales_weights?.EU} low={lower === "EU"} year={year} />
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Mean customer rating, 0 to 10, higher is better.</p>
    </li>
  );
}

export function ConflictBlock({ r, approval }: {
  r: Pick<Requirement, "id" | "kind" | "status" | "conflicts">;
  /** Latest approval (status → approved), passed only while the requirement is approved. `when` is formatted on the server. */
  approval?: Pick<AuditEvent, "actor" | "rationale"> & { when: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, start] = useTransition();
  const submitting = useRef(false);
  const pending = saving || refreshing;

  if (r.kind !== "market_conflict" || !r.conflicts.length) return null;
  const first = r.conflicts[0];
  const lower: "CN" | "EU" = first.cn <= first.eu ? "CN" : "EU";
  const specific = `${MARKET_LABEL[lower]}-specific`;
  const year = first.sales_year ?? 2025;

  async function approve(scope: string) {
    if (submitting.current || refreshing) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/requirements/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve", rationale: `${SCOPE_PREFIX} ${scope} requirement.` }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save this decision. Please try again.");
        return;
      }
      start(() => router.refresh());
    } catch {
      setError("Could not save this decision. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const recorded = approval?.rationale?.startsWith(SCOPE_PREFIX) ? approval.rationale.slice(SCOPE_PREFIX.length).trim() : null;

  return (
    <section aria-labelledby="conflict-title" className="border border-line border-l-4 border-l-validate bg-mist px-4 py-4 sm:px-5" data-testid="conflict-block">
      <h2 id="conflict-title" className="text-[13px] font-bold uppercase tracking-[0.08em] text-validate">Global or market-specific?</h2>
      <p className="mt-1 text-[14px] text-ink-2">
        China and Europe rate this differently in the {year} customer study. Decide whether one requirement serves both markets.
      </p>

      <ul className="mt-4 flex flex-col gap-4">
        {r.conflicts.map((c) => <ConflictRow key={c.attribute} c={c} />)}
      </ul>

      <div className="mt-4 border-l-2 border-validate bg-validate-soft px-3 py-2 text-[13px] text-ink-2">
        <b className="font-semibold text-ink">No customer comments behind this card.</b> China has no customer comments in the data,
        so this comparison rests on survey means only. Confidence is low accordingly.
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Source: CN/EU customer study {year}, means only, no sample sizes. Sales shares: {year} vehicle sales, all markets.</p>

      <div className="mt-4 border-t border-line pt-4">
        {r.status === "approved" ? (
          <div data-testid="conflict-decision">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">Scope decision</div>
            {recorded ? (
              <p className="mt-1 text-[15px] text-ink">
                <b className="font-semibold">Approved as {recorded.replace(/\.$/, "")}.</b>
                {approval && <span className="text-ink-3"> {approval.actor}, {approval.when}</span>}
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-ink-2">Approved without a recorded scope decision. Reopen it to decide between global and market-specific.</p>
            )}
          </div>
        ) : r.status === "rejected" ? (
          <p className="text-[14px] text-ink-2">Rejected. Reopen it to make a scope decision.</p>
        ) : (
          <>
            <h3 className="text-[15px] font-semibold text-ink">One global requirement, or market-specific ones?</h3>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button className="btn-primary btn-sm" onClick={() => approve("global")} disabled={pending}>Approve as global requirement</button>
              <button className="btn-primary btn-sm" onClick={() => approve(specific)} disabled={pending}>Approve as {specific}</button>
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Approves the requirement and records the scope in the audit trail with your region and the time.</p>
            {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}
