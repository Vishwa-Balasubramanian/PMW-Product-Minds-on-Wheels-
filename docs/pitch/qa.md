# PMW judge Q&A

Ten likely questions with short, honest answers. Each answer matches `main` (2381fb1) as of 11 October 2026.
Where something is not built, the answer says so. Deck: [deck.md](deck.md). Demo: [demo-script.md](demo-script.md).
Scoring detail will live in Vishwa's `docs/pitch/scoring.md`, data traps in Arjun's `docs/pitch/data-traps.md`
(neither written yet).

---

### 1. Is the text on the requirement cards really written by AI?

**Not in the version you saw.** All 45 topic requirements come from reviewed evidence templates: task profiles the
team wrote, filled in by code with the real counts, comment IDs and survey rows. The card says "Evidence-based draft ·
needs validation". The 260 extra topic labels come from keyword rules, and the challenge paragraphs from rules too.
The AI path is built: it labels unlabelled comments, drafts the ladder and writes the challenge paragraph, using
structured output, validation and a cache. It is tested with simulated responses but has not run against a live
model yet, because we had no API key. When it runs, the outputs are cached and the card shows "AI draft · needs
validation". Either way, the numbers never come from the model.

<!-- SELECT generated_by, COUNT(*) FROM requirements GROUP BY 1;  -> evidence-template:v2 45, equipment_matcher 10
     SELECT label_source, COUNT(DISTINCT feedback_id) FROM feedback_labels GROUP BY 1;  -> bmw 8948, rule 260
     pipeline/cache/ holds only README.md ("No live generation was run for the offline deliverable").
     AI path: pipeline/pmw/ai.py, classify.py, derive.py generate(), challenge.py explain(). Card label: DecisionCard.tsx.
     Quick wins (generated_by 'equipment_matcher') show "Price-list match · needs validation"; "AI draft" only for llm:* output. -->

### 2. How do you stop the AI from making things up?

Five checks in code, before any AI text is accepted:
- It may only cite comment IDs it was given; an unknown ID rejects the draft.
- Generated text may not contain any digit, %, € or $. Numbers can only come from code.
- The root cause must be worded as a hypothesis and cite at least one comment.
- Fixed fields only; extra fields such as a score are rejected. One retry, then the evidence template is used, and
  the fallback is written to the audit trail.
- Customer comments are passed as data, and the prompt says never to follow instructions inside them.

And the last check is a person: nothing counts until the product manager approves it.

<!-- pipeline/pmw/ai.py: SYSTEM prompt, validate_prose() (unknown IDs, digits/%/€/$), run_json() retry and cache revalidation.
     pipeline/pmw/derive.py validate(): hypothesis wording, citation required, exact field set, scope words.
     pipeline/pmw/cli.py: audit event "used offline fallback" when --llm is set and validation fails. -->

### 3. Where do the scores come from, and who chose the weights?

Both scores are weighted averages computed in `score.py`. Priority: customer impact 35%, frequency 25%, market
relevance by 2030 sales 20%, future relevance 15%, competitive pressure 5%. Confidence: evidence quantity 25%,
source variety 25%, market representation 20%, evidence agreement 20%, recency 10%. The team set the weights and
wrote the reason for each one in the code; they are judgement, not fitted to past outcomes. To show how fragile a
priority is, the challenge result shows the priority range when each weight moves by 20%. Sliders that let the
product manager change the weights are planned but not built.

<!-- SELECT value FROM settings WHERE key='weights';  thresholds priority 55, confidence 58.
     pipeline/pmw/score.py DEFAULT_WEIGHTS comments, sensitivity(). Sliders: GOKUL.md task G3 (no web/lib/score.ts on main). -->

### 4. What about China? There are no Chinese comments.

Correct, and we do not hide it. China is 24% of 7 Series sales in 2025 and has zero comments, for every car. PMW
shows a "Missing voices" warning, lowers confidence through the market-representation factor, and the challenge
adds a penalty for every market with 15% or more of sales and no comments. For China we only have the China and
Europe study means, which are shown on each requirement. A China product manager sees "Thin evidence" on the home
page. We never invent Chinese quotes and never read silence as satisfaction. The next step would be a China customer
clinic; external web research for China is not built.

<!-- SELECT market, COUNT(*) FROM feedback GROUP BY market;  -> no CN rows
     SELECT sales_share FROM representation WHERE vehicle='G70' AND market='CN';  -> 0.2381
     score.py challenge_issues(): penalty 6 for sales_share >= 0.15 and 0 comments; confidence() representation factor.
     web/app/page.tsx thin-evidence text; data_issues ids 3, 6, 10 (their handling text mentions web research: not built). -->

### 5. Why do you use German price lists for other markets?

