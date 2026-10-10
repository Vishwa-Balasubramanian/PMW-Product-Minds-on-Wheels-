import { applyAction, type ActionInput } from "@/lib/actions";
import { getViewer } from "@/lib/gate";

const ACTIONS = new Set(["approve", "reject", "validate", "edit", "challenge", "reopen"]);

export async function POST(req: Request, ctx: RouteContext<"/api/requirements/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as ActionInput | null;
  if (!body || !ACTIONS.has(body.action)) {
    return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
  const viewer = await getViewer();
  const result = await applyAction(viewer, id, body);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
