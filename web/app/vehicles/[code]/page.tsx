import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionCard } from "@/components/DecisionCard";
import { HappinessMeterCard } from "@/components/HappinessMeterCard";
import { BoardToolbar, RequirementsBoard, requirementBoardHref } from "@/components/RequirementsBoard";
import { ScrollToCard } from "@/components/ScrollToCard";
import { WeightsPanel } from "@/components/WeightsPanel";
import { Matrix, QuadrantBadge, Section } from "@/components/ui";
import {
  auditFor, dataIssues, getActiveWeights, getFactorLabels, getRequirement, getVehicle, getViewer, getWeights, listRequirements, listSignals,
  marketConflicts, missingVoices, representation, storedOrder, vehicleTotals,
} from "@/lib/gate";
import { MARKET_LABEL } from "@/lib/regions";
import { PRIORITY_FACTORS, factorValues, presetLabel, type PriorityWeights } from "@/lib/score";
import { QUADRANT, type Quadrant } from "@/lib/types";

export const dynamic = "force-dynamic";

const VIEWS = [
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
  const view = VIEWS.find((v) => v.k === sp.view)?.k ?? "inbox";
  // List filter: a quadrant, "quick" for quick wins (equipment BMW already sells) or "conflict" for market conflict cards.
  const qFilter = sp.q === "quick" || sp.q === "conflict" ? sp.q
    : typeof sp.q === "string" && Object.hasOwn(QUADRANT, sp.q) ? (sp.q as Quadrant) : null;

  const [all, weights, voices, totals, labels, active, stored] = await Promise.all([
    listRequirements(viewer, code), getWeights(), missingVoices(code), vehicleTotals(code), getFactorLabels(), getActiveWeights(),
    storedOrder(code),
  ]);
  const quickWins = all.filter((r) => r.kind === "quick_win");
  const conflicts = all.filter((r) => r.kind === "market_conflict");
  const search = view === "inbox" && typeof sp.search === "string" ? sp.search.trim().slice(0, 256) : "";
  const filtered = qFilter === "quick" ? quickWins : qFilter === "conflict" ? conflicts : qFilter ? all.filter((r) => r.quadrant === qFilter) : all;
  const reqs = search ? filtered.filter((r) => r.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) : filtered;
  const selectedId = typeof sp.req === "string" && reqs.some((r) => r.id === sp.req) ? sp.req : reqs[0]?.id;
  const awaiting = all.filter((r) => r.status === "proposed" || r.status === "edited").length;

  return (
    <main className="flex-1 bg-white">

      <section className="relative isolate overflow-hidden bg-night text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/cars/${code}-wide.jpg`} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/55 to-black/10" />
        <div className="container-x flex flex-col gap-5 py-12">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-white/75">Requirements for the successor generation · {code}</p>
          <h1 className="headline text-[40px] sm:text-[52px]">{vehicle.name}</h1>
          <dl className="flex flex-wrap gap-x-10 gap-y-3 text-[14px]">
            <div><dt className="text-white/60">Viewing as</dt><dd className="font-medium">{viewer.actor}</dd></div>
            <div><dt className="text-white/60">Requirements in your region</dt><dd className="font-medium tabular-nums">{all.length}</dd></div>
            <div><dt className="text-white/60">Awaiting decision</dt><dd className="font-medium tabular-nums">{awaiting}</dd></div>
            <div><dt className="text-white/60">Comments analysed (all markets)</dt><dd className="font-medium tabular-nums">{totals.comments.toLocaleString("en-US")}</dd></div>
          </dl>
          {voices && (
            <p className="max-w-[820px] border-l-2 border-validate bg-black/40 px-4 py-3 text-[14px] text-white/90">
              <b className="uppercase tracking-[0.06em]">Missing voices.</b> {voices} Confidence is lowered accordingly.
            </p>
          )}
        </div>
      </section>

      <nav className="sticky top-[72px] z-20 border-b border-line bg-white" aria-label="Views">
        <div className="container-x flex gap-8 overflow-x-auto">
          {VIEWS.map((v) => (
            <Link
              key={v.k}
              href={`/vehicles/${code}?view=${v.k}`}
              aria-current={view === v.k ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 py-4 text-[13px] font-bold uppercase tracking-[0.05em] ${view === v.k ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
            >
              {v.label}
            </Link>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-2 py-2" aria-label="Export requirement list">
            <span className="hidden text-[13px] text-ink-3 lg:inline">Requirement list in BMW format</span>
            {/* Plain links: the route answers with a file download. */}
            <a href={`/api/export?vehicle=${code}&format=csv`} className="btn-outline btn-sm" download>Export CSV</a>
            <a href={`/api/export?vehicle=${code}&format=json`} className="btn-outline btn-sm" download>JSON</a>
          </div>
        </div>
      </nav>

      <div className="container-x py-8">
        {view === "inbox" && (
          <div className="mb-6">
            {/* Factor values, IDs and titles only: no customer text reaches this client component. */}
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
          <div className="grid gap-8 lg:grid-cols-[minmax(0,640px)_1fr]">
            <Section title="Priority against confidence" aside="Click a dot to open the requirement">
              <Matrix items={all} thresholds={weights.thresholds} vehicle={code} size={640} />
            </Section>
            <div className="grid content-start gap-4 sm:grid-cols-2">
              {(Object.keys(QUADRANT) as Quadrant[]).map((q) => (
                <div key={q} className="card p-5">
                  <div className="flex items-center justify-between"><QuadrantBadge q={q} /><span className="text-[28px] font-light tabular-nums">{all.filter((r) => r.quadrant === q).length}</span></div>
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
    </main>
  );

  async function Inbox() {
    const detail = selectedId ? await getRequirement(viewer, selectedId) : undefined;
    const events = detail ? await auditFor(viewer, detail.requirement.id) : [];
    return (
      <div className="flex flex-col">
        {active && (
          <p className="mb-4 border-l-2 border-blue bg-monitor-soft px-3 py-2 text-[13px] text-ink-2" data-testid="ranking-note">
            <b className="uppercase tracking-[0.05em] text-ink">Ranking: {presetLabel(active.preset)}</b> · changed by {active.changed_by} at{" "}
            <time dateTime={active.changed_at}>{new Date(active.changed_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
          </p>
        )}
        <BoardToolbar all={all} vehicle={code} filter={qFilter} search={search} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* Desktop: the board stays in view beside the Decision Card, like an inbox. Phone: board, then card. */}
        <div className="min-w-0 lg:sticky lg:top-[145px] lg:flex lg:h-[calc(100vh-170px)] lg:flex-col lg:self-start">
          <RequirementsBoard items={reqs} vehicle={code} filter={qFilter} search={search} selected={selectedId} region={viewer.label} />
        </div>
        <div id="decision-card" className="min-w-0 scroll-mt-[145px]">
          {detail && <ScrollToCard targetId="decision-card" selected={detail.requirement.id} />}
          {detail ? (
            <>
            <a href={`${requirementBoardHref(code, qFilter, search)}#requirements-board`} className="mb-4 inline-flex text-[13px] font-medium text-blue hover:underline lg:hidden">← Back to requirements board</a>
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
            <p className="text-ink-3">Select a requirement.</p>
          )}
        </div>
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
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <HappinessMeterCard viewer={viewer} vehicle={code} />
          </div>
          <div className="grid gap-6 xl:col-span-2 xl:grid-cols-2">
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
          </div>
        </div>
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
