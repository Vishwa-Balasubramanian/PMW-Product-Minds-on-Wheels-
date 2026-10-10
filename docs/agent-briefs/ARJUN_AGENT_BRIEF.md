> **Phase 2 is in its own brief: [phase-2/ARJUN.md](phase-2/ARJUN.md).** This file covers Phase 1 (finished).

# Agent brief: Arjun (data and evidence lead) · Product Minds on Wheels

You are working on **Product Minds on Wheels (PMW)**, a hackathon prototype for the BMW challenge
"AI for Product Decision Making" (EHL Grand Finale 2026). Read this whole brief before changing anything.

## 1. What the product does

PMW helps a BMW product manager decide what the next generation of a vehicle should offer customers.
It turns BMW's customer data into requirements a product manager can defend:

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

BMW's judges score: decision and scoring logic, human-in-the-loop workflow, traceability and auditability,
usability and feasibility, innovation and scalability. They value trustworthy sources, a clear understanding
of uncertainty and conflicting evidence, and customer value over engineering specs or pricing.

**Demo vehicle: BMW 7 Series (G70), across all markets.** The 1 Series (F70) and 5 Series (G60) show that
the engine generalises.

## 2. Setup

Repo: https://github.com/Vishwa-Balasubramanian/PMW-Product-Minds-on-Wheels-

```bash
git clone https://github.com/Vishwa-Balasubramanian/PMW-Product-Minds-on-Wheels-.git
cd PMW-Product-Minds-on-Wheels-
brew install poppler            # pdftotext, for the price-list PDFs
cd pipeline && uv sync && uv run pmw build      # ~2 seconds, rebuilds db/pmw.sqlite
cd ../web && npm install && npm run dev         # http://localhost:3000
```

Read `README.md` and `TEAM.md` in the repo first. Never commit keys or `.env` files. The repo is public.
Inspect the database any time with `sqlite3 db/pmw.sqlite`.

## 3. How the code is organised

| Path | What | Owner |
|---|---|---|
| `data/` | BMW files: 3 feedback xlsx, customer studies, sales, 3 German price-list PDFs | shared, read-only |
| `pipeline/pmw/db.py` | SQLite schema. **The contract with the web app.** | everyone, change together |
| `pipeline/pmw/ingest.py` | **reads every raw file, records data issues, parses equipment** | **you** |
| `pipeline/pmw/evidence.py` | **survey mapping, missing voices, market conflicts** | **you** |
| `pipeline/pmw/scope.py` | **scope guard** | **you** |
| `pipeline/pmw/aspects.py` | **photo, part and focal point per requirement** | **you** |
| `pipeline/pmw/signals.py`, `derive.py`, `score.py` | signals, LLM drafting, scoring | Vishwa |
| `pipeline/pmw/cli.py` | orchestrates the steps (`uv run pmw build`) | shared, keep edits small and additive |
| `web/lib/types.ts` | TypeScript mirror of the schema | everyone, change together |
| `web/lib/gate.ts` | every database read in the web app, filtered by region | shared (data functions are fine for you to add) |
| `web/app/**`, `web/components/**` | UI | Gokul |

Facts about the data you will need:
- Feedback: `feedback` (one row per comment) + `feedback_labels` (one row per label). Markets are mapped from
  country codes in `config.country_to_market` (GB, SE, FR… → EU; JP, KR, AU, CA… → ROW).
- G70 comments: US 3,792, ROW 189, EU 19, **China 0**. Sales 2025: EU 13k, US 12k, CN 10k, ROW 7k.
- Customer studies: `survey_scores`. US_2025 = 103 questions, 7-point scale, G60 and G70 only (stored with
  `bottom3` and `top2`). CN_EU_2025 = 35 attributes, means on 1-10 (China G68 = 5 Series long wheelbase).
- Price lists are **Germany only**, July 2026, in German. Symbols: ■ standard, □ optional, –,– no extra cost.
  The current parser in `ingest.ingest_equipment` is best-effort (standard / optional / package_item).
- Already recorded traps (see Data health in the app): broken sales formula `=-D3-C10` (F70 CN 2024),
  multi-row comments, unlabelled comments, no China comments, two empty US survey questions, duplicates.

## 4. Rules (non-negotiable)

1. **No invented facts.** Every number, match or claim must trace to a row in the data (comment ID, survey
   attribute, sales row, price-list line) or a real, citable web source with a URL. If unsure, leave it out.
2. **Numbers come from code**, not from an LLM.
3. **Scope:** customer-facing product requirements only. Never regulatory, engineering-spec or pricing
   requirements. Every exclusion carries a reason a product manager can read.
