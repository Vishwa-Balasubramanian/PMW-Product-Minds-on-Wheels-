// ElevenLabs Conversational AI session (agent created by scripts/eleven-agent.ts with PMW's prompt and tools).
// Streams speech recognition, the LLM and the voice over WebRTC with natural turn-taking and interruptions.
// Every tool call still runs through VoiceAgent.runTool -> /api/voice/tools (region-filtered and audited),
// and decisions or challenges still need the PM's click in the confirmation dialog.
import { VoiceConversation } from "@elevenlabs/client";
import { VOICE_TOOLS } from "./config";
import type { RealtimeCallbacks } from "./realtime";

export class ElevenSession {
  private conversation: VoiceConversation | null = null;
  private ended = false;

  constructor(private callbacks: RealtimeCallbacks) {}

  async start(conversationToken: string) {
    const clientTools = Object.fromEntries(VOICE_TOOLS.map((name) => [
      name, (params: Record<string, unknown>) => this.callbacks.onToolCall(name, params ?? {}),
    ]));
    this.conversation = await VoiceConversation.startSession({
      conversationToken,
      connectionType: "webrtc",
      clientTools,
      onConnect: () => this.callbacks.onLive(),
      onDisconnect: (details) => {
        if (details.reason === "error") this.callbacks.onError(details.message || "Voice disconnected.");
        this.finish();
      },
      onError: (message) => this.callbacks.onError(typeof message === "string" ? message : "Voice error."),
      onModeChange: ({ mode }) => {
        this.callbacks.onSpeaking(mode === "speaking");
        this.callbacks.onHearing(false);
      },
      // Final user transcripts are kept (not shown) as the audited spoken request.
      onMessage: ({ message, role }) => this.callbacks.onTranscript({ id: String(Date.now()), role: role === "user" ? "user" : "agent", text: message, final: true }),
    });
  }

  /** Page context and confirmation results, as background the agent should know (not a user turn). */
  sendContext(text: string) {
    this.conversation?.sendContextualUpdate(text);
  }

  stop() {
    const c = this.conversation;
    this.conversation = null;
    if (c) void c.endSession().catch(() => {});
    this.finish();
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.callbacks.onEnd();
  }
}
