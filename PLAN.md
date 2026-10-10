# Plan · Product Minds on Wheels (PMW)

Latest team plan for the BMW track at the EHL Grand Finale 2026. Updated 10 October 2026, evening.
Setup and code layout: [README.md](README.md). Who owns what: [TEAM.md](TEAM.md). Agent briefs: [docs/agent-briefs/](docs/agent-briefs/).

## 1. The challenge in one line

Help a BMW product manager decide what the next generation of a car must offer customers, prove why, and
record every decision. BMW judges: decision and scoring logic, workflow and human decision-making, traceability
and auditability, usability and feasibility, innovation and business impact. Deliverables: pitch deck,
GitHub repository, live demo.

## 2. What we are building

A web app where AI turns BMW's customer data into a ranked list of requirements for the next generation, shows
the evidence behind each one, and leaves every decision to the product manager.

```
Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail
```

## 3. Decisions made

| Topic | Decision |
|---|---|
| Name | **Product Minds on Wheels (PMW)** |
| Demo vehicle | **BMW 7 Series (G70), across all markets.** 1 Series and 5 Series show the engine generalises. |
| App type | Custom web app (Next.js) with a Python pipeline inside. Not Streamlit. |
| Look and feel | bmw.de: photography first, light body type, uppercase headlines, square buttons, one blue. Real car photos from the BMW price lists. |
| Home screen | Three cars side by side as lanes (1, 5, 7 Series), real photos, a 1-second entrance, no long animation. |
| Login | **None.** An Amazon-style region picker (United States, Europe, China, Rest of World, All markets). SSO is explained in the pitch. |
| Access | A market PM sees raw customer comments from their own market only; summary scores stay visible; access is logged. |
| Scoring | **Priority and confidence are separate**, both computed by code. Decision quadrants: Act, Validate first, Monitor, Park. |
| Priority display | **MoSCoW groups**: Must have 65+, Should have 55+, Could have 45+, Won't have this time below 45. |
| Requirement view | **Photo header**: each requirement opens on a photo of the part of the car it is about, cropped to that part. |
| Data store | SQLite locally; Turso (hosted SQLite) for the live demo. |
| Hosting | Vercel, **not indexed by search engines, no trackers, no third-party requests**. |

## 4. Signature features (the "wow")

1. **You already sell this.** Customers ask for features BMW already offers as an option, inside a package, or as
   standard on another BMW (Trickle-Down). Verified examples: ventilated seats only inside the 5 Series Comfort
   Package 7VB (€2,750); 7 Series has multifunction seats and comfort access as standard.
2. **Challenge.** The PM asks "what could make this wrong?", the red-team check lists the issues and confidence
   drops live (for example 73 → 53 when 97% of the evidence comes from one market).
3. **One click from requirement to customer.** Real quotes with comment IDs, source and severity.
4. **Evidence versus assumption.** Every requirement separates today's data from assumptions about 2030.
5. **Conflict alerts and missing voices.** For the 7 Series, 95% of comments come from the US, which buys 29%
   of the cars, and China has none. China and Europe disagree on rear roominess (7.52 vs 9.41), front roominess
   (7.69 vs 9.69) and braking (7.82 vs 9.60).
6. **Scope guard.** Pricing, regulatory and engineering topics are filtered out with a stated reason
   (for example permanent start-stop switch-off touches emissions regulation).
7. **Happiness Meter** (stretch). Share of customer pain addressed per market as the PM approves, weighted by sales.

## 5. Status

**Done (merged into `main`)**
- #1, #4 (Arjun): "You already sell this" finder. Positioned price-list parser with six verified checks; matches only
  from customer wishes, on the right topic; up to five feature-specific quick wins per vehicle.
- #2 (Vishwa): complete evidence-to-decision workflow. Reviewed evidence templates for root cause, customer need and
  requirement (labelled "needs validation"), rule-based labels for unlabelled comments, merged themes, stable
  requirement IDs, calibrated scoring, challenge narrative and priority sensitivity, 36+ Python and 15 browser tests.
- #3 (Gokul): requirement export in BMW's format (CSV / JSON), region-filtered and logged.
- #5, #6 (Gokul): scroll position kept when opening a requirement; BMW Group internal-tool branding
  (header lockup, palette, typography, favicon). The BMW logo file still has to be added.