Because the only price lists provided are German, July 2026. We say so wherever it matters: every requirement with
evidence outside Europe carries the assumption "Equipment comparisons use the German price list for every market",
and every quick win says that availability and prices come from the German list. A feature that is in a package
in Germany may be standard or unavailable in the US or China. With BMW's market price lists or configurator data,
the same matching would run per market.

<!-- data_issues ids 14-16: "Price lists cover Germany only (July 2026)."
     pipeline/pmw/cli.py: assumption added when any market != EU; quick-win assumptions list. -->

### 6. How would this scale at BMW?

The pipeline already runs three vehicle lines from one codebase and rebuilds all of them in about three seconds.
A new vehicle or market is an entry in `config.py` plus its files. AI outputs are cached by a hash of their exact
inputs, so a rebuild only sends new or changed evidence to the model. For production we would connect BMW's
feedback and sales systems instead of Excel files, replace the region picker with BMW single sign-on and add
access rules in the database. None of that production wiring is built. The price-list parser is tuned to these PDF
layouts, so new layouts need new checks.

<!-- SELECT vehicle, COUNT(*) FROM requirements GROUP BY vehicle;  -> F70 18, G60 20, G70 17
     `time uv run pmw build` -> 3.04 s (Apple M4). config.py VEHICLES/MARKETS. ai.py digest() cache key.
     README "Regions instead of logins". VISHWA_IMPLEMENTATION.md: equipment extraction best effort, six checks. -->

### 7. What about privacy? Who sees customer comments?

A market product manager sees raw comments from their own market only; other markets show as counts ("49 comments
from United States restricted"). Scores and survey summaries stay visible to everyone. The head of product (All
markets) sees everything. The filtering happens on the server, so restricted text is not sent to the browser, and
every view of evidence with restricted markets is logged. The export, the "You already sell this" banner and the
audit trail follow the same rule: comment IDs from other markets are removed or replaced. The hosted site is not
indexed, has no trackers and loads no third-party fonts or scripts. Limits: in the prototype the region is a cookie
anyone can change, which stands in for single sign-on. In AI mode, comment text would go to the model provider;
in production that would have to run in a BMW-approved environment.

<!-- web/lib/gate.ts getRequirement(), restrictRawEvidence(), restrictMatchIds(), redactAuditIds(), logAccess(), exportBundle(). web/lib/regions.ts.
     README "Hosted demo" (robots meta, robots.txt, X-Robots-Tag, self-hosted font).
     derive.py generate(): up to 15 supporting and 5 positive comments per signal in the AI payload. -->

### 8. Can the audit trail be changed?

Not from the app: there is no screen or endpoint that edits or deletes an audit event, and every decision is
written in the same database batch as its audit event, so one cannot exist without the other. It records who,
when, region, the field, before and after, and the reason. It is not tamper-proof at database level: an
administrator with database access could change it, and a rebuild replaces it. In production it would go to
write-once storage with database permissions that allow inserts only.

<!-- web/lib/actions.ts applyAction(): writeBatch(stmts) with auditStatement in the same batch.
     pipeline/pmw/db.py audit_events schema. README: "Rebuilding wipes the database, including every PM decision." -->

### 9. Can the AI approve or change anything by itself?

No. The pipeline only creates proposals with status "proposed". Approve, validate first, edit, reject and reopen
are product manager actions, and reject, edit and validate first need a written reason. The challenge only runs
when the product manager clicks it; it lowers confidence and can move the quadrant, and that change is logged as
the scoring engine's. The product manager cannot type in a score either: scores only come from the formula.

<!-- pipeline/pmw/cli.py inserts status 'proposed'. web/lib/actions.ts: NEEDS_RATIONALE = reject, validate, edit;
     challenge case updates confidence/quadrant and logs "Red-team check" and "Scoring engine" events. -->

### 10. How reliable is "You already sell this"?

It is a lead for the product manager, not a verdict. A match needs a customer comment labelled as a wish on the
right topic, with wording that matches a German price-list row; complaints about standard equipment are kept
separately as "standard but failing". Each match keeps its comment IDs and the price-list line, so it can be
checked in seconds; the banner on the card shows the original German equipment row. The price-list parser has six
checks against known codes and prices. It is word matching, so it can pick the wrong package: the 7 Series quick win
title for "ventilated front seats" names the Executive Paket, which holds rear-seat ventilation. The banner shows
both rows, rear and front, so a product manager would catch it. We found it ourselves and it is flagged for a fix.

<!-- pipeline/pmw/evidence.py build_equipment_matches(): Wants -> option/package/standard_other_vehicle,
     Difficult to Use/Defect -> standard_but_failing. 
     SELECT name, package FROM equipment WHERE vehicle='G70' AND package='Executive Paket';  -> "Aktive Sitzbelüftung im Fond" (rear)
     Front ventilation: "Aktive Sitzbelüftung vorn", CONNOISSEUR PAKET 9DC €3,200 (equipment_matches note).
     If the fix lands before the pitch, shorten the last two sentences. -->
