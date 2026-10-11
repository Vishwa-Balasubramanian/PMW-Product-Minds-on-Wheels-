import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceAgent } from "@/components/VoiceAgent";
import type { RealtimeCallbacks } from "@/lib/voice/realtime";
import type { VoiceResult } from "@/lib/voice/config";
import { agentFocus } from "@/lib/agentFocus";

const rt = vi.hoisted(() => ({
  callbacks: null as RealtimeCallbacks | null,
  start: vi.fn(), stop: vi.fn(), context: vi.fn(), push: vi.fn(), refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: rt.push, refresh: rt.refresh }),
  usePathname: () => "/vehicles/G70",
  useSearchParams: () => new URLSearchParams("req=R-G70-001"),
}));
vi.mock("@/lib/voice/realtime", () => ({
  RealtimeSession: class {
    constructor(callbacks: RealtimeCallbacks) { rt.callbacks = callbacks; }
    start = rt.start;
    sendContext = rt.context;
    stop = () => { rt.stop(); rt.callbacks?.onEnd(); };
  },
}));

const success: VoiceResult = { ok: true, summary: "Opened requirement", confidence: { value: 62, level: "limited" }, sources: [{ id: "G70-0012", source: "BMW interview" }], href: "/vehicles/G70?req=R-G70-001&tab=evidence" };
const fetchMock = vi.fn();
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
const mic = () => screen.getByRole("button", { name: /PMW/ });

