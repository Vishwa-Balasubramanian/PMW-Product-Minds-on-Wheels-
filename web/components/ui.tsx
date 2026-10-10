import { QUADRANT, STATUS_LABEL, type AuditEvent, type Factors, type Quadrant, type Requirement, type Status } from "@/lib/types";

const Q_STYLE: Record<Quadrant, string> = {
  act: "bg-act-soft text-act",
  validate: "bg-validate-soft text-validate",
  monitor: "bg-monitor-soft text-monitor",
  park: "bg-park-soft text-park",
};

export function QuadrantBadge({ q }: { q: Quadrant }) {
  return <span className={`inline-flex h-6 items-center px-2 text-[12px] font-semibold uppercase tracking-[0.06em] ${Q_STYLE[q]}`}>{QUADRANT[q].label}</span>;
}

const S_STYLE: Record<Status, string> = {
  proposed: "border border-line text-ink-2",
  edited: "bg-validate-soft text-validate",
  approved: "bg-act text-white",
  rejected: "bg-danger-soft text-danger",
  validate: "bg-validate text-white",
};

export function StatusBadge({ s, onDark = false }: { s: Status; onDark?: boolean }) {
  const style = onDark && s === "proposed" ? "bg-white text-ink" : S_STYLE[s];
  return <span className={`inline-flex h-6 items-center px-2 text-[12px] font-medium ${style}`}>{STATUS_LABEL[s]}</span>;
}

/** MoSCoW group from the priority score. Should starts at the decision-matrix threshold (55). */
export const MOSCOW = [
  { key: "must", label: "Must have", min: 65, hint: "Must shape the next generation", text: "text-must", bg: "bg-must", dot: "bg-must" },
  { key: "should", label: "Should have", min: 55, hint: "Strong case, plan for it", text: "text-should", bg: "bg-should", dot: "bg-should" },
  { key: "could", label: "Could have", min: 45, hint: "Include if it fits", text: "text-could", bg: "bg-could", dot: "bg-could" },
  { key: "wont", label: "Won't have this time", min: 0, hint: "Revisit for a later update", text: "text-wont", bg: "bg-wont", dot: "bg-wont" },
] as const;

export function moscowFor(priority: number) {
  return MOSCOW.find((m) => priority >= m.min)!;
}

export function MoscowBadge({ p }: { p: number }) {
  const m = moscowFor(p);
  return <span className={`inline-flex h-6 items-center px-2 text-[12px] font-semibold text-white ${m.bg}`}>{m.label}</span>;
}

export function ScorePair({ r, size = "sm" }: { r: Pick<Requirement, "priority" | "confidence">; size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <div className={`flex ${big ? "gap-8" : "gap-4"} tabular-nums`}>
      <div>
        <div className={big ? "eyebrow" : "text-[11px] uppercase tracking-[0.1em] text-ink-3"}>Priority</div>
        <div className={big ? "text-[44px] font-light leading-none" : "text-[20px] font-medium leading-none"}>{r.priority}</div>
      </div>
      <div>
        <div className={big ? "eyebrow" : "text-[11px] uppercase tracking-[0.1em] text-ink-3"}>Confidence</div>
        <div className={big ? "text-[44px] font-light leading-none" : "text-[20px] font-medium leading-none"}>{r.confidence}</div>
      </div>
    </div>
  );
}

