# PMW pitch deck (5 minutes)

BMW challenge "AI for Product Decision Making", EHL Grand Finale 2026. Pitch lead: Gokul.
Demo click path: [demo-script.md](demo-script.md). Judge questions: [qa.md](qa.md).

> **Name not final.** The app shows "PMW · Product Manager's Workbench"; older docs say "Product Minds on Wheels".
> The team still has to confirm the final name before the slides are designed.

**How to read this file.** One block per slide: title, the one message, what is on screen, what to say.
Every number was checked against a fresh `uv run pmw build` of `main` (4ef88d2) on 11 October 2026.
The query behind each number sits in an HTML comment under the slide (`sqlite3 db/pmw.sqlite`).
Numbers change if the pipeline changes: rerun the queries after the last merge and before designing the slides.

| # | Slide | Time |
|---|---|---|
| 1 | Plenty of data, few decisions you can defend | 0:20 |
| 2 | What PMW does | 0:20 |
| 3 | Live demo | 2:00 |
| 4 | How scoring works | 0:25 |
| 5 | You already sell this · Challenge | 0:20 |
| 6 | Missing voices · Market conflicts | 0:20 |
| 7 | Workflow and audit trail | 0:20 |
| 8 | Traps we found in BMW's data | 0:20 |
| 9 | Scalability | 0:15 |
| 10 | Business impact | 0:15 |
| 11 | Team and close | 0:10 |
| | **Total** | **about 5:05** |

If the demo runs long, cut slide 6 (missing voices and the China switch are already in the demo) and shorten slide 9.

---

## Slide 1 · Plenty of data, few decisions you can defend

**Message:** BMW has more customer data than a product manager can read, and it points in different directions.

**On screen**
- 10,128 customer comments · 391 survey measures · 575 price-list rows · sales by market
- 7 Series: **95%** of comments from the US, which buys **29%** of the cars
- China: **24%** of 7 Series sales, **0** comments
- "Which requirement goes into the next generation, and can you prove why?"

**Speaker notes**
A product manager planning the next 7 Series has ten thousand customer comments, two customer studies, sales
volumes and price lists. The hard part is not finding data. It is deciding, and defending the decision. Look at
the 7 Series: 95 percent of the comments come from the US, which buys 29 percent of the cars. China buys almost a
quarter and has no comments at all. If you just count complaints, you build a car for one market.

<!--
Verified:
  SELECT COUNT(*) FROM feedback;                                   -> 10128
  SELECT COUNT(*) FROM survey_scores;                              -> 391
  SELECT COUNT(*) FROM equipment;                                  -> 575
  SELECT market, feedback_n, feedback_share, sales_2025, sales_share FROM representation WHERE vehicle='G70';
    -> US 3792 comments, 0.948 of comments, 12000 sold, 0.2857 of 2025 sales
    -> CN 0 comments, 10000 sold, 0.2381 of 2025 sales
-->

---

## Slide 2 · What PMW does

**Message:** PMW turns customer evidence into requirements a product manager can defend, and leaves every decision to the product manager.

**On screen**
- One line: *From customer evidence to traceable, prioritised requirements for the next generation. The product manager decides.*
- The ladder:
  `Customer voice → Signal → Root cause → Customer need → Requirement → Priority + Confidence → PM decision → Audit trail`
- Three cars, four markets: 1 Series, 5 Series, 7 Series · US, Europe, China, Rest of World

**Speaker notes**
PMW, the Product Manager's Workbench, reads all of BMW's files and builds this ladder for every requirement: what
customers said, the pattern behind it, a root-cause hypothesis, the customer need and a testable requirement.
Then two separate scores: how important, and how well proven. The product manager approves, edits, rejects or
challenges. Every step lands in an audit trail. Let me show you.

<!--
Ladder: PLAN.md section 2, README.md, web/components/DecisionCard.tsx (Ladder component: Customer voice, Signal,
Root cause, Customer need, Requirement). Vehicles and markets: pipeline/pmw/config.py (VEHICLES, MARKETS).
-->

---

## Slide 3 · Live demo

**Message:** One requirement, end to end, on the live site.

**On screen**
- Full-screen browser: https://product-minds-on-wheels.vercel.app
- Slide only as a fallback: "Live demo · 7 Series · region United States"

