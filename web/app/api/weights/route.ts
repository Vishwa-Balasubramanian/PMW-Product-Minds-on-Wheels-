import { resetWeights, setWeights } from "@/lib/actions";
import { getViewer } from "@/lib/gate";

// POST /api/weights
//   { action: "set", weights: { impact, frequency, market, competitive, future }, preset?, rationale }
//   { action: "reset", rationale }
// Team-wide priority weights. Validation and the audit event live in actions.ts.
const bad = (error: string) => Response.json({ ok: false, error }, { status: 400 });

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid weights input.");
  const b = body as Record<string, unknown>;
  if (b.rationale !== undefined && typeof b.rationale !== "string") return bad("Invalid weights input.");
  if (b.preset !== undefined && typeof b.preset !== "string") return bad("Invalid weights input.");
  const rationale = b.rationale as string | undefined;

  const viewer = await getViewer();
  let result;
  if (b.action === "set") {
    if (!b.weights || typeof b.weights !== "object" || Array.isArray(b.weights)) return bad("Weights are missing.");
    result = await setWeights(viewer, { weights: b.weights as Record<string, unknown>, preset: b.preset as string | undefined, rationale });
  } else if (b.action === "reset") {
    result = await resetWeights(viewer, { rationale });
  } else {
    return bad("Unknown action.");
  }
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