beforeEach(() => {
  vi.clearAllMocks();
  rt.callbacks = null;
  rt.start.mockImplementation(async () => { rt.callbacks?.onLive(); });
  fetchMock.mockReset().mockResolvedValue(json({ clientSecret: "ek_test" }));
  vi.stubGlobal("fetch", fetchMock);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  agentFocus.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function connect() {
  render(<VoiceAgent region="US" />);
  fireEvent.click(mic());
  await waitFor(() => expect(rt.start).toHaveBeenCalledWith("ek_test"));
  await waitFor(() => expect(mic().getAttribute("aria-pressed")).toBe("true"));
}
const say = (text: string, role: "user" | "agent" = "user") => act(() => rt.callbacks!.onTranscript({ id: `${role}-1`, role, text, final: true }));

it("does nothing until clicked, then shares page context and stops on a second click", async () => {
  render(<><article data-requirement-id="R-G70-001" data-status="proposed" /><VoiceAgent region="US" /></>);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mic().getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(mic());
  await waitFor(() => expect(rt.context).toHaveBeenCalled());
  expect(fetchMock.mock.calls[0][0]).toBe("/api/voice/session");
  const context = JSON.parse(rt.context.mock.calls[0][0].replace(/^[^{]*/, ""));
  expect(context).toMatchObject({ page: "/vehicles/G70", view: "inbox", region: "US", model: "G70", open_requirement: { id: "R-G70-001", status: "proposed" } });
  fireEvent.click(mic());
  expect(rt.stop).toHaveBeenCalled();
  expect(mic().getAttribute("aria-pressed")).toBe("false");
});

it("never displays transcripts on screen", async () => {
  await connect();
  say("Explain this score");
  act(() => rt.callbacks!.onSpeaking(true));
  say("Priority is 71 with limited confidence.", "agent");
  expect(document.body.textContent).not.toContain("Explain this score");
  expect(document.body.textContent).not.toContain("Priority is 71");
  expect(screen.getByRole("button", { name: /PMW is speaking/ })).toBeTruthy();
});

it("refuses tools without a transcript, then forwards the spoken request and navigates", async () => {
  await connect();
  const count = fetchMock.mock.calls.length;
  expect(await rt.callbacks!.onToolCall("open_requirement", { id: "R-G70-001" })).toContain("No user transcript");
  expect(fetchMock.mock.calls.length).toBe(count);
  say("Open this requirement");
  fetchMock.mockResolvedValueOnce(json(success));
  const output = JSON.parse(await rt.callbacks!.onToolCall("open_requirement", { id: "R-G70-001" }));
  expect(output.summary).toBe("Opened requirement");
  expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/voice/tools");
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ tool: "open_requirement", params: { id: "R-G70-001" }, spokenRequest: "Open this requirement" });
  expect(rt.push).toHaveBeenCalledWith(success.href);
});

it("decisions need an on-screen click; voice cannot confirm and never sees the token", async () => {
  await connect();
  say("Approve this requirement");
  fetchMock.mockResolvedValueOnce(json({ ...success, confirmation: { token: "one-use-secret", id: "R-G70-001", title: "Seat support", decision: "approve", expiresAt: Date.now() + 60_000 } }));
  let output = "";
  await act(async () => { output = await rt.callbacks!.onToolCall("request_decision", { id: "R-G70-001", decision: "approve" }); });
  expect(output).not.toContain("one-use-secret");
  expect(output).toContain("awaiting_confirmation");
  expect(screen.getByRole("dialog")).toBeTruthy();
  say("Yes, confirm it");
  const count = fetchMock.mock.calls.length;
  expect(await rt.callbacks!.onToolCall("request_decision", { id: "R-G70-001", decision: "approve" })).toContain("awaiting a click");
  expect(fetchMock.mock.calls.length).toBe(count);
  fetchMock.mockResolvedValueOnce(json({ ...success, summary: "R-G70-001 approved after your confirmation." }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/voice/confirm");
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ token: "one-use-secret", confirm: true });
  expect(rt.context.mock.calls.at(-1)![0]).toContain("approved after your confirmation");
});

it("reports a configuration error and returns to idle", async () => {
  fetchMock.mockResolvedValueOnce(json({ error: "Voice is not configured yet." }, false));
  render(<VoiceAgent region="US" />);
  fireEvent.click(mic());
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not configured"));
  expect(rt.start).not.toHaveBeenCalled();
  expect(mic().getAttribute("aria-pressed")).toBe("false");
});

it("agent proposals are confirmed one by one on screen; skip and cancel all are sent too", async () => {
  await connect();
  say("Investigate the top requirements and take the necessary actions");
  const proposal = (n: number, decision: "approve" | "reject" | "validate") => ({ token: `secret-${n}`, id: `R-G70-00${n}`, title: `Requirement ${n}`, decision, expiresAt: Date.now() + 60_000, rationale: `Evidence ${n}.` });
  fetchMock.mockResolvedValueOnce(json({ ...success, href: undefined, confirmations: [proposal(1, "approve"), proposal(2, "validate"), proposal(3, "reject")] }));
  let output = "";
  await act(async () => { output = await rt.callbacks!.onToolCall("propose_decisions", { items: [] }); });
  expect(output).not.toContain("secret-");
  expect(JSON.parse(output).confirmations).toEqual([
    { id: "R-G70-001", decision: "approve", status: "awaiting_confirmation" },
    { id: "R-G70-002", decision: "validate", status: "awaiting_confirmation" },
    { id: "R-G70-003", decision: "reject", status: "awaiting_confirmation" },
  ]);
  expect(agentFocus.get()).toMatchObject({ "R-G70-001": "proposed", "R-G70-003": "proposed" });
  expect(screen.getByText("Proposal 1 of 3 · from the PMW agent")).toBeTruthy();
  expect(screen.getByText(/Evidence 1\./)).toBeTruthy();

  // Voice cannot confirm while the queue is open.
  say("Yes, approve all of them");
  const count = fetchMock.mock.calls.length;
  expect(await rt.callbacks!.onToolCall("propose_decisions", { items: [] })).toContain("awaiting a click");
  expect(fetchMock.mock.calls.length).toBe(count);

  fetchMock.mockResolvedValueOnce(json({ ...success, summary: "R-G70-001 approved after your confirmation." }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await waitFor(() => expect(screen.getByText("Proposal 2 of 3 · from the PMW agent")).toBeTruthy());
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ token: "secret-1", confirm: true });
  expect(agentFocus.get()["R-G70-001"]).toBe("done");
  expect(rt.refresh).toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(json({ ...success, summary: "Decision cancelled. No change applied." }));
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  await waitFor(() => expect(screen.getByText("Proposal 3 of 3 · from the PMW agent")).toBeTruthy());
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ token: "secret-2", confirm: false });

  fetchMock.mockResolvedValueOnce(json({ ...success, summary: "Decision cancelled. No change applied." }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel all" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ token: "secret-3", confirm: false });
  expect(rt.context.mock.calls.at(-1)![0]).toContain("R-G70-001 approved after your confirmation");
});

it("investigating highlights the card and shows progress without opening a panel", async () => {
  await connect();
  say("Investigate the climate requirement");
  let release!: () => void;
  fetchMock.mockReturnValueOnce(new Promise((r) => { release = () => r(json({ ...success, href: "/vehicles/G70?open=R-G70-001&tab=evidence" })); }));
  let call!: Promise<string>;
  act(() => { call = rt.callbacks!.onToolCall("investigate_requirement", { id: "R-G70-001" }); });
  expect(agentFocus.get()["R-G70-001"]).toBe("investigating");
  expect(screen.getByRole("status").textContent).toContain("Investigating #1 · R-G70-001");
  await act(async () => { release(); await call; });
  expect(agentFocus.get()["R-G70-001"]).toBe("investigated");
  // The card is not on screen in this test, so the vehicle board opens (not the drawer).
  expect(rt.push).toHaveBeenCalledWith("/vehicles/G70");
});