**Speaker notes**
Follow [demo-script.md](demo-script.md) click by click (about 2 minutes): home and region, the 7 Series
missing-voices warning, "Everyday controls without menu hunting" (ladder, evidence, scores), Challenge
(confidence 70 → 44, Act → Validate first), edit and approve with a reason, audit trail, switch to China,
workflow page, CSV export.

<!--
Requirement and expected numbers:
  SELECT id, title, priority, confidence, quadrant, json_extract(challenge,'$.revised_confidence')
  FROM requirements WHERE vehicle='G70' AND title='Everyday controls without menu hunting';
    -> R-G70-30fddc4c00, priority 69, confidence 70, act, revised_confidence 44 (< threshold 58) -> Validate first
-->

---

## Slide 4 · How scoring works

**Message:** Priority and confidence are two different numbers, computed by a formula you can check, never by the model.

**On screen**
- **Priority** (how important): customer impact 35% · frequency 25% · market relevance (2030 sales) 20% · future relevance 15% · competitive pressure 5%
- **Confidence** (how well proven): evidence quantity 25% · source variety 25% · market representation 20% · evidence agreement 20% · recency 10%
- Decision matrix: priority ≥ 55 and confidence ≥ 58 → **Act** · high priority, weak evidence → **Validate first** · **Monitor** · **Park**
- Example, "Everyday controls without menu hunting": priority **69**, confidence **70** → Act
- "Language comes from AI. Numbers come from code."
- Placeholder: full explanation in Vishwa's `docs/pitch/scoring.md` (not written yet)

**Speaker notes**
We keep two numbers apart on purpose. Priority asks how much this matters: how negative and severe the comments
are, how often the topic comes up, and how much of the 2030 sales sit in markets that have evidence. Confidence
asks how well we know it: how many comments, from how many independent sources, whether the evidence comes from
where the car is sold, and whether the survey agrees. A topic can be urgent and badly proven. That lands in
Validate first, not Act. Every factor and weight is on the screen next to the score.

<!--
Weights and thresholds:
  SELECT value FROM settings WHERE key='weights';
    -> priority {impact .35, frequency .25, market .20, competitive .05, future .15}
       confidence {quantity .25, sources .25, representation .20, agreement .20, recency .10}
       thresholds {priority 55, confidence 58}
  Formula: pipeline/pmw/score.py _weighted(): round(100 * sum(value*weight) / sum(weight)); quadrant(): both thresholds.
Example:
  SELECT priority, confidence, priority_factors, confidence_factors FROM requirements WHERE id='R-G70-30fddc4c00';
    priority 69 = 100*(.35*.556 + .25*.866 + .20*.827 + .05*.171 + .15*.70) = 69.0
    confidence 70 = 100*(.25*1.0 + .25*.651 + .20*.459 + .20*.72 + .10*.5) = 69.9
  Recency is fixed at 0.5 because the data has no dates (score.py, confidence()).
MoSCoW groups (Must 65+, Should 55+, Could 45+): web/lib/moscow.ts, README.
TODO: replace the placeholder with a link once Vishwa's docs/pitch/scoring.md exists.
-->

---

## Slide 5 · You already sell this · Challenge

**Message:** PMW finds wishes BMW can answer with equipment it already sells, and it argues against its own recommendations.

**On screen**
- **You already sell this**
  - 5 Series: customers ask for ventilated front seats. BMW sells them only inside the **€2,750 Comfort Paket (7VB)**.
  - 7 Series: **8** comments ask for massage seats. Rear massage sits in the **€4,450 Executive Paket (9DA)**. (G70-1817)
  - 5 Series: **8** comments ask for comfort access. It is standard on the 7 Series.
  - **10** quick wins across the three cars, each with comment IDs and the price-list line
- **Challenge**: "Everyday controls without menu hunting"
  - confidence **70 → 44**, **Act → Validate first**
  - 99% of comments from the US · no comments from China (24% of sales) · none from Rest of World (17%) · 48 comments praise the controls

**Speaker notes**
Two features to point out. First: some customer wishes are for things BMW already sells, as an option,
inside a package, or as standard on another BMW. On the 5 Series, ventilated front seats only come inside a
2,750-euro package. That is a packaging decision, not a new development. Second, Challenge. The product manager
asks "what could make this wrong?" and PMW lists the weaknesses in its own evidence. You saw confidence fall from
70 to 44 in the demo.

