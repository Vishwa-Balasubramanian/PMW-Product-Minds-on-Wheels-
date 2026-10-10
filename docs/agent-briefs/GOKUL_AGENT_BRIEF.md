# Agent brief: Gokul (product, frontend and demo lead) · Product Minds on Wheels

You are working on **Product Minds on Wheels (PMW)**, a hackathon prototype for the BMW challenge
"AI for Product Decision Making" (EHL Grand Finale 2026). Read this whole brief, `PLAN.md`, `README.md` and
`TEAM.md` before changing anything.

## 1. What the product does

PMW helps a BMW product manager decide what the next generation of a vehicle should offer customers.
It turns BMW's customer data into requirements a product manager can defend:

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

BMW's judges score: decision and scoring logic, human-in-the-loop workflow, traceability and auditability,
usability and feasibility, innovation and scalability. Submission: **pitch deck, GitHub repository, live demo.**
BMW's four deliverables: a working prototype; a structured requirement list (ID, description, findings and
sources, priority or score, prioritisation rationale, evidence level, assumptions and uncertainties, decision
status); an end-to-end workflow showing what the AI does alone and where human review is mandatory; an audit trail.

**Demo vehicle: BMW 7 Series (G70), across all markets.**

## 2. Setup

```bash
git clone https://github.com/Vishwa-Balasubramanian/PMW-Product-Minds-on-Wheels-.git
cd PMW-Product-Minds-on-Wheels-
cd pipeline && uv sync && uv run pmw build      # rebuilds db/pmw.sqlite (~5 s)
cd ../web && npm install && npm run dev         # http://localhost:3000
```

Live demo: https://product-minds-on-wheels.vercel.app (Vercel project `product-minds-on-wheels`, team
`gokul-rajan-s-projects`, **not** connected to GitHub).
- Deploy code: `cd web && vercel deploy --prod`
- Update hosted data: `cd web && vercel env pull .env.local && npm run db:push` (replaces all hosted data,
  including decisions made online)

## 3. How the web app is built (you own `web/app/**` and `web/components/**`)

| Path | What |
|---|---|
| `web/app/page.tsx` | Home: three cars as photo panels, live stats per region |
| `web/app/vehicles/[code]/page.tsx` | Vehicle page with tabs: Requirements (MoSCoW list + Decision Card), Decision matrix, Signals, Data health |
| `web/app/audit/page.tsx` | Full audit trail with filters |
| `web/app/api/requirements/[id]/route.ts` | POST approve / reject / validate / edit / challenge / reopen |
| `web/app/api/region/route.ts` | Region picker cookie (stands in for single sign-on) |
| `web/components/DecisionCard.tsx` | The core screen: photo header, ladder, priority, confidence, evidence, survey, assumptions, audit |
| `web/components/DecisionActions.tsx` | Decision buttons and forms (client component) |
| `web/components/ui.tsx` | `MOSCOW` groups (65 / 55 / 45), badges, `FactorBars`, `Matrix`, `AuditTimeline`, `Section` |
| `web/components/Header.tsx`, `RegionPicker.tsx` | Header and Amazon-style region picker |
| `web/lib/gate.ts` | **Every database read**, filtered by the viewer's region. Shared with Vishwa and Arjun. |
| `web/lib/actions.ts` | Every PM decision, written atomically with its audit events (`writeBatch`) |
| `web/lib/db.ts` | libSQL client: local SQLite file in development, hosted Turso on Vercel. Helpers `all`, `one`, `writeBatch` |
| `web/lib/types.ts` | Mirror of the schema in `pipeline/pmw/db.py` |
| `web/app/globals.css` | Design tokens (Tailwind v4 `@theme`) and utilities (`btn-primary`, `btn-outline`, `headline`, `eyebrow`, `container-x`) |

Design language: bmw.de. Photography first, light 300-weight body, uppercase bold headlines, square buttons,
one blue (`--color-blue`). Requirement list = MoSCoW groups. Decision Card = photo header cropped to the part.

