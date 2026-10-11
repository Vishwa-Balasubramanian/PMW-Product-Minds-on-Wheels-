"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { agentFocus } from "@/lib/agentFocus";
import { noVoiceData, VOICE_TOOLS, type VoiceConfirmation, type VoiceDecision, type VoiceResult, type VoiceTool } from "@/lib/voice/config";
import { RealtimeSession } from "@/lib/voice/realtime";

type Pending = VoiceConfirmation;
type Phase = "idle" | "connecting" | "live";

const ERROR_MS = 5_000;
const IDLE_MS = 90_000;
// Tools that change data: refresh server components after they run.
const MUTATING: VoiceTool[] = ["run_challenge"];

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? data.summary ?? "PMW could not complete this action.");
  return data as T;
}

const DECISION_TEXT: Record<VoiceDecision, { title: string; confirm: string }> = {
  approve: { title: "Approve", confirm: "Confirm approval" },
  reject: { title: "Reject", confirm: "Confirm rejection" },
  validate: { title: "Request validation for", confirm: "Confirm validation request" },
};

/** One proposal at a time. Nothing changes until the PM clicks Confirm; Skip and Cancel all are audited too. */
function ProposalQueue({ items, onDone }: { items: Pending[]; onDone: (outcomes: VoiceResult[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const outcomes = useRef<VoiceResult[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const item = items[index];
  useEffect(() => { dialog.current?.showModal(); }, []);

  function next(result: VoiceResult) {
    outcomes.current.push(result);
    setError("");
    if (index + 1 >= items.length) return onDone(outcomes.current);
    setIndex(index + 1);
  }

  async function decide(confirm: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await post<VoiceResult>("/api/voice/confirm", { token: item.token, confirm });
      if (confirm) {
        agentFocus.set(item.id, "done");
        router.refresh(); // The card moves column once the server data changes.
      } else agentFocus.remove(item.id);
      next(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision could not be confirmed.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function cancelAll() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    for (const rest of items.slice(index)) {
      agentFocus.remove(rest.id);
      outcomes.current.push(await post<VoiceResult>("/api/voice/confirm", { token: rest.token, confirm: false })
        .catch((e) => ({ ...noVoiceData(), summary: e instanceof Error ? e.message : "Could not cancel." })));
    }
    onDone(outcomes.current);
  }

  const text = DECISION_TEXT[item.decision];
  return <dialog ref={dialog} className="voice-confirm" aria-labelledby="voice-confirm-title" onCancel={(event) => { event.preventDefault(); if (!busy) void decide(false); }}>
    {items.length > 1 && <p className="eyebrow">Proposal {index + 1} of {items.length} · from the PMW agent</p>}
    <h2 id="voice-confirm-title" className={items.length > 1 ? "mt-2" : ""}>{text.title} this requirement?</h2>
    <p className="mt-3"><b>{item.id}</b> · {item.title}</p>
    {item.rationale && <p className="voice-rationale"><b>AI rationale.</b> {item.rationale}</p>}
    <p className="mt-3 text-ink-2">Requested by voice. Nothing changes until you confirm here.</p>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-3">
      {items.length > 1 && <button className="btn-outline mr-auto" disabled={busy} onClick={() => void cancelAll()}>Cancel all</button>}
      <button autoFocus className="btn-outline" disabled={busy} onClick={() => error ? next({ ...noVoiceData(), summary: error }) : void decide(false)}>{error ? "Close" : items.length > 1 ? "Skip" : "Cancel"}</button>
      <button className="btn-primary" disabled={busy || !!error} onClick={() => void decide(true)}>{busy ? "Saving…" : text.confirm}</button>
    </div>
  </dialog>;
}

/** Short progress text for the pill next to the mic, derived from the tool being run. */
function progressFor(name: string, params: Record<string, unknown>, investigated: number): string {
  switch (name) {
    case "critical_issues": case "find_requirements": case "daily_briefing": return "Finding priorities…";
    case "investigate_requirement": return `Investigating #${investigated} · ${String(params.id ?? "")}`;
    case "propose_decisions": return `Preparing ${Array.isArray(params.items) ? params.items.length : ""} proposals…`;
    case "run_challenge": return "Challenging the evidence…";
    default: return "Working…";
  }
}

export function VoiceAgent({ region }: { region: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<Pending[]>([]);
  const [progress, setProgress] = useState("");
  const session = useRef<RealtimeSession | null>(null);
  const spoken = useRef("");
  // True while proposals wait for clicks: voice can never confirm or add decisions meanwhile.
  const pendingRef = useRef(false);
  // Bumped on stop so results that arrive after a cancel are discarded.
  const generation = useRef(0);
  const inFlight = useRef(0);
  const investigated = useRef(0);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = search.toString();
  const pageContext = useCallback(() => {
    const params = new URLSearchParams(query);
    const model = pathname.split("/vehicles/")[1]?.split("/")[0] ?? null;
    const view = params.get("view") ?? (pathname === "/" || (model && !params.get("req")) ? "board" : "inbox");
    const open = document.querySelector("[data-requirement-id]");
    return JSON.stringify({
      page: pathname, view, region, model: model ?? params.get("vehicle") ?? "all",
      board_filters: view === "board" ? Object.fromEntries(["priority", "conf", "rec", "search", "sort", "layout"].flatMap((k) => params.get(k) ? [[k, params.get(k)]] : [])) : undefined,
      // The requirement whose detail is on screen (board drawer or list selection).
      open_requirement: open ? {
        id: open.getAttribute("data-requirement-id"),
        status: open.getAttribute("data-status"),
      } : null,
      heading: document.querySelector("h1")?.textContent?.trim().slice(0, 120) ?? null,
    });
  }, [pathname, query, region]);

  // No transcript is shown; only a brief message when voice cannot start.
  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(""), ERROR_MS);
  }, []);

  const stop = useCallback(() => { generation.current++; session.current?.stop(); }, []);

  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, IDLE_MS);
  }, [stop]);

  const runTool = useCallback(async (name: string, params: Record<string, unknown>): Promise<string> => {
    touch();
    if (!VOICE_TOOLS.includes(name as VoiceTool)) return JSON.stringify({ ...noVoiceData(), summary: `Unknown tool ${name}.` });
    if (pendingRef.current) return JSON.stringify({ ...noVoiceData(), summary: "A decision is awaiting a click on screen. Voice cannot confirm it." });
    if (!spoken.current) return JSON.stringify({ ...noVoiceData(), summary: "No user transcript received. Ask the PM to repeat the request." });
    const run = generation.current;
    if (name === "critical_issues" || name === "find_requirements") investigated.current = 0;
    if (name === "investigate_requirement") {
      investigated.current++;
      if (typeof params.id === "string") agentFocus.set(params.id, "investigating");
    }
    setProgress(progressFor(name, params, investigated.current));
    inFlight.current++;
    try {
      const result = await post<VoiceResult>("/api/voice/tools", { tool: name, params, spokenRequest: spoken.current });
      if (run !== generation.current) return JSON.stringify({ ...noVoiceData(), summary: "Cancelled by the PM. No action applied." });
      if (name === "investigate_requirement" && result.href) {
        // Keep the board in view: open the requirement's vehicle board only if its card is not on screen.
        const id = String(params.id);
        if (!document.querySelector(`[data-card-id=${JSON.stringify(id)}]`)) router.push(result.href.split("?")[0]);
        agentFocus.set(id, "investigated");
      } else if (result.href) router.push(result.href);
      if (MUTATING.includes(name as VoiceTool)) router.refresh();
      const proposals = result.confirmations ?? (result.confirmation ? [result.confirmation] : []);
      if (proposals.length) {
        for (const p of proposals) agentFocus.set(p.id, "proposed");
        pendingRef.current = true;
        setQueue(proposals);
      }
      // One-use confirmation tokens never reach the model.
      return JSON.stringify({
        ...result,
        confirmation: result.confirmation ? { status: "awaiting_confirmation" } : undefined,
        confirmations: result.confirmations?.map(({ id, decision }) => ({ id, decision, status: "awaiting_confirmation" })),
      });
    } catch (e) {
      if (name === "investigate_requirement" && typeof params.id === "string") agentFocus.remove(params.id);
      return JSON.stringify({ ...noVoiceData(), summary: e instanceof Error ? e.message : "The voice action failed." });
    } finally {
      inFlight.current--;
    }
  }, [router, touch]);

  async function start() {
    setPhase("connecting");
    setError("");
    spoken.current = "";
    const current = new RealtimeSession({
      onLive: () => {
        setPhase("live");
        current.sendContext(`PMW page context (not evidence): ${pageContext()}`);
        touch();
      },
      onEnd: () => {
        if (session.current === current) session.current = null;
        if (idleTimer.current) clearTimeout(idleTimer.current);
        setPhase("idle");
        setSpeaking(false);
        setHearing(false);
        setProgress("");
        // Proposals stay highlighted until the PM resolves the queue; investigation marks go.
        for (const [id, state] of Object.entries(agentFocus.get())) if (state !== "proposed") agentFocus.remove(id);
      },
      onError: showError,
      onSpeaking: (value) => {
        setSpeaking(value);
        touch();
        // The pill fades once the agent has finished speaking and no tool is running.
        if (!value && !inFlight.current) setTimeout(() => { if (!inFlight.current) setProgress(""); }, 2_500);
      },
      onHearing: (value) => { setHearing(value); touch(); },
      // Transcripts are not displayed; the final user text is kept for the audit trail.
      onTranscript: ({ role, text, final }) => { if (role === "user" && final && text) spoken.current = text; },
      onToolCall: runTool,
    });
    session.current = current;
    try {
      const { clientSecret } = await post<{ clientSecret: string }>("/api/voice/session", {});
      if (session.current !== current) return;
      await current.start(clientSecret);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not start voice.");
      current.stop();
    }
  }

  function resolved(outcomes: VoiceResult[]) {
    pendingRef.current = false;
    setQueue([]);
    router.refresh();
    session.current?.sendContext(`PMW confirmation dialog results (clicked by the PM): ${JSON.stringify(outcomes.map((o) => ({ ok: o.ok, summary: o.summary })))}`);
  }

  // Keep the agent aware of where the PM is.
  useEffect(() => {
    if (phase === "live") session.current?.sendContext(`PMW page context (not evidence): ${pageContext()}`);
  }, [pageContext, phase]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && !pendingRef.current) stop(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      for (const timer of [errorTimer, idleTimer]) if (timer.current) clearTimeout(timer.current);
      session.current?.stop();
    };
  }, [stop]);

  const state = phase === "idle" ? "idle" : phase === "connecting" ? "connecting" : speaking ? "speaking" : hearing ? "hearing" : "listening";
  const label = { idle: "Start PMW voice", connecting: "Connecting PMW voice… click to cancel", listening: "PMW is listening · click to stop", hearing: "PMW is listening · click to stop", speaking: "PMW is speaking · click to stop" }[state];

  return <>
    <div className="voice-agent" data-state={state}>
      {error && <p className="voice-error" role="alert">{error}</p>}
      {!error && progress && phase === "live" && !queue.length && <p className="voice-progress" role="status">{progress}</p>}
      <button className="voice-mic" aria-label={label} title={label} aria-pressed={phase !== "idle"} onClick={() => phase === "idle" ? void start() : stop()}>
        <span className="voice-glow" aria-hidden="true" />
        {phase === "idle"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
          : <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /></span>}
      </button>
    </div>
    {queue.length > 0 && <ProposalQueue key={queue[0].token} items={queue} onDone={resolved} />}
  </>;
}
