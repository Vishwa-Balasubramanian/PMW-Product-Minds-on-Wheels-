# Agent brief: Vishwa (AI lead) · Product Minds on Wheels

You are working on **Product Minds on Wheels (PMW)**, a hackathon prototype for the BMW challenge
"AI for Product Decision Making" (EHL Grand Finale 2026). Read this whole brief before changing anything.

## 1. What the product does

PMW helps a BMW product manager decide what the next generation of a vehicle should offer customers.
It turns BMW's customer data into requirements a product manager can defend:

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

BMW's judges score: decision and scoring logic, human-in-the-loop workflow, traceability and auditability,
usability and feasibility, innovation and scalability. BMW asked for each requirement to carry: ID,
actionable description, linked findings and sources, priority or score, prioritisation rationale,
evidence level, future-facing assumptions and uncertainties, and decision status.

**Demo vehicle: BMW 7 Series (G70), across all markets.** The 1 Series (F70) and 5 Series (G60) show that
the engine generalises.

## 2. Setup

Repo: https://github.com/Vishwa-Balasubramanian/PMW-Product-Minds-on-Wheels-

```bash
git clone https://github.com/Vishwa-Balasubramanian/PMW-Product-Minds-on-Wheels-.git
cd PMW-Product-Minds-on-Wheels-
brew install poppler            # pdftotext, for the price-list PDFs
cd pipeline && uv sync --extra llm && uv run pmw build      # ~2 seconds, rebuilds db/pmw.sqlite
cd ../web && npm install && npm run dev                     # http://localhost:3000
```

Read `README.md` and `TEAM.md` in the repo first. For LLM calls: `export ANTHROPIC_API_KEY=...`, and the
model comes from `PMW_MODEL` (see `pipeline/.env.example`). Never commit keys or `.env` files. The repo is public.

## 3. How the code is organised

| Path | What | Owner |
|---|---|---|
| `data/` | BMW files: 3 feedback xlsx, customer studies, sales, 3 German price-list PDFs | shared, read-only |
| `pipeline/pmw/db.py` | SQLite schema. **The contract with the web app.** | everyone, change together |
| `pipeline/pmw/ingest.py`, `evidence.py`, `scope.py`, `aspects.py` | data, survey cross-checks, scope guard, photos | Arjun |
| `pipeline/pmw/signals.py`, `derive.py`, `score.py` | **signals, requirement drafting, scoring** | **you** |
| `pipeline/pmw/cli.py` | orchestrates the steps (`uv run pmw build`) | shared, keep edits small and additive |
| `pipeline/cache/` | cached LLM outputs, **committed** so teammates without a key get the same drafts | you |
| `web/lib/types.ts` | TypeScript mirror of the schema | everyone, change together |
| `web/lib/gate.ts` | every database read in the web app, filtered by region | shared |
| `web/app/**`, `web/components/**` | UI | Gokul |

Facts about the data you will need:
- Feedback: one row per (comment, label). Stored as `feedback` (one row per comment) + `feedback_labels`.
  F70 2,128 comments, G60 4,000, G70 4,000. Sources: A owner reviews, B dealer notes ("Customer stated…"),
  C quality survey with severity ("I had a serious problem with…"), D open survey answers (always unlabelled).
- **Unlabelled comments** (`feedback.classified = 0`): F70 300, G60 440, G70 440.
- G70 comments: US 3,792, Rest of World 189, Europe 19, **China 0**. The China study gives means only.
- Requirements today: 15 per vehicle, built in **template mode**, so `root_cause` and `customer_need` are NULL
  and titles read like "Easy-to-use personal eSIM". The web app shows "Pending AI analysis" for NULL fields.

## 4. Rules (non-negotiable)

1. **Language from the LLM, numbers from code.** The LLM never writes a score, count or percentage that is
   stored as data. Priority and confidence stay deterministic in `score.py`.
2. **Priority and confidence stay separate.** Quadrants: act / validate / monitor / park.
3. **No invented facts.** Every claim must trace to comment IDs (e.g. `G70-2544`), survey rows or sales rows.
   Prompts must forbid inventing numbers; validate outputs and drop claims that cite unknown IDs.
4. **Scope:** customer-facing product requirements only. Never regulatory, engineering-spec or pricing requirements.
5. **Every AI step writes an audit event** via `db.audit(...)` (`actor_type="ai"`).
6. **Cache every LLM call** in `pipeline/cache/` keyed by inputs, and commit the cache. The build must still
   work with no API key (template or cached output).
7. **Schema changes:** edit `pipeline/pmw/db.py` **and** `web/lib/types.ts` in the same PR, say so in the PR
   title, and tell Gokul and Arjun. Adding columns or JSON fields is fine; never rename or remove.
8. Work on branches `vishwa/<topic>`, small PRs into `main`, pull `main` every two hours. **Never push to `main`
   directly and never merge your own PR.** Gokul or a teammate reviews and merges.
