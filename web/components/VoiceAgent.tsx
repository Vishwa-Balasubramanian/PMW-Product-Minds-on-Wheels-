"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { noVoiceData, VOICE_TOOLS, type VoiceResult, type VoiceTool } from "@/lib/voice/config";
import { RealtimeSession } from "@/lib/voice/realtime";

type Pending = NonNullable<VoiceResult["confirmation"]>;
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

function DecisionConfirmation({ pending, onComplete }: { pending: Pending; onComplete: (result: VoiceResult) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function decide(confirm: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      onComplete(await post<VoiceResult>("/api/voice/confirm", { token: pending.token, confirm }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The decision could not be confirmed.");
      locked.current = false;
      setBusy(false);
    }
  }
  return <dialog ref={dialog} className="voice-confirm" aria-labelledby="voice-confirm-title" onCancel={(event) => { event.preventDefault(); void decide(false); }}>
    <h2 id="voice-confirm-title">{pending.decision === "approve" ? "Approve" : "Reject"} this requirement?</h2>
    <p className="mt-3"><b>{pending.id}</b> · {pending.title}</p>
    <p className="mt-3 text-ink-2">Requested by voice. Nothing changes until you confirm here.</p>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    <div className="mt-5 flex justify-end gap-3">
      <button autoFocus className="btn-outline" disabled={busy} onClick={() => error ? onComplete({ ...noVoiceData(), summary: error }) : void decide(false)}>{error ? "Close" : "Cancel"}</button>
      <button className="btn-primary" disabled={busy || !!error} onClick={() => void decide(true)}>{busy ? "Saving…" : `Confirm ${pending.decision === "approve" ? "approval" : "rejection"}`}</button>
    </div>
  </dialog>;
}

export function VoiceAgent({ region }: { region: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const session = useRef<RealtimeSession | null>(null);
  const spoken = useRef("");
  const pendingRef = useRef<Pending | null>(null);
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

  const stop = useCallback(() => { session.current?.stop(); }, []);

  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, IDLE_MS);
  }, [stop]);

  const runTool = useCallback(async (name: string, params: Record<string, unknown>): Promise<string> => {
    touch();
    if (!VOICE_TOOLS.includes(name as VoiceTool)) return JSON.stringify({ ...noVoiceData(), summary: `Unknown tool ${name}.` });
    if (pendingRef.current) return JSON.stringify({ ...noVoiceData(), summary: "A decision is awaiting a click on screen. Voice cannot confirm it." });
    if (!spoken.current) return JSON.stringify({ ...noVoiceData(), summary: "No user transcript received. Ask the PM to repeat the request." });
    try {
      const result = await post<VoiceResult>("/api/voice/tools", { tool: name, params, spokenRequest: spoken.current });
      if (result.href) router.push(result.href);
      if (MUTATING.includes(name as VoiceTool)) router.refresh();
      if (result.confirmation) {
        pendingRef.current = result.confirmation;
        setPending(result.confirmation);
      }
      // The one-use confirmation token never reaches the model.
      return JSON.stringify({ ...result, confirmation: result.confirmation ? { status: "awaiting_confirmation" } : undefined });
    } catch (e) {
      return JSON.stringify({ ...noVoiceData(), summary: e instanceof Error ? e.message : "The voice action failed." });
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
      },
      onError: showError,
      onSpeaking: (value) => { setSpeaking(value); touch(); },
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

  function confirmed(result: VoiceResult) {
    pendingRef.current = null;
    setPending(null);
    if (result.href) router.push(result.href);
    router.refresh();
    session.current?.sendContext(`PMW confirmation dialog result: ${JSON.stringify({ ok: result.ok, summary: result.summary })}`);
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
      <button className="voice-mic" aria-label={label} title={label} aria-pressed={phase !== "idle"} onClick={() => phase === "idle" ? void start() : stop()}>
        <span className="voice-glow" aria-hidden="true" />
        {phase === "idle"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
          : <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /></span>}
      </button>
    </div>
    {pending && <DecisionConfirmation key={pending.token} pending={pending} onComplete={confirmed} />}
  </>;
}
