// Local voice mode, used when no OpenAI key is configured (idea from the Minerva prototype):
// browser speech recognition -> a deterministic command router -> PMW's existing voice tools -> spoken reply
// (ElevenLabs through /api/voice/speak, falling back to the browser voice). Tools still run server-side,
// are audited, and decisions or challenges still need the PM's click in the confirmation dialog.
import type { RealtimeCallbacks } from "./realtime";

export type LocalContext = { model: string | null; view: string | null; requirement: string | null };
export type Command =
  | { kind: "tool"; tool: string; params: Record<string, unknown> }
  | { kind: "needs_requirement"; say: string }
  | { kind: "stop" }
  | { kind: "help" };

export const HELP = "You can say: open the 7 Series, show conflicts, show quick wins, explain the score, read a customer quote, challenge this, approve this, or give me my briefing.";

const MODELS: [RegExp, string][] = [[/\b(7|seven)\s*series\b|\bg70\b/, "G70"], [/\b(5|five)\s*series\b|\bg60\b/, "G60"], [/\b(1|one)\s*series\b|\bf70\b/, "F70"]];
const VIEWS: [RegExp, string][] = [[/decision matrix|\bmatrix\b/, "matrix"], [/\bsignals?\b/, "signals"], [/data health/, "data"], [/\bdecisions?\b|decision board/, "decisions"], [/\brequirements?\b/, "inbox"]];

