# PMW live demo script (about 2 minutes, 7 Series)

Site: **https://product-minds-on-wheels.vercel.app** · Region at start: **United States** · Slide 3 of [deck.md](deck.md).
Judge questions: [qa.md](qa.md).

Requirement IDs are hashes (for example `R-G70-30fddc4c00`), so this script uses **titles**. Two titles appear
twice in the 7 Series list ("Seats that adapt to everyday comfort needs", "Doors and access that behave
predictably"); the demo avoids both.

Every expected value below was checked on a fresh build of `main` (4ef88d2) with the app running locally,
by running the same challenge, edit and approve through the app's API. Queries are in HTML comments.

## Before going on stage

- [ ] **Deploy current `main`** (Gokul): `cd web && vercel deploy --prod`. On 11 October the live site still showed
      "Product Minds on Wheels" and `/workflow` returned 404, so the live site is behind `main`.
- [ ] **Reset hosted data** (Gokul): `cd pipeline && uv run pmw build`, then
      `cd ../web && vercel env pull .env.local && npm run db:push`. This replaces all hosted data and decisions.
- [ ] **Recheck the numbers** after the reset: open the 7 Series and confirm "Everyday controls without menu hunting"
      shows priority 69, confidence 70, Act, and the purple button still says **Challenge** (not "Challenged").
      If any later merge changed the pipeline, rerun the queries in this file and update the numbers.
- [ ] **Cold-start warm-up**, 2 to 3 minutes before: open the home page, `/vehicles/G70`, `/workflow` and `/audit` once.
      Opening a requirement writes a "viewed evidence" access event; that is expected and harmless.
- [ ] **Region set to United States**: top right, "Your region" → United States → Apply.
- [ ] Browser: one window, zoom 100 to 110%, notifications off, bookmarks bar hidden, download folder empty.
- [ ] Fallback ready: local app running in a second tab (see Fallback plan) and the backup video on the desktop.
- [ ] Backup video: record this script on the live site, then **reset hosted data again**, because recording
      challenges and approves the demo requirement.

## Click by click

| Time | Click | Say | Expected on screen |
|---|---|---|---|
| 0:00 | Open the home page. Point at "Your region: United States" (top right). | "There is no login. A market product manager picks a region; in production this comes from BMW single sign-on." | Three car lanes. **1 Series greyed out**: "Not sold in United States, so there is no evidence to review here." 7 Series lane: 3,792 customer comments, 12,000 sold in 2025, 17 requirements, 17 awaiting decision. |
| 0:10 | 7 Series lane → **Open requirements**. | "First thing PMW tells you: whose voice is missing." | Banner: "**Missing voices.** 95% of customer comments come from United States, which buys 29% of these cars. China (24% of sales) has no comments at all. Confidence is lowered accordingly." |
| 0:20 | In "Ranked by priority", under **Must have**, click **Everyday controls without menu hunting** (priority 69, 4th in the list). | "Seventeen requirements, ranked. Let's open one." | Photo header "Cockpit · Control display", badges Must have, Act. Line: "Rank 4 of 17 · priority 69 · Evidence-based draft · needs validation · Evidence from United States, Europe, China". |
| 0:30 | Scroll to **From customer voice to requirement**. | "The ladder. What customers said, the pattern, a root-cause hypothesis, the need, and a requirement you can test." | Signal: "69 of 117 distinct comments raise concerns about Touchscreen and everyday controls: 59 hard to use, 5 defects, 7 wishes". Root cause starts "Working hypothesis". Requirement: "...drivers shall locate and change a familiar setting without coaching..." |
| 0:40 | Scroll to **Priority** and **Confidence**. | "Two separate numbers. Priority 69: how much it matters. Confidence 70: how well we know it. Every factor and weight is shown." | Priority 69, confidence 70. Factors, e.g. customer impact 56 (weight 35%), recency 50 with "The data has no dates". Matrix dot in Act. |
| 0:48 | Scroll to **Customer evidence**. Point at **G70-1329**. | "Every claim links to a real comment with its ID, source and severity." | "39 supporting · 10 contradicting · visible to United States". "1 comment from Europe restricted to that market's product managers and the head of product. This access was logged." Quote G70-1329 (Quality survey, very serious): "screen is cluttered, have to keep swiping to find what i need..." |
| 0:55 | Scroll up. Click **Challenge** (purple). Type "Is this only a US problem?" → **Run the challenge**. | "Now I ask: what could make this wrong?" | Challenge result: 4 issues. "Confidence moved from **70** to **44**, so this requirement now sits in **Validate first**." Issues: 99% of the comments come from US (−8) · No comments from CN, 24% of 2025 sales (−6) · No comments from ROW, 17% (−6) · 48 comments praise this topic (−6). |
| 1:10 | Click **Edit**. In "Requirement", add at the end: "Validate with owners in Europe and China before design freeze." Reason: "Challenge: 99% of the evidence is from the US." → **Save edit**. | "I keep the requirement but make the validation part of it. The reason is mandatory." | Status badge **Edited**. |
| 1:20 | Click **Approve**. Note: "Approved for planning; Europe and China validation added to the requirement." → **Confirm approval**. | "The decision is mine, not the AI's." | Status **Approved**. Button changes to **Reopen**. |
| 1:28 | Scroll to **Audit trail** at the bottom of the card. | "Everything is on record: who, when, before and after, and why." | Newest first: approved requirement (edited → approved, with the note) · marked requirement for review after edit · edited requirement (old → new text, with reason) · Scoring engine moved quadrant act → validate · revised confidence 70 → 44 · Red-team check found 4 issues · challenged requirement "Is this only a US problem?" · viewed evidence (other markets restricted) · pipeline steps. |
| 1:38 | Top right **Your region** → **China** → **Apply**. Stay on the same requirement. | "Now I am the China product manager." | "Requirements in your region 10", "Rank 4 of 10". Customer voice: "No supporting customer quote is available in your selected region." Evidence: "1 comment from Europe, 49 comments from United States restricted to those markets' product managers and the head of product. This access was logged." Survey still visible: China 8.43 / 10 and 8.1 / 10. |
| 1:48 | Header **WORKFLOW**. | "BMW's deliverable three: what runs automatically and where a person must decide." | Six automatic steps (Code or AI · drafts only), then the dark step 7 "The product manager decides" (mandatory), step 8 "Record". "1 requirements decided", "54 awaiting a decision". |
| 1:55 | Header **7 SERIES** → **Export CSV** (top right of the tab bar). | "And the requirement list in BMW's format, filtered to what this region may see, and logged." | Download `pmw-requirements-G70-CN-<date>.csv` with 10 requirements (date is UTC). Comment text from other markets is restricted. |

Optional, only if ahead of time: in the 7 Series list (United States), **Could have** group, open
**Offer massage seats outside €4,450 Executive Paket (9DA)**: 8 customer comments ask for massage seats; rear
massage sits in the €4,450 Executive Paket. Do not open "Offer ventilated front seats outside €4,450 Executive
Paket (9DA)": 9DA holds rear seat ventilation, so that title is wrong (flagged to Arjun). Also note the card line
on quick wins currently reads "AI draft · needs validation", although they come from the equipment matcher, not
an AI model (flagged; `DecisionCard.tsx`).

<!--
Expected values, fresh build of main 4ef88d2:
  Home lane (US): SELECT feedback_n FROM representation WHERE vehicle='G70' AND market='US';  -> 3792
                  SELECT volume FROM sales WHERE vehicle='G70' AND market='US' AND year=2025;   -> 12000
                  SELECT COUNT(*) FROM requirements WHERE vehicle='G70';                         -> 17
                  F70 US 2025 sales -> 0 (lane greyed, web/lib/gate.ts listVehicles available = sales2025 > 0)
  Banner: SELECT market, feedback_share, sales_share FROM representation WHERE vehicle='G70';
          US 0.948 / 0.2857, CN 0 comments / 0.2381 (web/lib/gate.ts missingVoices)
  Requirement: SELECT id, priority, confidence, quadrant, signal_text, challenge FROM requirements
               WHERE vehicle='G70' AND title='Everyday controls without menu hunting';
               -> R-G70-30fddc4c00, 69, 70, act; challenge.revised_confidence 44, 4 issues (8+6+6+6 = 26)
               -> after challenge: quadrantFor(69, 44) with thresholds 55/58 -> validate
  Evidence counts: SELECT f.market, e.role, COUNT(*) FROM signal_evidence e JOIN feedback f ON f.id=e.feedback_id
                   WHERE e.signal_id=(SELECT signal_id FROM requirements WHERE id='R-G70-30fddc4c00') GROUP BY 1,2;
                   -> US supports 39, US contradicts 10, EU supports 1
  China list: SELECT COUNT(*) FROM requirements WHERE vehicle='G70' AND markets LIKE '%"CN"%';  -> 10
  Workflow after the demo: 1 decided, 54 awaiting (55 requirements in total).
  The whole sequence (challenge, edit, approve, China view, workflow, CSV export) was run against a local
  `next dev` with a fresh database on 11 Oct 2026; texts above are copied from that run.
-->

## If something goes wrong

| Problem | Do this |
|---|---|
| The demo requirement already shows **Challenged** | Use **Comfortable cabin with understandable climate controls** (Should have, priority 62): challenge moves confidence **71 → 51**, Act → Validate first. Say the numbers from the screen. |
| A page takes more than 5 seconds | Say "cold start", switch to the local tab (below), continue from the same step. |
| A click returns an error | Switch to the local tab. Do not retry more than once on stage. |
| Region switch shows "Switching…" for long | Reload the page; the cookie is already set. |

<!--
  SELECT confidence, json_extract(challenge,'$.revised_confidence'), priority FROM requirements
  WHERE vehicle='G70' AND title='Comfortable cabin with understandable climate controls';  -> 71, 51, 62
-->

## Fallback plan

1. **Local app** (same code, local database): before the pitch, on the presenting laptop:
   ```bash
   cd pipeline && uv sync --extra llm && uv run pmw build   # fresh local database
   cd ../web && npm ci && npm run dev                       # http://localhost:3000
   ```
   Without `PMW_USE_REMOTE=1` the local app reads `db/pmw.sqlite`, not the hosted database. Open
   http://localhost:3000 in a second tab, set the region to United States, and leave it untouched until needed.
2. **Backup video**: a screen recording of this script on the live site, about 2 minutes, saved locally and
   playable offline. If the laptop or network fails, play it and narrate over it.
3. **Slides only**: slides 5 to 7 carry the same numbers as the demo, so the story still works without a screen.
