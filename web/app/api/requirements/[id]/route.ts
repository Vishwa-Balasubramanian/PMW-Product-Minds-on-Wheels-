import { applyAction, type ActionInput } from "@/lib/actions";
import { getViewer } from "@/lib/gate";

const ACTIONS = new Set(["approve", "reject", "validate", "edit", "challenge", "reopen"]);
const EDITABLE = new Set(["title", "requirement", "customer_need"]);

function validInput(value: unknown): value is ActionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.action !== "string" || !ACTIONS.has(body.action)) return false;
  if (body.rationale !== undefined && typeof body.rationale !== "string") return false;
  if (body.action !== "edit") return body.fields === undefined;
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return false;
  const fields = Object.entries(body.fields);
  return fields.length > 0 && fields.every(([key, text]) =>
    EDITABLE.has(key) && typeof text === "string" && text.trim().length > 0);
}

export async function POST(req: Request, ctx: RouteContext<"/api/requirements/[id]">) {
  const { id } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  if (!validInput(body)) {
    return Response.json({ ok: false, error: "Invalid decision input." }, { status: 400 });
  }
  const viewer = await getViewer();
  const result = await applyAction(viewer, id, body);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
