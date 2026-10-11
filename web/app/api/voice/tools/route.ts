import { getViewer } from "@/lib/gate";
import { VOICE_TOOLS, noVoiceData, type VoiceTool } from "@/lib/voice/config";
import { sameOrigin, voiceBody, voiceJson } from "@/lib/voice/http";
import { executeVoiceTool, logVoice } from "@/lib/voice/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return voiceJson({ error: "This request must come from PMW." }, 403);
  const body = await voiceBody(request);
  if (!body || typeof body.tool !== "string" || !VOICE_TOOLS.includes(body.tool as VoiceTool)
    || typeof body.spokenRequest !== "string" || !body.spokenRequest.trim() || body.spokenRequest.length > 8_000
    || !body.params || typeof body.params !== "object" || Array.isArray(body.params)) {
    return voiceJson({ error: "A known tool, parameters and the actual spoken request are required." }, 400);
  }
  const viewer = await getViewer();
  const params = body.params as Record<string, unknown>;
  const entity = typeof params.id === "string" ? params.id.slice(0, 200) : typeof params.model === "string" ? params.model.slice(0, 200) : "voice";
  try {
    // Fail closed if the audit trail is unavailable, before any action occurs.
    await logVoice(viewer, body.tool, body.spokenRequest, "Requested", entity);
    const result = await executeVoiceTool(viewer, body.tool as VoiceTool, params, body.spokenRequest);
    // Quote text remains in the evidence store; record its IDs/sources, not duplicates.
    await logVoice(viewer, body.tool, body.spokenRequest, JSON.stringify({ ok: result.ok, summary: result.summary, confidence: result.confidence, sources: result.sources }), entity);
    return voiceJson(result);
  } catch (error) {
    const message = error instanceof Error && /^(Invalid |Unknown |Choose |Quote count |Add a |This requirement|Requirement not)/.test(error.message)
      ? error.message : "The action could not be completed. Check the audit trail before retrying.";
    try { await logVoice(viewer, body.tool, body.spokenRequest, `Failed: ${message}`, entity); } catch { /* no unlogged mutation is attempted */ }
    return voiceJson({ ...noVoiceData(), summary: message }, 400);
  }
}