4. **Missing data is shown as unknown**, never as 0 or 100 (China has no comments).
5. Pipeline steps that create or change evidence write an audit event via `db.audit(...)`.
6. **Schema changes:** edit `pipeline/pmw/db.py` **and** `web/lib/types.ts` in the same PR, say so in the PR
   title, and tell Gokul and Vishwa. Adding tables, columns or JSON fields is fine; never rename or remove.
   The build drops and recreates tables, so new columns apply on the next `uv run pmw build`.
7. Work on branches `arjun/<topic>`, small PRs into `main`, pull `main` every two hours. **Never push to `main`
   directly and never merge your own PR.** Gokul or a teammate reviews and merges.
8. Commit messages: plain and descriptive. No AI tool names, no co-author or attribution lines.
9. Before every PR, both must pass:
   `cd pipeline && uv run pmw build` and `cd web && npx tsc --noEmit && npm run build`.
10. The web app uses **Next.js 16** with `cacheComponents: false`. If you touch web code, read the relevant
    guide in `web/node_modules/next/dist/docs/` first. No SQL in pages or components; add functions to
    `web/lib/gate.ts`. Every function there must respect the viewer's region (see `listRequirements`).

## 5. Your tasks, in priority order

### Task 1: "You already sell this" finder (highest demo value)
Find customer wishes and complaints where **the solution already exists**, on the same car (as an option or
inside a package) or on another BMW (as standard). This is one of the team's signature features.

- Build a DE↔EN glossary for equipment names, e.g. ventilated seats ↔ *Aktive Sitzbelüftung*,
  comfort access / keyless ↔ *Komfortzugang*, multifunction / multi-contour seats ↔ *Multifunktionssitze*,
  heated steering wheel ↔ *Lenkradheizung*, head-up display ↔ *Head-Up Display*, surround view ↔
  *Surround View System*, massage ↔ *Massage*, sun blinds ↔ *Sonnenschutzrollos*, wireless charging ↔
  *Wireless Charging Ablage*, ambient light ↔ *Ambientes Licht*.
- Match "Wants" and complaint comments to equipment rows. New table, for example
  `equipment_matches(vehicle, signal_or_requirement_id, match_type, equipment_name, code, price_eur,
  source_vehicle, feedback_ids JSON, note)` with `match_type` in
  `option_same_vehicle | package_same_vehicle | standard_other_vehicle | standard_but_failing`.
- Surface matches on requirements: add `kind TEXT` (`signal | quick_win | market_conflict`) and
  `already_exists TEXT` (JSON) to `requirements`. Matches that are not one of the top-15 signals become their own
  `quick_win` requirement candidates (low effort: the solution exists).
- **Verified examples to reproduce** (from the data, checked by hand):
  - G60: 7 US comments want ventilated seats (e.g. `G60-0532`) → only inside **Comfort Paket 7VB, €2,750**.
  - G60: Surround View wished for (`G60-0513`) → **Innovationspaket 7EW, €2,400** (Parking Assistant Plus).
  - G60: rear-door comfort access missed (`G60-0739`, `G60-2608`) → **G70 has Komfortzugang as standard**.
  - G60: multi-contour seats missed vs the previous G30 (`G60-0366`, `G60-1310`) → **G60 option 4MA M
    Multifunktionssitze, €1,750**; **G70 has Multifunktionssitze as standard**.
  - G60: wireless charging pad is **standard** yet ~11 owners report it defective → `standard_but_failing`.
  - F70: comfort access exists but only inside optional packages.
- Tell Gokul the final field names; he builds the "You already sell this" banner on the Decision Card.

### Task 2: Equipment parser good enough for Task 1
File: `pipeline/pmw/ingest.py` (`ingest_equipment`).
- Parse per-trim availability (the ■/□ columns), packages with their contents and prices, and SA codes.
- Write a small check that asserts the verified facts above (7VB €2,750 contains Aktive Sitzbelüftung vorn;
  456 Komfortsitze €930; 4MA €1,750; G70 Multifunktionssitze and Komfortzugang standard). Run it in the build.

### Task 3: Market conflict cards
File: `pipeline/pmw/evidence.py` (`build_conflicts` exists).
- In-scope China vs Europe gaps for the 7 Series (CN vs EU means): front interior roominess 7.69 vs 9.69,
  rear interior roominess 7.52 vs 9.41, braking 7.82 vs 9.60, reliability 8.22 vs 9.67, ease of loading
  7.46 vs 8.67, sportiness 8.64 vs 6.97 (China higher). Value for money and overall satisfaction are
  already flagged out of scope.
