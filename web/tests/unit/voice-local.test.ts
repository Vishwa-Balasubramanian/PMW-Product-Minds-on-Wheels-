import { describe, expect, it } from "vitest";
import { routeCommand, spokenReply, type LocalContext } from "../../lib/voice/local";

const onCard: LocalContext = { model: "G70", view: "inbox", requirement: "R-G70-73240d3417" };
const home: LocalContext = { model: "all", view: "home", requirement: null };

describe("local voice command router", () => {
  it("navigates to vehicles and views", () => {
    expect(routeCommand("Open the 7 Series", home)).toEqual({ kind: "tool", tool: "navigate", params: { page: "vehicle", model: "G70", view: "inbox" } });
    expect(routeCommand("show the five series decision matrix", home)).toEqual({ kind: "tool", tool: "navigate", params: { page: "vehicle", model: "G60", view: "matrix" } });
    expect(routeCommand("go to the requirements board", home)).toMatchObject({ params: { page: "board" } });
    expect(routeCommand("open the cross model radar", home)).toMatchObject({ params: { page: "portfolio" } });
    expect(routeCommand("show the audit trail", home)).toMatchObject({ params: { page: "audit" } });
  });

  it("lists requirements on the current or named vehicle", () => {
    expect(routeCommand("show me the conflicts", onCard)).toEqual({ kind: "tool", tool: "find_requirements", params: { model: "G70", filter: "conflict" } });
    expect(routeCommand("which quick wins does the 1 series have", onCard)).toEqual({ kind: "tool", tool: "find_requirements", params: { model: "F70", filter: "quick_win" } });
  });

  it("acts on the requirement that is open, and asks for one when none is", () => {
    expect(routeCommand("challenge this", onCard)).toEqual({ kind: "tool", tool: "run_challenge", params: { id: onCard.requirement } });
    expect(routeCommand("approve it", onCard)).toEqual({ kind: "tool", tool: "request_decision", params: { id: onCard.requirement, decision: "approve" } });
    expect(routeCommand("why is the score so high", onCard)).toMatchObject({ tool: "explain_score" });
    expect(routeCommand("read me a customer quote", onCard)).toMatchObject({ tool: "read_customer_quotes", params: { n: 1 } });
    expect(routeCommand("challenge this", home)).toMatchObject({ kind: "needs_requirement" });
  });

  it("handles briefing, stop and unknown phrases", () => {
    expect(routeCommand("give me my briefing", home)).toMatchObject({ tool: "daily_briefing" });
    expect(routeCommand("stop", home)).toEqual({ kind: "stop" });
    expect(routeCommand("what is the weather", home)).toEqual({ kind: "help" });
  });
});

describe("spoken replies", () => {
  it("reads quotes as real customer comments and points to the confirm click", () => {
    expect(spokenReply("read_customer_quotes", { quotes: [{ text: "The screen freezes", market: "US" }] })).toContain("A customer from US said: The screen freezes");
    const reply = spokenReply("run_challenge", { summary: "Evidence Challenger preview: 2 issues; confidence would go from 78 to 60/100. Awaiting a click to apply. Nothing has changed.", confirmation: { status: "awaiting_confirmation" } });
    expect(reply).toContain("confidence would go from 78 to 60");
    expect(reply).toContain("Click Confirm to apply it.");
    expect(reply).not.toContain("Awaiting a click");
  });
});
