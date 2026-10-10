import Link from "next/link";
import { Header } from "@/components/Header";
import { getViewer, workflowStats } from "@/lib/gate";
import { QUADRANT, type Quadrant } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

type Owner = "code" | "ai" | "human" | "system";

const OWNER: Record<Owner, { label: string; className: string }> = {
  code: { label: "Code · automatic", className: "border border-ink text-ink" },
  ai: { label: "AI · drafts only", className: "bg-blue text-white" },
  human: { label: "Product manager · mandatory", className: "bg-challenge text-white" },
  system: { label: "System · automatic", className: "border border-ink-3 text-ink-2" },
};

const DRAFT_SOURCE: Record<string, string> = {
  "evidence-template:v2": "reviewed evidence templates",
  equipment_matcher: "equipment matcher",
  template: "basic templates",
};
const draftLabel = (g: string) => (g.startsWith("llm:") ? `AI model (${g.slice(4)})` : DRAFT_SOURCE[g] ?? g);

function OwnerChip({ owner }: { owner: Owner }) {
  const o = OWNER[owner];
  return <span className={`inline-flex h-7 w-fit self-start items-center px-3 text-[12px] font-bold uppercase tracking-[0.05em] ${o.className}`}>{o.label}</span>;
}

function Stat({ value, label, dark = false }: { value: string | number; label: string; dark?: boolean }) {
  return (
    <div>
      <div className="text-[28px] font-light leading-none tabular-nums">{typeof value === "number" ? fmt(value) : value}</div>
      <div className={`mt-1 text-[13px] ${dark ? "text-white/75" : "text-ink-3"}`}>{label}</div>
    </div>
  );
}

