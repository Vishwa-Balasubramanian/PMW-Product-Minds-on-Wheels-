"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { REGIONS, type RegionCode } from "@/lib/regions";

/** Amazon-style "deliver to" picker. In production the region comes from single sign-on. */
export function RegionPicker({ region, light = false }: { region: RegionCode; light?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<RegionCode>(region);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const current = REGIONS.find((r) => r.code === region)!;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function apply() {
    await fetch("/api/region", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ region: choice }) });
    setOpen(false);
    start(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setChoice(region); setOpen(true); }}
        className={`flex items-center gap-2 text-left ${light ? "text-white" : "text-ink"}`}
        aria-haspopup="dialog"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="leading-tight">
          <span className={`block text-[12px] ${light ? "text-white/80" : "text-ink-3"}`}>Your region</span>
          <span className="block text-[15px] font-semibold">{pending ? "Switching…" : current.label}</span>
        </span>
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dialog.current) setOpen(false); }}
        className="m-auto w-[min(440px,calc(100vw-32px))] p-0 text-ink backdrop:bg-black/50"
      >
        <div className="p-7">
          <h2 className="headline text-[22px]">Choose your region</h2>
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
          <div className="mt-5 flex gap-3">
            <button type="button" className="btn-primary flex-1" onClick={apply}>Apply</button>
            <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
