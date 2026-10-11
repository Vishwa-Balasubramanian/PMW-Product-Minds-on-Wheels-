import { sameOrigin, voiceBody, voiceJson } from "@/lib/voice/http";

export const runtime = "nodejs";

const MAX_CHARS = 1200;

// Text to speech with ElevenLabs for the local voice mode. The API key stays on the server; the browser only
// receives audio. Only the sentence PMW is about to say is sent (it can include a customer quote being read out).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return voiceJson({ error: "This request must come from PMW." }, 403);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return voiceJson({ error: "Speech is not configured. Add ELEVENLABS_API_KEY to the server environment." }, 503);
  const body = await voiceBody(request);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_CHARS) return voiceJson({ error: `Text must be 1 to ${MAX_CHARS} characters.` }, 400);
  const voice = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok || !res.body) return voiceJson({ error: `Speech service error (${res.status}).` }, 502);
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store, private" } });
  } catch {
    return voiceJson({ error: "Speech service unreachable." }, 502);
  }
}
