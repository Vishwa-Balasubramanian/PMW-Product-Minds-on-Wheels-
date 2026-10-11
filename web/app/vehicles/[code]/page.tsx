import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardWorkspace } from "@/components/BoardWorkspace";
import { DecisionCard } from "@/components/DecisionCard";
import { EvidenceMeter } from "@/components/EvidenceMeter";
import { WeightsPanel } from "@/components/WeightsPanel";
import { MOSCOW, Matrix, QuadrantBadge, QuickWinBadge, Section, StatusBadge } from "@/components/ui";
import {
  auditFor, dataIssues, getActiveWeights, getFactorLabels, getRequirement, getVehicle, getViewer, getWeights, listRequirements, listSignals,
  marketConflicts, missingVoices, representation, storedOrder, vehicleTotals,
} from "@/lib/gate";
import { MARKET_LABEL } from "@/lib/regions";
import { PRIORITY_FACTORS, factorValues, presetLabel, type PriorityWeights } from "@/lib/score";
import { QUADRANT, type Quadrant } from "@/lib/types";

export const dynamic = "force-dynamic";

const VIEWS = [
  { k: "board", label: "Board" },
  { k: "inbox", label: "Requirements" },
  { k: "matrix", label: "Decision matrix" },
  { k: "signals", label: "Signals" },
  { k: "data", label: "Data health" },
] as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function VehiclePage({ params, searchParams }: PageProps<"/vehicles/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const vehicle = await getVehicle(code);
  if (!vehicle) notFound();
  const viewer = await getViewer();
  // Board is the default; existing list links (?req= selection, ?q= quadrant filter) keep opening the two-pane list.
  const view = VIEWS.find((v) => v.k === sp.view)?.k ?? (typeof sp.req === "string" || typeof sp.q === "string" ? "inbox" : "board");
  const qFilter = sp.q === "quick" ? "quick" : typeof sp.q === "string" && Object.hasOwn(QUADRANT, sp.q) ? (sp.q as Quadrant) : null;

  const [all, weights, voices, totals, labels, active, stored] = await Promise.all([
    listRequirements(viewer, code), getWeights(), missingVoices(code), vehicleTotals(code), getFactorLabels(), getActiveWeights(), storedOrder(code),
  ]);
  const quickWins = all.filter((r) => r.kind === "quick_win");
  const reqs = qFilter === "quick" ? quickWins : qFilter ? all.filter((r) => r.quadrant === qFilter) : all;
  const selectedId = typeof sp.req === "string" && reqs.some((r) => r.id === sp.req) ? sp.req : reqs[0]?.id;
  const awaiting = all.filter((r) => r.status === "proposed" || r.status === "edited").length;

  return (
    <div className="vehicle-workspace">
      <section className="vehicle-summary">
        <div className="vehicle-titlebar">
        <div className="vehicle-heading">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/cars/${code}-wide.jpg`} alt="" />
          <div><h1 className="page-heading">{vehicle.name}</h1><p className="page-caption">{code} · Requirements for the successor generation</p></div>
        </div>
        <details className="export-menu">
          <summary className="btn-outline btn-sm">Export</summary>
          <div className="export-options" aria-label="Export requirement list">
            <a href={`/api/export?vehicle=${code}&format=csv`} download>Export CSV</a>
            <a href={`/api/export?vehicle=${code}&format=json`} download>Export JSON</a>
          </div>
        </details>
        </div>
        <dl className="vehicle-metrics">
          <div><dd>{all.length}</dd><dt>requirements in your region</dt></div>
          <div><dd className="text-blue">{awaiting}</dd><dt>awaiting decision</dt></div>
          <div><dd>{totals.comments.toLocaleString("en-US")}</dd><dt>comments analysed (all markets)</dt></div>
          <div className="viewer-metric"><dt>Viewing as</dt><dd>{viewer.actor}</dd></div>
        </dl>
        {voices && <p id="missing-voices" className="evidence-notice"><b>Missing voices.</b> {voices} Confidence is lowered accordingly.</p>}
      </section>
      <nav className="workspace-views" aria-label="Views">
        {VIEWS.map((v) => <Link key={v.k} href={`/vehicles/${code}?view=${v.k}`} aria-current={view === v.k ? "page" : undefined}>{v.label}</Link>)}
      </nav>
      <div className={`vehicle-body ${view === "inbox" ? "is-inbox" : view === "board" ? "is-board" : ""}`}>
        {view === "board" && <BoardWorkspace sp={sp} viewer={viewer} basePath={`/vehicles/${code}`} fixedVehicle={code} heading="h2" />}
        {view === "inbox" && (
          <div className="workspace-weights">
            <WeightsPanel
              items={[...all].sort((a, b) => stored.indexOf(a.id) - stored.indexOf(b.id))
                .map((r) => ({ id: r.id, title: r.title, values: factorValues(r.priority_factors) }))}
              labels={Object.fromEntries(PRIORITY_FACTORS.map((k) => [k, labels[k] ?? k]))}
              defaults={weights.priority as PriorityWeights}
              active={active ? { priority: active.priority, preset: active.preset } : null}
            />
          </div>
        )}
        {view === "inbox" && <Inbox />}
        {view === "matrix" && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,640px)_1fr]">
            <Section title="Priority against confidence" aside="Click a dot to open the requirement">
              <Matrix items={all} thresholds={weights.thresholds} vehicle={code} size={640} />
            </Section>
            <div className="grid content-start gap-4 sm:grid-cols-2">
              {(Object.keys(QUADRANT) as Quadrant[]).map((q) => (
                <div key={q} className="card p-5">
                  <div className="flex items-center justify-between"><QuadrantBadge q={q} /><span className="text-[28px] font-semibold tabular-nums">{all.filter((r) => r.quadrant === q).length}</span></div>
                  <p className="mt-2 text-[14px] text-ink-2">{QUADRANT[q].hint}.</p>
                </div>
              ))}
              <p className="text-[13px] text-ink-3 sm:col-span-2">
                Thresholds: priority {weights.thresholds.priority}, confidence {weights.thresholds.confidence}. Priority and confidence are computed separately
                by code from the factors on each requirement.
              </p>
            </div>
          </div>
        )}
        {view === "signals" && <Signals />}
        {view === "data" && <DataHealth />}
      </div>
    </div>
  );

  async function Inbox() {
    const detail = selectedId ? await getRequirement(viewer, selectedId) : undefined;
    const events = detail ? await auditFor(viewer, detail.requirement.id) : [];
    return (
      <div className={`requirements-layout ${typeof sp.req === "string" && selectedId ? "has-selection" : ""}`}>
        <aside className="requirements-list" aria-label="Requirements">
          <div className="list-toolbar">
            <div className="filter-chips" role="group" aria-label="Filter requirements">
              {[null, "act", "validate", "monitor", "park"].map((q) => (
                <Link
                  key={q ?? "all"}
                  href={`/vehicles/${code}?${q ? `q=${q}` : "view=inbox"}`}
                  className="filter-chip"
                  aria-current={qFilter === q ? "true" : undefined}
                  scroll={false}
                >
                  {q ? QUADRANT[q as Quadrant].label : "All"} <span className="tabular-nums opacity-70">{q ? all.filter((r) => r.quadrant === q).length : all.length}</span>
                </Link>
              ))}
              <Link href={`/vehicles/${code}?q=quick`} scroll={false} className="filter-chip" aria-current={qFilter === "quick" ? "true" : undefined} title="Customers ask for equipment BMW already sells">
                Quick wins <span className="tabular-nums opacity-70">{quickWins.length}</span>
              </Link>
            </div>
            {active && (
              <p className="mt-3 border-l-2 border-blue bg-monitor-soft px-3 py-2 text-[11px] text-ink-2" data-testid="ranking-note">
                <b>Ranking: {presetLabel(active.preset)}</b> · changed by {active.changed_by} at{" "}
                <time dateTime={active.changed_at}>{new Date(active.changed_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
              </p>
            )}
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[12px] font-semibold">Ranked by priority</h2>
              <span className="text-[10px] text-ink-3">MoSCoW, highest first</span>
            </div>
          </div>
          <div className="requirement-rows">
            {reqs.length === 0 && <p className="empty-state">No {qFilter === "quick" ? "quick wins" : "requirements"} with evidence in {viewer.label}.</p>}
            {MOSCOW.map((m, gi) => {
              const next = MOSCOW[gi - 1]?.min ?? 101;
              const rows = reqs.filter((r) => r.priority >= m.min && r.priority < next);
              if (!rows.length) return null;
              return (
                <section key={m.key} aria-label={m.label}>
                  <div className="requirement-group">
                    <h3 className={`font-semibold ${m.text}`}>{m.label}</h3>
                    <span className="text-[10px] text-ink-3" title={m.hint}>{rows.length} requirements</span>
                  </div>
                  <ul>
                    {rows.map((r) => {
                      const on = r.id === selectedId;
                      return (
                        <li key={r.id}>
                          <Link
                            href={`/vehicles/${code}?${qFilter ? `q=${qFilter}&` : ""}req=${r.id}`}
                            aria-label={`${m.label}, priority ${r.priority}: ${r.title}`}
                            className="requirement-row"
                            aria-current={on ? "true" : undefined}
                            scroll={false}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="requirement-row-title">{r.title}</span>
                              <span className="requirement-score" title={`Priority ${r.priority}`} aria-label={`Priority ${r.priority}`}>{r.priority}</span>
                            </div>
                            <span className="requirement-row-meta">
                              <span className="font-mono">{r.id}</span>
                              <QuadrantBadge q={r.quadrant} />
                              {r.kind === "quick_win" && <QuickWinBadge />}
                              <StatusBadge s={r.status} />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </aside>
        <div className="requirement-detail" key={selectedId}>
          <Link href={`/vehicles/${code}?${qFilter ? `q=${qFilter}` : "view=inbox"}`} className="back-to-list" scroll={false}>← Back to requirements</Link>
          {detail ? (<>
            <EvidenceMeter mix={detail.requirement.evidence_mix} region={viewer.label} />
            <DecisionCard
              r={detail.requirement}
              quotes={detail.quotes}
              hidden={detail.hidden}
              events={events}
              labels={labels}
              thresholds={weights.thresholds}
              viewer={viewer}
              siblings={all}
            />
            </>
          ) : (
            <div className="empty-state"><p className="font-medium text-ink-2">No requirement selected</p><p className="mt-2">Choose a requirement from the list to review its evidence and make a decision.</p></div>
          )}
        </div>
      </div>
    );
  }

  async function Signals() {
    const signals = await listSignals(code);
    return (
      <Section title={`${signals.length} signals · ${totals.outOfScope} excluded by the scope guard · ${totals.unlabelled} comments still unlabelled`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="text-left text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Topic</th>
                <th className="py-2 pr-3 text-right font-medium">Comments</th>
                <th className="py-2 pr-3 text-right font-medium">Negative</th>
                <th className="py-2 pr-3 text-right font-medium">Praise</th>
                <th className="py-2 pr-3 font-medium">Main issue</th>
                <th className="py-2 pr-3 font-medium">Markets</th>
                <th className="py-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3">{s.topic}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.n_comments}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.n_negative}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.n_likes}</td>
                  <td className="py-2 pr-3 text-ink-2">{s.dominant_issue ?? "–"}</td>
                  <td className="py-2 pr-3 text-ink-2">{Object.entries(s.by_market).map(([m, n]) => `${m} ${n}`).join(" · ")}</td>
                  <td className="py-2">
                    {!s.in_scope ? <span className="text-danger">Out of scope: {s.scope_reason}</span>
                      : s.requirement_id ? <Link className="text-blue hover:underline" href={`/vehicles/${code}?req=${s.requirement_id}`}>{s.requirement_id}</Link>
                      : <span className="text-ink-3">Below the cut</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    );
  }

  async function DataHealth() {
    const [rep, conflicts, issues] = await Promise.all([representation(code), marketConflicts(code), dataIssues(code)]);
    const sev: Record<string, string> = { critical: "bg-danger text-white", warning: "bg-validate-soft text-validate", info: "bg-mist text-ink-2" };
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Missing voices" aside="Share of customer comments vs share of 2025 sales">
          <ul className="flex flex-col gap-4">
            {rep.map((r) => (
              <li key={r.market} className="text-[13px]">
                <div className="flex justify-between"><span className="font-medium">{MARKET_LABEL[r.market]}</span><span className="tabular-nums text-ink-3">{r.feedback_n.toLocaleString("en-US")} comments · {r.sales_2025.toLocaleString("en-US")} sold</span></div>
                <div className="mt-1 grid grid-cols-[70px_1fr_44px] items-center gap-2"><span className="text-ink-3">Comments</span><span className="h-2 bg-mist"><span className="block h-full bg-blue" style={{ width: pct(r.feedback_share) }} /></span><span className="text-right tabular-nums">{pct(r.feedback_share)}</span></div>
                <div className="mt-1 grid grid-cols-[70px_1fr_44px] items-center gap-2"><span className="text-ink-3">Sales</span><span className="h-2 bg-mist"><span className="block h-full bg-ink" style={{ width: pct(r.sales_share) }} /></span><span className="text-right tabular-nums">{pct(r.sales_share)}</span></div>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Market conflicts" aside="China vs Europe study, gap of 0.8 or more">
          {conflicts.length === 0 ? <p className="text-[14px] text-ink-3">No conflicts above the threshold.</p> : (
            <table className="w-full text-[13px]">
              <thead className="text-left text-ink-3"><tr><th className="py-1 font-medium">Attribute</th><th className="py-1 text-right font-medium">China</th><th className="py-1 text-right font-medium">Europe</th><th className="py-1 pl-3 font-medium">Scope</th></tr></thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr key={c.attribute} className="border-t border-line">
                    <td className="py-2">{c.attribute}</td>
                    <td className="py-2 text-right tabular-nums">{c.cn}</td>
                    <td className="py-2 text-right tabular-nums">{c.eu}</td>
                    <td className="py-2 pl-3">{c.in_scope ? <span className="text-act">In scope</span> : <span className="text-ink-3">{c.scope_reason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <div className="xl:col-span-2">
          <Section title="Data issues found and how they were handled">
            <ul className="flex flex-col divide-y divide-line">
              {issues.map((i) => (
                <li key={i.id} className="grid gap-2 py-3 text-[14px] sm:grid-cols-[96px_1fr_1fr] sm:gap-4">
                  <span><span className={`px-2 py-0.5 text-[11px] font-semibold uppercase ${sev[i.severity]}`}>{i.severity}</span></span>
                  <span>{i.description}</span>
                  <span className="text-ink-2">{i.handling}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    );
  }
}
