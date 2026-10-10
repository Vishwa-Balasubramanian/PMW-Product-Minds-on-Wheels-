# Product Minds on Wheels (PMW)

AI decision support for BMW product managers: from customer evidence to traceable, prioritised requirements for
the next vehicle generation, with the product manager deciding every step. EHL Grand Finale 2026, BMW track.

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

## Run it (10 minutes)

Needs: Node 20+, [uv](https://docs.astral.sh/uv/), poppler (`brew install poppler`, for the price-list PDFs).

```bash
# 2. Build the database (about 2 seconds)
cd pipeline
uv sync
uv run pmw build            # template mode, no API key needed
# uv sync --extra llm && ANTHROPIC_API_KEY=... uv run pmw build --llm   # AI mode, see below

# 3. Run the web app
cd ../web
npm install
npm run dev                 # http://localhost:3000
```

Rebuilding wipes the database, including every PM decision. That is the clean demo state.
After pulling changes to `pipeline/pmw/db.py`, rebuild: the build drops and recreates every table.

**Priority display:** the list is grouped MoSCoW-style by priority score: Must have 65+, Should have 55+, Could have 45+,
Won't have this time below 45 (`MOSCOW` in `web/components/ui.tsx`). The Act / Validate first / Monitor / Park chip is the
separate decision quadrant (priority × confidence).

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

`uv run pmw build --llm` asks the LLM to write the root cause, customer need, requirement, assumptions and
uncertainties for each signal. Results are cached in `pipeline/cache/` and **committed**, so only one person needs
an API key and everyone else gets the same drafts. Model: set `PMW_MODEL` (see `pipeline/.env.example`).

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
