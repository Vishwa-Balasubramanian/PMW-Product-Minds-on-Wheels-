import Link from "next/link";
import { Header } from "@/components/Header";
import { getViewer, portfolio } from "@/lib/gate";

export const dynamic = "force-dynamic";

// Discrete BMW-blue bands keep small labels readable at both ends of the scale.
const heatColor = (share: number) => {
  const percent = Math.round(share * 100);
  return percent >= 100 ? "#00417F" : percent >= 75 ? "#1C69D4" : percent >= 50 ? "#B7D2F6" : percent >= 25 ? "#DCEAFF" : "#F2F7FD";
};

export default async function PortfolioPage() {
  const [viewer, data] = await Promise.all([getViewer(), portfolio()]);
  return (
    <main className="flex-1 bg-white">
    <Header viewer={viewer} />
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Cross-program intelligence</p><h1 className="headline mt-2 text-[36px]">Cross-Model Radar</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">Find customer issues that repeat across the 1, 5 and 7 Series.</p></div>
        <Link href="/" className="text-[13px] font-medium text-blue hover:underline">All vehicles →</Link>
      </div>
      <div className="my-6 grid grid-cols-3 gap-3">
        {[{ label: "Vehicle programs", value: data.vehicles.length }, { label: "Customer themes", value: data.themes.length }, { label: "Recurring issues", value: data.recurring }].map(item => (
          <div key={item.label} className=" border border-line bg-white p-3 sm:p-5"><p className="text-2xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-[11px] text-ink-3">{item.label}</p></div>
        ))}
      </div>
      <section aria-label="Cross-vehicle theme heatmap" className="min-w-0 border border-line bg-white">
        <div className="border-b border-line p-4 sm:p-5"><h2 className="text-sm font-semibold">Negative share by theme</h2>
          <p id="heatmap-description" className="mt-2 max-w-3xl text-xs leading-relaxed text-ink-2">Concerns ÷ all comments within each theme. Concerns include difficulty, defects and wishes; each comment is counted once per theme. These are sample shares, not market prevalence. Recurring means at least one concern in two or more programs. Customer-facing themes are sorted by recurrence, then total concerns.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-ink-3"><span>Negative share</span>{[0, 25, 50, 75, 100].map(n => <span key={n} className="flex items-center gap-1"><span className="inline-block h-3 w-4 border border-blue/20" style={{ backgroundColor: heatColor(n / 100) }} />{n === 100 ? "100%" : `${n}–${n + 24}%`}</span>)}</div>
        </div>
        <p className="px-4 pt-3 text-[11px] text-ink-3 sm:hidden">Scroll the table horizontally to compare all programs.</p>
        <div role="region" aria-label="Scrollable portfolio heatmap" tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-blue">
          <table aria-describedby="heatmap-description" className="w-full min-w-[650px] border-collapse text-xs" data-testid="portfolio-heatmap">
            <thead><tr className="border-b border-line bg-mist text-left text-ink-2"><th scope="col" className="w-[28%] p-4 font-medium sm:w-[40%]">Customer theme</th>{data.vehicles.map(v => <th key={v.code} scope="col" className="p-4 text-center font-medium">{v.short}<span className="mt-1 block font-mono text-[10px] text-ink-3">{v.code}</span></th>)}</tr></thead>
            <tbody>{data.themes.map(row => <tr key={row.theme} className="border-b border-line last:border-0">
              <th scope="row" className="p-4 text-left font-medium">{row.theme}{row.recurring && <span className="mt-1 block text-[10px] font-normal text-ink-3">Recurring</span>}</th>
              {row.cells.map(cell => <td key={cell.vehicle} className="p-1.5">
                <Link href={`/vehicles/${cell.vehicle}?view=signals`} aria-label={`${row.theme}, ${cell.vehicle}: ${cell.share === null ? "no evidence" : `${Math.round(cell.share * 100)}% negative, ${cell.negative} of ${cell.comments} comments`}. Open signals`} className={`block p-3 text-center outline-offset-2 transition-shadow hover:ring-2 hover:ring-blue ${cell.share !== null && Math.round(cell.share * 100) >= 75 ? "text-white" : "text-ink"}`}
                  style={{ backgroundColor: cell.share === null ? "#F4F6F8" : heatColor(cell.share) }}>
                  <span className="block text-base font-semibold tabular-nums">{cell.share === null ? "—" : `${Math.round(cell.share * 100)}%`}</span>
                  <span className="mt-1 block text-[10px] tabular-nums">{cell.share === null ? "No evidence" : `${cell.negative} / ${cell.comments} comments`}</span>
                </Link>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {!data.themes.length && <p className="p-5 text-sm text-ink-2">No customer themes are available in this dataset yet.</p>}
      </section>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">All markets · Aggregate counts only · Identical for every viewer region. Open a vehicle to review evidence permitted for your region. A comment can belong to several themes; theme counts must not be added together.</p>
    </div>
    </main>
  );
}
