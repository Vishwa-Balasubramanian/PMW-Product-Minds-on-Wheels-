import { getViewer } from "@/lib/gate";
import { noVoiceData } from "@/lib/voice/config";
import { sameOrigin, voiceBody, voiceJson } from "@/lib/voice/http";
import { confirmVoiceDecision } from "@/lib/voice/server";

export const runtime = "nodejs";

// Intentionally absent from the agent's tool registry. Only the dialog calls it.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return voiceJson({ error: "This request must come from PMW." }, 403);
  const body = await voiceBody(request);
  if (!body || typeof body.token !== "string" || !/^[a-f0-9-]{36}$/.test(body.token) || typeof body.confirm !== "boolean") {
    return voiceJson({ error: "A valid confirmation token and a click decision are required." }, 400);
  }
  try { return voiceJson(await confirmVoiceDecision(await getViewer(), body.token, body.confirm)); }
  catch (error) {
    const message = error instanceof Error && error.message.startsWith("This confirmation") ? error.message : "Could not confirm this decision. Check the audit trail before retrying.";
    return voiceJson({ ...noVoiceData(), summary: message }, 409);
  }
}
