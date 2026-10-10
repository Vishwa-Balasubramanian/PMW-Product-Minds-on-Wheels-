"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { PRESETS, PRIORITY_FACTORS, normalise, presetLabel, weightedScore, type PriorityFactor, type PriorityWeights } from "@/lib/score";

/** Only what the preview needs: no customer text, no evidence, no scores beyond the factor values. */
export type WeightItem = { id: string; title: string; values: Record<PriorityFactor, number> };

type Sliders = Record<PriorityFactor, number>; // relative importance, 0..100

const toSliders = (w: PriorityWeights): Sliders =>
  Object.fromEntries(PRIORITY_FACTORS.map((k) => [k, Math.round(w[k] * 100)])) as Sliders;

/** Same rule as listRequirements in gate.ts: stable sort by priority over the stored order. */
function rankBy(items: WeightItem[], w: PriorityWeights) {
  return items.map((it) => ({ ...it, priority: weightedScore(it.values, w) })).sort((a, b) => b.priority - a.priority);
}

/** Strategy weights for the priority score: five sliders, presets, a live top-5 preview, Apply and Reset. */
export function WeightsPanel({ items, labels, defaults, active }: {
  items: WeightItem[]; // in the stored (default-weight) order, which breaks ties exactly like the server
  labels: Record<string, string>;
  defaults: PriorityWeights;
  active: { priority: PriorityWeights; preset: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sliders, setSliders] = useState<Sliders>(() => toSliders(active?.priority ?? defaults));
  const [preset, setPreset] = useState<string>(active ? active.preset : "default");
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, start] = useTransition();
  const submitting = useRef(false);
  const pending = saving || refreshing;

  const total = PRIORITY_FACTORS.reduce((s, k) => s + sliders[k], 0);
  const weights = useMemo(() => (total > 0 ? normalise(sliders) : null), [sliders, total]);
  const current = useMemo(() => new Map(rankBy(items, active?.priority ?? defaults).map((it, i) => [it.id, i])), [items, active, defaults]);
  const preview = useMemo(
    () => (weights ? rankBy(items, weights).slice(0, 5).map((it) => ({ ...it, rank: current.get(it.id) ?? 0 })) : []),
    [items, weights, current],
  );

  function choose(key: string) {
    const p = PRESETS.find((x) => x.key === key);
    setSliders(toSliders(p ? p.weights : defaults));
    setPreset(p ? p.key : "default");
  }

  async function send(action: "set" | "reset") {
    if (submitting.current || refreshing) return;
    if (action === "set" && preset === "default") {
      setError("These are the default weights. Use Reset to return to them.");
      return;
    }
    if (!why.trim()) {
      setError("Add a short reason. It goes into the audit trail.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/weights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "set"
          ? { action, weights: sliders, preset: PRESETS.some((p) => p.key === preset) ? preset : "custom", rationale: why }
          : { action, rationale: why }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save the weights. Please try again.");
        return;
      }
      setWhy("");
      if (action === "reset") choose("default");
      start(() => router.refresh());
    } catch {
      setError("Could not save the weights. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const presetButtons = [{ key: "default", label: "Default" }, ...PRESETS];

  return (
    <section className="card" aria-label="Priority weights">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-mist"
        aria-expanded={open}
        aria-controls="weights-body"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <span className="text-[13px] font-bold uppercase tracking-[0.05em] text-ink">Priority weights</span>
          <span className="text-[13px] text-ink-3">{active ? presetLabel(active.preset) : "Default weights"} · change what drives the ranking</span>
        </span>
        <span className="text-[18px] leading-none text-ink-2" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div id="weights-body" className="flex flex-col gap-6 border-t border-line px-5 py-5">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Strategy presets</span>
            <div className="flex flex-wrap gap-1.5">
              {presetButtons.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => choose(p.key)}
                  aria-pressed={preset === p.key}
                  title={"idea" in p ? p.idea : "The pipeline's default weights"}
                  className={`h-9 border px-3 text-[13px] font-bold uppercase tracking-[0.04em] ${preset === p.key ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-ink"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-ink-3">
              {PRESETS.find((p) => p.key === preset)?.idea
                ?? (preset === "default" ? "The reviewed weights the pipeline scored with. Use Reset to return to them." : "Custom weights.")}
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <fieldset className="flex min-w-0 flex-col gap-4">
              <legend className="eyebrow mb-3">Weights</legend>
              {PRIORITY_FACTORS.map((k) => (
                <label key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                  <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-ink">{labels[k] ?? k}</span>
                  <span className="text-[13px] tabular-nums text-ink-2">{weights ? Math.round(weights[k] * 100) : 0}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={sliders[k]}
                    onChange={(e) => { setSliders({ ...sliders, [k]: Number(e.target.value) }); setPreset("custom"); }}
                    className="col-span-2 w-full accent-blue"
                    aria-label={labels[k] ?? k}
                  />
                </label>
              ))}
              {!weights && <p role="alert" className="text-[13px] text-danger">At least one weight must be above zero.</p>}
            </fieldset>

            <div className="flex min-w-0 flex-col gap-3">
              <span className="eyebrow">Preview · top 5 under these weights</span>
              <ol className="flex flex-col divide-y divide-line border-y border-line" aria-live="polite">
                {preview.map((r, i) => {
                  const moved = r.rank - i;
                  return (
                    <li key={r.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 text-[14px]">
                      <span className="tabular-nums text-ink-3">{i + 1}</span>
                      <span className="min-w-0 [overflow-wrap:anywhere]">{r.title}</span>
                      <span className="flex items-baseline gap-2 whitespace-nowrap tabular-nums">
                        <span className={`text-[12px] ${moved > 0 ? "text-act" : moved < 0 ? "text-danger" : "text-ink-3"}`}>
                          {moved > 0 ? `▲ ${moved}` : moved < 0 ? `▼ ${-moved}` : "="}
                        </span>
                        <span className="font-semibold">{r.priority}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-[12px] text-ink-3">Arrows compare with the current list. Confidence does not change: it measures evidence, not strategy.</p>
            </div>
          </div>

          <form className="flex flex-col gap-3 border border-line bg-mist p-4" onSubmit={(e) => { e.preventDefault(); send("set"); }}>
            <label className="flex flex-col gap-1 text-[13px] font-medium">
              Reason
              <input
                id="weights-why"
                className="border border-line bg-white px-3 py-2 font-light"
                placeholder="e.g. Board asked to rank by customer pain for the G70 review"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                required
              />
            </label>
            {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary btn-sm" disabled={pending || !weights || preset === "default"}>Apply to the team</button>
              <button type="button" className="btn-outline btn-sm" disabled={pending || !active} onClick={() => send("reset")}>Reset to defaults</button>
            </div>
            <p className="text-[12px] text-ink-3">Weights apply to every region and vehicle. Each change is recorded in the audit trail with your region, the time and the reason.</p>
          </form>
        </div>
      )}
    </section>
  );
}