/** Map one spoken sentence to a PMW voice tool. Deterministic: no model, no network. */
export function routeCommand(raw: string, ctx: LocalContext): Command {
  const t = raw.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  const named = MODELS.find(([re]) => re.test(t))?.[1] ?? null;
  const model = named ?? (ctx.model && ctx.model !== "all" ? ctx.model : null);
  const req = ctx.requirement;
  const onReq = (tool: string, params: Record<string, unknown> = {}): Command =>
    req ? { kind: "tool", tool, params: { id: req, ...params } } : { kind: "needs_requirement", say: "Open a requirement first, then ask again." };

  if (/^(stop|cancel|goodbye|bye|that's all|that is all|thank you|thanks)\b/.test(t)) return { kind: "stop" };
  if (/\b(help|what can (i|you) (say|do))\b/.test(t)) return { kind: "help" };

  // Actions on the requirement that is open on screen.
  if (/\bchallenge\b/.test(t)) return onReq("run_challenge");
  if (/\bapprove\b/.test(t)) return onReq("request_decision", { decision: "approve" });
  if (/\breject\b/.test(t)) return onReq("request_decision", { decision: "reject" });
  if (/\bvalidat/.test(t) && !/needs validation/.test(t)) return onReq("request_decision", { decision: "validate" });
  if (/\b(explain|why)\b|\bscore\b/.test(t)) return onReq("explain_score");
  if (/\bquotes?\b|customers? (say|said)|read .*comment/.test(t)) return onReq("read_customer_quotes", { n: /\bquotes\b|comments/.test(t) ? 2 : 1 });

  // Overviews.
  if (/\bbriefing\b|what'?s new|catch me up/.test(t)) return { kind: "tool", tool: "daily_briefing", params: {} };
  if (/\b(critical|urgent|top issues|most important|what should i)\b/.test(t)) return { kind: "tool", tool: "critical_issues", params: model ? { model } : {} };
  if (/missing voices|under ?represented/.test(t)) return { kind: "tool", tool: "show_missing_voices", params: { model: model ?? "G70" } };
  if (/(summari[sz]e|what are) .*(feedback|customers)/.test(t)) return { kind: "tool", tool: "summarize_feedback", params: { model: model ?? "G70" } };

  // Lists on the current (or named) vehicle.
  const filter = /conflicts?/.test(t) ? "conflict" : /quick wins?/.test(t) ? "quick_win" : /weak evidence|low confidence/.test(t) ? "weak_evidence"
    : /\b(pending|awaiting|to review|undecided)\b/.test(t) ? "pending" : /\bapproved\b/.test(t) ? "approved" : /\brejected\b/.test(t) ? "rejected" : null;
  if (filter && /\b(show|list|find|which|any|what)\b/.test(t)) return { kind: "tool", tool: "find_requirements", params: { model: model ?? "G70", filter } };

  // Navigation.
  if (/radar|portfolio|cross.?model/.test(t)) return { kind: "tool", tool: "navigate", params: { page: "portfolio" } };
  if (/\baudit\b/.test(t)) return { kind: "tool", tool: "navigate", params: { page: "audit" } };
  if (/\bworkflow\b/.test(t)) return { kind: "tool", tool: "navigate", params: { page: "workflow" } };
  if (/requirements? board|\bboard\b|kanban/.test(t) && !named) return { kind: "tool", tool: "navigate", params: { page: "board" } };
  if (/\bhome\b|all (cars|vehicles)/.test(t)) return { kind: "tool", tool: "navigate", params: { page: "home" } };
  if (model && (named || /\b(open|show|go|switch|take)\b/.test(t))) {
    const view = VIEWS.find(([re]) => re.test(t))?.[1] ?? "inbox";
    return { kind: "tool", tool: "navigate", params: { page: "vehicle", model, view } };
  }
  return { kind: "help" };
}

/** Turn a tool result into one short spoken reply. */
export function spokenReply(tool: string, result: Record<string, unknown>): string {
  const summary = typeof result.summary === "string" ? result.summary : "Done.";
  const quotes = Array.isArray(result.quotes) ? result.quotes as { text: string; market?: string }[] : [];
  if (tool === "read_customer_quotes" && quotes.length) {
    return "Reading real customer comments. " + quotes.map((q) => `A customer${q.market ? ` from ${q.market}` : ""} said: ${q.text.slice(0, 300)}`).join(" ... ");
  }
  const waiting = result.confirmation || (Array.isArray(result.confirmations) && result.confirmations.length);
  if (waiting) return `${summary.replace(/ ?(Awaiting a click|Nothing has changed|No decision has been applied)[^.]*\./g, "")} I've opened a confirmation on screen. Click Confirm to apply it.`.trim();
  return summary;
}

const Recognition = () => (typeof window === "undefined" ? undefined
  : (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition);

type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
};

export const localVoiceSupported = () => Boolean(Recognition());

/** Same surface as RealtimeSession, so VoiceAgent can use either. */
export class LocalVoiceSession {
  private recognition: SpeechRecognitionLike | null = null;
  private audio: HTMLAudioElement | null = null;
  private ctx: LocalContext = { model: null, view: null, requirement: null };
  private stopped = false;
  private waitingForClick = false;

  constructor(private callbacks: RealtimeCallbacks, private tts: boolean) {}

  async start() {
    const R = Recognition();
    if (!R) throw new Error("Voice needs Chrome or Edge in this mode.");
    const rec = new R();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onspeechstart = () => this.callbacks.onHearing(true);
    rec.onresult = (e) => {
      this.callbacks.onHearing(false);
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      if (text) void this.handle(text);
    };
    rec.onerror = (e) => {
      this.callbacks.onHearing(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { this.callbacks.onError("Allow microphone access to use voice."); this.stop(); }
    };
    // Recognition ends after each phrase; without a result it simply listens again (hands-free).
    rec.onend = () => { if (!this.stopped && !this.busy) this.listen(); };
    this.recognition = rec;
    this.callbacks.onLive();
    await this.say("PMW voice is on. " + HELP);
    this.listen();
  }

  private busy = false;

  private listen() {
    if (this.stopped || this.waitingForClick || this.busy) return;
    try { this.recognition?.start(); } catch { /* already listening */ }
  }

  private async handle(text: string) {
    this.busy = true;
    this.callbacks.onTranscript({ id: String(Date.now()), role: "user", text, final: true });
    try {
      const cmd = routeCommand(text, this.ctx);
      if (cmd.kind === "stop") { await this.say("Okay, voice is off."); this.stop(); return; }
      if (cmd.kind === "help") { await this.say(`I didn't catch a command. ${HELP}`); return; }
      if (cmd.kind === "needs_requirement") { await this.say(cmd.say); return; }
      const raw = await this.callbacks.onToolCall(cmd.tool, cmd.params);
      const result = JSON.parse(raw) as Record<string, unknown>;
      if (result.confirmation || (Array.isArray(result.confirmations) && result.confirmations.length)) this.waitingForClick = true;
      await this.say(spokenReply(cmd.tool, result));
    } finally {
      this.busy = false;
      // Hands-free: listen again once PMW has finished speaking (Minerva's auto-mic), unless a click is pending.
      this.listen();
    }
  }

  /** Page context and confirmation results from VoiceAgent. */
  sendContext(text: string) {
    const json = text.slice(text.indexOf(":") + 1).trim();
    let data: unknown;
    try { data = JSON.parse(json); } catch { return; }
    if (text.startsWith("PMW page context") && data && typeof data === "object") {
      const d = data as { model?: string; view?: string; open_requirement?: { id?: string } | null };
      this.ctx = { model: d.model ?? null, view: d.view ?? null, requirement: d.open_requirement?.id ?? null };
    } else if (text.startsWith("PMW confirmation dialog results") && Array.isArray(data)) {
      this.waitingForClick = false;
      const said = (data as { summary?: string }[]).map((o) => o.summary).filter(Boolean).join(" ");
      void this.say(said || "Done.").then(() => this.listen());
    }
  }

  private async say(text: string) {
    if (this.stopped) return;
    this.callbacks.onSpeaking(true);
    try {
      if (this.tts && await this.playEleven(text)) return;
      await this.browserVoice(text);
    } finally {
      this.callbacks.onSpeaking(false);
    }
  }

  private async playEleven(text: string): Promise<boolean> {
    try {
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 1200) }) });
      if (!res.ok) return false;
      const url = URL.createObjectURL(await res.blob());
      this.audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        this.audio!.onended = () => resolve();
        this.audio!.onerror = () => reject(new Error("audio"));
        this.audio!.play().catch(reject);
      });
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  private browserVoice(text: string) {
    return new Promise<void>((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    try { this.recognition?.abort(); } catch { /* not listening */ }
    this.audio?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.callbacks.onEnd();
  }
}
