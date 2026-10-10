"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Requirement } from "@/lib/types";

type Mode = null | "reject" | "validate" | "edit" | "approve" | "challenge";

const PROMPT: Record<Exclude<Mode, null>, { label: string; placeholder: string; required: boolean; submit: string }> = {
  approve: { label: "Note (optional)", placeholder: "Why this goes into the next generation", required: false, submit: "Confirm approval" },
  reject: { label: "Reason", placeholder: "Why this should not shape the next generation", required: true, submit: "Confirm rejection" },
  validate: { label: "What needs validating?", placeholder: "e.g. Check China customer clinic before deciding", required: true, submit: "Request validation" },
  edit: { label: "Reason for the edit", placeholder: "What you changed and why", required: true, submit: "Save edit" },
  challenge: { label: "What do you doubt? (optional)", placeholder: "e.g. Is this only a US problem?", required: false, submit: "Run the challenge" },
};

/** Approve, validate first, edit, reject, challenge. Posts to /api/requirements/[id] and refreshes the page. */
export function DecisionActions({ r }: { r: Requirement }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [why, setWhy] = useState("");
  const [fields, setFields] = useState({ title: r.title, requirement: r.requirement, customer_need: r.customer_need ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const pending = saving || refreshing;

  async function send(action: string) {
    if (submitting.current || refreshing) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/requirements/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, rationale: why, fields: action === "edit" ? fields : undefined }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save this decision. Please try again.");
        return;
      }
      setMode(null);
      setWhy("");
      start(() => router.refresh());
    } catch {
      setError("Could not save this decision. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  const decided = r.status === "approved" || r.status === "rejected";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {decided ? (
          <button className="btn-outline btn-sm" onClick={() => send("reopen")} disabled={pending}>Reopen</button>
        ) : (
          <>
            <button className="btn-primary btn-sm" onClick={() => setMode("approve")} disabled={pending}>Approve</button>
            <button className="btn-outline btn-sm" onClick={() => setMode("validate")} disabled={pending}>Validate first</button>
            <button className="btn-outline btn-sm" onClick={() => setMode("edit")} disabled={pending}>Edit</button>
            <button className="btn-outline btn-sm" onClick={() => setMode("reject")} disabled={pending}>Reject</button>
          </>
        )}
        <button
          className="btn btn-sm border border-blue text-blue hover:bg-blue hover:text-white"
          onClick={() => setMode("challenge")}
          disabled={pending || r.challenged}
          title={r.challenged ? "Already challenged" : "Ask the AI what could make this wrong"}
        >
          {r.challenged ? "Challenged" : "Challenge"}
        </button>
      </div>

      {mode && (
        <form
          className="flex flex-col gap-3 border border-line bg-mist p-4"
          onSubmit={(e) => { e.preventDefault(); send(mode); }}
        >
          {mode === "edit" && (
            <>
              <label className="flex flex-col gap-1 text-[13px] font-medium">Title
                <input id="edit-title" className="border border-line bg-white px-3 py-2 font-light" value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">Customer need
                <textarea id="edit-need" rows={2} className="border border-line bg-white px-3 py-2 font-light" value={fields.customer_need} onChange={(e) => setFields({ ...fields, customer_need: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">Requirement
                <textarea id="edit-req" rows={3} className="border border-line bg-white px-3 py-2 font-light" value={fields.requirement} onChange={(e) => setFields({ ...fields, requirement: e.target.value })} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            {PROMPT[mode].label}
            <input
              id="decision-why"
              autoFocus
              className="border border-line bg-white px-3 py-2 font-light"
              placeholder={PROMPT[mode].placeholder}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              required={PROMPT[mode].required}
            />
          </label>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={pending}>{PROMPT[mode].submit}</button>
            <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => { setMode(null); setError(null); }}>Cancel</button>
          </div>
          <p className="text-[12px] text-ink-3">Recorded in the audit trail with your region and the time.</p>
        </form>
      )}
      {!mode && error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