export function FactorBars({ factors, labels }: { factors: Factors; labels: Record<string, string> }) {
  return (
    <ul className="flex flex-col gap-3">
      {Object.entries(factors).map(([k, f]) => (
        <li key={k} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">
          <span className="font-medium text-ink">{labels[k] ?? k}</span>
          <span className="tabular-nums text-ink-3">{Math.round(f.value * 100)} · weight {Math.round(f.weight * 100)}%</span>
          <span className="col-span-2 h-1.5 bg-mist"><span className="block h-full bg-blue" style={{ width: `${Math.round(f.value * 100)}%` }} /></span>
          <span className="col-span-2 text-[12px] text-ink-3">{f.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** Priority (x) vs confidence (y). Threshold lines split the four decision quadrants. */
export function Matrix({ items, thresholds, vehicle, selected, size = 520 }: {
  items: Requirement[];
  thresholds: { priority: number; confidence: number };
  vehicle: string;
  selected?: string;
  size?: number;
}) {
  const pad = 44;
  const w = size, h = size * 0.78;
  const x = (p: number) => pad + (p / 100) * (w - pad - 12);
  const y = (c: number) => h - pad - (c / 100) * (h - pad - 12);
  const tx = x(thresholds.priority), ty = y(thresholds.confidence);
  const zone = (q: Quadrant, x1: number, y1: number, x2: number, y2: number, lx: number, ly: number, anchor: "start" | "end") => (
    <g key={q}>
      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} className={{ act: "fill-act-soft", validate: "fill-validate-soft", monitor: "fill-monitor-soft", park: "fill-park-soft" }[q]} />
      <text x={lx} y={ly} textAnchor={anchor} className="fill-ink-2 text-[11px] font-semibold uppercase tracking-[0.08em]">{QUADRANT[q].label}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-full" role="img" aria-label="Decision matrix: priority against confidence">
      {zone("monitor", x(0), y(100), tx, ty, x(0) + 8, y(100) + 16, "start")}
      {zone("act", tx, y(100), x(100), ty, x(100) - 8, y(100) + 16, "end")}
      {zone("park", x(0), ty, tx, y(0), x(0) + 8, y(0) - 8, "start")}
      {zone("validate", tx, ty, x(100), y(0), x(100) - 8, y(0) - 8, "end")}
      <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(0)} className="stroke-ink-3" />
      <line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(100)} className="stroke-ink-3" />
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <text x={x(t)} y={y(0) + 16} textAnchor="middle" className="fill-ink-3 text-[10px] tabular-nums">{t}</text>
          <text x={x(0) - 8} y={y(t) + 3} textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">{t}</text>
        </g>
      ))}
      <text x={(x(0) + x(100)) / 2} y={h - 6} textAnchor="middle" className="fill-ink-2 text-[11px]">Priority →</text>
      <text x={12} y={(y(0) + y(100)) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(y(0) + y(100)) / 2})`} className="fill-ink-2 text-[11px]">Confidence →</text>
      {items.map((r) => {
        const on = r.id === selected;
        return (
          <a key={r.id} href={`/vehicles/${vehicle}?req=${r.id}`}>
            <g className="cursor-pointer">
              <title>{`${r.id} · ${r.title} · P${r.priority} C${r.confidence}`}</title>
              <circle cx={x(r.priority)} cy={y(r.confidence)} r={on ? 9 : 6} className={on ? "fill-ink stroke-white" : "fill-blue stroke-white"} strokeWidth={2} />
              <text x={x(r.priority) + 10} y={y(r.confidence) + 4} className={`text-[10px] tabular-nums ${on ? "fill-ink font-semibold" : "fill-ink-2"}`}>{r.id.slice(-3)}</text>
            </g>
          </a>
        );
      })}
    </svg>
  );
}

const ACTOR_DOT: Record<string, string> = { ai: "bg-blue", pm: "bg-validate", system: "bg-ink-3" };

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="text-[14px] text-ink-3">No events yet.</p>;
  return (
    <ol className="relative flex flex-col">
      {events.map((e) => (
        <li key={e.id} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 gap-y-1 py-2 text-[13px] sm:grid-cols-[132px_14px_minmax(0,1fr)]">
          <time className="col-start-2 pt-0.5 font-mono text-[11.5px] text-ink-3 sm:col-start-1 sm:text-right" dateTime={e.ts}>
            {new Date(e.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </time>
          <span className={`col-start-1 row-start-1 mt-1.5 h-2.5 w-2.5 rounded-full sm:col-start-2 ${ACTOR_DOT[e.actor_type] ?? "bg-ink-3"}`} aria-hidden="true" />
          <div className="col-start-2 min-w-0 [overflow-wrap:anywhere] sm:col-start-3 sm:row-start-1">
            <span className="font-semibold text-ink">{e.actor}</span> <span className="text-ink-2">{e.action}</span>
            {(e.before !== null || e.after !== null) && (
              <div className="mt-0.5 text-ink-2">
                {e.before !== null && <span className="line-through decoration-ink-3/60">{e.before}</span>}
                {e.before !== null && e.after !== null && <span className="px-1.5 text-ink-3">→</span>}
                {e.after !== null && <span>{e.after}</span>}
              </div>
            )}
            {e.rationale && <div className="mt-0.5 italic text-ink-3">“{e.rationale}”</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="eyebrow">{title}</h3>
        {aside && <div className="text-[12px] text-ink-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
