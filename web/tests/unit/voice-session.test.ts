// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/voice/session/route";

const request = (origin = "http://localhost:3000") => new Request("http://localhost:3000/api/voice/session", { method: "POST", headers: { origin } });

describe("server-issued voice credentials", () => {
  beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "server-secret"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects cross-origin requests before calling the provider", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts the browser Host when Next uses an internal request URL", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const req = new Request("http://0.0.0.0:3107/api/voice/session", { method: "POST", headers: { host: "127.0.0.1:3107", origin: "http://127.0.0.1:3107" } });
    expect((await POST(req)).status).toBe(503); // reached configuration check
  });
  it("reports missing configuration without calling the provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("exposes only an uncacheable ephemeral client secret, never the API key", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ value: "ek_temporary", extra: "server-secret" }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ clientSecret: "ek_temporary" });
    expect(text).not.toContain("server-secret");
    expect(fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer server-secret");
    // Prompt and tools are fixed server-side, not supplied by the browser.
    const session = JSON.parse(fetch.mock.calls[0][1].body).session;
    expect(session.instructions).toContain("Never invent");
    expect(session.tools.map((t: { name: string }) => t.name)).toContain("request_decision");
    expect(session.tools.map((t: { name: string }) => t.name)).not.toContain("confirm_decision");
  });
  it("redacts provider failure details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("server-secret in request")));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("server-secret");
  });
  it("rejects a malformed credential", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ value: "https://untrusted.example" })));
    expect((await POST(request())).status).toBe(502);
  });
});
