import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionCard } from "@/components/DecisionCard";
import { Header } from "@/components/Header";
import { ScrollToCard } from "@/components/ScrollToCard";
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
  // List filter: a quadrant, or "quick" for quick wins (equipment BMW already sells).
  const qFilter = sp.q === "quick" ? "quick" : typeof sp.q === "string" && Object.hasOwn(QUADRANT, sp.q) ? (sp.q as Quadrant) : null;

  const [all, weights, voices, totals, labels, active, stored] = await Promise.all([
    listRequirements(viewer, code), getWeights(), missingVoices(code), vehicleTotals(code), getFactorLabels(), getActiveWeights(),
    storedOrder(code),
  ]);
  const quickWins = all.filter((r) => r.kind === "quick_win");
  const reqs = qFilter === "quick" ? quickWins : qFilter ? all.filter((r) => r.quadrant === qFilter) : all;
  const selectedId = typeof sp.req === "string" && reqs.some((r) => r.id === sp.req) ? sp.req : reqs[0]?.id;
  const awaiting = all.filter((r) => r.status === "proposed" || r.status === "edited").length;

  return (
    <main className="flex-1 bg-white">
      <Header viewer={viewer} />

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
      <div className="grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 lg:sticky lg:top-[140px] lg:max-h-[calc(100vh-170px)] lg:self-start">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter requirements">
            {([null, "act", "validate", "monitor", "park"] as const).map((q) => (
              <Link
                key={q ?? "all"}
                href={`/vehicles/${code}${q ? `?q=${q}` : ""}`}
                scroll={false}
                className={`h-8 border px-2.5 text-[13px] leading-8 ${qFilter === q ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-ink"}`}
              >
                {q ? QUADRANT[q].label : "All"} <span className="tabular-nums opacity-70">{q ? all.filter((r) => r.quadrant === q).length : all.length}</span>
              </Link>
            ))}
            <Link
              href={`/vehicles/${code}?q=quick`}
              scroll={false}
              title="Customers ask for equipment BMW already sells"
              className={`h-8 border px-2.5 text-[13px] leading-8 ${qFilter === "quick" ? "border-blue bg-blue text-white" : "border-blue text-blue hover:bg-monitor-soft"}`}
            >
              Quick wins <span className="tabular-nums opacity-70">{quickWins.length}</span>
            </Link>
          </div>
          {active && (
            <p className="border-l-2 border-blue bg-monitor-soft px-3 py-2 text-[13px] text-ink-2" data-testid="ranking-note">
              <b className="uppercase tracking-[0.05em] text-ink">Ranking: {presetLabel(active.preset)}</b> · changed by {active.changed_by} at{" "}
              <time dateTime={active.changed_at}>{new Date(active.changed_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
            </p>
          )}
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2">
            <h2 className="whitespace-nowrap text-[15px] font-semibold">Ranked by priority</h2>
            <span className="text-[12px] text-ink-3">MoSCoW, highest first</span>
          </div>
          <div className="flex flex-col overflow-y-auto">
            {reqs.length === 0 && <p className="py-6 text-[14px] text-ink-3">No {qFilter === "quick" ? "quick wins" : "requirements"} with evidence in {viewer.label}.</p>}
            {MOSCOW.map((m, gi) => {
              const next = MOSCOW[gi - 1]?.min ?? 101;
              const rows = reqs.filter((r) => r.priority >= m.min && r.priority < next);
              if (!rows.length) return null;
              return (
                <section key={m.key} aria-label={m.label} className="border-b border-line pb-2">
                  <div className="flex items-baseline justify-between gap-2 px-3 pt-4 pb-1">
                    <h3 className={`text-[12px] font-bold uppercase tracking-[0.1em] ${m.text}`}>{m.label}</h3>
                    <span className="text-[12px] text-ink-3">{rows.length} · {m.hint}</span>
                  </div>
                  <ul>
                    {rows.map((r) => {
                      const on = r.id === selectedId;
                      return (
                        <li key={r.id}>
                          <Link
                            href={`/vehicles/${code}?${qFilter ? `q=${qFilter}&` : ""}req=${r.id}`}
                            scroll={false}
                            aria-label={`${m.label}, priority ${r.priority}: ${r.title}`}
                            className={`relative grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2.5 pr-3 pl-7 ${on ? "bg-monitor-soft shadow-[inset_3px_0_0_var(--color-blue)]" : "hover:bg-mist"}`}
                          >
                            <span className={`absolute left-3 top-[17px] h-[5px] w-[5px] ${m.dot}`} aria-hidden="true" />
                            <span className="text-[15px] font-normal leading-snug text-ink">{r.title}</span>
                            <span className="row-span-2 self-center text-[16px] font-semibold tabular-nums">{r.priority}</span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                              {r.aspect && <span>{r.aspect} · {r.part}</span>}
                              <QuadrantBadge q={r.quadrant} />
                              {r.kind === "quick_win" && <QuickWinBadge />}
                              {r.status !== "proposed" && <StatusBadge s={r.status} />}
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
        <div id="decision-card" className="min-w-0 scroll-mt-[145px]">
          {detail && <ScrollToCard targetId="decision-card" selected={detail.requirement.id} />}
          {detail ? (
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
          ) : (
            <p className="text-ink-3">Select a requirement.</p>
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