## 4. Rules (non-negotiable)

1. **No SQL in pages or components.** Add an `async` function to `web/lib/gate.ts`. Every read respects the
   viewer's region (see `listRequirements`, `getRequirement`). Writes go through `web/lib/actions.ts` and always
   include an audit event in the same `writeBatch`.
2. **Numbers from code, words from the LLM.** Priority and confidence stay separate and deterministic.
3. **Next.js 16** with `cacheComponents: false`; pages use `export const dynamic = "force-dynamic"`. Read the
   relevant guide in `web/node_modules/next/dist/docs/` before using an API you have not used in this version.
   Use the generated `PageProps<...>` / `RouteContext<...>` helpers; `params` and `searchParams` are promises.
4. **Do not use `next/font/google`.** It broke under Turbopack. The font is self-hosted in `public/fonts`.
5. **Keep the site private from search engines and trackers:** no analytics, no third-party scripts, fonts or
   images; keep `robots` metadata, `app/robots.ts` and the `X-Robots-Tag` header.
6. **Schema changes** (`pipeline/pmw/db.py` + `web/lib/types.ts`) are agreed by all three and flagged in the PR title.
7. Work on branches `gokul/<topic>`, small PRs into `main`. Commit messages plain, no AI tool names, no co-author lines.
8. Before every PR and every deploy: `cd pipeline && uv run pmw build` and
   `cd web && npx tsc --noEmit && npx eslint app components lib && npm run build` all pass.

## 5. Your tasks, in priority order