<!--
Quick wins:
  SELECT vehicle, title, signal_text FROM requirements WHERE kind='quick_win' ORDER BY vehicle, priority DESC;
    -> 10 rows (F70 3, G60 5, G70 2)
    -> G60 "Offer ventilated front seats outside €2,750 Comfort Paket (7VB)": 3 distinct comments
    -> G60 "Bring standard comfort access from the 7 Series to the 5 Series": 8 distinct comments
    -> G70 "Offer massage seats outside €4,450 Executive Paket (9DA)": 8 distinct comments
  SELECT vehicle, name, code, price_eur, package FROM equipment WHERE code IN ('7VB','9DA')
     OR package IN ('Comfort Paket','Executive Paket');
    -> G60 COMFORT PAKET 7VB 2750, contains "Aktive Sitzbelüftung vorn"
    -> G70 EXECUTIVE PAKET 9DA 4450, contains "Massagefunktion im Fond" (rear)
  SELECT id, text FROM feedback WHERE id='G70-1817';  -> customer wants massage seats in the rear
  Comfort access standard on G70: equipment_matches row feature='comfort access', match_type='standard_other_vehicle', source_vehicle='G70'.
Challenge:
  SELECT confidence, json_extract(challenge,'$.revised_confidence'), json_extract(challenge,'$.issues')
  FROM requirements WHERE id='R-G70-30fddc4c00';
    -> 70 -> 44; issues: 99% from US (-8), no CN 24% of sales (-6), no ROW 17% (-6), 48 praise (-6)
  Quadrant after challenge: priority 69 >= 55, confidence 44 < 58 -> validate (web/lib/actions.ts quadrantFor).
Do NOT use the 7 Series "ventilated front seats ... Executive Paket (9DA)" quick win: 9DA holds REAR ventilation;
front ventilation is in the Connoisseur Paket (9DC, €3,200). Flagged to Arjun.
The "You already sell this" banner on the Decision Card (task G2) is not built yet; quick wins currently show as
their own requirements in the list.
-->

---

## Slide 6 · Missing voices · Market conflicts

**Message:** PMW shows who is not in the data and where markets disagree, instead of averaging it away.

**On screen**
- **Missing voices, 7 Series** (share of comments vs share of 2025 sales)
  - US 95% vs 29% · Europe under 1% vs 31% · China 0% vs 24%
  - 5 Series: US 90% vs 26% · China 0% vs 25%
- **China vs Europe, 7 Series study (mean out of 10)**
  - Front roominess **7.69 vs 9.69** · Rear roominess **7.52 vs 9.41** · Braking **7.82 vs 9.60**
  - Sportiness the other way: **8.64 vs 6.97**
  - Value for money (8.29 vs 6.47) excluded: pricing is out of scope
- The product manager decides: one global requirement, or market-specific ones

**Speaker notes**
The 7 Series comments are almost all American. PMW says so on every screen and lowers confidence for it, rather
than pretending the US speaks for China. Where we do have China and Europe side by side, in the customer study,
they disagree sharply: Chinese customers rate front and rear roominess and braking much lower than Europeans. That
is a real product question: one car for everyone, or a market variant. PMW puts it to the product manager.

<!--
  SELECT market, feedback_n, round(feedback_share,4), sales_2025, round(sales_share,4) FROM representation WHERE vehicle IN ('G70','G60');
    G70: US 0.948 / 0.2857, EU 19 comments 0.00475 / 0.3095, CN 0 / 0.2381, ROW 0.04725 / 0.1667
    G60: US 0.9025 / 0.2635, CN 0 / 0.2534
  SELECT attribute, cn, eu, delta, in_scope, scope_reason FROM market_conflicts WHERE vehicle='G70' ORDER BY in_scope DESC, abs(delta) DESC;
    Front interior roominess 7.69 / 9.69; Rear interior roominess 7.52 / 9.41; Braking 7.82 / 9.6;
    Sportiness 8.64 / 6.97; Value for money 8.29 / 6.47 in_scope=0 "Pricing and business case are out of scope."
  Banner text: web/lib/gate.ts missingVoices().
  On a requirement card the conflict shows as "Markets disagree" (DecisionCard.tsx), e.g.
    SELECT title, conflicts FROM requirements WHERE vehicle='G70' AND conflicts <> '[]';
    -> "Predictable and comfortable braking" (Braking), "Seats that adapt to everyday comfort needs" (Rear roominess)
  Market conflict cards as separate requirements (kind='market_conflict', Arjun P2-1) are not built yet.
