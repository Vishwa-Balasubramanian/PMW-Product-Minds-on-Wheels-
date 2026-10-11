# Product Minds on Wheels (PMW)

AI decision support for BMW product managers: from customer evidence to traceable, prioritised requirements for
the next vehicle generation, with the product manager deciding every step. EHL Grand Finale 2026, BMW track.

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

## Run it (10 minutes)

Needs: Node 24, current npm, and [uv](https://docs.astral.sh/uv/). The pipeline reads
the supplied PDFs directly with Python, including on Windows.

```bash
# 1. Build the database (about 10 seconds)
cd pipeline
uv sync
uv run pmw build --offline  # complete evidence drafts; no network generation
uv run pmw verify          # citations, counts and deterministic scoring checks
# uv sync --extra llm && ANTHROPIC_API_KEY=... uv run pmw build --llm   # AI mode, see below

# 2. Run the web app
cd ../web
npm ci
npm run dev                 # http://localhost:3000
```

Rebuilding wipes the database, including every PM decision. That is the clean demo state.
After pulling changes to `pipeline/pmw/db.py`, rebuild: the build drops and recreates every table.

Equipment matches stay within the feature's allowed topics. Only `Wants` comments support option, package or
cross-vehicle offers; complaints about standard equipment are marked `standard_but_failing`.
Each vehicle keeps its 15 signal requirements plus up to five quick wins, ranked by distinct wishing comment IDs.
G60 and G70 also include their three strongest in-scope China/Europe survey conflicts, with explicit market values,
2025 sales shares and limited evidence confidence. These cards do not invent customer comments.
Quick wins name the feature and option/package code or source vehicle, and use their own comments and scores.
Comment IDs are the available counting unit; the source data does not identify unique people across comments.

Schema update: `equipment_matches.feature` identifies the feature; the placeholder `equipment.trim` column was
removed. Rebuild the database before running the updated app.

Phase 2 adds `signal_feedback` (full negative-comment membership for live approval coverage) and `feedback_scope`
(readable text exclusions). Rebuild before using this branch. The async `happiness(viewer, vehicle)` gate function
returns authorized markets only and `share: null` when evidence is missing; the meter UI can consume it.
Implementation notes: [Happiness data](docs/HAPPINESS_DATA.md), [survey and scope](docs/SURVEY_AND_SCOPE.md),
[photos](docs/REQUIREMENT_PHOTOS.md), and [pitch data traps](docs/pitch/data-traps.md).

Vishwa Phase 2 adds a region-aware evidence/assumption meter and `/portfolio`, a theme-by-vehicle heatmap with
aggregate counts only. The additive `requirements.evidence_mix` and `evidence_mix_by_market` columns can be
backfilled without replacing decisions: back up the existing database, then run `uv run pmw evidence-mix` from
`pipeline`. A full rebuild is still needed to regenerate upstream source changes. See the [Phase 2 delivery and
migration notes](docs/PHASE2_VISHWA.md) and [scoring pitch](docs/pitch/scoring.md).

Regression checks: `cd pipeline && uv run --extra llm python -m unittest discover -s tests -v`, then
`cd ../web && node --test scripts/test-equipment-evidence.mjs scripts/test-happiness.mjs scripts/test-score.mjs && npx tsc --noEmit && npm run build`.
Run `npm run test:e2e` after building; it uses a separate copy of the local database.

**Priority display:** the list is grouped MoSCoW-style by priority score: Must have 65+, Should have 55+, Could have 45+,
Won't have this time below 45 (`MOSCOW` in `web/components/ui.tsx`). The Act / Validate first / Monitor / Park chip is the
separate decision quadrant (priority × confidence).

**Priority weights and presets:** the "Priority weights" panel above the requirement list lets a product manager change
how much each of the five priority factors counts (customer impact, frequency, market relevance, competitive pressure,
future relevance), by slider or with a strategy preset: Customer first, Premium experience, Quick wins, China focus or
Europe focus (defined and explained in `web/lib/score.ts`). A live preview shows how the top 5 would re-order before
anything is saved. Apply needs a reason; the weights are stored team-wide in `settings.weights_active` and logged in the
audit trail (who, region, before/after, why). While they are active, every page and export recomputes priority with the
pipeline's formula, `round(100 × Σ weight·value / Σ weight)`, re-groups MoSCoW and re-derives the quadrant; confidence
is never changed because it measures evidence, not strategy. The stored scores stay untouched, so Reset restores the
original ranking exactly. `node --test scripts/test-score.mjs` proves the web formula reproduces every stored priority
and quadrant under the default weights.

## Hosted demo

Live at **https://product-minds-on-wheels.vercel.app** (Vercel project `product-minds-on-wheels`).

- Online, the app reads and writes a hosted Turso database (SQLite in the cloud, free plan, added through the
  Vercel Marketplace). Locally it uses `db/pmw.sqlite`. Same code, chosen in `web/lib/db.ts`.
- Update the hosted data after a pipeline change: `cd web && vercel env pull .env.local && npm run db:push`.
  This replaces everything online, including PM decisions made on the hosted demo.
- Deploy code: `cd web && vercel deploy --prod`. The project is not connected to GitHub, so pushes do not deploy.
- Search engines are kept out three ways (robots meta tag, `robots.txt`, `X-Robots-Tag` header). No analytics,
  and the font is self-hosted, so visitors' browsers make no requests to third parties.

## How it fits together

```
data/*.xlsx, *.PDF ─────► pipeline/ (Python) ──► db/pmw.sqlite ──► web/ (Next.js) ──► product manager
                              │                        ▲                 │
                              └── pipeline/cache/ ─────┘                 └── decisions + access events
                                  (AI drafts, committed)                     written back to audit_events
```

| Step | Where | Who does it |
|---|---|---|
| 1 Ingest, record data problems | `pipeline/pmw/ingest.py` | AI pipeline, automatic |
| 2 Signals (themes from comments) | `pipeline/pmw/signals.py` | AI pipeline, automatic |
| 3 Triangulate (survey, sales, equipment, conflicts, missing voices) | `pipeline/pmw/evidence.py` | AI pipeline, automatic |
| Scope guard | `pipeline/pmw/scope.py` | AI pipeline, automatic, every exclusion has a reason |
| 4 Derive requirement (the ladder) | `pipeline/pmw/derive.py` | AI drafts, never final |
| 5 Priority and confidence | `pipeline/pmw/score.py` | Deterministic code, not the LLM |
| 6 Approve / validate first / edit / reject / challenge | `web/lib/actions.ts` | **Product manager, mandatory** |
| 7 Audit trail | `audit_events` table, `/audit` page | Automatic, append-only |

**Two rules that keep the system honest**
- Language comes from AI, numbers come from code. Scores are never written by the model.
- Priority and confidence are separate. High priority with weak evidence lands in **Validate first**, not **Act**.

## Regions instead of logins

There is no login. The region picker in the header (top right) sets a cookie. A market product manager sees raw
customer comments from their own market only; summary scores stay visible everywhere; the head of product
(All markets) sees everything. All reads go through `web/lib/gate.ts`, which filters by region and logs access.
In production this maps onto BMW single sign-on and database-level security.

## AI mode

`uv run pmw build --llm` classifies unlabelled feedback, drafts requirements and explains challenges.
Validated results are cached by their full inputs in `pipeline/cache/`; commit those files after a live run
so teammates can replay them without a key. Model: set `PMW_MODEL` (and optionally `PMW_MODEL_FAST`) in
`pipeline/.env`. `--offline` reads validated caches but prohibits network calls even if a key exists.
Without a matching cache, the pipeline uses explicit evidence-based templates and provisional rule labels.
Live-model caches are not included in the offline-first deliverable.

Implementation, checks and limitations: [Vishwa pipeline handoff](docs/VISHWA_IMPLEMENTATION.md).

Optional voice agent (OpenAI Realtime): [setup, tools and safety](docs/VOICE_COPILOT.md). Set the server-side `OPENAI_API_KEY` in `web/.env.local`, then click the small microphone at the bottom of any page to talk to PMW in English or German.

## Repo map

```
data/                BMW hackathon files
db/pmw.sqlite        built by the pipeline (git-ignored)
pipeline/pmw/        Python pipeline; db.py is the schema = the contract with the web app
pipeline/cache/      cached AI drafts (committed)
web/lib/gate.ts      every data read, region filtering, access logging
web/lib/actions.ts   every PM decision and its audit events
web/app/             pages: / (home), /vehicles/[code] (requirements, matrix, signals, data health), /audit
web/components/      UI; DecisionCard.tsx is the core screen
```

Team, ownership and workflow: [TEAM.md](TEAM.md).

**Note:** the repo contains BMW data and photography provided for the hackathon. Check the hackathon terms before keeping it public.
