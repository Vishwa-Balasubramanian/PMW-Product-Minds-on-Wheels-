import type { Viewer } from "@/lib/gate";
import { MARKET_LABEL } from "@/lib/regions";
import { POWERTRAIN_LABEL, QUADRANT, SOURCE_LABEL, type AuditEvent, type Quote, type Requirement } from "@/lib/types";
import { ReviewTabs } from "./ReviewTabs";
import { DecisionActions } from "./DecisionActions";
import { AuditTimeline, FactorBars, Matrix, MoscowBadge, QuadrantBadge, ScorePair, Section, StatusBadge } from "./ui";

const PENDING = "Further evidence is needed before this step can be completed.";

function Ladder({ r }: { r: Requirement }) {
  const steps = [
    { k: "Customer voice", v: r.customer_voice },
    { k: "Signal", v: r.signal_text },
    { k: "Root cause", v: r.root_cause },
    { k: "Customer need", v: r.customer_need },
    { k: "Requirement", v: r.requirement },
  ];
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.k} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-line" aria-hidden="true" />}
          <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold tabular-nums ${i === steps.length - 1 ? "bg-blue text-white" : "border border-ink-3 text-ink-2"}`}>{i + 1}</span>
          <div>
            <div className="eyebrow">{s.k}</div>
            <p className={`mt-1 text-[13px] ${s.v ? (i === steps.length - 1 ? "font-normal text-ink" : "text-ink-2") : "italic text-ink-3"}`}>{s.v ?? (s.k === "Customer voice" ? "No supporting customer quote is available in your selected region." : PENDING)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function QuoteItem({ q }: { q: Quote }) {
  const strong = q.severity === "serious" || q.severity === "very serious";
  return (
    <li className={`border-l-2 pl-4 ${q.role === "contradicts" ? "border-act" : strong ? "border-danger" : "border-line"}`}>
      <p className="text-[13px] text-ink">“{q.text.length > 420 ? q.text.slice(0, 420) + "…" : q.text}”</p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-ink-3">
        <span className="font-mono text-blue">{q.id}</span>
        <span>{SOURCE_LABEL[q.source] ?? q.source}</span>
        <span>{MARKET_LABEL[q.market] ?? q.market}{q.country && q.country !== q.market ? ` (${q.country})` : ""}</span>
        {q.powertrain && <span>{POWERTRAIN_LABEL[q.powertrain] ?? q.powertrain}</span>}
        {q.severity && <span>{q.severity} problem</span>}
      </p>
    </li>
  );
}

export function DecisionCard({ r, quotes, hidden, events, labels, thresholds, viewer, siblings }: {
  r: Requirement;
  quotes: Quote[];
  hidden: Record<string, number>;
  events: AuditEvent[];
  labels: Record<string, string>;
  thresholds: { priority: number; confidence: number };
  viewer: Viewer;
  siblings: Requirement[];
}) {
  const supports = quotes.filter((q) => q.role === "supports");
  const contradicts = quotes.filter((q) => q.role === "contradicts");
  const hiddenTotal = Object.values(hidden).reduce((a, b) => a + b, 0);
  const originalConfidence = events.find((e) => e.field === "confidence")?.before;

  return (
    <article className="decision-card" aria-label="Requirement review">
      <header className="decision-header">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
          <span className="font-mono">{r.id}</span><span>Rank {siblings.findIndex((x) => x.id === r.id) + 1} of {siblings.length}</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {r.aspect && <p className="mb-1 text-[11px] text-ink-3">{r.aspect} · {r.part}</p>}
            <h2 className="decision-title">{r.title}</h2>
          </div>
          {r.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.photo} alt={r.part ?? ""} className="decision-thumbnail" style={{ objectPosition: `${r.focal_x ?? 50}% ${r.focal_y ?? 50}%` }} />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><MoscowBadge p={r.priority} /><QuadrantBadge q={r.quadrant} /><StatusBadge s={r.status} /><span className="ml-auto text-[11px] text-ink-2 tabular-nums">Priority <b>{r.priority}</b> <span className="mx-1 text-line">/</span> Confidence <b>{r.confidence}</b></span></div>
        <p className="mt-3 text-[11px] text-ink-3">{r.generated_by.startsWith("evidence-template") ? "Evidence-based draft · needs validation" : r.generated_by === "template" ? "Template draft" : "AI draft · needs validation"}</p>
        <p className="mt-1 text-[11px] text-ink-3">Evidence from {r.markets.map((m) => MARKET_LABEL[m] ?? m).join(", ")}</p>
      </header>
      <div className="decision-actions"><DecisionActions key={`${r.id}:${r.updated_at}`} r={r} /></div>

      {r.challenged && (
        <section className="challenge-result">
          <h3 className="eyebrow text-challenge">Challenge result</h3>
          {r.challenge.narrative && <p className="mt-2 text-[13px] text-ink-2">{r.challenge.narrative}</p>}
          <p className="mt-2 text-[13px]">
            The red-team check found {r.challenge.issues.length} issue{r.challenge.issues.length === 1 ? "" : "s"}.
            Confidence moved from <b className="tabular-nums">{originalConfidence ?? "?"}</b> to <b className="tabular-nums">{r.confidence}</b>,
            so this requirement now sits in <b>{QUADRANT[r.quadrant].label}</b>.
          </p>
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-[14px] text-ink-2">
            {r.challenge.issues.map((i) => <li key={i.text}>{i.text} <span className="text-ink-3">(−{i.penalty})</span></li>)}
          </ul>
          {r.challenge.priority_sensitivity && (
            <p className="mt-3 text-[13px] text-ink-3">
              Priority ranges from {r.challenge.priority_sensitivity.min} to {r.challenge.priority_sensitivity.max} when each strategy weight changes by 20% in turn.
              {r.challenge.priority_sensitivity.crosses_threshold ? " Review this borderline priority with your team." : " The priority threshold remains on the same side in these scenarios."}
            </p>
          )}
        </section>
      )}

      <ReviewTabs key={r.id}
        overview={<>
          <Section title="From customer voice to requirement">
            <Ladder r={r} />
          </Section>
          <Section title="Assumptions, uncertainties, contradictions">
            <ul className="flex flex-col gap-2 text-[14px]">
              {r.assumptions.map((a) => <li key={a}><span className="mr-2 bg-validate-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase text-validate">Assumption</span>{a}</li>)}
              {r.uncertainties.map((a) => <li key={a}><span className="mr-2 bg-monitor-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase text-monitor">Uncertainty</span>{a}</li>)}
              {r.contradictions.map((a) => <li key={a}><span className="mr-2 bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase text-danger">Contradiction</span>{a}</li>)}
            </ul>
          </Section>
        </>}
        evidence={<>
          <Section title="Customer evidence" aside={`${supports.length} supporting · ${contradicts.length} contradicting · visible to ${viewer.label}`}>
            {hiddenTotal > 0 && (
              <p className="mb-4 border border-dashed border-line bg-mist px-4 py-3 text-[14px] text-ink-2">
                {Object.entries(hidden).map(([m, n]) => `${n} comment${n === 1 ? "" : "s"} from ${MARKET_LABEL[m] ?? m}`).join(", ")} restricted to
                {" "}{Object.keys(hidden).length > 1 ? "those markets'" : "that market's"} product managers and the head of product. This access was logged.
              </p>
            )}
            {supports.length === 0 && hiddenTotal === 0 && <p className="text-[14px] text-ink-3">No customer comments. This requirement rests on survey evidence only.</p>}
            <ul className="flex flex-col gap-4">{supports.slice(0, 8).map((q) => <QuoteItem key={q.id} q={q} />)}</ul>
            {contradicts.length > 0 && (
              <>
                <h4 className="eyebrow mt-6 mb-3">Customers who disagree</h4>
                <ul className="flex flex-col gap-4">{contradicts.slice(0, 3).map((q) => <QuoteItem key={q.id} q={q} />)}</ul>
              </>
            )}
          </Section>
          <Section title="Survey evidence" aside="US: share of lowest answers · CN/EU: mean of 10">
            {r.survey.length === 0 ? (
              <p className="text-[14px] text-ink-3">No survey question maps to this topic yet.</p>
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {r.survey.map((s) => (
                    <tr key={s.study + s.market + s.attribute} className="border-t border-line first:border-t-0">
                      <td className="py-2 pr-3">{s.attribute}{s.variant ? ` (${s.variant})` : ""}</td>
                      <td className="py-2 pr-3 text-ink-3">{MARKET_LABEL[s.market]}</td>
                      <td className="py-2 text-right tabular-nums">{s.scale === 7 ? `${Math.round((s.bottom3 ?? 0) * 1000) / 10}% negative` : `${s.mean} / 10`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.conflicts.length > 0 && (
              <div className="mt-4 border-l-2 border-validate bg-validate-soft px-4 py-3 text-[14px]">
                <b>Markets disagree.</b>{" "}
                {r.conflicts.map((c) => `${c.attribute}: China ${c.cn} vs Europe ${c.eu}`).join("; ")}. Decide whether this is a global or a market-specific requirement.
              </div>
            )}
          </Section>
        </>}
        scoring={
          <div className="grid gap-6">
            <Section title="Priority" aside="How important">
              <div className="mb-5"><ScorePair r={r} size="lg" /></div>
              <FactorBars factors={r.priority_factors} labels={labels} />
            </Section>
            <Section title="Confidence" aside="How well proven">
              <FactorBars factors={r.confidence_factors} labels={labels} />
              <div className="mt-6">
                <Matrix items={siblings} thresholds={thresholds} vehicle={r.vehicle} selected={r.id} size={420} />
              </div>
            </Section>
          </div>
        }
        activity={
          <Section title="Audit trail" aside="Who, when, what changed and why">
            <AuditTimeline events={events} />
          </Section>
        }
      />
    </article>
  );
}
