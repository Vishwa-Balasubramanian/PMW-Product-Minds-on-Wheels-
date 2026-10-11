// Minimal OpenAI Realtime (WebRTC) client for the PMW voice agent.
// Audio streams peer-to-peer; events and tool calls use the data channel.
// The prompt, tools and turn detection are fixed server-side when the
// short-lived client secret is minted (see /api/voice/session).

export type RealtimeCallbacks = {
  onLive: () => void;
  onEnd: () => void;
  onError: (message: string) => void;
  /** The agent's audio is playing. */
  onSpeaking: (speaking: boolean) => void;
  /** Voice activity detected on the PM's microphone. */
  onHearing: (hearing: boolean) => void;
  /** Streaming transcript; the same id is updated in place. */
  onTranscript: (entry: { id: string; role: "user" | "agent"; text: string; final: boolean }) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<string>;
};

type FunctionCall = { type: string; name: string; call_id: string; arguments?: string };
type ServerEvent = {
  type: string; item_id?: string; delta?: string; transcript?: string;
  response?: { output?: FunctionCall[] }; error?: { message?: string };
};

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private closed = false;
  private partials = new Map<string, string>();
  private replies = new Map<string, string>();
  // Committed user audio not yet transcribed. Tools wait for it so the
  // actual spoken request is known (and audited) before any action runs.
  private transcribing = new Set<string>();

  constructor(private callbacks: RealtimeCallbacks) {}

  async start(clientSecret: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.closed) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;

      const pc = new RTCPeerConnection();
      this.pc = pc;
      const audio = new Audio();
      audio.autoplay = true;
      this.audio = audio;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      pc.addTrack(stream.getAudioTracks()[0], stream);
      pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") this.fail("Voice connection lost."); };

      const channel = pc.createDataChannel("oai-events");
      this.channel = channel;
      channel.onopen = () => { if (!this.closed) this.callbacks.onLive(); };
      channel.onclose = () => this.stop();
      channel.onmessage = (event) => { if (!this.closed) this.receive(JSON.parse(event.data) as ServerEvent); };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST", body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (this.closed) return;
      if (!response.ok) throw new Error("rejected");
      await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (e) {
      this.fail(e instanceof Error && e.name === "NotAllowedError" ? "Microphone permission was denied." : "Could not connect to the voice service.");
    }
  }

  /** Background knowledge for the agent (page state, confirmation results). Never triggers a reply. */
  sendContext(text: string) {
    this.send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
  }

  stop() {
    if (this.closed) return;
    this.closed = true;
    this.channel?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.audio) this.audio.srcObject = null;
    this.callbacks.onEnd();
  }

  private send(event: Record<string, unknown>) {
    if (!this.closed && this.channel?.readyState === "open") this.channel.send(JSON.stringify(event));
  }

  private fail(message: string) {
    if (this.closed) return;
    this.callbacks.onError(message);
    this.stop();
  }

  private receive(event: ServerEvent) {
    const id = event.item_id ?? "";
    switch (event.type) {
      case "input_audio_buffer.speech_started": this.callbacks.onHearing(true); break;
      case "input_audio_buffer.speech_stopped": this.callbacks.onHearing(false); break;
      case "input_audio_buffer.committed": this.transcribing.add(id); break;
      case "conversation.item.input_audio_transcription.delta": {
        const text = (this.partials.get(id) ?? "") + (event.delta ?? "");
        this.partials.set(id, text);
        this.callbacks.onTranscript({ id, role: "user", text, final: false });
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        this.partials.delete(id);
        this.transcribing.delete(id);
        this.callbacks.onTranscript({ id, role: "user", text: event.transcript?.trim() ?? "", final: true });
        break;
      case "conversation.item.input_audio_transcription.failed":
        this.partials.delete(id);
        this.transcribing.delete(id);
        break;
      case "response.output_audio_transcript.delta": {
        const text = (this.replies.get(id) ?? "") + (event.delta ?? "");
        this.replies.set(id, text);
        this.callbacks.onTranscript({ id, role: "agent", text, final: false });
        break;
      }
      case "response.output_audio_transcript.done":
        this.replies.delete(id);
        this.callbacks.onTranscript({ id, role: "agent", text: event.transcript ?? "", final: true });
        break;
      case "output_audio_buffer.started": this.callbacks.onSpeaking(true); break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared": this.callbacks.onSpeaking(false); break;
      case "response.done": {
        const calls = (event.response?.output ?? []).filter((output) => output.type === "function_call");
        if (calls.length) void this.runTools(calls);
        break;
      }
      case "error": console.warn("PMW voice:", event.error?.message); break;
    }
  }

  private async runTools(calls: FunctionCall[]) {
    for (let waited = 0; this.transcribing.size && waited < 4_000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // The model may pair a data tool with a generic navigate in one response.
    // Run navigate first so the data tool's more specific page wins.
    const ordered = [...calls].sort((a, b) => Number(b.name === "navigate") - Number(a.name === "navigate"));
    for (const call of ordered) {
      let output: string;
      try {
        output = await this.callbacks.onToolCall(call.name, call.arguments ? JSON.parse(call.arguments) : {});
      } catch (e) {
        output = JSON.stringify({ ok: false, summary: e instanceof Error ? e.message : "The tool failed." });
      }
      this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output } });
    }
    this.send({ type: "response.create" });
  }
}