-->

---

## Slide 7 · Workflow and audit trail

**Message:** The AI drafts, code scores, the product manager decides, and everything is recorded. (BMW deliverables 3 and 4.)

**On screen**
- Workflow (live page `/workflow`):
  1 Ingest (code) · 2 Label and group (AI, drafts only) · 3 Cross-check (code) · 4 Scope guard (code) ·
  5 Draft requirement (AI, drafts only) · 6 Score (code) · **7 Product manager decides (mandatory)** · 8 Record (system)
- Mandatory human review: every requirement before it counts · Validate-first items · market conflicts · challenge results
- A reason is required to reject, edit or ask for validation
- Audit trail: who, when, region, before → after, why · AI steps, decisions, edits, evidence access, exports
- Fresh build: **242** audit events before anyone clicks

**Speaker notes**
This is BMW's third and fourth deliverable. Six steps run automatically: reading the files, grouping comments,
cross-checking against surveys, sales and price lists, removing out-of-scope topics, drafting, scoring. One step
cannot be skipped: the product manager decides, and has to give a reason to reject, edit or send something back
for validation. Every step, every decision and every look at customer comments goes into an append-only trail.

<!--
Steps and owners: web/app/workflow/page.tsx. Reasons required: web/lib/actions.ts NEEDS_RATIONALE = reject, validate, edit.
Audit fields: pipeline/pmw/db.py audit_events (ts, actor_type, actor, region, entity_type, entity_id, action, field, before, after, rationale).
Evidence access logging: web/lib/gate.ts logAccess(). Export logging: gate.ts logExport().
  SELECT COUNT(*) FROM audit_events;  -> 242 (fresh build, all actor_type 'system')
Append-only means: the app has no edit or delete path for audit_events. A rebuild or `npm run db:push` replaces it.
NOTE: /workflow returns 404 on the live site until current main is deployed (checked 11 Oct 2026).
-->

---

## Slide 8 · Traps we found in BMW's data

**Message:** We checked the data before trusting it, and every fix is visible in the app.

**On screen**
- 7 Series file: **4,690 rows, but 4,000 comments**. One comment is split over several rows, one per label. We count comments, not rows.
- **440 of 4,000** 7 Series comments had no BMW topic. Rules labelled 132; **308** stay unlabelled and every requirement says so.
- **No customer comments from China** for any car, though China is 24% of 7 Series sales.
- Sales file: 1 Series China 2024 holds a **broken formula** (`=-D3-C10`) instead of a number.
- China figures for the 5 Series are for the **long-wheelbase G68**, not the G60.
- Placeholder: full list in Arjun's `docs/pitch/data-traps.md` (not written yet)

**Speaker notes**
Before scoring anything we checked BMW's files. Some of what we found: the 7 Series file has 4,690 rows but only
4,000 comments, because one comment repeats once per label. Count rows and you inflate every topic. 440 comments
had no topic at all. China has no comments for any car. One sales cell holds a broken formula. Each issue is
recorded with how we handled it, on the Data health tab of every vehicle.

<!--
  SELECT dataset, vehicle, severity, description, handling FROM data_issues;  (16 rows)
    id 7  G70 "4,690 rows but 4,000 comments: one comment is split across several rows, one per label."
    id 8  G70 "308 comments remain without a topic label; 0 AI-labelled and 132 rule-labelled."
    id 10 G70 critical "No customer comments from CN." (also id 3 F70, id 6 G60)
    id 13 F70 "1 Series CN 2024: cell holds a broken formula (=-D3-C10) instead of a number." -> treated as 0
    id 12 G60 "China figures for the 5 Series are for the long-wheelbase G68, not the G60."
  SELECT SUM(classified=0) FROM feedback WHERE vehicle='G70';   -> 440
  SELECT market, COUNT(*) FROM feedback GROUP BY market;         -> EU 1563, ROW 1163, US 7402 (no CN)
Other traps in data_issues if Arjun wants more: 7 exact duplicate comment texts (G70, id 9); CN/EU study has means
only, no sample sizes (id 11); price lists are Germany only, July 2026 (ids 14-16).
The CN handling text says "survey means and web research only": web research is not built. Do not say it on stage.
TODO: replace the placeholder with a link once Arjun's docs/pitch/data-traps.md exists.
-->

