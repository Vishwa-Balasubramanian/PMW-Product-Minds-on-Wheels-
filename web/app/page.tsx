import Link from "next/link";
import { getViewer, listVehicles } from "@/lib/gate";

export const dynamic = "force-dynamic";
const fmt = (n: number) => n.toLocaleString("en-US");

const STEPS = [
  { title: "Customer voice", text: "10,128 comments, surveys, sales and price lists, cleaned into one evidence base." },
  { title: "Signals and root causes", text: "Recurring complaints, unmet needs and competitor pressure, grouped and explained." },
  { title: "Priority and confidence", text: "Two separate scores from transparent formulas, never from the model alone." },
  { title: "Product manager decides", text: "Approve, edit, reject, challenge or ask for validation. Every step is logged." },
];

export default async function Home() {
  const viewer = await getViewer();
  const vehicles = await listVehicles(viewer);
  const programs = ["G70", "G60", "F70"].map((code) => vehicles.find((v) => v.code === code)!).filter(Boolean);
  const available = programs.filter((v) => v.available);
  const pending = available.reduce((n, v) => n + v.awaiting, 0);
  const requirements = available.reduce((n, v) => n + v.requirements, 0);
  const comments = available.reduce((n, v) => n + v.comments, 0);
  return (
    <div className="page-content">
      <div className="page-titlebar">
        <div><h1 className="page-heading">Portfolio overview</h1><p className="page-caption">Your vehicle programs, evidence and decisions in one workspace.</p></div>
        <Link href="/audit" className="btn-outline">View audit trail <span aria-hidden="true">↗</span></Link>
      </div>
      <dl className="metric-grid">
        <div className="card metric-card"><dt>Awaiting decision</dt><dd className="text-blue">{fmt(pending)}</dd><p>Proposed or edited requirements</p></div>
        <div className="card metric-card"><dt>Requirements</dt><dd>{fmt(requirements)}</dd><p>Across {available.length} available programs</p></div>
        <div className="card metric-card"><dt>Customer comments</dt><dd>{fmt(comments)}</dd><p>Evidence visible in {viewer.label}</p></div>
      </dl>
      <section className="card overflow-hidden" aria-labelledby="programs-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
          <h2 id="programs-heading" className="text-[14px] font-semibold">Vehicle programs <span className="ml-1 text-ink-3 font-normal">{programs.length}</span></h2>
          <span className="text-[12px] text-ink-3">{viewer.label} · Successor generation</span>
        </div>
        {programs.map((v) => (
          <article key={v.code} className={`portfolio-row ${v.available ? "" : "is-unavailable"}`}>
            <div className="portfolio-program flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.image} alt={`${v.name}, front three-quarter view`} className={`program-thumbnail ${v.available ? "" : "grayscale opacity-60"}`} />
              <div><p className="text-[10px] font-mono text-ink-3 mb-1">{v.code}</p><h3 className="text-[15px] font-semibold">{v.name}</h3><p className="mt-1 text-[11px] text-ink-3">{v.available ? `${fmt(v.sales2025)} sold in 2025` : "Unavailable in this region"}</p></div>
            </div>
            <dl><dt>Requirements</dt><dd>{v.available ? v.requirements : "—"}</dd></dl>
            <dl><dt>Awaiting decision</dt><dd className={v.available && v.awaiting ? "text-blue" : ""}>{v.available ? v.awaiting : "—"}</dd></dl>
            <dl><dt>Comments</dt><dd>{v.available ? fmt(v.comments) : "—"}</dd></dl>
            <div className="portfolio-action justify-self-end">
              {v.available ? <Link href={`/vehicles/${v.code}`} className="btn-outline" aria-label={`Open requirements for ${v.name}`}>Open requirements <span aria-hidden="true">→</span></Link>
                : <span className="text-[12px] text-ink-3">Not available in your region</span>}
            </div>
            {v.thin && <p className="program-note"><b>Thin evidence.</b> No customer comments from {viewer.label}. Requirements rest on survey means only.</p>}
            {!v.available && <p className="col-span-full text-[12px] text-ink-3">Not sold in {viewer.label}, so there is no evidence to review here.</p>}
          </article>
        ))}
      </section>
      <details className="card workflow-guide">
        <summary>How evidence becomes a product decision</summary>
        <ol>{STEPS.map((s, i) => <li key={s.title}><span className="text-[11px] text-blue font-medium">0{i + 1}</span><h3 className="my-1 text-[13px] font-semibold">{s.title}</h3><p className="text-[12px] text-ink-3">{s.text}</p></li>)}</ol>
      </details>
      <footer className="mt-6 flex flex-wrap justify-between gap-2 text-[11px] text-ink-3"><span>Product Minds on Wheels · BMW challenge prototype</span><span>Vehicle photography from the provided BMW price lists</span></footer>
    </div>
  );
}
