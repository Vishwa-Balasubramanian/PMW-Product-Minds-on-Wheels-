import { cookies } from "next/headers";
import { REGION_COOKIE, isRegion } from "@/lib/regions";

// Region picker. Stands in for single sign-on in the prototype.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { region?: string } | null;
  if (!isRegion(body?.region)) return Response.json({ ok: false, error: "Unknown region." }, { status: 400 });
  const store = await cookies();
  store.set(REGION_COOKIE, body.region, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ ok: true });
}
