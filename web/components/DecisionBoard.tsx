import Link from "next/link";
import { COLUMNS } from "@/lib/board";
import { boardCards, type Viewer } from "@/lib/gate";
import { moscowFor } from "@/lib/moscow";
import { ConflictBadge, QuadrantBadge, QuickWinBadge } from "./ui";
import { DecisionMove } from "./DecisionMove";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Decision board (from Vishwa's feature_v): one column per decision status, so the PM sees where every
 * requirement is in the workflow. The Requirements tab groups by priority; this tab groups by decision.
 */
export async function DecisionBoard({ viewer, vehicle }: { viewer: Viewer; vehicle: { code: string; name: string } }) {
  const cards = await boardCards(viewer, [vehicle]);
  const count = (...s: string[]) => cards.filter((c) => s.includes(c.status)).length;
  const href = (id: string) => `/vehicles/${vehicle.code}?req=${encodeURIComponent(id)}#decision-card`;

  return (
    <section aria-labelledby="decision-board-heading" data-testid="decision-board">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="decision-board-heading" className="headline text-[28px]">Decision board</h2>
          <p className="mt-1 text-[14px] text-ink-2">The AI proposes; you decide. Every move is recorded in the audit trail.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4" aria-label="Requirement counts">
          {[["Awaiting review", count("proposed", "edited"), "text-blue"], ["Needs validation", count("validate"), ""], ["Approved", count("approved"), ""], ["Total", cards.length, ""]].map(([label, n, tone]) => (
            <div key={label as string} className="bg-white px-5 py-3">
              <dt className="text-[12px] text-ink-3">{label}</dt>
              <dd className={`text-[24px] font-light tabular-nums ${tone}`}>{fmt(n as number)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {cards.length === 0 && <p role="status" className="mb-4 border border-line px-4 py-3 text-[14px] text-ink-2">No requirements with evidence in {viewer.label}.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const rows = cards.filter((c) => c.status === col.status).sort((a, b) => b.priority - a.priority);
          return (
            <section key={col.status} aria-label={col.title} data-testid={`decision-${col.status}`} className="flex min-w-0 flex-col border-t-[3px] border-ink bg-mist">
              <div className="flex items-baseline justify-between gap-2 px-3 pt-3">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">{col.title}</h3>
                <span className="text-[12px] tabular-nums text-ink-3" aria-label={`${rows.length} requirements`}>{rows.length}</span>
              </div>
              <p className="px-3 pb-2 text-[12px] text-ink-3">{col.hint}</p>
              <ul className="flex flex-col gap-2 px-2 pb-2">
                {rows.map((c) => {
                  const m = moscowFor(c.priority);
                  return (
                    <li key={c.id} data-testid="decision-card" data-requirement-id={c.id} className="border border-line bg-white p-3">
                      <Link href={href(c.id)} className="block hover:text-blue">
                        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${m.text}`}>{m.label}</span>
                        <span className="mt-1 block text-[14px] leading-snug [overflow-wrap:anywhere]">{c.title}</span>
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                        <QuadrantBadge q={c.quadrant} />
                        {c.kind === "quick_win" && <QuickWinBadge />}
                        {c.kind === "market_conflict" && <ConflictBadge />}
                        {c.challenged && <span className="text-challenge">Challenged</span>}
                      </div>
                      <p className="mt-2 text-[12px] tabular-nums text-ink-3">Priority {c.priority} · Confidence {c.confidence}</p>
                      <p className="text-[12px] tabular-nums text-ink-3">{c.comments === null ? "Survey only" : `${fmt(c.comments)} customer comments`}</p>
                      <DecisionMove id={c.id} title={c.title} status={c.status} editHref={href(c.id)} />
                    </li>
                  );
                })}
                {rows.length === 0 && <li className="border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-3">None</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
