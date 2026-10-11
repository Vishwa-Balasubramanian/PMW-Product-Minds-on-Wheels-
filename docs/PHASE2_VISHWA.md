# Vishwa Phase 2 delivery

Branch: `feature_v` (as requested). Includes the professional workspace and the latest merged team work from
`main` at `73f49cd`. The existing review actions, exports, region restrictions, ranking controls and audit trail
remain available. The Phase 2 meter integration does not edit `DecisionCard.tsx`: the vehicle page composes the
meter immediately above the card. This branch also retains the earlier workspace redesign, which introduced
review tabs in that card. The sidebar/mobile navigation includes the new portfolio route.

| Brief item | Delivery |
|---|---|
| P2-1 | Deterministic global and market evidence mixes; stacked meter; legacy backfill; pipeline and browser checks |
| P2-2 | `/portfolio`: theme × vehicle heatmap, sample counts, recurring themes, links to signals, internal mobile scrolling |
| P2-3 | Skipped as allowed: no Anthropic API key configured. Reviewed templates retained; no fabricated live cache or comparison |
| P2-4 | [Scoring slide and five formula answers](pitch/scoring.md), including the merged survey-only scoring exception |

## Schema and migration

Additive columns in `requirements`, mirrored in `web/lib/types.ts`:

- `evidence_mix TEXT`: JSON `{observed, survey, inferred, assumed}`, normalized to one. Nullable solely for an
  existing database awaiting backfill; all requirements in a completed build have a value.
- `evidence_mix_by_market TEXT NOT NULL DEFAULT '{}'`: the same four-key mix for US, EU, CN and ROW. These are
  computed by the pipeline, so the web app never estimates regional composition from a small displayed quote sample.

`settings.evidence_mix_rule` records `evidence-mix:v1` and its explanation. The rule is documented next to the
[implementation](../pipeline/pmw/evidence_mix.py). It uses distinct comment IDs and survey measure identities,
tracks provisional labels and theme merging, respects text exclusions, and uses only feature-specific wishes for
quick wins. Survey-only conflict candidates never borrow a comment signal. A batched source scan avoids a query
per requirement and market. The mix describes the draft's provenance, not causal proof or measured truth fractions.

For an existing SQLite database, make a SQLite backup, set `PMW_DB` to that file's absolute path if needed, then run:

```sh
cd pipeline
uv run pmw evidence-mix
```

This command adds columns, fills the mix and writes an aggregate audit event in one transaction. It does not
rebuild, change requirement IDs, overwrite PM wording/status/scores, reset strategy weights, or delete history.
It is idempotent and rolls back the additive schema if computation fails. It does not regenerate old requirements
from newly changed upstream source rules; a full `pmw build` is still a fresh-demo rebuild that erases decisions.

For this delivery, the local database was backed up to `db/pmw-before-phase2-20261010-223932.sqlite` and all
131 existing requirements were enriched; every original field and all 807 pre-existing audit events were checked
for equality. An isolated rebuild in `db/pmw-phase2-verify.sqlite` exercises the latest pipeline instead: 61
requirements (45 core, 10 equipment quick wins, 6 survey-only market conflicts) from all eight supplied files.
Database files and backups are ignored by Git. The hosted Turso database has not been replaced; its maintainer
must apply the additive backfill to a current snapshot before using the meter there. An older hosted schema
continues rendering with “Evidence composition is pending for this dataset” instead of invented percentages.

## Component handoff

```tsx
<EvidenceMeter mix={detail.requirement.evidence_mix} region={viewer.label} />
```

Props: `mix: EvidenceMix | null`, `region: string`. Use the requirement returned by `getRequirement(viewer, id)`;
`gate.ts` selects the viewer's precomputed mix. Never pair the global mix with a regional label. The component is
server-compatible, takes no raw customer text, includes a textual legend and accessible bar description, and
displays rounded percentages that total 100. The expandable explanation distinguishes provenance from confidence.
For China, observed comments are zero even when US comments inform the global draft. No changes to DecisionCard
are required for the integration delivered here.

`portfolio()` is an async gate read of only vehicle labels and in-scope signal summary counts. The page does not
fetch comment text, IDs or dominant-issue snippets. Its values are identical across viewer regions. “No evidence”
is distinct from 0% negative. Counts are deduplicated within a theme, but cannot be added across themes.

## Validation

- Isolated `uv run pmw build` and `uv run pmw verify`: pass, all eight source files checked.
- `uv run --with pytest pytest -q tests`: 69 tests plus 66 subtests pass, including normalization, China,
  quick wins, survey-only candidates, tamper detection, migration preservation and rollback.
- Node score, equipment-evidence and happiness checks: 5 pass; score parity covers all 61 rebuilt requirements.
- Next route type generation, TypeScript, ESLint and production build pass.
- Browser checks: 30 pass, including regional meter values/rounding, aggregate-only heatmap parity across all five regions,
  vehicle links, 375px scrolling, and the existing PM workflow, exports, weights, privacy and keyboard navigation.

Screenshots from the isolated production build are in [reports/vishwa-phase2](reports/vishwa-phase2).
The browser test fixture is copied to `db/pmw-smoke-run.sqlite`; tests never mutate the working database.