- Turn the strongest in-scope conflicts into requirement candidates with `kind = 'market_conflict'` and a clear
  PM choice in the text: global requirement or market-specific? Evidence is survey-only (no China comments),
  so confidence must reflect that.

### Task 4: Happiness Meter data
- Add a function to `web/lib/gate.ts`, e.g. `happiness(viewer, vehicle)`, returning per market:
  negative comments in in-scope signals, how many are covered by **approved** requirements, the share, and the
  2025 sales weight. Markets with no comments return `unknown`. Must be computed live (decisions change at runtime).
- Gokul builds the meter UI on top of it.

### Task 5: Better survey coverage and scope rules
- `evidence.TOPIC_TO_SURVEY`: make sure every top-15 signal for each vehicle maps to at least one survey
  attribute where one plausibly exists. List the ones that cannot map, in a comment.
- `scope.py`: apply `text_scope` to comment text so pricing or regulatory comments are flagged even inside an
  in-scope topic. Keep the reasons readable.

### Task 6: Photos per requirement
File: `pipeline/pmw/aspects.py` (photos live in `web/public/cars/<vehicle>/<key>.jpg`, focal points in `PHOTOS`).
- Make sure no top requirement falls back to "Whole vehicle". Add rules for any new themes Vishwa creates.
- Weak spots today: no seat close-up or speaker photo for the 1 Series, so those point at the nearest part.

### Task 7: Web evidence (only if time allows)
- A committed `data/web_sources.csv`: `id, vehicle, topic, claim, url, publisher, published_date,
  accessed_date, kind (competitor | trend | review)`. Real, citable URLs only. Ingest it into a `web_sources`
  table and link sources to requirements. Web evidence is context; it never replaces missing customers.

## 6. How to check your work in the app

- `http://localhost:3000/vehicles/G60` and `/vehicles/G70`: requirement list and Decision Cards.
- `?view=data` (Data health): data issues, missing voices, market conflicts.
- `?view=signals`: every signal with its scope decision.
- Region picker (top right): China must show "thin evidence" and hide US comments.

## 7. When you are done with a task

Work on **one task at a time**. When a task is done: commit on your branch, push it, open a PR with
`gh pr create` (or on github.com), then stop and report back.


Open a PR with: what changed, the verified examples it reproduces (with comment IDs and price-list lines),
any schema change called out in the title, and screenshots of Data health if it changed.

## 8. Phase 2 (from 10 October, evening)

Before starting: `git pull`, `cd pipeline && uv sync && uv run pmw build`, `cd web && npm install`.
Requirement IDs are stable hashes now (e.g. `R-G70-73240d3417`). All web data access is async through `web/lib/gate.ts`.
One task per branch and pull request; never merge your own pull request.

Your Phase 1 work is merged (#1, #4). Phase 2, in priority order:

### P2-1: Market conflict cards (signature feature #5)
- Turn the strongest **in-scope** China vs. Europe gaps from `market_conflicts` into requirements with
  `kind = 'market_conflict'`, e.g. 7 Series front roominess 7.69 vs 9.69, rear roominess 7.52 vs 9.41,
  braking 7.82 vs 9.60. Value for money and overall satisfaction stay out of scope.
- Each card states the gap, both market values and sales weights, and asks the product manager:
  **global requirement or market-specific?** Evidence is survey-only (no China comments), so confidence must show it.
- Give them a photo via `aspects.py`. Keep the 15 core requirements and quick wins unchanged.
- **Done when:** the 7 Series shows 2 to 4 conflict cards with correct numbers, regions see them correctly, all tests pass.

### P2-2: Happiness Meter data (unblocks Gokul)
- Add `happiness(viewer, vehicle)` to `web/lib/gate.ts` (async). Per market: negative comments in in-scope signals,
  how many are covered by **approved** requirements, the share, and the 2025 sales weight.
  Markets without comments return `null` ("unknown"), never 0 or 100.
- It must be computed live, because approvals change at runtime. Add a test.

### P2-3: Survey coverage and text scope
- Every core theme maps to at least one survey attribute where one plausibly exists; list the ones that cannot.
- Apply text-based scope rules to comment text (pricing, regulatory) with readable reasons.

### P2-4: Photos
- Every quick win and conflict card gets a fitting photo and focal point; none falls back to "Whole vehicle".

### P2-5: Pitch input
- `docs/pitch/data-traps.md`: one slide "Traps we found in BMW's data" (broken sales formula, split comments,
  unlabelled comments, no China comments, Germany-only price lists, empty survey questions) and how each was handled.
