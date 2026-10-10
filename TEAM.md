# Team plan

**AI agent briefs:** [Vishwa](docs/agent-briefs/VISHWA_AGENT_BRIEF.md) · [Arjun](docs/agent-briefs/ARJUN_AGENT_BRIEF.md).
Give your agent the brief and ask it to do one task at a time, on a branch, ending in a pull request.

Three people, three lanes, one shared contract. Each lane owns its files, so we rarely touch the same file.

## The contract (change only together)

- `pipeline/pmw/db.py`: the SQLite schema
- `web/lib/types.ts`: the same shapes in TypeScript

If you need a new column or table: say so in the group chat, add it to both files in one small PR, and rebuild.
Adding a new table or a nullable column never breaks the others. Renaming or removing does.

## Gokul: product, frontend and demo lead

Owns `web/app/**`, `web/components/**`, the pitch.

1. **Priority weights and strategy presets in the UI.** Sliders for the five priority weights plus presets
   (Customer first, Premium experience, Quick wins, China focus, Europe focus). Re-rank live, log every change as an
   audit event (`entity_type = 'weights'`). Port the formula from `score.py` to `web/lib/score.ts`.
2. **Export the requirement list** in BMW's format (ID, description, findings and sources, score, rationale,
   evidence level, assumptions, status) as CSV and JSON. This is deliverable 2.
3. **Workflow view**: one page or section showing what the AI does alone and where the PM must decide (deliverable 3).
4. **Portfolio heatmap**: topics × 1/5/7 Series, coloured by negative share (data is already in `signals`).
5. **Happiness Meter UI** once Arjun has the numbers: share of customer pain addressed per market as the PM approves.
6. Polish: home entrance, mobile layout, empty states, loading states.
7. Demo script, slides, backup video. Rehearse the 5-minute story at least five times.

## Vishwa: AI lead

Owns `pipeline/pmw/signals.py`, `derive.py`, `score.py`, and the AI parts of challenge.

1. **Classify unlabelled comments** (`signals.classify_unlabelled`): 440 per car for the 5 and 7 Series, 300 for the 1 Series.
   Batch them, write labels with `label_source = 'ai'`, one audit event per batch.
2. **Run the derive step with the LLM** (`--llm`) and improve the prompt until root cause, customer need and
   requirement read like a BMW PM wrote them. Commit `pipeline/cache/`.
3. **Merge topics into real themes.** BMW's labels are narrow; "climate control" is spread over 3 topics.
4. **Future lens**: current pain / emerging / future must-have, with a stated assumption for each.
5. **Challenge narrative**: keep the deterministic issues in `score.challenge_issues`, add an LLM paragraph
   on top ("what could make this wrong").
6. **Calibrate** weights and thresholds so the 7 Series spreads over all four quadrants for a convincing demo.

## Arjun: data and evidence lead

Owns `pipeline/pmw/ingest.py`, `evidence.py`, `scope.py`, `aspects.py`.

1. **Equipment parser**: proper packages, their contents, prices and per-trim availability from the three PDFs.
2. **Trickle-Down Finder and "You already sell this"**: match customer wishes to equipment that already exists
   on the same car (as an option or inside a package) or on another BMW (e.g. the 7 Series has it as standard).
   Also "standard but failing" (fitted everywhere, still causing complaints). New table, e.g. `equipment_matches`,
   plus a field on requirements. Verified examples: ventilated seats only in Comfort Package 7VB (€2,750) on the
   5 Series; 7 Series multifunction seats and comfort access are standard.
3. **Market conflict cards**: turn the in-scope China vs Europe gaps (7 Series rear roominess 7.52 vs 9.41,
   front roominess 7.69 vs 9.69, braking 7.82 vs 9.60) into requirement candidates with a "global or
   market-specific?" decision for the PM.
4. **Extend `TOPIC_TO_SURVEY`** so more requirements get survey support.
5. **Scope guard rules** for comment text, not only topics.
6. **Happiness Meter numbers**: per market, share of negative comments covered by approved requirements, weighted
   by sales. China has no comments, so show "unknown", never 0% or 100%.
7. **Photos per requirement** (`aspects.py`): each topic maps to an aspect, a part, a photo and a focal point,
   shown as the photo header on the Decision Card. Add rules for new topics and better photos (seats, audio).
8. **Web evidence**: a small table of external sources (competitor features, trends) with URL, date and the claim,
   linked to requirements. Context only; it never replaces missing customers.

## Workflow

- Branches: `gokul/<topic>`, `vishwa/<topic>`, `arjun/<topic>`. Small PRs into `main`, merge often.
- Pull `main` at least every two hours. Integration checkpoints: every three hours, everyone rebuilds and clicks
  through the 7 Series story together.
- Never commit `.env`, API keys or `db/`. Do commit `pipeline/cache/`.
- Before a PR: `cd pipeline && uv run pmw build` and `cd web && npm run build` both pass.
- Feature freeze two hours before the deadline. After that, only fixes and rehearsal.

## Demo story (7 Series)

1. Home: three cars, region USA. The 1 Series is greyed out because it is not sold in the US.
2. Open the 7 Series: the missing-voices warning (95% of comments from the US, which buys 29% of cars).
3. A requirement: customer voice, signal, root cause, need, requirement. Real quotes with IDs.
4. Priority and confidence, separately, with every factor explained.
5. Challenge: confidence drops, the requirement moves from Act to Validate first.
6. Edit, then approve with a reason. Show the audit trail.
7. Switch region to China: thin evidence, US comments restricted, the access is logged.
8. Data health: the traps we found in BMW's data and how we handled them.
