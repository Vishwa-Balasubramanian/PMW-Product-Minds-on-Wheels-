"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { REGIONS, type RegionCode } from "@/lib/regions";

/** Region context for the workspace. In production it comes from single sign-on. */
export function RegionPicker({ region, light = false }: { region: RegionCode; light?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<RegionCode>(region);
  const [refreshing, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const pending = saving || refreshing;
  const dialog = useRef<HTMLDialogElement>(null);
  const current = REGIONS.find((r) => r.code === region)!;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function apply() {
    if (submitting.current || refreshing) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/region", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ region: choice }) });
      if (!response.ok || !(await response.json()).ok) throw new Error("Region update failed");
      setOpen(false);
      start(() => router.refresh());
    } catch {
      setError("Could not change region. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setChoice(region); setError(null); setOpen(true); }}
        disabled={pending}
        className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-left hover:bg-mist ${light ? "text-white" : "text-ink"}`}
        aria-haspopup="dialog"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="leading-tight">
          <span className={`block text-[10px] ${light ? "text-white/80" : "text-ink-3"}`}>Your region</span>
          <span className="block text-[12px] font-medium">{pending ? "Switching…" : current.label}</span>
        </span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="region-heading"
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dialog.current) setOpen(false); }}
        className="m-auto w-[min(440px,calc(100vw-32px))] p-0 text-ink backdrop:bg-black/50"
      >
        <div className="p-7">
          <h2 id="region-heading" className="headline text-[22px]">Choose your region</h2>
          <p className="mt-2 text-[14px] text-ink-2">
            You see customer comments from your own market only. Summary scores stay visible for every market.
          </p>
          <fieldset className="mt-5 flex flex-col gap-2">
            <legend className="sr-only">Region</legend>
            {REGIONS.map((r) => (
              <label key={r.code} className={`flex cursor-pointer items-center gap-3 border px-4 py-3 ${choice === r.code ? "border-blue bg-monitor-soft" : "border-line"}`}>
                <input type="radio" name="region" value={r.code} checked={choice === r.code} onChange={() => setChoice(r.code)} className="accent-blue" />
                <span className="flex-1">
                  <span className="block font-medium">{r.label}</span>
                  <span className="block text-[13px] text-ink-3">{r.role}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-4 text-[12px] text-ink-3">Prototype: in production your region comes from BMW single sign-on.</p>
          {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" className="btn-primary flex-1" disabled={pending} onClick={apply}>Apply</button>
            <button type="button" className="btn-outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
