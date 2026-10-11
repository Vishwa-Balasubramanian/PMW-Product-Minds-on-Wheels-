import "server-only";

export function voiceJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

// PMW currently uses its region cookie as the prototype identity. Apply the same
// origin boundary to voice POSTs; production SSO should guard these with the app.
export function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  // Next may build request.url with its internal bind address (0.0.0.0 or
  // localhost). Host is the authority the browser actually requested. Do not
  // trust x-forwarded-host, which a client can supply on an untrusted proxy.
  const expected = new URL(request.url);
  const host = request.headers.get("host");
  if (host) expected.host = host;
  const protocol = request.headers.get("x-forwarded-proto");
  if (protocol === "https" || protocol === "http") expected.protocol = `${protocol}:`;
  return request.headers.get("origin") === expected.origin;
}

export async function voiceBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  const text = await request.text();
  if (text.length > 16_000) return null;
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}
