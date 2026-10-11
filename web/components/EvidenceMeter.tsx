import type { EvidenceMix } from "@/lib/types";

const PARTS = [
  { key: "observed", label: "Observed comments", color: "#1C69D4" },
  { key: "survey", label: "Survey measures", color: "#00417F" },
  { key: "inferred", label: "Inference", color: "#68778D" },
  { key: "assumed", label: "Assumptions", color: "#CBD5E1" },
] as const;

/** Pure server-compatible component; pass only the viewer's mix from gate.ts. */
export function EvidenceMeter({ mix, region }: { mix: EvidenceMix | null; region: string }) {
  // Round for display with largest remainders so four visible percentages total 100.
  const percentages = PARTS.map(({ key }) => Math.floor((mix?.[key] ?? 0) * 100));
  if (mix) {
    const order = PARTS.map(({ key }, i) => ({ i, remainder: mix[key] * 100 - percentages[i] }))
      .sort((a, b) => b.remainder - a.remainder);
    for (const { i } of order.slice(0, 100 - percentages.reduce((a, b) => a + b, 0))) percentages[i]++;
  }
  const label = PARTS.map((p, i) => `${p.label} ${percentages[i]}%`).join(", ");
  return (
    <section aria-label="Evidence composition" className="border border-line bg-mist p-5" data-testid="evidence-meter">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="eyebrow">Evidence &amp; assumptions</h3>
        <span className="text-[11px] text-ink-3">{region}</span>
      </div>
      {!mix ? <p className="mt-3 text-xs text-ink-2">Evidence composition is pending for this dataset.</p> : <>
        <div role="img" aria-label={label} className="mt-3 flex h-3 w-full overflow-hidden">
          {PARTS.map(p => <span key={p.key} style={{ width: `${mix[p.key] * 100}%`, backgroundColor: p.color }} />)}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-ink-2">
          {PARTS.map((p, i) => <li key={p.key} className="flex items-center gap-2" data-part={p.key} data-value={mix[p.key]}>
            <span aria-hidden="true" className="size-2 shrink-0" style={{ backgroundColor: p.color }} />
            <span>{p.label}</span><strong className="ml-auto tabular-nums text-ink">{percentages[i]}%</strong>
          </li>)}
        </ul>
        <details className="mt-3 text-[11px] text-ink-3">
          <summary className="cursor-pointer">How this mix is calculated</summary>
          <p className="mt-2 leading-relaxed">A rule-based provenance index for {region.toLowerCase()}, not confidence or a probability. Comments receive up to 4 units (30 comments reaches the cap); distinct mapped survey measures receive up to 4. Inference receives 2 units for the hypothesis and requirement, plus 1 for merged topics and up to 1 for provisional labels. Assumptions receive 1 unit for successor relevance, plus 1 for equipment transfer in quick wins. Units are normalized to 100%.</p>
          <p className="mt-2 leading-relaxed">Survey measures can support or contradict a draft. Inference includes reviewed templates, rules and AI where used. This describes the source basis of the draft; it does not verify edited wording. Priority and confidence remain separate scores.</p>
          {mix.observed === 0 && <p className="mt-2 font-medium text-ink-2">No observed customer comments in this market&apos;s evidence. Other markets&apos; comments are not counted here.</p>}
        </details>
      </>}
    </section>
  );
}
