# Phase 2 brief: Gokul (frontend, demo lead and reviewer) · PMW

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
9. Branch `gokul/<topic>`, **one task per pull request**, plain commit messages without AI tool names or
   co-author lines. **Never push to `main` and never merge your own pull request.**

## 6. Your Phase 2 tasks, in priority order

### G1: Get the workflow page (#7) reviewed and merged
Ask Vishwa or Arjun to review #7. After merging, all four BMW deliverables are covered.

### G2: "You already sell this" banner + Quick wins filter
- Data: `requirement.kind` and `requirement.already_exists` (`EquipmentMatch[]`: `match_type`, `feature`,
  `equipment_name`, `code`, `price_eur`, `source_vehicle`, `feedback_ids`, `note`).
- On the Decision Card, under the photo header: a banner with wording per `match_type`
  (option on this car · inside a package with name, code and price · standard on another BMW · standard but failing),
  linking the comment IDs.
- In the list: a **Quick wins** filter chip next to Act / Validate first / Monitor / Park. Quick wins sit mostly in
  Park, so without the chip the demo's wow moment is hard to find.
- **Done when:** the 5 Series quick win "Offer ventilated front seats outside €2,750 Comfort Paket (7VB)" opens with a
  clear banner, and the chip lists every quick win for the car and region.

### G3: Priority sliders and strategy presets
- Sliders for the five priority factors and presets (Customer first, Premium experience, Quick wins, China focus,
  Europe focus). Factor values per requirement are in `priority_factors` (`value` 0..1, `weight`, `note`).
- Recompute `round(100 × Σ weight·value / Σ weight)` in a new `web/lib/score.ts` (must match `score.py`); re-group
  MoSCoW and recompute quadrants with the thresholds from `getWeights()`.
- Persist the active weights (`settings` key `weights_active`) through a new action in `actions.ts` with an audit event
  (`entity_type = 'weights'`, before/after, reason). Show "Ranking changed by … at …" above the list.
- **Done when:** moving a slider re-ranks the 7 Series live, the change is in `/audit`, and a reload keeps it.

### G4: Place your teammates' components
- Vishwa's `EvidenceMeter` (from `requirements.evidence_mix`) on the Decision Card, near the confidence section.
- Arjun's market conflict cards (`kind = 'market_conflict'`): a clear "Global or market-specific?" block on the card.

### G5: Happiness Meter UI (after Arjun's `happiness(viewer, vehicle)` is merged)
- Show per market the share of customer pain addressed by approved requirements; `null` shows as "unknown",
  never 0% or 100%. It must move when a requirement is approved.

### G6: Logo and live site
- Add the official `web/public/brand/bmw-logo.svg` from the organizers and confirm it may appear on a public prototype.
- After merges: `cd web && vercel env pull .env.local && npm run db:push && vercel deploy --prod` (replaces hosted
  data, including decisions made online).

### G7: Pitch lead
- Deck: problem → our answer → live demo → how scoring works (Vishwa's `docs/pitch/scoring.md`) → data traps
  (Arjun's `docs/pitch/data-traps.md`) → workflow and audit → scalability → team.
- Update the demo script in `PLAN.md` §6 (IDs are hashes now; use titles). Record a backup video on the live site.
- Before presenting: `db:push` for a clean state, open the live link once (cold start), region United States.

## 7. Dependencies

| You need | From | For |
|---|---|---|
| `evidence_mix` + `EvidenceMeter.tsx` | Vishwa P2-1 | G4 |
| `kind = 'market_conflict'` requirements | Arjun P2-1 | G4 |
| `happiness()` in `gate.ts` | Arjun P2-2 | G5 |
| slide notes in `docs/pitch/` | Vishwa P2-4, Arjun P2-5 | G7 |

You are also the reviewer: before merging a teammate's PR, run the checklist below on the combined code
(PR merged with current `main`), check region privacy and confirm the 7 Series demo still works.

## 8. Pull request checklist

Before opening a pull request, all of these pass:
`uv run pmw build`, `uv run pmw verify`, `uv run --with pytest pytest -q tests`,
`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `PMW_USE_REMOTE=0 npm run test:e2e`.

The pull request description says: what changed and why, how it was tested (with numbers), any schema change,
and screenshots for UI changes (desktop and 375px). Then **stop and report**. Someone else reviews and merges.
