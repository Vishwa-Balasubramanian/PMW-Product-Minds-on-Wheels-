# Product Minds on Wheels (PMW)

PMW helps a BMW product manager decide what the next generation of a car should offer. It reads the customer
feedback, surveys, sales figures and price lists BMW gave us, turns them into requirements, and shows the evidence
behind each one. The product manager makes every decision, and every decision is written down.

We built it for the BMW track of the EHL Grand Finale 2026.

**Live demo:** https://product-minds-on-wheels.vercel.app

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

## What you can do

**Pick a car.** The home page shows the 1, 5 and 7 Series. Cars that aren't sold in your region are greyed out,
and cars with no customer comments from your region say so.

**Work through its requirements.** Each car page has five tabs:

- **Requirements:** a MoSCoW board (Must, Should, Could, Won't have this time), grouped by priority score, with the
  full Decision Card next to it. Filter by Act, Validate first, Monitor, Park, Quick wins or Conflicts, or search.
- **Decisions:** the same requirements sorted by where they are in the workflow (To review, Needs validation,
  Edited, Approved, Rejected). Drag a card to another column, or use its "…" menu, to approve, reject or ask for
  validation.
- **Decision matrix:** priority against confidence, so you can see what is important but not yet proven.
- **Signals:** the customer topics behind the requirements, with counts.
- **Data health:** where the evidence is thin (missing voices), where China and Europe disagree, what share of
  customer pain your approved requirements cover, and every problem we found in the source data.

**Open a requirement.** The Decision Card shows the car part it is about, why the AI recommends it, and buttons to
Approve, Validate first, Edit, Reject or Challenge. Its tabs hold the rest:

- **Overview:** how much of the case rests on customer comments, survey data, AI inference and assumptions, plus
  the chain from customer voice to requirement, and the assumptions and uncertainties.
- **Evidence:** real customer quotes (supporting and contradicting) and survey results.
- **Scoring:** each priority and confidence factor, with its weight and reason.
- **Activity:** the audit trail for this requirement.

**Challenge it.** Challenge runs a red-team check against the requirement. Confidence drops if the evidence is
weaker than it looks, and the requirement can move from Act to Validate first.

**Change the strategy.** Priority weights (with presets such as Customer first or China focus) re-rank the list
live. Applying them needs a reason and is logged. Reset brings back the original ranking.

**See across cars.** The top bar has two more views:

- **Board:** every requirement across all three cars, by decision status, with counts, filters and a list view.
- **Radar:** a heatmap of customer themes across the 1, 5 and 7 Series, recurring issues first.

**Export.** Each car page exports the requirement list in BMW's format as CSV or JSON.

**Talk to it.** The microphone at the bottom right starts a voice assistant. Ask it to open a car, explain a score,
read customer quotes or challenge a requirement. It can propose a decision, but nothing changes until you click
Confirm.

**Check the record.** The Audit trail page lists every AI step, product manager decision and access to customer
evidence, filterable by car and actor.

## How it works

```
data/*.xlsx, *.PDF ──► pipeline/ (Python) ──► db/pmw.sqlite ──► web/ (Next.js) ──► product manager
                                                   ▲                  │
                                                   └── decisions and access events (audit_events)
```

| Step | Where | Who does it |
|---|---|---|
| Ingest the files and record data problems | `pipeline/pmw/ingest.py` | Pipeline |
| Group comments into signals | `pipeline/pmw/signals.py` | Pipeline |
| Cross-check with surveys, sales, equipment and markets | `pipeline/pmw/evidence.py` | Pipeline |
| Remove out-of-scope topics, with a reason for each | `pipeline/pmw/scope.py` | Pipeline |
| Draft the requirement | `pipeline/pmw/derive.py` | AI draft, never final |
| Score priority and confidence | `pipeline/pmw/score.py` | Code, not the AI |
| Approve, validate first, edit, reject, challenge | `web/lib/actions.ts` | **Product manager** |
| Record what happened | `audit_events` table, `/audit` | Automatic, append-only |

Two rules keep it honest. The AI writes the words, but the numbers come from code. And priority and confidence are
scored separately: an important requirement with weak evidence goes to Validate first, not Act.

## Regions instead of logins

There is no login in this prototype. The region picker in the top bar decides what you can see. A market product
manager sees customer comments from their own market only; summary scores are visible to everyone; "All markets"
(head of product) sees everything. Every data read goes through `web/lib/gate.ts`, which applies the region and logs
access to customer evidence. In production this would sit behind BMW single sign-on.

## Run it locally

You need Node 24, npm and [uv](https://docs.astral.sh/uv/).

```bash
# 1. Build the database (about 10 seconds)
cd pipeline
uv sync
uv run pmw build --offline   # builds every table from the files in data/
uv run pmw verify            # checks citations, counts and scores

# 2. Start the web app
cd ../web
npm ci
npm run dev                  # http://localhost:3000
```

A rebuild starts from a clean slate and wipes every decision made locally. Rebuild after pulling changes to
`pipeline/pmw/db.py`, which is the schema shared by the pipeline and the web app.

`uv run pmw build --llm` uses an LLM to label unclassified comments and draft requirement text (set the key and
model in `pipeline/.env`, see `pipeline/.env.example`). Results are cached in `pipeline/cache/`. Without it, the
pipeline uses evidence-based templates that are clearly marked as drafts.

## Voice

The assistant picks the best option the server is set up for:

1. **OpenAI Realtime** when `OPENAI_API_KEY` is set. This is the main mode.
2. **ElevenLabs conversational agent** when `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` are set. Create or update
   the agent with `node --env-file=.env.local scripts/eleven-agent.ts` from `web/`.
3. **Command mode** otherwise: the browser recognises a short command and PMW answers from a fixed set of actions.

Keys stay on the server; the browser only gets short-lived session tokens. Whatever the mode, every action goes
through the same region checks and audit trail, and decisions or challenges need a click on Confirm.

For a noisy room, PMW ignores background talk while it is speaking (click the mic to stop it). Tune this with
`OPENAI_VAD_THRESHOLD` (default 0.75), `OPENAI_NOISE_REDUCTION` (`far_field` for a laptop mic, `near_field` for a
headset) and `OPENAI_VOICE_INTERRUPT=1` to allow interrupting by voice. Details: [docs/VOICE_COPILOT.md](docs/VOICE_COPILOT.md).

Put local keys in `web/.env.local` (git-ignored). `web/.env.example` lists every setting.

## Tests

```bash
cd pipeline && uv run --extra llm python -m unittest discover -s tests   # pipeline
cd ../web
npx tsc --noEmit && npm run lint && npm run build                        # types, lint, build
npm run test:voice                                                       # voice unit tests
npm run test:e2e                                                         # browser tests (after a build)
node --test scripts/test-score.mjs scripts/test-happiness.mjs scripts/test-equipment-evidence.mjs
```

The browser tests use their own copy of the database and run without the voice keys, so they never touch the live
site or use paid voice minutes.

## Hosting

The live site runs on Vercel (project `product-minds-on-wheels`). Online it reads and writes a hosted Turso
database; locally it uses `db/pmw.sqlite`. `web/lib/db.ts` picks between them.

- **Deploy:** `cd web && vercel deploy --prod`. The project is not connected to GitHub, so a push does not deploy.
- **Replace the live data** after a pipeline change: `cd web && vercel env pull .env.local && npm run db:push`.
  This overwrites everything online, including decisions made on the live site.
- **No tracking:** no analytics, a self-hosted font, and search engines are kept out (robots meta tag,
  `robots.txt` and an `X-Robots-Tag` header). The voice assistant is the only part that talks to an outside
  service, and only after you click the mic.

## Where things live

```
data/                 BMW hackathon files
db/pmw.sqlite         built by the pipeline (git-ignored)
pipeline/pmw/         Python pipeline; db.py is the schema
pipeline/cache/       cached AI drafts (committed)
web/app/              pages: home, /vehicles/[code], /board, /portfolio (Radar), /workflow, /audit, and the API routes
web/components/       UI; DecisionCard.tsx is the main screen
web/lib/gate.ts       every data read, region filter and access log
web/lib/actions.ts    every product manager decision and its audit entries
web/lib/voice/        voice modes, tools and safety rules
docs/                 implementation notes, voice guide, pitch material
```

More detail: [team and workflow](TEAM.md), [plan](PLAN.md), [pitch deck and demo script](docs/pitch/),
[data traps we found](docs/pitch/data-traps.md), [how scoring works](docs/pitch/scoring.md).

**Note:** this repo contains BMW data and photography provided for the hackathon. Check the hackathon terms before
keeping it public.
