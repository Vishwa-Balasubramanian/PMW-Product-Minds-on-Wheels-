import { VOICE_PROMPT, VOICE_TOOLS, VOICE_TOOL_SCHEMAS } from "@/lib/voice/config";
import { sameOrigin, voiceJson } from "@/lib/voice/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return voiceJson({ error: "This request must come from PMW." }, 403);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return voiceJson({ error: "Voice is not configured yet. Add OPENAI_API_KEY to the server environment." }, 503);
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
              noise_reduction: { type: "near_field" },
              turn_detection: { type: "server_vad", silence_duration_ms: 550, interrupt_response: true, create_response: true },
            },
            output: { voice: process.env.OPENAI_REALTIME_VOICE || "marin" },
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
