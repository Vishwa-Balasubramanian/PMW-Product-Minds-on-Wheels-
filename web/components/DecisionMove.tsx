"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { COLUMNS, moveFor, type Move } from "@/lib/board";
import type { Status } from "@/lib/types";

/** "Move to…" for one card. Maps a column move onto the existing decision actions; the API validates and audits it. */
export function DecisionMove({ id, title, status, editHref }: { id: string; title: string; status: Status; editHref: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [move, setMove] = useState<Extract<Move, { kind: "action" }> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const targets = COLUMNS.filter((c) => c.status !== status);

  function pick(to: Status) {
    const m = moveFor(status, to);
    if (!m) return;
    if (m.kind === "blocked") { setNotice(m.message); return; }
    if (m.kind === "edit") { router.push(editHref); return; }
    setNotice(null); setError(null); setWhy(""); setMove(m);
    dialog.current?.showModal();
  }

  function submit() {
    if (!move) return;
    if (move.required && !why.trim()) { setError("Add a short reason. It goes into the audit trail."); return; }
    start(async () => {
      const res = await fetch(`/api/requirements/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: move.action, rationale: why.trim() || undefined }) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) { setError(body?.error ?? "The decision could not be saved. Try again."); return; }
      dialog.current?.close();
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <label className="sr-only" htmlFor={`move-${id}`}>Move {title} to</label>
      <select id={`move-${id}`} value="" onChange={(e) => pick(e.target.value as Status)} disabled={pending}
        className="h-8 w-full border border-line bg-white px-2 text-[12px] text-ink-2 hover:border-ink">
        <option value="" disabled>Move to…</option>
        {targets.map((c) => <option key={c.status} value={c.status}>{c.title}</option>)}
      </select>
      {notice && <p role="status" className="mt-2 text-[12px] text-ink-2">{notice} {status === "approved" || status === "rejected" ? null : <Link href={editHref} className="text-blue hover:underline">Open card</Link>}</p>}
      <dialog ref={dialog} aria-labelledby={`move-title-${id}`} className="m-auto w-[min(480px,calc(100vw-32px))] border border-line p-6 text-ink backdrop:bg-ink/50">
        <h2 id={`move-title-${id}`} className="text-[20px] font-light">{move?.title}</h2>
        <p className="mt-1 text-[14px] text-ink-2">{title}</p>
        <label className="mt-4 flex flex-col gap-1 text-[13px] font-medium">
          {move?.prompt}
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} maxLength={1000} className="border border-line p-2 text-[14px] font-normal focus:border-ink" />
        </label>
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-outline btn-sm" onClick={() => dialog.current?.close()} disabled={pending}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={pending}>{pending ? "Saving…" : move?.submit}</button>
        </div>
      </dialog>
    </div>
  );
}