### Task 1: Requirement export (BMW deliverable 2) · DONE (#3)
- Route handler `GET /api/export?vehicle=G70&format=csv|json`, plus an **Export** button on the vehicle page.
- One row per requirement visible in the viewer's region, with BMW's fields:
  `id`, `title`, `description` (requirement text), `customer_need`, `root_cause`, `findings_and_sources`
  (signal text, top comment IDs from `signal_evidence`, survey rows), `priority`, `moscow`, `priority_rationale`
  (each factor's value, weight and note), `confidence`, `evidence_level` (quadrant + confidence factors),
  `assumptions`, `uncertainties`, `contradictions`, `decision_status`, `last_decision` (actor, time, reason from
  the audit trail), `markets`.
- Restricted markets: export summary fields only, never raw comment text the viewer may not see.
- Log an audit event `exported requirement list` (actor, region, vehicle, format).
- **Done when:** the CSV opens cleanly in Excel and every BMW field is present for all 7 Series requirements.

### Task 2: Workflow page (BMW deliverable 3)
- New page `/workflow`, linked from the header.
- The pipeline as a sequence: Ingest → Signals → Cross-check → Scope guard → Draft requirement → Score →
  **PM decision** → Audit. For each step: what happens, who does it (AI / code / **human, mandatory**), the
  file that does it, and live counts from the database (comments → signals → requirements →
  decided, read from the database rather than hard-coded).
- Make the mandatory human gates visually unmistakable: deciding, challenging, market conflicts, low-confidence items.
- **Done when:** a judge understands in 20 seconds where the AI stops and the product manager decides.

### Task 3: Priority weight sliders and strategy presets
- On the vehicle page: sliders for the five priority factors (`impact`, `frequency`, `market`, `competitive`,
  `future`; labels in the `factor_labels` setting) and presets: Customer first, Premium experience, Quick wins,
  China focus, Europe focus.
- Each requirement stores its factor values in `priority_factors` (`value` 0..1, `weight`, `note`).
  Recompute priority as `round(100 * Σ weight × value / Σ weight)` in a new `web/lib/score.ts`, re-group the
  MoSCoW list and recompute quadrants with the thresholds from `getWeights()`.
- Persist the active weights (e.g. `settings` key `weights_active`) through a new action in `actions.ts`, with an
  audit event (`entity_type = 'weights'`, before/after, reason). Show "Ranking changed by … at …" above the list.
- **Done when:** moving a slider re-ranks the 7 Series live, the change appears in `/audit`, and a reload keeps it.

### Task 4: "You already sell this" banner (after Arjun's fix to PR #1 lands)
- Data: `requirement.kind` (`signal | quick_win | market_conflict`) and `requirement.already_exists`
  (`EquipmentMatch[]`: `match_type`, `equipment_name`, `code`, `price_eur`, `source_vehicle`, `feedback_ids`, `note`).
- Banner on the Decision Card under the photo header, wording per `match_type`:
  option on this car · inside a package (name, code, price) · standard on another BMW · standard but failing.
  Link the comment IDs. A "Quick wins" chip in the list for `kind = 'quick_win'`.
- Wait for Arjun's fix before demoing: today some matches sit on unrelated topics (see the review on PR #1).

### Task 5: Challenge narrative · DONE (rendered in #2)
- Render `requirement.challenge.narrative` (optional string) in the "Challenge result" section of the Decision Card.

### Task 6: Happiness Meter UI (after Arjun's data function)
- Arjun adds `happiness(viewer, vehicle)` to `gate.ts`: per market, share of negative comments covered by
  approved requirements, weighted by sales, `unknown` where there are no comments (China).
- Show it on the vehicle page; it must move when a requirement is approved. Never show `unknown` as 0% or 100%.

### Task 7: Pitch, demo and backup
- Demo script: `PLAN.md` section 6. Slides: problem, our answer, live demo, how scoring works (priority ≠
  confidence), what the AI does vs the PM, data traps we found, scalability (1 / 5 / 7 Series, markets), team.
- Record a backup screen video of the full demo on the live site.
- Before presenting: `npm run db:push` for a clean state, open the live link once (cold start ~4 s),
  set the region to United States.

### Stretch: Portfolio heatmap
- A page comparing topics across the 1, 5 and 7 Series (negative share per topic from `signals`),
  e.g. connectivity and ease of use red on all three.

## 6. You are also the reviewer

Vishwa and Arjun open PRs; you merge them. Check before merging:
- both builds pass locally after `git pull` and `uv run pmw build`;
- schema changes are mirrored in `db.py` and `types.ts` and flagged in the title;
- new `gate.ts` functions are `async`, respect the region, and contain no raw-comment leaks across markets;
- no secrets, no `.env`, no AI attribution in commits;
- the 7 Series demo still works (list, Decision Card, Challenge, region switch, audit).
After merging a schema change, everyone runs `uv run pmw build`; update the live site with `db:push` and deploy.
Ask Vishwa to enable branch protection on `main` (Settings → Branches → require a pull request).

## 7. Phase 2 (from 10 October, evening)

Before starting: `git pull`, `cd pipeline && uv sync && uv run pmw build`, `cd web && npm install`.
Requirement IDs are stable hashes now (e.g. `R-G70-73240d3417`). All web data access is async through `web/lib/gate.ts`.
One task per branch and pull request; never merge your own pull request.

Already merged on top of this brief: export (#3), Vishwa's workflow (#2), Arjun's fixed quick wins (#4),
scroll fix (#5), BMW Group branding (#6). Header is 72px; brand tokens live in `web/app/globals.css`.

1. **Workflow page** (Task 2 above). In progress on `gokul/workflow-page`.
2. **"You already sell this" banner + Quick wins filter** (Task 4 above, now unblocked). Quick wins have
   `kind = 'quick_win'` and sit mostly in Park, so add a "Quick wins" chip to the list filters and the banner on the card.
3. **Priority sliders + strategy presets** (Task 3 above).
4. **Happiness Meter UI** (Task 6 above) once Arjun's `happiness(viewer, vehicle)` is merged.
5. **Place teammates' components** on the Decision Card: Vishwa's `EvidenceMeter`, Arjun's market-conflict content.
6. **Pitch lead** (Task 7 above): collect Vishwa's and Arjun's slide notes from `docs/pitch/`.