- Hosted at https://product-minds-on-wheels.vercel.app (Turso database, not indexed, no trackers).

**Open decisions**
- Name: decided on 11 October: **Product Minds on Wheels (PMW)**, everywhere in the app and the docs.
- BMW logo: add `web/public/brand/bmw-logo.svg` and confirm the organizers allow it on a public prototype.

## 5a. Phase 2 split

Each person owns different files. Shared files (`gate.ts`, `types.ts`, `db.py`) only get additions; schema changes are
flagged in the PR title. `DecisionCard.tsx` and `Header.tsx` belong to Gokul: Vishwa and Arjun build separate
components and Gokul places them. Details and "done when" checks are in each person's brief.

| | Gokul (frontend, demo lead) | Vishwa (AI and scoring) | Arjun (data and evidence) |
|---|---|---|---|
| 1 | **Workflow page** `/workflow` (BMW deliverable 3) | **Evidence vs. assumption meter** (wow #4) | **Market conflict cards** (wow #5) |
| 2 | "You already sell this" banner + Quick wins filter | **Portfolio page** `/portfolio` (topics × 1/5/7 Series) | **Happiness Meter data** `happiness()` in `gate.ts` |
| 3 | Priority sliders + strategy presets | Real AI run, if an API key is available | Survey coverage + text scope rules |
| 4 | Happiness Meter UI (after Arjun 2) | Pitch: "How scoring works" + judge Q&A | Photos for quick wins and conflict cards |
| 5 | Pitch lead: deck, demo script, backup video | | Pitch: "Traps we found in BMW's data" |

Merge order: Arjun 2 early (unblocks the meter UI); Vishwa 1 before Gokul polishes the Decision Card.
Feature freeze two hours before the deadline, then rehearse at least five times.

## 6. Demo story (about 2 minutes of the 5-minute pitch, 7 Series)

Pitch materials: [deck](docs/pitch/deck.md) · [demo script](docs/pitch/demo-script.md) (click by click, checklist,
fallback) · [judge Q&A](docs/pitch/qa.md). Requirement IDs are hashes, so the demo uses titles.

1. Home, region United States. The 1 Series is greyed out: not sold in the US.
2. Open the 7 Series: the missing-voices warning (95% of comments from the US, which buys 29%; China 24% of sales, no comments).
3. Open **"Everyday controls without menu hunting"** (Must have, priority 69, confidence 70, Act): photo of the
   part, the ladder, real quotes with IDs (for example G70-1329), priority and confidence with every factor.
4. **Challenge**: confidence 70 → 44, the requirement moves from Act to Validate first. Backup if already
   challenged: "Comfortable cabin with understandable climate controls" (71 → 51).
5. Edit the requirement (add Europe and China validation), then approve with a reason. Show the audit trail.
6. Switch region to China: 10 requirements, no customer quote, 49 US and 1 Europe comment restricted, the access is logged.
7. Workflow page: six automatic steps, one mandatory product-manager step.
8. Export the requirement list as CSV (region-filtered, logged).

Optional if time allows: the quick win "Offer massage seats outside €4,450 Executive Paket (9DA)" (You already sell this),
and the Data health tab (traps in BMW's data).

Pitch lines: "Language reasoning comes from AI. Decision metrics come from deterministic computation."
"PMW helps BMW make product decisions they can defend, not just AI suggestions they have to trust."

## 7. Rules for everyone

- Numbers from code, words from the LLM. No invented facts; every claim traces to a comment ID or data row.
- Customer-facing requirements only: no regulatory, engineering-spec or pricing requirements.
- Schema changes (`pipeline/pmw/db.py` + `web/lib/types.ts`) are agreed by all three.
- All web data access goes through `web/lib/gate.ts` (async since the move to Turso).
- Branches per person, pull requests into `main`, nobody merges their own pull request.
- Feature freeze two hours before the deadline, then rehearse the demo at least five times.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Many teams build a chatbot over PDFs | Lead with Challenge, "You already sell this" and the audit trail |
| AI text sounds generic or invents facts | Prompts cite comment IDs; outputs referencing unknown IDs are dropped |
| Thin data for China, Germany-only price lists | Shown openly as assumptions and lower confidence |
| Live demo network or cold start | Open the hosted link once beforehand; keep the local version ready as backup |
| Repo and site are public with BMW data | Not indexed; check the hackathon terms on sharing |
