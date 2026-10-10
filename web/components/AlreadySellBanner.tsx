import type { EquipmentMatch, Requirement } from "@/lib/types";

// "You already sell this": equipment customers ask for that the German price list already contains.
// Comment IDs arrive region-filtered from gate.ts (hidden_count says how many were removed).

const MODEL: Record<string, string> = { G70: "7 Series", G60: "5 Series", F70: "1 Series" };
const model = (code: string | null) => (code ? MODEL[code] ?? code : "another BMW");
const euro = (n: number | null) => (n === null ? null : `€${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const ORDER: EquipmentMatch["match_type"][] = ["option_same_vehicle", "package_same_vehicle", "standard_other_vehicle", "standard_but_failing"];
const MAX_IDS = 6;

/** "Package: COMFORT PAKET (7VB, €2,750)" in the match note -> "Comfort Paket". */
function packageName(m: EquipmentMatch) {
  const raw = /Package: (.+?) \(/.exec(m.note)?.[1];
  return raw ? raw.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : null;
}

type Group = { feature: string; lines: EquipmentMatch[]; ids: string[]; hidden: number };

/**
 * One group per customer wish. The same equipment can match through more than one signal: show it once, and show the
 * comment IDs once per wish. Matches from the same signal cite the same comments, so hidden counts are taken once per signal.
 */
function groupMatches(matches: EquipmentMatch[]): Group[] {
  type Acc = Group & { keys: Set<string>; signals: Map<string, number> };
  const groups = new Map<string, Acc>();
  for (const m of matches) {
    const g: Acc = groups.get(m.feature) ?? { feature: m.feature, lines: [], ids: [], hidden: 0, keys: new Set(), signals: new Map() };
    const key = [m.match_type, m.equipment_name, m.code, m.source_vehicle].join("|");
    if (!g.keys.has(key)) { g.keys.add(key); g.lines.push(m); }
    for (const id of m.feedback_ids) if (!g.ids.includes(id)) g.ids.push(id);
    g.signals.set(m.signal_or_requirement_id, Math.max(g.signals.get(m.signal_or_requirement_id) ?? 0, m.hidden_count ?? 0));
    groups.set(m.feature, g);
  }
  return [...groups.values()].map(({ feature, lines, ids, signals }) => ({
    feature, ids,
    lines: lines.sort((a, b) => ORDER.indexOf(a.match_type) - ORDER.indexOf(b.match_type)),
    hidden: [...signals.values()].reduce((a, b) => a + b, 0),
  }));
}

function Code({ code, price }: { code: string | null; price: number | null }) {
  const parts = [code && <span key="c" className="font-mono">{code}</span>, euro(price) && <span key="p" className="tabular-nums">{euro(price)}</span>].filter(Boolean);
  if (!parts.length) return null;
  return <> ({parts.flatMap((p, i) => (i ? [", ", p] : [p]))})</>;
}

function Sentence({ m, vehicle }: { m: EquipmentMatch; vehicle: string }) {
  const here = model(vehicle);
  switch (m.match_type) {
    case "option_same_vehicle":
      return <>Sold as an option on the {here}: <b>{m.equipment_name}</b><Code code={m.code} price={m.price_eur} />.</>;
    case "package_same_vehicle": {
      const pkg = packageName(m);
      return pkg ? (
        <>Only inside the <b>{pkg}</b><Code code={m.code} price={m.price_eur} /> on the {here}, listed as {m.equipment_name}.</>
      ) : (
        <>Only inside a package on the {here}: <b>{m.equipment_name}</b><Code code={m.code} price={m.price_eur} />.</>
      );
    }
    case "standard_other_vehicle":
      return <><b>{m.equipment_name}</b> is standard on the {model(m.source_vehicle)}.</>;
    case "standard_but_failing":
      return <><b>{m.equipment_name}</b> is standard on the {here}, but customers report problems with it.</>;
  }
}

function CommentIds({ line, linkable }: { line: Group; linkable: Set<string> }) {
  const shown = line.ids.slice(0, MAX_IDS);
  const more = line.ids.length - shown.length;
  if (!line.ids.length && !line.hidden) return null;
  return (
    <p className="mt-1 text-[12px] text-ink-3 [overflow-wrap:anywhere]">
      {line.ids.length > 0 && <>Customer comments{" "}
        {shown.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            {linkable.has(id)
              ? <a href={`#comment-${id}`} className="font-mono text-blue hover:underline">{id}</a>
              : <span className="font-mono text-ink-2">{id}</span>}
          </span>
        ))}
        {more > 0 && <> and {more} more</>}
      </>}
      {line.hidden > 0 && (
        <>{line.ids.length > 0 ? " · " : ""}{line.hidden} comment{line.hidden === 1 ? "" : "s"} from other markets not shown (restricted to those markets&apos; product managers)</>
      )}
    </p>
  );
}

export function AlreadySellBanner({ r, linkable }: { r: Pick<Requirement, "kind" | "vehicle" | "already_exists">; linkable: Set<string> }) {
  if (!r.already_exists.length) return null;
  const groups = groupMatches(r.already_exists);
  const failingOnly = r.already_exists.every((m) => m.match_type === "standard_but_failing");
  return (
    <section aria-labelledby="already-sell-title" className="border border-line border-l-4 border-l-blue bg-monitor-soft px-4 py-4 sm:px-5">
      <h2 id="already-sell-title" className="text-[13px] font-bold uppercase tracking-[0.08em] text-blue">
        {failingOnly ? "Standard, but customers report problems" : "You already sell this"}
      </h2>
      {r.kind === "quick_win" && (
        <p className="mt-1 text-[14px] text-ink-2">Quick win: the equipment exists, so the decision is about availability and packaging, not new development.</p>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {groups.map((g) => (
          <li key={g.feature} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
              {g.lines.every((m) => m.match_type === "standard_but_failing") ? "Customers mention" : "Customers ask for"} {g.feature}
            </div>
            <ul className="mt-1 flex flex-col gap-1">
              {g.lines.map((m) => (
                <li key={[m.match_type, m.equipment_name, m.code, m.source_vehicle].join("|")} className="text-[14px] text-ink">
                  <Sentence m={m} vehicle={r.vehicle} />
                </li>
              ))}
            </ul>
            <CommentIds line={g} linkable={linkable} />
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">
        Source: German price list, July 2026. Availability and prices in other markets are an assumption until checked against their price lists.
      </p>
    </section>
  );
}
