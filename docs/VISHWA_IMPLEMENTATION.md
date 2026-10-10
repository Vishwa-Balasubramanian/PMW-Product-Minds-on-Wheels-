# Vishwa pipeline handoff

The offline workflow turns the eight supplied files into 45 traceable requirement
drafts, with source-preserving classification, merged themes, deterministic scores
and challenge explanations. It runs without an API key. Drafts remain proposed;
root causes are hypotheses and every decision still belongs to the product manager.

## Run and verify

```sh
cd pipeline
uv sync --extra llm
uv run pmw build --offline
uv run pmw verify --report ../docs/reports/vishwa-offline.json
uv run python -m unittest discover -s tests -v
cd ../web
npm ci --ignore-scripts
npx next typegen
npx tsc --noEmit
npm run build
npm run dev
```

Use Node 22 or newer and a current npm. The Windows validation used Node 24 and
npm 11. Both tested npm versions attempted an unnecessary SQLite native rebuild
without Visual Studio. `--ignore-scripts` uses the package's shipped native binary;
its database operations and the app build are verified below. This flag affects
dependency lifecycle hooks, not explicit `npm run build` commands.
The pipeline now uses pypdf if Poppler is unavailable; its crypto
extra reads the supplied encrypted PDFs. Rotated headings and German-only coverage
are reported in Data health; equipment extraction remains best effort.

`build` recreates the database, including decisions. Keep a database backup before
rebuilding a session whose PM decisions matter. Tests use separate databases.

## Tasks delivered offline

1. **Requirement ladder.** All drafts have a concise title, cited causal hypothesis,
   customer need, observable successor behaviour, a validation task, assumptions
   and uncertainties. Reviewed task profiles replace empty placeholders. They are
   identified as `evidence-template:v2`, never as a live model response.
2. **Classification.** Existing BMW labels stay intact. Conservative phrase rules
   use explicit topic/sentiment evidence and abstain on ambiguous or generic
   answers. They have `label_source='rule'`; genuine model results use `ai`.
   Data health separates their counts and shows remaining unlabelled comments.
   `feedback.classified` retains its original meaning: BMW supplied a label.
3. **Scoring.** Priority uses customer impact, diminishing-return frequency,
   market coverage, competitor mentions and a stated future-relevance assumption.
   Confidence uses quantity, effective source diversity, market representation,
   agreement and neutral recency when dates are missing. An LLM's prose or future
   label cannot change a numeric score. No vehicle-specific cutoffs or forced ranks.
4. **Challenge.** Every draft gets a build-time explanation and a concrete
   validation action. Existing deterministic issues and penalties are preserved.
   The card also shows priority sensitivity when each strategy weight changes by
   twenty percent in turn. This is a scenario range, not a statistical interval.
5. **Themes.** A reviewed static map groups climate controls, connected services,
   touchscreen controls, ride comfort and storage. Comments are counted once per
   theme, even when they have several member labels. Surveys are the deduplicated
   union of member mappings. Existing photo rules receive a representative member.

Signal and requirement IDs are derived from vehicle and theme, so rank changes
no longer change identity. Evidence samples rotate across market/source groups
while keeping severe reports within each group first. Aggregate counts still use
all comments, not just selected quotes.

## Live AI path, ready for a separate credentialed run

Create `pipeline/.env` from `.env.example`, set `ANTHROPIC_API_KEY` locally and
choose `PMW_MODEL`. Optionally choose a faster `PMW_MODEL_FAST` for classification.
Then run `uv run pmw build --llm`. `--offline` prohibits network generation even
when a key is present, while allowing validated cache reads.

All three stages share content-addressed caches, structured JSON output,
application validation, a single corrective retry and audited fallback. Batch
classification uses up to forty comments and only the vehicle's existing topics.
Each returned label needs a literal evidence span. Requirements reject unknown
citations, extra score fields, numerical claims and malformed structures. Customer
comments are explicitly treated as untrusted data in prompts. Errors retain only
safe descriptions, not provider exception bodies or credentials.

No API key was available, and the user chose offline-first delivery. Live output
quality, provider connectivity and real model caches have therefore not been
validated. The tests exercise cache replay, invalidation, malformed responses,
unknown IDs, retry limits and offline operation through controlled transports.
Prose validation cannot prove a causal claim: human evidence review remains required.

Implementation references:
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- Next.js guides shipped in `web/node_modules/next/dist/docs/`, particularly Server
  and Client Components and Playwright testing.

## Contract and team coordination

The existing challenge JSON gains optional `narrative`, `narrative_source` and
`priority_sensitivity` fields; Python schema documentation and TypeScript types
change together. No database columns were removed or renamed. Label provenance
adds `rule`, and `generated_by` supports offline/cached drafts. Gokul should retain
these values in any exports. The priority threshold stays 55, so the existing
MoSCoW boundaries do not change. Confidence moves from 62 to 58: the reference
case is roughly thirty comments, two balanced sources, half-market overlap,
partial agreement and unknown recency. The report includes alternative thresholds.

Arjun's survey map remains authoritative; theme lookup unions all member mappings.
His equipment parser now has a Windows PDF fallback. Per-trim package matching and
new survey mappings remain his lane. Region filtering now also covers the ladder's
raw customer quote and quoted contradiction examples, including serialized list
props; global summary findings remain visible as before.

No teammates were messaged automatically. This handoff and the PR description
document the shared contract changes for review.

## Evidence limits

- Feedback IDs identify comments, not verified unique customers. Label categories
  overlap, and source/market coverage is highly uneven.
- Most unlabelled F70 comments do not support a specific product topic. They remain
  unclassified rather than being forced into a theme to improve a completion rate.
- Rule labels are provisional. The measured label count is coverage, not an accuracy
  claim; a labelled holdout is needed before treating automation as validated.
- China has survey means but no customer comments. The pipeline never creates
  Chinese quotes or treats silence as satisfaction.
- Surveys lack sample sizes, feedback lacks dates, and German equipment lists
  cannot establish equipment fitted in other markets or earlier vehicles.
- The offline future lens is current pain. Future relevance in scoring is an
  explicit planning assumption, not external trend research.

The machine-readable report records all eight input hashes, draft provenance,
classification counts, quadrant counts and sensitivity scenarios.