9. Commit messages: plain and descriptive. No AI tool names, no co-author or attribution lines.
10. Before every PR, both must pass:
    `cd pipeline && uv run pmw build` and `cd web && npx tsc --noEmit && npm run build`.
11. The web app uses **Next.js 16** with `cacheComponents: false`. If you touch web code, read the relevant
    guide in `web/node_modules/next/dist/docs/` first. Do not put SQL in pages or components; add a function
    to `web/lib/gate.ts`.

## 5. Your tasks, in priority order

### Task 1: AI-written requirements (highest demo value)
File: `pipeline/pmw/derive.py` (the `llm()` function and `PROMPT` exist already).
- Run `uv run pmw build --llm` and iterate on the prompt until, for all 45 requirements:
  `root_cause` and `customer_need` are filled; `title` is at most 9 words, customer-facing, no BMW jargon;
  `requirement` is one or two testable sentences for the successor vehicle; `assumptions` and `uncertainties`
  are concrete; `future_lens` is one of `current_pain | emerging | future_must_have`.
- Root causes should cite comment IDs from the quotes you passed in. Reject outputs citing IDs not in the input.
- Validate the JSON keys, retry once on bad JSON, fall back to the template on failure (and log it).
- Commit `pipeline/cache/derive_*.json`.
- **Done when:** the 7 Series cards in the app read like a BMW product manager wrote them, and a teammate
  without an API key gets the same text after `uv run pmw build --llm`.

### Task 2: Label the unlabelled comments
File: `pipeline/pmw/signals.py`, function `classify_unlabelled(con, vehicle)` (stub returns 0).
- Send comments with `classified = 0` in batches (~40) with the list of topics already used for that vehicle
  (`SELECT DISTINCT topic FROM feedback_labels ...`) and the four feedback types.
- Insert into `feedback_labels` with `label_source = 'ai'`. Allow "none" when nothing fits; do not force a label.
- Use a cheaper/faster model for this bulk step if available (e.g. a `PMW_MODEL_FAST` env var).
- One audit event per batch. Cache per batch. Update the data-issue text so it reports how many were labelled.
- Check: `signals.build` already joins all labels, so AI labels flow into the counts automatically.
- **Done when:** unlabelled counts drop substantially and Data health shows how many comments the AI labelled.

### Task 3: Calibrate scoring for a convincing demo
File: `pipeline/pmw/score.py` (`DEFAULT_WEIGHTS`, thresholds, factor formulas).
- Today the G70 split is act 9, validate 0, monitor 2, park 4. Aim for **at least two requirements in every
  quadrant for the 7 Series** after Tasks 1 and 2, without making the formulas arbitrary.
- Write the reasoning for every weight and threshold as a comment next to it. Judges will ask.
- The MoSCoW groups in the UI use priority cut-offs 65 / 55 / 45 (`MOSCOW` in `web/components/ui.tsx`).
  If you move the priority threshold, tell Gokul so the two stay consistent.

### Task 4: Challenge narrative
Files: `pipeline/pmw/score.py` (`challenge_issues`), `pipeline/pmw/cli.py`.
- Keep the deterministic issues and penalties. Add an LLM paragraph "What could make this wrong" to the
  challenge JSON as a new optional field `narrative` (cached, built at pipeline time, no runtime LLM call).
- Add `narrative?: string` to the `Challenge` type in `web/lib/types.ts`. Gokul renders it; if you add the
  render yourself, keep it to a few lines in the "Challenge result" section of `web/components/DecisionCard.tsx`
  and say so in the PR.

### Task 5: Merge narrow topics into real themes
File: `pipeline/pmw/signals.py`.
- BMW's labels are narrow: climate is spread over "Vehicle, climatization", "Air conditioning, setting" and
  "Air conditioning control panel"; connectivity over "Personal eSIM", "My BMW App / MINI App",
  "ConnectedDrive and Infotainment, overall technology", "Apple CarPlay".
- Propose a theme map with the LLM, review it yourself, and commit it as a **static** dict (so builds are
  deterministic). Build one signal per theme. Keep `evidence.TOPIC_TO_SURVEY` working for every member topic
  (coordinate with Arjun, who owns that map).
- Check that `aspects.for_topic` still finds the right photo for a theme (Arjun owns `aspects.py`).

## 6. How to check your work in the app

- `http://localhost:3000/vehicles/G70`: the requirement list (MoSCoW groups) and the Decision Card.
- Use **Challenge** on a requirement: confidence must drop and the audit trail must show each step.
- `?view=data` (Data health) for data issues; `/audit` for the full log.
- Region picker (top right): switching to China must hide US comments and log the access.

## 7. When you are done with a task

Work on **one task at a time**. When a task is done: commit on your branch, push it, open a PR with
`gh pr create` (or on github.com), then stop and report back.


Open a PR with: what changed, before/after for two G70 requirements (title, root cause, requirement),
the new quadrant split, and any schema change called out in the title.
