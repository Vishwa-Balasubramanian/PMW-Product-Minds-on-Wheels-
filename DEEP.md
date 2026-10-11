# PMW: Deep Architecture Guide

**Product Minds on Wheels (PMW)** turns BMW customer evidence into prioritised, traceable requirements for the next vehicle generation. The product manager (PM) makes every decision, and every step is recorded.

This guide covers the whole system end to end. For every screen it shows what you see, what each number means, which function produces it and which database table it comes from. File references are relative to the repo root (`PMW-Product-Minds-on-Wheels-/`).

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Repository map](#2-repository-map)
3. [Input data (what BMW gave us)](#3-input-data)
4. [The Python pipeline (how the database is built)](#4-the-python-pipeline)
5. [Scoring: every formula](#5-scoring-every-formula)
6. [The database (the contract)](#6-the-database)
7. [The web data layer (`web/lib`)](#7-the-web-data-layer)
8. [Regions instead of logins](#8-regions-instead-of-logins)
9. [Screen by screen](#9-screen-by-screen)
10. [PM decisions and the audit trail](#10-pm-decisions-and-the-audit-trail)
11. [Priority weights and presets](#11-priority-weights-and-presets)
12. [Export](#12-export)
13. [The voice agent](#13-the-voice-agent)
14. [API reference](#14-api-reference)
15. [AI usage: what the model does and doesn't do](#15-ai-usage)
16. [Testing](#16-testing)
17. [Configuration, running and deployment](#17-configuration-running-and-deployment)
18. [Known gaps and gotchas](#18-known-gaps-and-gotchas)

---

## 1. The big picture

```
 data/*.xlsx, *.PDF                     pipeline/ (Python)                  db/pmw.sqlite            web/ (Next.js 16)
 ───────────────────                    ──────────────────                  ─────────────            ─────────────────
 3 feedback workbooks  ─┐               ingest → scope → classify           17 tables                pages (server components)
 customer studies       ├──►  pmw build  → signals → evidence      ──────►  = the contract  ◄──────►  read via lib/gate.ts
 sales volumes          │               → derive → score                    (pipeline/pmw/db.py)     write via lib/actions.ts
 3 option-list PDFs    ─┘               → quick wins → market conflicts                              voice agent (OpenAI Realtime)
                                        → evidence mix                                                       │
                        pipeline/cache/ (validated AI outputs, optional)                                     ▼
                                                                                                    product manager decides
                                                                                                    → audit_events (append-only)
```

**Three layers, one contract**

| Layer | Tech | Job |
|---|---|---|
| Pipeline | Python 3.11+, `uv`, openpyxl, pdfminer, optional Anthropic SDK | Reads the raw BMW files once, builds every signal, requirement and score, then writes SQLite |
| Database | SQLite locally (`db/pmw.sqlite`), Turso when hosted | The schema in `pipeline/pmw/db.py` is the contract between the two sides |
| Web app | Next.js 16 (App Router), React 19, Tailwind 4, `@libsql/client` | Region-filtered reading, PM decisions, audit trail, weights, export, voice |

**Two rules that keep the system honest**

1. **Language comes from AI; numbers come from code.** The model never writes a score, count or price. `ai.validate_prose` rejects any digit, %, € or $ that isn't a cited comment ID.
2. **Priority and confidence are separate.** Priority means "how important"; confidence means "how well proven". High priority with weak evidence lands in **Validate first**, not in **Act**.

---

## 2. Repository map

```
PMW-Product-Minds-on-Wheels-/
├── README.md, PLAN.md, TEAM.md      overview, team plan, who owns which files
├── DEEP.md                          this file
├── data/                            BMW hackathon files (xlsx + PDF); data/raw/ also works (git-ignored)
├── db/pmw.sqlite                    built by the pipeline (git-ignored); test copies live here too
├── docs/                            notes: happiness data, survey/scope, photos, Phase 2, voice agent, pitch/, reports/, agent-briefs/
├── pipeline/
│   ├── pyproject.toml               package pmw-pipeline, CLI entry `pmw`
│   ├── pmw/                         one module per step (see §4)
│   ├── cache/                       validated AI outputs (currently only README + .gitkeep)
│   └── tests/                       unittest suites
└── web/
    ├── app/                         pages + API routes
    │   ├── layout.tsx               shell: Header + main + VoiceAgent
    │   ├── page.tsx                 /            Product Requirements Board (Kanban)
    │   ├── portfolio/page.tsx       /portfolio   Portfolio signals heatmap
    │   ├── workflow/page.tsx        /workflow    How PMW works (live stats)
    │   ├── audit/page.tsx           /audit       Audit trail
    │   ├── vehicles/[code]/page.tsx /vehicles/G70 etc. (Board, Requirements, Decision matrix, Signals, Data health)
    │   └── api/                     export, region, requirements/[id], weights, voice/{session,tools,confirm}
    ├── components/                  Header, RegionPicker, DecisionCard, DecisionActions, ReviewTabs, EvidenceMeter,
    │                                WeightsPanel, AlreadySellBanner, ui.tsx, VoiceAgent, BrandLogo, ScrollToCard
    ├── lib/
    │   ├── db.ts                    SQLite/Turso client + helpers
    │   ├── gate.ts                  EVERY data read, with region filtering and access logging
    │   ├── actions.ts               EVERY PM write, with its audit events
    │   ├── score.ts, moscow.ts      scoring port, presets, MoSCoW bands
    │   ├── regions.ts, types.ts     regions/markets, shared types
    │   ├── export.ts                CSV/JSON rows
    │   └── voice/                   config (prompt + tools), realtime (WebRTC client), server (tool execution), http
    ├── scripts/                     prepare-test-db, push-db, node --test parity checks
    └── tests/                       Playwright e2e (*.spec.ts) + Vitest unit tests (unit/)
```

**Ownership (`TEAM.md`).** Gokul owns `web/app`, `web/components` and the pitch. Vishwa owns AI (`signals.py`, `derive.py`, `score.py`). Arjun owns data (`ingest.py`, `evidence.py`, `scope.py`, `aspects.py`). The shared contract (`pipeline/pmw/db.py` and `web/lib/types.ts`) only changes when all three agree.

---

## 3. Input data

All files are in `data/`. `config.py` uses `data/raw/` instead when it contains `sales_volumes.xlsx`.

| File | What is read | Becomes |
|---|---|---|
| `G70_feedback_hackathon.xlsx`, `G60_…`, `F70_…` | First sheet. Columns: `ID`, `Customer Feedback`, `Source`, `Country`, `Engine Type`, `Vfc level2 Name` (topic), `Vfc level3 Name` (subtopic), `Feedback Type`. One comment can span several rows, one row per label. | `feedback` (10,128 comments), `feedback_labels` |
| `F70_G60_G68_G70_customer_studies.xlsx` | Sheet `CN_EU_2025`: attribute means, 1–10 scale, fixed column map (G68 stands in for the China 5 Series). Sheet `US_2025`: 7-point answer counts, from which mean, bottom-3 share and top-2 share are computed. | `survey_scores` |
| `sales_volumes.xlsx` | One sheet per vehicle; columns `volume_2024`, `volume_2025`, `volume_2030` per market. Broken formulas (`=…`) are stored as 0 and logged. | `sales` |
| `G70_OptionList.PDF`, `G60_…`, `F70_…` | German price lists (July 2026), parsed by x/y position with pdfminer: name, SA code, ■ standard / □ optional marks, price, package context. | `equipment` |

**How the raw data is cleaned** (`pipeline/pmw/ingest.py`)

- **Market** comes from `country_to_market`: US→US, CN→CN, 26 European codes (including GB, CH, NO)→EU, anything else→ROW.
- **Source**: A = Owner review, B = Dealer note, C = Quality survey, D = Open survey answer.
- **Severity** is only available for Source C. It comes from the regex "I had a (very minor|minor|serious|very serious) problem"; if no qualifier matches, the comment is "moderate".
- **Competitors**: 12 brand regexes (Mercedes, Audi, Tesla, Lexus, Porsche, …).
- **Every data problem goes into `data_issues`** with a severity and a note on how it was handled. Examples: comments split across rows, comments with no topic label, duplicate texts, *no comments from China* (critical), CN/EU surveys with means only and no sample sizes, US survey questions with no answers, broken sales formulas, and price lists that cover Germany only.
- **Equipment parsing is checked against six hand-verified facts**, e.g. G60 7VB costs €2,750. If any fails, the build stops (`validate_equipment_facts`).

**Facts about the data that shape the product**

- There are **no comments from China**, even though China is about 25% of sales.
- US comments make up about 73% of all comments.
- There are **no dates**, so the recency factor is always 0.5.

---

## 4. The Python pipeline

Entry point: `pipeline/pmw/cli.py` → `pmw` command.

| Command | What it does |
|---|---|
| `uv run pmw build --offline` | Full rebuild. **Drops and recreates all 17 tables, including PM decisions.** Reads AI outputs from the cache only and never touches the network. |
| `uv run pmw build --llm` | Same, but can call the Anthropic API (needs `ANTHROPIC_API_KEY` and the `llm` extra). |
| `uv run pmw build --top N` | Number of signal requirements per vehicle (default 15). |
| `uv run pmw verify [--report file.json]` | Integrity, citation and scoring checks; exits with code 1 on failure. |
| `uv run pmw evidence-mix` | Recomputes only the evidence-mix columns and keeps decisions. |

### Build order (`cli.build`)

```
1. db.connect() + db.reset()             create schema (WAL), drop + recreate every table
2. settings: weights, factor_labels       defaults from score.py
3. ingest.run()
     ingest_vehicles → ingest_feedback ×3 → scope.apply_text_scope → ingest_studies
     → ingest_sales → ingest_equipment ×3 → validate_equipment_facts
4. for vehicle in F70, G60, G70:
     signals.classify_unlabelled      label comments BMW left unlabelled (AI cache or rules)
     signals.build                    group comments into signals (themes)
     evidence.record_survey_coverage  log topics with no survey question
     evidence.build_representation    comment share vs sales share per market
     evidence.build_conflicts         China vs Europe survey gaps ≥ 0.8
     evidence.build_equipment_matches "you already sell this" matching
     build_requirements               top-N signals → requirement ladder + scores + challenge
       └── build_quick_wins           up to 5 equipment quick wins
     market_requirements.build        up to 3 China/Europe survey-conflict requirements
5. evidence_mix.refresh()             evidence/assumption composition, global + per market
```

### What each module does

| Module | Purpose | Writes |
|---|---|---|
| `config.py` | Paths, `PMW_DB`, `PMW_MODEL`, vehicles, markets, source and powertrain names | — |
| `db.py` | Schema (the contract), `connect`, `reset`, `audit()`, `issue()` | all tables |
| `ingest.py` | Reads all input files (§3) | `vehicles`, `feedback`, `feedback_labels`, `survey_scores`, `sales`, `equipment`, `data_issues` |
| `scope.py` | **Scope guard.** Excludes four topics (MSA start-stop, general enquiry, owner's manual, body equipment overall), survey attributes about price, warranty, brand image or environment, and text clauses about emissions, financing or horsepower. Every exclusion has a reason. | `feedback_scope`, `signals.in_scope`, `survey_scores.in_scope` |
| `classify.py` | Labels unlabelled comments. Offline: 34 lexical topic rules plus sentiment rules (`lexical-v1`). With AI: batches of 40, validated (known IDs only, evidence span must appear in the text). | `feedback_labels` (`label_source` = `rule` or `ai`) |
| `themes.py` | Merges related BMW topics into themes, e.g. "Climate control" (3 topics) or "Connected services and phone integration" (5 topics) | — |
| `signals.py` | One signal per theme: comment counts, negatives (Difficult to Use, Defect, Wants), likes, severity, dominant subtopic, market and source split, competitor mentions | `signals`, `signal_evidence` (display sample: 40 supporting + 10 contradicting), `signal_feedback` (full negative membership) |
| `evidence.py` | Survey mapping (about 45 topic → survey attribute rules, 10 deliberate gaps), representation, CN/EU conflicts, equipment matching against a 10-feature glossary | `representation`, `market_conflicts`, `equipment_matches`, `data_issues` |
| `aspects.py` | Maps a topic to aspect, part and photo with a focal point (30 ordered rules) | requirement photo fields |
| `derive.py` | The requirement ladder: title, root cause, customer need, requirement, future lens, assumptions, uncertainties. Validated strictly, e.g. the requirement must mention "successor" and the root cause must be framed as a hypothesis with a citation. | requirement text |
| `drafts.py` | Offline templates: 34 regex profiles plus a generic one (`evidence-template:v2`) | requirement text |
| `ai.py` | Anthropic calls, prose validation and the hash-keyed cache | `pipeline/cache/*.json` |
| `score.py` | Priority, confidence, quadrant, sensitivity and challenge penalties (§5) | requirement scores |
| `challenge.py` | Challenge narrative: AI-written (at most 3 sentences, no numbers) or rule-based | `requirements.challenge.narrative` |
| `market_requirements.py` | Survey-only requirements for the top 3 China/Europe conflicts (G60, G70) | `requirements` (`kind = market_conflict`) |
| `evidence_mix.py` | Share of observed comments, survey measures, inference and assumptions | `requirements.evidence_mix`, `evidence_mix_by_market` |
| `verify.py` | Post-build checks (see below) | JSON report |

### Requirement kinds

| Kind | ID pattern | Source | Notes |
|---|---|---|---|
| `signal` | `R-<veh>-<hash10>` | Top-N in-scope signals by negative count | Full ladder, AI or template prose |
| `quick_win` | `R-<veh>-Q<hash10>` | Equipment matches: the feature exists (as an option, inside a package, or standard on another model) and customers ask for it | Top 5 per vehicle by distinct wishing comment IDs. The title names the feature and its code. |
| `market_conflict` | `R-<veh>-M<hash10>` | China vs Europe survey gap ≥ 0.8 | Top 3 per vehicle. No customer comments; confidence is limited by design. |

### `verify.py` checks

- Exactly N signal requirements and at most 5 quick wins per vehicle.
- Stored evidence mixes equal a fresh recomputation.
- Quick wins name a glossary feature and code, and every cited comment is a "Wants" comment on an allowed topic.
- Market conflicts match the source survey means.
- Signal prose passes `derive.validate` and cites only that signal's comments.
- Priority and confidence equal the weighted factors, and a challenged requirement shows its revised confidence.
- Quadrants are consistent, `PRAGMA integrity_check` passes, signal membership counts match, and no text-excluded comment is used as evidence.

---

## 5. Scoring: every formula

All scores come from `pipeline/pmw/score.py`, with a parity port in `web/lib/score.ts`. The core formula:

```
score = round( 100 × Σ(value_i × weight_i) / Σ(weight_i) )      (Python rounding: exact halves go to even)
```

### Default weights and thresholds (stored in `settings.weights`)

| Priority factor | Weight | Value (0–1) |
|---|---|---|
| **impact** | 0.35 | `0.6 × negative/comments + 0.4 × severity` |
| **frequency** | 0.25 | `ln(1 + negatives) / ln(1 + max negatives of the vehicle)` |
| **market** | 0.20 | Sum of **2030** sales shares of markets with ≥3 comments, plus markets with a survey gap ≥ 0.3 |
| **competitive** | 0.05 | `min(1, competitor mentions / max(6, 0.15 × comments))` |
| **future** | 0.15 | 0.70 if the topic matches a future keyword (connected, app, charging, navigation, assistance, touchscreen, …), otherwise 0.45 |

| Confidence factor | Weight | Value (0–1) |
|---|---|---|
| **quantity** | 0.25 | `min(1, log10(n + 1) / 2)`: 100 comments gives full marks |
| **sources** | 0.25 | `(effective number of sources + 1 if survey) / 4`, where effective = 1 / Σ share² |
| **representation** | 0.20 | Σ min(comment share, 2025 sales share) + 0.3 × sales share of survey-only markets |
| **agreement** | 0.20 | With survey: `0.4 + 0.6 × share of survey rows with gap ≥ 0.3`; without survey: 0.5; then minus `0.5 × likes/n` |
| **recency** | 0.10 | Always 0.5 (the data has no dates) |

**Signal severity** is `0.75 × mean severity score (very minor 0.2 … very serious 1.0, default 0.5) + 0.25 × defect share`.

**Survey gap:** on the 7-point US scale, `bottom3 / 0.25`; on the 10-point CN/EU scale, `(9 − mean) / 2`; both capped at 0–1.

### Quadrant (thresholds: priority 55, confidence 58)

```
                     confidence ≥ 58        confidence < 58
priority ≥ 55        ACT                    VALIDATE FIRST
priority < 55        MONITOR                PARK
```

### MoSCoW (web only, `web/lib/moscow.ts`, based on priority)

| Band | Priority | Hint |
|---|---|---|
| Must have | ≥ 65 | Must shape the next generation |
| Should have | ≥ 55 | Strong case, plan for it |
| Could have | ≥ 45 | Include if it fits |
| Won't have this time | < 45 | Revisit for a later update |

### Challenge (red-team check)

The pipeline precomputes the issues. Clicking **Challenge** in the app applies them: `revised confidence = max(0, confidence − Σ penalties)`.

| Penalty | Condition |
|---|---|
| −8 | One market supplies ≥ 70% of the comments |
| −6 | Per market with ≥ 15% of 2025 sales and zero comments |
| −8 | Fewer than 30 comments |
| −6 | Likes make up ≥ 20% of the comments |
| −8 | A survey exists but every row has gap < 0.2 |
| −4 | No survey at all |
| −4 | One source supplies ≥ 80% of the comments |

**Sensitivity:** each priority weight is multiplied by 0.8 and then by 1.2, one at a time. If the resulting priority range crosses 55, the requirement is "borderline".

### Evidence mix (`evidence_mix.py`, `evidence-mix:v1`)

| Part | Units |
|---|---|
| Observed comments | `4 × min(comments, 30) / 30` |
| Survey measures | `min(distinct survey measures, 4)` |
| Inference | `2 + (1 if themes were merged) + share of rule- or AI-labelled comments` |
| Assumptions | `1 + (1 if quick win)` |

The units are normalised to shares that sum exactly to 1 (largest-remainder rounding). The mix is computed globally (`evidence_mix`) and per market (`evidence_mix_by_market`); regional viewers see their own market's mix.

### Missing voices (web, `gate.missingVoices`)

The banner shows when the market with the largest comment share exceeds its sales share by ≥ 25 percentage points. It also names markets with ≥ 15% of sales and no comments. Example: *"95% of customer comments come from United States, which buys 29% of these cars. China (24% of sales) has no comments at all."*

---

## 6. The database

There are 17 tables, all defined in `pipeline/pmw/db.py`. No foreign keys are declared; all links are logical. JSON columns are stored as TEXT.

| Table | One row per | Key columns |
|---|---|---|
| `vehicles` | Vehicle program (F70, G60, G70) | code, name, short, image |
| `feedback` | Customer comment | id (`G70-0001`), vehicle, source, country, **market**, powertrain, text, severity, competitors, classified |
| `feedback_labels` | Label on a comment (many per comment) | feedback_id, feedback_type (Likes / Difficult to Use / Defect / Wants), topic, subtopic, **label_source** (bmw / ai / rule) |
| `feedback_scope` | Text exclusion | feedback_id, in_scope, reason |
| `survey_scores` | Survey measure | vehicle, variant, market, study (US_2025 / CN_EU_2025), attribute, mean, scale (7 or 10), bottom3, top2, in_scope |
| `sales` | Market × year volume | vehicle, market, year (2024 / 2025 / 2030), volume |
| `equipment` | Price-list row | vehicle, name, code, price_eur, availability (standard / optional / package_item), package |
| `equipment_matches` | Feature matched to customer wishes | feature, match_type (option_same_vehicle / package_same_vehicle / standard_other_vehicle / standard_but_failing), code, price, feedback_ids (JSON) |
| `data_issues` | Data problem found | dataset, vehicle, severity (info / warning / critical), description, handling |
| `representation` | Market per vehicle | feedback_n, feedback_share, sales_2025, sales_share, sales_2030 |
| `market_conflicts` | CN vs EU survey gap ≥ 0.8 | attribute, cn, eu, delta, in_scope |
| `signals` | Theme per vehicle | topic, n_comments, n_negative, n_likes, n_hard_to_use, n_defect, n_wants, dominant_issue, severity, by_market (JSON), by_source (JSON), in_scope, scope_reason |
| `signal_evidence` | Display-sample quote | signal_id, feedback_id, role (supports / contradicts) |
| `signal_feedback` | Full negative membership | signal_id, feedback_id |
| `requirements` | Requirement | see below |
| `audit_events` | Event (**append-only**) | ts, actor_type (ai / pm / system), actor, region, entity_type, entity_id, action, field, before, after, rationale |
| `settings` | Key/value JSON | weights, factor_labels, weights_active, evidence_mix_rule, voice_briefing:*, voice_decision:* |

### `requirements` columns

| Group | Columns |
|---|---|
| Identity | `id`, `vehicle`, `signal_id`, `kind` (signal / quick_win / market_conflict) |
| Ladder | `title`, `customer_voice`, `signal_text`, `root_cause`, `customer_need`, `requirement` |
| Photo | `aspect`, `part`, `photo`, `focal_x`, `focal_y` |
| Evidence (JSON) | `markets`, `already_exists`, `survey`, `conflicts`, `assumptions`, `uncertainties`, `contradictions`, `evidence_mix`, `evidence_mix_by_market` |
| Scores | `priority`, `priority_factors` (JSON `{value, weight, note}` per factor), `confidence`, `confidence_factors`, `quadrant`, `challenge` (JSON issues, revised confidence, sensitivity, narrative), `challenged` |
| Lifecycle | `status` (proposed / edited / validate / approved / rejected), `future_lens`, `generated_by`, `created_at`, `updated_at` |

### Settings keys

| Key | Written by | Used for |
|---|---|---|
| `weights` | pipeline build | Default priority and confidence weights and thresholds |
| `factor_labels` | pipeline build | Human-readable factor names |
| `weights_active` | `actions.setWeights` (deleted by reset) | Team-wide override of priority weights |
| `evidence_mix_rule` | `evidence_mix.py` | Documents the mix version |
| `voice_briefing:<REGION>` | voice `daily_briefing` | Timestamp of the last briefing, so "new since last time" works |
| `voice_decision:<uuid>` | voice `request_decision` | Pending voice proposal: single-use, expires after 5 minutes, bound to the browser and region |

---

## 7. The web data layer

**The rule:** pages contain no SQL. Every read goes through `web/lib/gate.ts`, and every PM write goes through `web/lib/actions.ts`.

### `db.ts`: which database?

```ts
TURSO_DATABASE_URL set  AND  (VERCEL set  OR  PMW_USE_REMOTE=1)   →  Turso (hosted)
otherwise                                                         →  file: PMW_DB  or  ../db/pmw.sqlite
```

- The client is a singleton on `globalThis.__pmwDb`.
- Helpers: `all()`, `one()`, `writeBatch()` (one atomic batch, so a change and its audit row land together), `parse()` and `nowIso()` (matches the pipeline's timestamp format).

### `gate.ts`: every read

| Function | Reads | Region rule | Used by |
|---|---|---|---|
| `getViewer()` | cookie `pmw_region` | Defaults to US | everything |
| `listVehicles(viewer)` | vehicles, feedback, sales, requirements | Counts only the viewer's markets | Home, voice |
| `getVehicle(code)` | vehicles | — | Vehicle page, export, voice |
| `listRequirements(viewer, vehicle)` | requirements | Keeps requirements whose `markets` overlap the viewer's. For non-ALL viewers it hides `customer_voice`, swaps in the market mix, strips contradiction examples and hides equipment comment IDs from other markets. Re-scores when weights are active. | Vehicle page, export, voice |
| `getRequirement(viewer, id)` | requirements, signal_evidence + feedback (quotes) | Visible quotes only, plus counts of hidden quotes per market. **Writes a "viewed evidence" audit row** (at most once per 10 minutes per requirement and region). | Requirement detail, voice |
| `auditFor` / `auditLog` | audit_events | Redacts comment IDs from other markets; hides other regions' voice events | Activity tab, /audit, voice |
| `portfolio()` | signals (aggregated) | **Global**, counts only | /portfolio, voice |
| `listSignals(vehicle)` | signals + requirements | Global | Signals view, voice |
| `representation`, `missingVoices`, `marketConflicts`, `dataIssues`, `vehicleTotals` | the matching tables | Global, aggregates | Vehicle page header, Data health |
| `happiness(viewer, vehicle)` | signal_feedback + requirements | Viewer's markets: share of negative comments covered by approved requirements | Voice (`summarize_feedback`) |
| `getWeights`, `getActiveWeights`, `getFactorLabels` | settings | — | Scoring and weights UI |
| `exportBundle`, `logExport` | requirements, quotes, last PM decision | Region-filtered; the export is audited | /api/export |
| `voiceBriefing` | listVehicles + listRequirements + missingVoices | Viewer's region | Voice |
| `workflowStats` | Counts across all tables | Global | /workflow |

### `actions.ts`: every write

See [§10](#10-pm-decisions-and-the-audit-trail) for decisions and [§11](#11-priority-weights-and-presets) for weights.

---

## 8. Regions instead of logins

There is no login. The **region picker** (top right) sets the cookie `pmw_region`; in production this would come from BMW single sign-on.

| Region | Who | Sees |
|---|---|---|
| United States, Europe, China, Rest of World | Market product manager | Raw customer comments from **their own market only**. Summary scores for every market. |
| All markets | Head of product | Everything |

**What is region-filtered:**
- Home counts, the requirement list and detail, quotes, evidence mix, equipment comment IDs, exports, audit redaction and voice answers.
- Hidden material is always counted openly, e.g. "12 comments from Europe restricted to that market's product managers…".
- Opening evidence is logged.

**What is identical for every region:** aggregates only. That covers `/portfolio`, `/workflow`, Signals, Data health and the vehicle-page figure "comments analysed (all markets)".

**Decisions are region-checked:** a PM can only decide on requirements that have evidence in their region (`applyAction`).

---

## 9. Screen by screen

### 9.0 The shell (`app/layout.tsx`, `components/Header.tsx`)

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ PMW           │ ☰  Workspace / BMW 7 Series                  📍 Your region ▾ │  ← topbar (56px)
│ Product Minds │──────────────────────────────────────────────────────────────│
│ on Wheels     │                                                              │
│               │                                                              │
│ WORKSPACE     │                    page content (scrolls)                    │
│  Portfolio    │                                                              │
│  Portfolio    │                                                              │
│   signals     │                                                              │
│ VEHICLE PROG. │                                                              │
│  7 Series G70 │                                                              │
│  5 Series G60 │                              🎤                              │  ← voice mic (bottom centre)
│  1 Series F70 │                                                              │
│ GOVERNANCE    │                                                              │
│  Workflow     │                                                              │
│  Audit trail  │                                                              │
│ [BMW] Evidence│                                                              │
│ → decisions   │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
  sidebar 224px (on screens ≤1023px it becomes a ☰ drawer)
```

- **Every page** is an async server component with `dynamic = "force-dynamic"`, so it reads fresh data on every request.
- **Topbar title:** "BMW 7 Series", "Audit trail", "Workflow", "Portfolio signals" or "Portfolio", depending on the URL.
- **Region picker** (`RegionPicker.tsx`): a dialog "Choose your region" listing five regions with their roles. Clicking **Apply** sends `POST /api/region`, sets the cookie, then refreshes the page.
- **VoiceAgent** is mounted once, keyed by region; see [§13](#13-the-voice-agent).
- **Design:** BMW blue `#1C69D4`, ink `#202B3C`, background mist `#F4F6F9`. The font is BMW Type Next if installed, otherwise self-hosted Inter. Quadrant colours: Act green, Validate first amber, Monitor blue, Park grey.

---

### 9.1 Home: Product Requirements Board (`/`, `app/page.tsx` → `components/BoardWorkspace.tsx`)

The home page is a Kanban board across every vehicle program you can access. The same `BoardWorkspace` is the default **Board** tab on each vehicle page, where it is fixed to that vehicle.

```
Product Requirements Board
What needs your attention, what evidence supports it, and what to decide. AI proposes; you decide.

┌ Awaiting Review ┐ ┌ Needs Validation ┐ ┌ Approved ┐ ┌ Total Requirements ┐
│ {n}             │ │ {n}              │ │ {n}      │ │ {n}                │
└─────────────────┘ └──────────────────┘ └──────────┘ └────────────────────┘
[Vehicle ▾] [Priority ▾] [Evidence confidence ▾] [AI recommendation ▾] [Sort ▾] [Search……]   [Board|List]

To Review {n}       Needs Validation {n}   Edited / Re-review {n}   Approved {n}   Rejected {n}
┌──────────────────┐
│ Title         ⋯  │  ← ⋯ = keyboard "Move to…" menu; the card itself is draggable
│ R-G70-… · BMW 7… │
│ Priority 72/100  Confidence 64/100
│ AI recommendation: Act
│ 137 customer comments
│ [Weak evidence] [Market underrepresented] [Challenged] [Quick win]
│ View evidence →  │
└──────────────────┘
```

| Element | Meaning | Source |
|---|---|---|
| KPI: Awaiting Review | status `proposed` + `edited` | `boardCards(viewer, vehicles)` (reuses `listRequirements`), filtered by vehicle and region only |
| KPI: Needs Validation / Approved | status `validate` / `approved` | same |
| KPI: Total Requirements | All requirements you can access in the chosen vehicle scope | same |
| Columns | One per `requirements.status`: To Review (`proposed`), Needs Validation (`validate`), Edited / Re-review (`edited`), Approved, Rejected. Every card is in exactly one column. | `lib/board.ts` `COLUMNS` |
| Card scores | Priority and confidence (re-scored when team weights are active) | `requirements.priority`, `confidence` |
| AI recommendation | The quadrant: a label and filter, never a column | `requirements.quadrant` |
| Customer comments | Comments in **your** markets: from `signals.by_market` for signal requirements, from visible match IDs for quick wins; "Survey evidence only" for market conflicts | `boardCards` |
| Weak evidence | Confidence below the quadrant threshold (58) | `settings.weights.thresholds` |
| Market underrepresented | The pipeline's red-team findings about market share ("No comments from CN…", "95% of the comments come from US") | `requirements.challenge.issues` |
| Vehicle filter notes | "(not sold in …)" / "(no comments in …)", plus a notice when such a vehicle is chosen | `vehicleNames(viewer)` (sales and feedback in your markets) |

**Filters (URL parameters):** `vehicle` (home only), `priority` = must / should / could / wont (MoSCoW), `conf` = high (≥ 70) / medium (58–69) / low (< 58), `rec` = act / validate / monitor / park / quick, `search` (title or ID), `sort` = priority / confidence / comments / updated, and `layout=list` for a compact table. All filtering runs on the server (`applyFilters` in `lib/board.ts`).

**Drawer (`?open=<id>&tab=…`).** Clicking a card opens `RequirementDrawer` on the right, with no page change. It is server-rendered with the existing `EvidenceMeter` and `DecisionCard`, so it has the same actions, tabs, evidence restrictions and access logging as the list view. The `DecisionCard` header now also explains the recommendation ("Act: priority 81 ≥ 55 and confidence 72 ≥ 58…"), and the Evidence tab shows missing market representation. Escape, the × or the backdrop closes it.

**Moving cards** (`moveFor` in `lib/board.ts`). Drag a card, or use ⋯ → "Move to…". Every move maps onto an existing action and is sent to `POST /api/requirements/{id}`. The board only changes after the server confirms (`router.refresh()`), and every move is audited by `applyAction`.

| From → To | Result |
|---|---|
| open → Approved | Confirmation dialog (optional note) → `approve` |
| open → Rejected | Dialog, **reason required** → `reject` |
| open → Needs Validation | Dialog, **reason required** → `validate` |
| any → Edited / Re-review | Opens the drawer; the status changes only by actually editing the text (`edit`) |
| Approved / Rejected → To Review | Confirmation → `reopen` |
| Approved ↔ Rejected, decided → anything else | Blocked with a hint to reopen first |
| Needs Validation / Edited → To Review | Blocked; no backend action exists for it |

---

### 9.2 Vehicle workspace (`/vehicles/[code]`, `app/vehicles/[code]/page.tsx`)

**URL parameters**

| Parameter | Values | Effect |
|---|---|---|
| `view` | `board` (default), `inbox` (ranked list with priority weights; also chosen when `req` or `q` is present), `matrix`, `signals`, `data` | Which tab is shown |
| `q` | `act`, `validate`, `monitor`, `park`, `quick` | Filters the ranked list (board filters: see §9.1) |
| `req` | Requirement ID | Selected requirement; falls back to the first one in the list |
| `tab` | `overview`, `evidence`, `scoring`, `activity` | Detail tab (read on the client) |

**Header block (every view)**

```
[wide car photo]  BMW 7 Series
                  G70 · Requirements for the successor generation          [Export ▾ CSV | JSON]
                  {n} requirements in your region · {n} awaiting decision · 4,000 comments analysed (all markets)
⚠ Missing voices. 95% of customer comments come from United States, which buys 29% … Confidence is lowered accordingly.
[ Board | Requirements | Decision matrix | Signals | Data health ]
```

- **Data loaded:** `getVehicle`, `listRequirements`, `getWeights`, `missingVoices`, `vehicleTotals`, `getFactorLabels`, `getActiveWeights`, `storedOrder`, all in parallel.
- "comments analysed (all markets)" comes from `vehicleTotals` and is **not** region-filtered.
- The missing-voices sentence comes from `missingVoices(code)`, which reads `representation`.

#### View: Board (default)

The Kanban board from §9.1, fixed to this vehicle.

#### View: Requirements (`?view=inbox`), ranked list with priority weights

```
▸ PRIORITY WEIGHTS  Default weights · change what drives the ranking          (WeightsPanel, §11)

┌ list (420px) ───────────────────────┐ ┌ detail ─────────────────────────────────────────┐
│ All {n} | Act {n} | Validate first {n}│ │ Evidence & assumptions · United States          │
│ Monitor {n} | Park {n} | Quick wins {n}│ │ [■■■■■■■■ observed ■■ survey ■ inference ■]     │
│ Ranked by priority · MoSCoW         │ │                                                 │
│ MUST HAVE (6)                       │ │ R-G70-… · Rank 1 of {n} · Cockpit · Display      │
│  Everyday controls without menu  72 │ │ Everyday controls without menu hunting   [photo]│
│  R-G70-… [Act] [Needs decision]     │ │ [Must have] [Act] [Needs decision]  P 72 / C 64 │
│ SHOULD HAVE (…)                     │ │ [Approve][Validate first][Edit][Reject][Challenge]│ ← sticky
│ COULD HAVE …                        │ │ [ Overview | Evidence | Scoring | Activity ]    │
│ WON'T HAVE THIS TIME …              │ │ …tab content…                                   │
└─────────────────────────────────────┘ └─────────────────────────────────────────────────┘
```

**Left list**

| Element | Source |
|---|---|
| Filter chips with counts | `quadrant` and `kind = quick_win` of `listRequirements` |
| "Ranking: {preset} · changed by …" note | Shown only when `settings.weights_active` exists |
| MoSCoW groups | `moscowFor(priority)` |
| Row: title, priority, ID, quadrant badge, quick-win badge, status badge | `requirements` columns (re-scored when weights are active) |

**Right detail** (`getRequirement(viewer, id)` + `auditFor(viewer, id)`)

1. **EvidenceMeter** (`EvidenceMeter.tsx`): a stacked bar of Observed comments / Survey measures / Inference / Assumptions from `evidence_mix` (or the regional mix). It includes a "How this mix is calculated" explainer.
2. **DecisionCard** header: ID, "Rank i of n", aspect and part, title, photo cropped at the focal point, MoSCoW / quadrant / status badges, priority and confidence, draft provenance (`generated_by` → "Evidence-based draft · needs validation", "AI draft · needs validation", "Price-list match · needs validation", …) and "Evidence from {markets}".
3. **DecisionActions** (sticky): Approve / Validate first / Edit / Reject / Challenge, or only Reopen once a requirement is decided. See §10.
4. **Challenge result** (after a challenge): the narrative, issues with their penalties, "Confidence moved from X to Y, so this requirement now sits in {quadrant}", and the sensitivity range.
5. **ReviewTabs** (`ReviewTabs.tsx`, keyboard-accessible ARIA tabs):

| Tab | Contents | Source |
|---|---|---|
| **Overview** | **"You already sell this"** banner (`AlreadySellBanner.tsx`): the feature, code, price and package, or "standard on the {other model}", with links to the wishing comments. **Ladder:** Customer voice → Signal → Root cause → Customer need → Requirement. Assumptions, uncertainties and contradictions as tagged items. | `already_exists`, `customer_voice`, `signal_text`, `root_cause`, `customer_need`, `requirement`, `assumptions`, `uncertainties`, `contradictions` |
| **Evidence** | Customer evidence: up to 8 supporting quotes and 3 "Customers who disagree", each with ID, source, market, country, powertrain and severity. A dashed box counts restricted comments. Survey evidence: US bottom-3 % or CN/EU mean out of 10. "Markets disagree" box for conflicts. | `signal_evidence ⨝ feedback` (quick wins: `feedback` by matched IDs), `survey`, `conflicts` |
| **Scoring** | Priority and confidence numbers, factor bars (value, weight, note per factor) and the matrix with this requirement highlighted | `priority_factors`, `confidence_factors` |
| **Activity** | Audit timeline: time, actor, action, before → after, rationale | `auditFor(viewer, id)` |

Clicking a comment ID in the "You already sell this" banner switches to the Evidence tab and scrolls to that quote.

#### View: Decision matrix (`?view=matrix`)

```
Priority against confidence                       Click a dot to open the requirement
   Confidence ↑
 100 ┤  Monitor           │  Act
     │        •           │     •  •
  58 ┼────────────────────┼───────────────
     │  Park   • •        │  Validate first
   0 ┼────────────────────┴──────────→ Priority
     0                   55          100
[Act {n} · High priority, strong evidence] [Validate first {n} …] [Monitor {n} …] [Park {n} …]
Thresholds: priority 55, confidence 58.
```

- An SVG scatter (`Matrix` in `ui.tsx`) of all requirements visible to you. x = priority, y = confidence.
- Each dot links to `?req=<id>`.

#### View: Signals (`?view=signals`)

A table built by `listSignals(code)` from `signals ⟕ requirements`, sorted by negative count:

| Topic | Comments | Negative | Praise | Main issue | Markets | Outcome |
|---|---|---|---|---|---|---|
| theme | `n_comments` | `n_negative` | `n_likes` | `dominant_issue` | `by_market` ("US 12 · EU 3") | link to the requirement, "Out of scope: reason", or "Below the cut" |

The title line reads "{n} signals · {x} excluded by the scope guard · {y} comments still unlabelled". It is global, not region-filtered.

#### View: Data health (`?view=data`)

| Section | Shows | Source |
|---|---|---|
| Missing voices | Per market: comment share bar vs 2025 sales share bar, with counts | `representation` |
| Market conflicts | China vs Europe attributes with a gap ≥ 0.8, in or out of scope | `market_conflicts` |
| Data issues found and how they were handled | Severity pill, description, handling | `data_issues` (this vehicle plus global issues) |

---

### 9.3 Portfolio signals (`/portfolio`, `app/portfolio/page.tsx`)

```
CROSS-PROGRAM INTELLIGENCE
Portfolio signals                                           Back to portfolio overview →
[Vehicle programs 3] [Customer themes N] [Recurring issues M]

Negative share by theme
              1 Series F70      5 Series G60      7 Series G70
Climate…      {x}%  {neg}/{all}   {x}%  …          —
Recurring
```

- **Data:** `portfolio()`. It runs `SUM(n_comments)` and `SUM(n_negative)` over `signals WHERE in_scope=1`, grouped by vehicle and theme.
- **Cell value:** negative ÷ comments, coloured in BMW-blue bands. Each cell links to `/vehicles/{code}?view=signals`.
- **Recurring:** at least one concern in two or more programs.
- Aggregate counts only, so the page is identical for every region.

---

### 9.4 Workflow (`/workflow`, `app/workflow/page.tsx`)

The page explains how PMW works, using live numbers from `workflowStats()`, which counts across all tables.

| Step | Owner chip | Live stats |
|---|---|---|
| 1 Ingest | Code · automatic | comments, survey measures, price-list rows, data problems |
| 2 Label and group | AI · drafts only | comments newly labelled, signals |
| 3 Cross-check | Code | China vs Europe conflicts, equipment matches |
| 4 Scope guard | Code | signals excluded |
| 5 Draft requirement | AI · drafts only | requirements (incl. quick wins), split by draft source |
| 6 Score | Code | count per quadrant |
| 7 The product manager decides | Product manager · mandatory | decided / awaiting; button "Open the 7 Series" |
| 8 Record | System | audit events / of which by PMs; button "Open the audit trail" |

The three principle cards are "The AI drafts. It never decides.", "Numbers come from code." and "Every step is recorded."

---

### 9.5 Audit trail (`/audit`, `app/audit/page.tsx`)

- **Filters** are URL links: `?vehicle=G70|G60|F70` and `?who=pm|ai|system`.
- **Data:** `auditLog(viewer, {vehicle, limit: 600})`, newest first, then redaction. Comment IDs from other markets become "[comment from Europe]", and other regions' voice events are hidden.
- **Timeline:** each row shows the time, a coloured dot (AI blue, PM amber, system grey), actor and action, before → after, and the rationale.
- "Nothing here can be edited or deleted from the app": no code path updates or deletes `audit_events`.

---

## 10. PM decisions and the audit trail

**Flow:** `DecisionActions.tsx` (client) → `POST /api/requirements/{id}` → `applyAction()` (`lib/actions.ts`) → one atomic `writeBatch` that contains the change and its audit rows.

| Button | Reason required? | Database change | Audit action |
|---|---|---|---|
| Approve | optional note | status → `approved` | "approved requirement" |
| Reject | **yes** | status → `rejected` | "rejected requirement" |
| Validate first | **yes** ("What needs validating?") | status → `validate` | "requested validation before deciding" |
| Edit | **yes** | title, requirement and/or customer_need; status → `edited` | "edited {field}" per field + "marked requirement for review after edit" |
| Challenge | optional ("What do you doubt?") | confidence → revised confidence, quadrant recomputed, `challenged = 1` | PM: "challenged requirement"; AI "Red-team check": "found N issue(s)"; "Scoring engine": "revised confidence", "moved quadrant" |
| Reopen | — | status → `proposed` | "reopened requirement" |

**Guards:**
- The requirement must exist.
- It must have evidence in the PM's region.
- A reason is required for reject, validate and edit.
- A second challenge changes nothing ("already challenged, no further change").

**Who writes audit events**

| Writer | actor_type | Examples |
|---|---|---|
| Pipeline | system / ai | "ingested feedback", "classified feedback batch", "excluded signal from requirements", "drafted requirement", "scored", "prepared challenge narrative" |
| `gate.logAccess` | system | "viewed evidence (other markets restricted)" |
| `gate.logExport` | pm | "exported requirement list" |
| `actions.ts` | pm / ai | decisions, edits, challenge follow-ups, weight changes |
| Voice (`lib/voice/server.ts`) | pm ("PM (voice)") | "voice: {tool}". Logged as Requested before execution, then the result or "Failed: …"; confirmations are logged too |

---

## 11. Priority weights and presets

`components/WeightsPanel.tsx` is the collapsible strip above the requirement list.

- **Presets** (`lib/score.ts`):

  | Preset | impact | frequency | market | competitive | future |
  |---|---|---|---|---|---|
  | Default | 0.35 | 0.25 | 0.20 | 0.05 | 0.15 |
  | Customer first | 0.45 | 0.35 | 0.10 | 0.05 | 0.05 |
  | Premium experience | 0.40 | 0.10 | 0.10 | 0.20 | 0.20 |
  | Quick wins | 0.25 | 0.40 | 0.25 | 0.05 | 0.05 |
  | China focus | 0.25 | 0.10 | 0.35 | 0.05 | 0.25 |
  | Europe focus | 0.30 | 0.15 | 0.30 | 0.15 | 0.10 |
  | US focus | 0.40 | 0.20 | 0.25 | 0.10 | 0.05 |

- **Sliders** (0–100) for the five priority factors, plus a **live preview** of the top 5 with ▲/▼ movement arrows, computed in the browser with the same formula as the pipeline.
- **Apply to the team** (reason required) sends `POST /api/weights` → `setWeights()`. That upserts `settings.weights_active = {priority, preset, changed_by, region, changed_at}` and writes an audit row with before/after.
- **While weights are active,** `gate.rescore()` recomputes priority, quadrant and sensitivity on every read, and the page and export re-sort and re-group MoSCoW.
- **Confidence never changes**, because it measures evidence, not strategy.
- **Reset to defaults** deletes the key; the stored scores were never touched, so the original ranking returns exactly.
- `web/scripts/test-score.mjs` checks that the web formula reproduces every stored priority and quadrant.

---

## 12. Export

**Export ▾ CSV / JSON** on the vehicle page calls `GET /api/export?vehicle=G70&format=csv|json`.

- Data comes from `exportBundle(viewer, vehicle)`, so it is region-filtered and re-scored.
- `lib/export.ts` builds 25 columns, including:
  - scores, quadrant and MoSCoW
  - the ladder, evidence and survey lines
  - up to 10 comment IDs, plus "(+N more)"
  - "N comments from X restricted"
  - the last PM decision
- The CSV has a UTF-8 BOM and CRLF line endings.
- The filename is `pmw-requirements-{vehicle}-{region}-{date}.{csv|json}`.
- Every export writes an audit row.

---

## 13. The voice agent

A small BMW-blue mic sits at the bottom centre of every page. Click it to talk to PMW; click again, or press Escape, to stop. **It's speech-to-speech:** OpenAI's `gpt-realtime` model hears your audio and replies with audio. No transcript or panel is shown.

```
Browser (VoiceAgent.tsx)                         Next.js server                          OpenAI
──────────────────────────                       ──────────────                          ──────
click mic ─► POST /api/voice/session ──────────► mint client secret (10 min) ──────────► /v1/realtime/client_secrets
                                                  prompt + 14 tools + VAD fixed here
          ◄── { clientSecret: "ek_…" }
RealtimeSession (lib/voice/realtime.ts)
  getUserMedia + RTCPeerConnection ─── SDP offer ───────────────────────────────────────► /v1/realtime/calls
  audio ◄══════════════════════ WebRTC audio both ways ════════════════════════════════► gpt-realtime
  data channel "oai-events":
    ► page context on connect and on each navigation (page, model, selected requirement, region)
    ◄ function_call (e.g. critical_issues)
       └► POST /api/voice/tools ───────────────► audit "Requested" → executeVoiceTool()
                                                 (lib/voice/server.ts → gate.ts / actions.ts)
                                                 → audit result
       ◄── result (href → router.push)
    ► function_call_output + response.create ──────────────────────────────────────────► speaks the answer
```

**Tools** (`lib/voice/config.ts`): navigate, list_vehicles, find_requirements, open_requirement, explain_score, read_customer_quotes, summarize_feedback, run_challenge, critical_issues, daily_briefing, show_missing_voices, audit_trail, portfolio_overview and request_decision. All reuse `gate.ts` and `actions.ts`, so they get the same region filtering and the same audit trail.

**Safety**
- The API key stays on the server; the browser only gets a short-lived `ek_…` secret.
- The voice API routes accept same-origin requests only.
- **Approve/reject by voice only proposes.** `request_decision` stores a single-use token (5 minutes, bound to browser and region) and opens an on-screen dialog. Only a **click** calls `/api/voice/confirm`, which the model cannot reach. The token is never sent to the model, so a spoken "yes" can't confirm.
- Voice cannot change team weights.
- A tool won't run until the user's speech has been transcribed (it waits up to 4 s), so every action is audited with the actual spoken request.
- Sessions end after 90 s idle or when the tab is hidden.

**Transcription runs in parallel.** `gpt-4o-mini-transcribe` writes down what you say. The model doesn't use that text (it hears your audio); it's used only for the audit trail.

---

## 14. API reference

There are no server actions; every write is one of these route handlers.

| Route | Method | Input | Calls | Guard |
|---|---|---|---|---|
| `/api/region` | POST | `{region}` | Sets the `pmw_region` cookie (30 days) | `isRegion` |
| `/api/requirements/[id]` | POST | `{action, rationale?, fields?}` | `applyAction` | Validated action and fields; region check |
| `/api/weights` | POST | `{action:"set", weights, preset?, rationale}` or `{action:"reset", rationale}` | `setWeights` / `resetWeights` | Reason required; values 0–100, not all zero |
| `/api/export` | GET | `?vehicle&format=csv\|json` | `exportBundle`, `buildRows`, `logExport` | Region-filtered |
| `/api/voice/session` | POST | — | OpenAI `client_secrets` | Same origin; 503 without `OPENAI_API_KEY` |
| `/api/voice/tools` | POST | `{tool, params, spokenRequest}` | `logVoice` → `executeVoiceTool` → `logVoice` | Same origin; known tool; non-empty spoken request; body ≤ 16 KB |
| `/api/voice/confirm` | POST | `{token, confirm}` | `confirmVoiceDecision` | Same origin; UUID token; browser and region bound; single use |

---

## 15. AI usage

| Task | The model does | Code does |
|---|---|---|
| Classify unlabelled comments | Topic and type labels with a literal evidence span (validated) | Offline lexical rules as fallback (`label_source = rule`) |
| Draft a requirement | Title, root-cause hypothesis, customer need, requirement, assumptions, uncertainties | Offline templates (`evidence-template:v2`) as fallback; strict validation |
| Challenge narrative | At most 3 sentences, no numbers | Penalties and revised confidence are always code |
| Everything else | — | Counts, scores, quadrants, evidence mix, equipment matching, quick wins, conflicts, themes |

- **Pipeline model:** `PMW_MODEL` (default `claude-opus-5-5`), with `PMW_MODEL_FAST` for classification. Requires `ANTHROPIC_API_KEY` and `uv sync --extra llm`.
- **Cache:** `pipeline/cache/{task}_{sha256}.json`. The key covers the task, model, prompt, payload and schema. Hashes are checked on read and invalid caches are rejected. `--offline` reads the cache only.
- **Current state:** the cache is empty, so every requirement is an offline template draft (`generated_by = evidence-template:v2`).
- **Web voice model:** `gpt-realtime` (OpenAI), set by `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE`.

---

## 16. Testing

| Suite | Command | Covers |
|---|---|---|
| Pipeline unit tests | `cd pipeline && uv run --extra llm python -m unittest discover -s tests -v` | Equipment matching, evidence mix, market requirements, photos, scope guard, signal membership; workflow (AI cache and offline mode, citation rejection, scoring boundaries, verify tamper detection) |
| Pipeline verify | `uv run pmw verify` | Post-build integrity (§4) |
| Score parity | `cd web && node --test scripts/test-score.mjs` | The web formula reproduces stored priorities and quadrants; presets; Python rounding |
| Gate logic | `node --test scripts/test-equipment-evidence.mjs scripts/test-happiness.mjs` | Quick-win evidence, region restrictions, happiness coverage (in-memory DB) |
| Web unit tests | `npm run test:voice` (Vitest) | Voice agent UI safety; session route never leaks the key |
| End to end | `npm run build && npm run test:e2e` (Playwright, port 3107) | Workspace layout and responsiveness, workflow (decisions, challenge, region gating, edit flow), weights, Phase 2 (evidence meter, portfolio), voice APIs and confirmation |

`test:e2e` first copies `db/pmw.sqlite` to `db/pmw-smoke-run.sqlite` (`scripts/prepare-test-db.mjs`), so tests never change your real data. Set `PW_CHANNEL=msedge` to use an installed Edge when Playwright's own browser isn't installed.

---

## 17. Configuration, running and deployment

**Run locally**

```bash
cd pipeline && uv sync && uv run pmw build --offline && uv run pmw verify
cd ../web && npm ci && npm run dev        # http://localhost:3000
```

**Environment (`web/.env.local`, server-only, never `NEXT_PUBLIC_`)**

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Voice agent |
| `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE` | Optional; default `gpt-realtime` / `marin` |
| `PMW_DB` | Database file (default `../db/pmw.sqlite`) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Hosted database |
| `PMW_USE_REMOTE=1` | Use Turso locally |

The pipeline reads `pipeline/.env` for `ANTHROPIC_API_KEY`, `PMW_MODEL` and `PMW_MODEL_FAST`.

**Hosted demo:** https://product-minds-on-wheels.vercel.app (Vercel + Turso)

- Push data with `cd web && vercel env pull .env.local && npm run db:push`. **This replaces all hosted data, including decisions.**
- Deploy with `vercel deploy --prod`. The project isn't connected to GitHub, so a git push doesn't deploy.
- Privacy: noindex via meta tag, `robots.txt` and the `X-Robots-Tag` header; no analytics; self-hosted font.

**Stack versions:** Next 16.4, React 19.3, Tailwind 4, `@libsql/client` 0.18, Node 24, Python ≥ 3.11.

---

## 18. Known gaps and gotchas

Found while mapping the code; worth knowing before a demo or a change.

1. **The local database is out of date with the code.** The current `db/pmw.sqlite` has 86 quick wins (the code caps them at 5 per vehicle), no market-conflict requirements, and empty `signal_feedback` and `feedback_scope` tables. Run `uv run pmw build --offline` to rebuild it. Note that this wipes decisions.
2. **Happiness coverage reads `signal_feedback`.** Until you rebuild, the voice `summarize_feedback` approval coverage shows no data.
3. **Audit `entity_id` is not redacted.** Text-scope-guard events use the comment ID as `entity_id`, so the unfiltered `/audit` view can show comment IDs from other markets to a regional PM.
4. **Threshold fallback mismatch.** `gate.getWeights()` falls back to a confidence threshold of 62 if `settings.weights` is missing; the real value is 58.
5. **List links rely on `req`/`q`.** Signals rows, matrix dots and list filter chips carry `req` or `q`, which selects the Requirements list instead of the board.
6. **`components/ScrollToCard.tsx` is unused.**
7. **Rebuilding wipes PM decisions**, and so does `npm run db:push` for the hosted database.
8. **No dates in the data**, so recency is fixed at 0.5 and "new since last briefing" compares requirement creation times.
9. **Price lists are German only.** Equipment availability in other markets is flagged as an assumption.
10. **Opening a requirement writes to the database** (a "viewed evidence" audit row, throttled to once per 10 minutes).
