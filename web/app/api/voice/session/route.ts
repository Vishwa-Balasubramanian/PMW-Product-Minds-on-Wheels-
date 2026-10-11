import { VOICE_PROMPT, VOICE_TOOLS, VOICE_TOOL_SCHEMAS } from "@/lib/voice/config";
import { sameOrigin, voiceJson } from "@/lib/voice/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return voiceJson({ error: "This request must come from PMW." }, 403);
  const apiKey = process.env.OPENAI_API_KEY;
  // Without OpenAI: the ElevenLabs conversational agent, when configured. The browser gets a short-lived
  // conversation token (about 10 minutes); the API key never leaves the server.
  const eleven = process.env.ELEVENLABS_API_KEY, agent = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey && eleven && agent) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agent)}`, { headers: { "xi-api-key": eleven } });
      const data = await res.json().catch(() => ({})) as { token?: string };
      if (res.ok && data.token) return voiceJson({ provider: "elevenlabs", conversationToken: data.token });
    } catch { /* fall through to the local mode */ }
  }
  // Without either, the browser falls back to the local mode (speech recognition + PMW's command router);
  // tts says whether ElevenLabs speech is available for its replies.
  if (!apiKey) return voiceJson({ error: "Voice is not configured yet. Add OPENAI_API_KEY to the server environment.", local: true, tts: Boolean(process.env.ELEVENLABS_API_KEY) }, 503);
  try {
    // Mint a short-lived client secret; the browser never sees the API key.
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        // The agent's prompt and tools are fixed server-side.
        session: {
          type: "realtime",
          model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
          instructions: VOICE_PROMPT,
          tool_choice: "auto",
          tools: VOICE_TOOLS.map((name) => {
            const { description, properties, required } = VOICE_TOOL_SCHEMAS[name];
            return { type: "function", name, description, parameters: { type: "object", properties, required } };
          }),
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe" },
              // Laptop microphone in a noisy room: far-field noise reduction (use near_field with a headset).
              noise_reduction: { type: process.env.OPENAI_NOISE_REDUCTION === "near_field" ? "near_field" : "far_field" },
              // Background talk must not cut PMW off: a higher threshold needs clear, close speech, and speech while PMW
              // is talking does not interrupt it (click the mic to stop). OPENAI_VOICE_INTERRUPT=1 re-enables barge-in.
              turn_detection: {
                type: "server_vad",
                threshold: Math.min(0.95, Math.max(0.3, Number(process.env.OPENAI_VAD_THRESHOLD) || 0.75)),
                prefix_padding_ms: 300,
                silence_duration_ms: 600,
                interrupt_response: process.env.OPENAI_VOICE_INTERRUPT === "1",
                create_response: true,
              },
            },
            // Slightly brisker delivery for live demos.
            output: { voice: process.env.OPENAI_REALTIME_VOICE || "marin", speed: 1.1 },
          },
        },
      }),
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return voiceJson({ error: "Could not connect to OpenAI. Check the server API key and Realtime access." }, 502);
    const body = await response.json();
    if (typeof body.value !== "string" || !body.value.startsWith("ek_")) {
      return voiceJson({ error: "OpenAI returned an invalid session credential." }, 502);
    }
    return voiceJson({ clientSecret: body.value });
  } catch {
    // Never relay provider errors: they can contain credentials.
    return voiceJson({ error: "The voice service is unavailable. Please try again." }, 502);
  }
}
