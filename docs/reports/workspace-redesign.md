# Workspace redesign verification — 10 October 2026

The photographic landing page and large requirement banners have been replaced
with an operational portfolio, persistent navigation, compact requirement rows,
and an adjacent review panel. This implements the approved light workspace and
list + panel design.

## Behavior and integration

- The shared shell contains Portfolio, all three vehicle programs, Audit trail,
  and the region picker. Navigation becomes a modal drawer below 1024px.
- Requirements and review scroll independently at 1280px and above. Smaller
  screens show the list or selected detail, with a return link retaining the
  quadrant filter. Existing `view`, `q`, and `req` URLs remain supported.
- Overview retains the entire customer voice / signal / root cause / need /
  requirement chain and assumptions. Evidence contains quotes, surveys and
  market conflicts. Scoring retains both factor breakdowns and the matrix.
  Activity contains the requirement audit trail.
- Review tabs support arrow keys, Home and End. Changing requirements opens
  Overview and discards the previous unsaved edit. Decision actions remain
  accessible while scrolling; an open form scrolls naturally. Challenge results
  appear above the tabs regardless of the selected tab.
- The latest main (`b5b96f9`) was merged before delivery, preserving CSV/JSON
  exports, feature-specific equipment evidence, shared MoSCoW thresholds, PMW
  branding, and the locally available BMW font / self-hosted Inter fallback.
  Exports are available from the vehicle header on desktop and mobile.
- Relative to current main, this redesign changes no database schema, API
  contract, scoring formula, evidence gate, decision handler or export payload.

## Verification

| Check | Result |
|---|---|
| Offline pipeline build and verifier, isolated database | Passed |
| Python regression suite | 43 passed |
| Equipment evidence gate integration test | 1 passed |
| Next route type generation and TypeScript | Passed |
| Full ESLint | Passed |
| Production Next.js build | Passed |
| Microsoft Edge Playwright suite | 21 passed |
| Vehicle/view/region combinations within the suite | All 60 rendered |
| Layout checks | 360, 390, 768, 1280 and 1440px widths |
| Local development preview | HTTP 200 at port 3000 |

Browser coverage retains the complete PM lifecycle, challenge penalties and
audit events, input validation, network failure/retry, raw evidence restrictions
in HTML and serialized props, equipment evidence, and unavailable regions. New
coverage checks tab keyboard navigation, independent scrolling, selection history,
mobile list/detail navigation, drawer focus, narrow layouts, and regional exports.
Desktop and mobile screenshots were visually reviewed. Screenshot artifacts are
written to the ignored `web/test-results/` directory.

## Reproduce without replacing saved decisions

Run from the repository root in PowerShell:

```powershell
$env:PMW_DB = Join-Path (Get-Location) 'db/pmw-workspace-main-verify.sqlite'
cd pipeline
python -m uv run pmw build --offline
python -m uv run pmw verify
python -m uv run python -m unittest discover -s tests -v
cd ../web
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node --test scripts/test-equipment-evidence.mjs
npm run lint
npm run build
$env:PMW_TEST_SOURCE = $env:PMW_DB
$env:PW_CHANNEL = 'msedge'
npm run test:e2e
```

Playwright copies the source fixture into its dedicated smoke database and
disables hosted database access. The new main equipment rules produce 45 core
drafts and 10 feature-specific quick wins in the rebuilt fixture. This count
change comes from main's equipment correction, not the presentation redesign.

The local preview continues to use the existing `db/pmw.sqlite`; it was not
rebuilt or replaced. No saved PM decision was changed by verification. No hosted
database push or deployment was performed. Live Anthropic generation remains
unverified until the user configures the key.