---

## Slide 9 · Scalability

**Message:** The same pipeline already runs three vehicle lines; a new line or market is configuration plus its files.

**On screen**
- Running today: 1 Series **18** requirements · 5 Series **20** · 7 Series **17**, from 10,128 comments
- Full rebuild of all three lines: about **3 seconds** on a laptop
- New vehicle or market: one entry in `pipeline/pmw/config.py` plus its files
- New data: rebuild; AI outputs are cached by a hash of their exact inputs, so unchanged evidence is not sent again
- Production path (not built): BMW single sign-on instead of the region picker, database-level access rules, BMW's data platform instead of Excel files

**Speaker notes**
We built this for the 7 Series, but the same code produces requirement lists for the 1 and 5 Series. Adding a
vehicle or a market is one entry in a config file plus its data. The full rebuild takes about three seconds. In
production, the region picker becomes BMW single sign-on and the Excel files become a data feed. Two honest
limits: the price-list parser is tuned to these PDF layouts, and new layouts need new checks.

<!--
  SELECT vehicle, COUNT(*) FROM requirements GROUP BY vehicle;  -> F70 18, G60 20, G70 17
  `time uv run pmw build` (pipeline/, Apple M4 laptop, 11 Oct 2026) -> real 3.04 s
  Config: pipeline/pmw/config.py docstring "One place to change when adding a vehicle or market." (VEHICLES, MARKETS)
  Cache by input hash: pipeline/pmw/ai.py run_json() / digest(); pipeline/cache/README.md
  Production mapping: README.md "Regions instead of logins" (BMW single sign-on and database-level security).
  Parser limits: docs/VISHWA_IMPLEMENTATION.md ("Equipment extraction remains best effort; six source-backed checks").
-->

---

## Slide 10 · Business impact

**Message:** Faster, defensible requirement lists, with the cheapest wins and the biggest blind spots called out.

**On screen**
- One requirement list per vehicle in BMW's format, every line traced to comment IDs, survey rows and price-list lines
- Quick wins start from equipment BMW already has: **10** across three cars
- Blind spots surfaced, not hidden: China is **24%** of 7 Series sales with no customer comments
- Covers three lines with **451,000** cars sold in 2025 (sales file)
- Decisions survive review: every approval carries a person, a time and a reason

**Speaker notes**
What BMW gets: a requirement list per vehicle, in its own format, where every line can be traced back to customers.
Quick wins that start from equipment BMW already builds. Blind spots shown before they become a bad decision, like
building the next 7 Series without hearing from a quarter of its buyers. And a record that answers the question
every product decision eventually faces: who decided this, and why?

<!--
  Export columns (BMW deliverable 2): web/lib/export.ts ExportRow (id, description, findings_and_sources, comment_ids,
    survey_evidence, priority, priority_rationale, confidence, evidence_level, assumptions, uncertainties, decision_status, last_decision ...)
  SELECT COUNT(*) FROM requirements WHERE kind='quick_win';  -> 10
  SELECT sales_share FROM representation WHERE vehicle='G70' AND market='CN';  -> 0.2381
  SELECT SUM(volume) FROM sales WHERE year=2025;  -> 451000
No time-saved or revenue figures: we have no measurement for them. Do not add any.
-->

---

## Slide 11 · Team and close

**Message:** Decisions BMW can defend, not AI suggestions it has to trust.

**On screen**
- Gokul Rajan: product, frontend, demo · Vishwa Balasubramanian: AI and scoring · Arjun Selvakumar: data and evidence
- "PMW helps BMW make product decisions they can defend, not just AI suggestions they have to trust."
- Live demo: https://product-minds-on-wheels.vercel.app
- Code: https://github.com/Vishwa-Balasubramanian/PMW-Product-Minds-on-Wheels-

**Speaker notes**
We are Gokul, Vishwa and Arjun. PMW keeps the language work with AI, the numbers with code and the decisions with
people. It helps BMW make product decisions they can defend, not just AI suggestions they have to trust.
Thank you.

<!--
Roles: TEAM.md and docs/agent-briefs/phase-2/*. Closing line: PLAN.md section 6 "Pitch lines".
Names from git log authors; confirm spelling and whether to show surnames.
-->
