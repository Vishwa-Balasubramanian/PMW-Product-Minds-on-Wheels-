# Phase 2 brief: Vishwa (AI and scoring) · PMW

You are working on **PMW**, a hackathon prototype for the BMW challenge "AI for Product Decision Making"
(EHL Grand Finale 2026). This brief is self-contained: read it fully before changing anything. Phase 1 is finished
and merged; do not redo it. `PLAN.md` has the overall plan and demo story.

## 1. The product in one paragraph

PMW helps a BMW product manager decide what the next generation of a car must offer. It turns BMW's customer data
(10,128 comments, customer studies, sales, German price lists) into requirements a product manager can defend:
customer voice → signal → root cause → customer need → requirement → priority + confidence (separate, by formula)
→ the product manager decides → audit trail. Demo vehicle: **BMW 7 Series (G70)** across all markets.
BMW judges: scoring logic, human-in-the-loop workflow, traceability, usability, innovation and scalability.

## 2. Where we are (merged into `main`)

| PR | Who | What |
|---|---|---|
| #1, #4 | Arjun | "You already sell this": price-list parser with six verified checks, matches only from customer wishes, up to five feature-specific quick wins per car (`kind = 'quick_win'`) |
| #2 | Vishwa | Evidence-to-decision workflow: reviewed evidence templates (labelled "needs validation"), rule-based labels, merged themes, **stable hashed requirement IDs** (e.g. `R-G70-73240d3417`), calibrated scores, challenge narrative, Python and Playwright tests |
| #3 | Gokul | Requirement export in BMW's format (CSV / JSON), region-filtered and logged |
| #5, #6 | Gokul | Scroll position kept; BMW Group branding (72px header, PMW wordmark, palette, Inter self-hosted) |
| #7 | Gokul | Workflow page `/workflow` (BMW deliverable 3), **open for review** |

Live demo: https://product-minds-on-wheels.vercel.app (Turso database, not indexed, no trackers).

## 3. Setup

```bash
git checkout main && git pull
cd pipeline && uv sync --extra llm && uv run pmw build     # rebuilds db/pmw.sqlite (~5 s)
uv run pmw verify                                          # pipeline self-checks
uv run --with pytest pytest -q tests                       # Python tests
cd ../web && npm install && npm run dev                    # http://localhost:3000
PMW_USE_REMOTE=0 npm run test:e2e                          # 15 Playwright tests (isolated database copy)
```

## 4. Code map and ownership

| Path | What | Owner |
|---|---|---|
| `data/` | BMW files (read-only) | shared |
| `pipeline/pmw/db.py` + `web/lib/types.ts` | **schema contract**: additions only, change both together | everyone |
| `pipeline/pmw/ingest.py`, `evidence.py`, `scope.py`, `aspects.py` | data, cross-checks, scope guard, photos | Arjun |
| `pipeline/pmw/signals.py`, `classify.py`, `themes.py`, `derive.py`, `drafts.py`, `score.py`, `challenge.py`, `ai.py` | AI and scoring | Vishwa |
| `pipeline/pmw/cli.py`, `verify.py` | orchestration and checks | shared, small additive edits |
| `web/lib/gate.ts` | every database read, region-filtered, async | shared, additions only |
| `web/lib/actions.ts` | every PM decision + its audit events | Gokul |
| `web/app/**`, `web/components/**` (incl. `DecisionCard.tsx`, `Header.tsx`) | UI | Gokul (others add **new** component files) |
| `web/app/globals.css` | BMW brand tokens (`--bmw-*`) and Tailwind tokens | Gokul |
| `docs/pitch/` | slide notes | everyone |

## 5. Rules (non-negotiable)

1. **Numbers from code, words from the LLM.** Priority and confidence stay separate and deterministic.
2. **No invented facts.** Every claim traces to a comment ID, survey row, sales row or price-list line.
3. **Customer-facing requirements only**: no regulatory, engineering-spec or pricing requirements.
4. **Region privacy.** All web reads go through async functions in `gate.ts` that respect the viewer's region;
   no raw customer text from other markets, also not in client component props. Writes go through `actions.ts`
   with an audit event in the same `writeBatch`.
5. **Schema changes** (`db.py` + `types.ts`) are additions only and are named in the PR title.
6. **Next.js 16**, `cacheComponents: false`, pages use `export const dynamic = "force-dynamic"`. Read
   `web/node_modules/next/dist/docs/` before using an unfamiliar API. Do not use `next/font/google`.
7. **No trackers**: no analytics, no third-party scripts, fonts or images. Keep the noindex rules.
8. Brand: BMW blue `#1C69D4` for primary actions; square corners; uppercase bold labels; light headlines.
   Never redraw or alter the BMW logo; it only appears as `web/public/brand/bmw-logo.svg`.
9. Branch `vishwa/<topic>`, **one task per pull request**, plain commit messages without AI tool names or
   co-author lines. **Never push to `main` and never merge your own pull request.**

## 6. Your Phase 2 tasks, in priority order

### P2-1: Evidence vs. assumption meter (signature feature #4)
- For every requirement, compute how much rests on **observed customer comments**, **survey data**,
  **AI inference** (root-cause hypotheses, theme merging, rule labels) and **forward-looking assumptions** (2030).
- Deterministic, in the pipeline (`score.py` or a new module), with the rule documented next to the code in one
  paragraph a judge can follow. Store as `requirements.evidence_mix` (JSON `{observed, survey, inferred, assumed}`,
  summing to 1). **Schema change**: `db.py` + `types.ts`, named in the PR title.
- Build `web/components/EvidenceMeter.tsx`: a stacked bar with a legend, BMW palette, readable at 375px.
  Gokul places it on the Decision Card; do not edit `DecisionCard.tsx`.
- Add a Python test (mix sums to 1, survey-only China requirement has `observed = 0`) and a Playwright check.
- **Done when:** every requirement has a mix and the component renders correctly for a comment-heavy US requirement
  and a survey-only China requirement.

### P2-2: Portfolio page `/portfolio`
- A heatmap of themes × 1 Series / 5 Series / 7 Series (negative share per theme from `signals`), showing issues that
  repeat across the range (e.g. connectivity, ease of use). Summary numbers only, no raw comments, so the same for every region.
- New page `web/app/portfolio/page.tsx` plus an async `portfolio()` in `gate.ts`. Ask Gokul to add the header link.
- **Done when:** the page renders for every region, works at 375px (scrolls inside its own container if wide),
  and each cell links to that vehicle's signals view.

### P2-3: Real AI run (only if an API key is available)
- Run the validated AI path you built in #2, commit the cache, and show before/after for two 7 Series requirements.
  Skip if no key; the reviewed templates stay.

### P2-4: Pitch input
- `docs/pitch/scoring.md`: one slide "How scoring works" (priority vs. confidence, the factors and weights, why the
  model never writes numbers, what Challenge does) and answers to the five formula questions judges are most likely to ask.

## 7. Dependencies

- Gokul places `EvidenceMeter` on the Decision Card (his G4). Tell him the component's props when your PR is up.
- Gokul adds the header link for `/portfolio`.

## 8. Pull request checklist

Before opening a pull request, all of these pass:
`uv run pmw build`, `uv run pmw verify`, `uv run --with pytest pytest -q tests`,
`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `PMW_USE_REMOTE=0 npm run test:e2e`.

The pull request description says: what changed and why, how it was tested (with numbers), any schema change,
and screenshots for UI changes (desktop and 375px). Then **stop and report**. Someone else reviews and merges.
