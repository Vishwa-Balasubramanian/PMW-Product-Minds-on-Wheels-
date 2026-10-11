# PMW voice agent

A small floating microphone at the bottom right of every page. Click it to talk to PMW; click again (or press Escape) to stop. The microphone animates while PMW listens and speaks. No transcript, panel or chat window is shown; only a brief message appears if voice cannot start.

## Setup

1. In `web/.env.local`, set `OPENAI_API_KEY` (server only; never prefix with `NEXT_PUBLIC_`). Optional: `OPENAI_REALTIME_MODEL` (default `gpt-realtime`) and `OPENAI_REALTIME_VOICE` (default `marin`).
2. Run `npm run dev` and open <http://localhost:3000>. Allow microphone access when asked.

Without a key the app and tests still run; clicking the microphone shows a short configuration message.

## Local mode (no OpenAI key)

Adapted from the Minerva prototype. When the server has no `OPENAI_API_KEY`, the mic still works:

1. The browser's speech recognition (Chrome, Edge) hears one command.
2. `lib/voice/local.ts` routes it deterministically, with no model, to the same tools listed below, e.g. "open the 7 Series", "show conflicts", "explain the score", "read a customer quote", "challenge this", "approve this", "give me my briefing".
3. The tool runs through `POST /api/voice/tools`, so it is region-filtered and audited exactly like the AI agent; decisions and Challenge still open the Confirm dialog.
4. The reply is spoken by ElevenLabs through `POST /api/voice/speak` (the key stays on the server) or, without `ELEVENLABS_API_KEY`, by the browser voice.
5. Hands-free: after replying, PMW listens again, unless a confirmation is waiting for a click. Say "stop" or click the mic to end.

Privacy: Chrome sends recognised audio to Google; ElevenLabs receives only the sentence PMW speaks (which can include a customer quote it reads out).

## How it works

- `POST /api/voice/session` (same-origin only) mints a short-lived OpenAI Realtime client secret. The agent's prompt, tools and turn detection are fixed there, server-side. The API key never reaches the browser.
- `lib/voice/realtime.ts` connects the browser to OpenAI over WebRTC. Audio streams directly; transcripts and tool calls use the data channel. Server voice-activity detection allows natural turn-taking and interrupting PMW mid-sentence.
- `components/VoiceAgent.tsx` renders the microphone and the confirmation dialog. Final user transcripts are kept (not shown) as the audited spoken request. It sends the current page context (page, model, selected requirement, region) to the agent on start and on every navigation.
- Every tool call goes to `POST /api/voice/tools`, which runs existing PMW queries and actions (`lib/voice/server.ts`) with the viewer's region filter. Each call is written to the audit trail twice — the spoken request before execution and the result after — and fails closed if the audit write fails.
- Sessions end after 90 seconds of inactivity or when the tab is hidden.

## Tools

| Tool | PMW integration |
| --- | --- |
| `navigate(page, model?, view?)` | Home, portfolio, workflow, audit trail, or a vehicle's requirements / decision matrix / signals / data health |
| `list_vehicles` | `listVehicles` — programs, comments, requirements, decisions awaiting review |
| `find_requirements(model, filter?, query?)` | `listRequirements` filtered by status, quadrant, quick wins, conflicts or keyword |
| `open_requirement(id)` | `getRequirement`, opens the Decision Card on the Requirements board |
| `explain_score(id)` | Priority and confidence factors, evidence mix, Scoring tab |
| `read_customer_quotes(id, n)` | Verbatim, region-permitted comments |
| `summarize_feedback(model)` | `listSignals` top topics + approval coverage per market |
| `run_challenge(id)` | Previews the Evidence Challenger (issues and the confidence it would set) and reads it out; applies it only after the PM clicks **Confirm** |
| `critical_issues(model?)` | High-priority undecided requirements, challenged evidence, conflicts, missing voices, critical data issues |
| `daily_briefing` | Pending decisions, gaps, conflicts since the previous briefing |
| `show_missing_voices(model)` | Feedback vs. sales representation |
| `audit_trail(id? / model?)` | `auditFor` / `auditLog` |
| `portfolio_overview` | Cross-model recurring themes |
| `request_decision(id, decision)` | Proposal only — see below |

Team strategy weights cannot be changed by voice.

## Decisions need a click

`request_decision` never changes anything. It stores a one-use, five-minute proposal tied to the browser and region and opens an on-screen dialog. Only clicking **Confirm** calls `POST /api/voice/confirm`, which is not in the agent's tool list. The token is never sent to the model, a spoken "yes" cannot confirm, and stale or expired proposals are refused. Confirmations and cancellations are logged in the audit trail.

## Tests

- `npm run test:voice` — unit tests for the agent UI and the session route.
- `npx playwright test tests/voice.spec.ts` — tool APIs, region gating, audit logging, confirmation flow and the microphone's layout against the real database.