export default async function WorkflowPage() {
  const [viewer, s] = await Promise.all([getViewer(), workflowStats()]);

  const steps: { owner: Owner; title: string; text: string; files: string; stats: { value: string | number; label: string }[] }[] = [
    {
      owner: "code",
      title: "Ingest",
      text: "Reads the eight BMW files: customer comments, customer studies, sales and price lists. Known data problems are fixed and each one is recorded.",
      files: "pipeline/pmw/ingest.py",
      stats: [
        { value: s.comments, label: "customer comments" },
        { value: s.surveyRows, label: "survey measures" },
        { value: s.equipmentRows, label: "price-list rows" },
        { value: s.dataIssues, label: "data problems recorded" },
      ],
    },
    {
      owner: "ai",
      title: "Label and group",
      text: "Labels comments that BMW left without a topic, then groups related topics into themes. Every label keeps its source (BMW, rule or AI).",
      files: "pipeline/pmw/classify.py · signals.py · themes.py",
      stats: [
        { value: s.labelledByRules, label: "comments newly labelled" },
        { value: s.signals, label: "signals found" },
      ],
    },
    {
      owner: "code",
      title: "Cross-check",
      text: "Checks every theme against the customer studies, sales by market and the price lists: missing voices, market conflicts and features BMW already sells.",
      files: "pipeline/pmw/evidence.py",
      stats: [
        { value: s.conflicts, label: "China vs Europe conflicts" },
        { value: s.equipmentMatches, label: "equipment matches" },
      ],
    },
    {
      owner: "code",
      title: "Scope guard",
      text: "Removes regulatory, engineering-spec and pricing topics, each with a reason the product manager can read.",
      files: "pipeline/pmw/scope.py",
      stats: [{ value: s.outOfScope, label: "signals excluded with a reason" }],
    },
    {
      owner: "ai",
      title: "Draft requirement",
      text: "Writes the ladder: customer voice, signal, root cause, customer need, requirement. Every draft is labelled as needing validation; root causes are stated as hypotheses.",
      files: "pipeline/pmw/derive.py · drafts.py",
      stats: [
        { value: s.requirements, label: `requirements, incl. ${fmt(s.quickWins)} quick wins` },
        ...Object.entries(s.drafts).map(([g, c]) => ({ value: c, label: `from ${draftLabel(g)}` })),
      ],
    },
    {
      owner: "code",
      title: "Score",
      text: "Priority and confidence are computed separately, by formula. The model never writes a number. Together they place each requirement in a decision quadrant.",
      files: "pipeline/pmw/score.py",
      stats: (Object.keys(QUADRANT) as Quadrant[]).map((q) => ({ value: s.quadrants[q] ?? 0, label: QUADRANT[q].label })),
    },
  ];

  return (
    <main className="flex-1">
      <Header viewer={viewer} />

      <section className="container-x py-14">
        <p className="eyebrow">How PMW works · BMW deliverable 3</p>
        <h1 className="headline mt-3 max-w-[900px] text-[36px] sm:text-[48px]">
          From customer voice to a decision a product manager can defend.
        </h1>
        <p className="mt-5 max-w-[720px] text-[17px] text-ink-2">
          Six steps run automatically and prepare the evidence. One step belongs to the product manager and cannot be skipped.
          Every step is recorded. The numbers below are live from the database.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <OwnerChip owner="code" />
          <OwnerChip owner="ai" />
          <OwnerChip owner="human" />
          <OwnerChip owner="system" />
        </div>
      </section>

      <section className="bg-mist">
        <div className="container-x grid gap-px py-10 sm:grid-cols-3">
          {[
            { t: "The AI drafts. It never decides.", d: "AI output is always a proposal, labelled as needing validation, until a product manager acts on it." },
            { t: "Numbers come from code.", d: "Priority, confidence and every count are computed by formulas anyone can check, never written by the model." },
            { t: "Every step is recorded.", d: "AI steps, decisions, edits and every access to customer evidence go into an append-only audit trail." },
          ].map((p) => (
            <div key={p.t} className="bg-white p-6">
              <h2 className="text-[20px] font-light leading-snug">{p.t}</h2>
              <p className="mt-2 text-[14px] text-ink-2">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-14">
        <ol className="flex flex-col">
          {steps.map((step, i) => (
            <li key={step.title} className="grid gap-5 border-t border-line py-8 md:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)]">
              <span className="text-[40px] font-light leading-none text-ink-3 tabular-nums">{i + 1}</span>
              <div className="flex flex-col gap-3">
                <OwnerChip owner={step.owner} />
                <h2 className="text-[26px] font-light leading-tight">{step.title}</h2>
                <p className="max-w-[560px] text-[15px] text-ink-2">{step.text}</p>
                <code className="text-[12px] text-ink-3">{step.files}</code>
              </div>
              <div className="grid content-start gap-5 sm:grid-cols-2">
                {step.stats.map((st) => <Stat key={st.label} value={st.value} label={st.label} />)}
              </div>
            </li>
          ))}

          {/* The one mandatory human step. */}
          <li className="grid gap-5 bg-ink px-6 py-10 text-white md:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] md:px-0">
            <span className="text-[40px] font-light leading-none tabular-nums md:pl-6">7</span>
            <div className="flex flex-col gap-3">
              <OwnerChip owner="human" />
              <h2 className="text-[30px] font-light leading-tight">The product manager decides</h2>
              <p className="max-w-[560px] text-[15px] text-white/80">
                Approve, validate first, edit, reject or challenge. Nothing shapes the next generation without this step,
                and every decision needs a person and, for rejections, edits and validation requests, a written reason.
              </p>
              <ul className="mt-2 flex max-w-[560px] list-disc flex-col gap-1.5 pl-5 text-[14px] text-white/85">
                <li>Every requirement, before it counts for the next generation</li>
                <li><b>Validate first</b> items: high priority, but the evidence is not strong enough yet</li>
                <li>Market conflicts: one global requirement, or market-specific ones</li>
                <li>Challenge results, when the red-team check lowers confidence</li>
                <li>Only evidence from the product manager&apos;s own market is shown; other markets stay summarised</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/vehicles/G70" className="btn-primary">Open the 7 Series</Link>
              </div>
            </div>
            <div className="grid content-start gap-5 sm:grid-cols-2 md:pr-6">
              <Stat value={s.decided} label="requirements decided" dark />
              <Stat value={s.awaiting} label="awaiting a decision" dark />
            </div>
          </li>

          <li className="grid gap-5 border-t border-line py-8 md:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)]">
            <span className="text-[40px] font-light leading-none text-ink-3 tabular-nums">8</span>
            <div className="flex flex-col gap-3">
              <OwnerChip owner="system" />
              <h2 className="text-[26px] font-light leading-tight">Record</h2>
              <p className="max-w-[560px] text-[15px] text-ink-2">
                Every AI step, decision, edit and access to customer evidence is logged with who, when, what changed and why.
                The trail is append-only: nothing in it can be edited or deleted from the app.
              </p>
              <code className="text-[12px] text-ink-3">web/lib/actions.ts · audit_events</code>
              <div><Link href="/audit" className="btn-outline btn-sm">Open the audit trail</Link></div>
            </div>
            <div className="grid content-start gap-5 sm:grid-cols-2">
              <Stat value={s.auditEvents} label="audit events" />
              <Stat value={s.pmEvents} label="by product managers" />
            </div>
          </li>
        </ol>
      </section>
    </main>
  );
}
