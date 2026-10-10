# Offline verification — 10 October 2026

Scope: `feature_v`, local Python pipeline and production Next.js server. The user
confirmed that the later credential will be an **Anthropic API key**. No live model
calls, hosted database writes or deployments were made.

## Results

| Check | Result |
|---|---|
| Locked Python dependencies, including the LLM extra | Passed |
| Default pipeline build and explicit `--offline` build | Passed, using separate SQLite files |
| Compare generated requirements between both build modes | All 131 drafts and scores identical |
| Data verifier | Passed for all eight input files and all drafts |
| Python regression suite | 36 tests passed |
| TypeScript and full ESLint | Passed |
| Production Next.js build | Passed without the previous database-path tracing warning |
| Playwright on installed Microsoft Edge | 14 tests passed |
| Vehicle views across regions | 3 vehicles × 4 views × 5 regions: all 60 combinations rendered |
| Production dependency audit | Zero reported vulnerabilities |
| Key files | `pipeline/.env` and `web/.env.local` are ignored by Git |

Browser coverage includes the full requirement ladder; Challenge, confidence and
quadrant changes; repeat Challenge; edit, validate, approve, reopen and reject;
audit records and reasons; region restrictions on reads and writes; malformed
input; network failure and retry; switching requirements during an unsaved edit;
mobile region selection; images; home, audit, unknown routes and invalid filters.

Pipeline coverage includes all supplied data, original-label preservation,
classifier abstention, theme deduplication, equipment matching, deterministic
scores, cache replay/invalidation, malformed responses and cache files, and
Anthropic SDK serialization/authentication failure with a mock HTTP transport.
No actual API key is used by these tests.

## Defects fixed during verification

- Invalid decision payloads now return a validation response instead of crashing
  on non-string reasons. Edits reject unknown fields and blank values.
- Moving between requirements resets the editor, preventing stale unsaved text
  from being applied to a different requirement.
- Decision and region controls lock while saving, show a readable failure, and
  permit retry after a failed request.
- A material edit returns an approved requirement to review and records the
  status transition in the audit trail.
- Invalid filters fall back to the requirements view. A URL cannot select a
  requirement from a different vehicle or outside the displayed filter.
- Audit entries wrap on mobile, including long cache fingerprints; the page no
  longer expands beyond a narrow viewport.
- A valid JSON cache with the wrong shape falls back safely. Cache write failures
  do not repeat model generation. Provider errors avoid copying sensitive text
  into audit output, and SDK clients close after use.
- The verifier checks priority and revised confidence even after a Challenge.
- Runtime database paths are excluded from deployment tracing, removing the
  build warning without changing local SQLite or hosted Turso selection.

## Reproduce without changing a working session

PowerShell from the repository root:

```powershell
$env:PMW_DB = Join-Path (Get-Location) 'db/pmw-verify-run.sqlite'
cd pipeline
python -m uv sync --frozen --extra llm
python -m uv run pmw build --offline
python -m uv run pmw verify
python -m uv run python -m unittest discover -s tests -v
cd ../web
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm run build
$env:PMW_TEST_SOURCE = $env:PMW_DB
$env:PW_CHANNEL = 'msedge'
npm run test:e2e
```

With Playwright Chromium installed, omit `PW_CHANNEL`. The test suite copies
`PMW_TEST_SOURCE` to its dedicated database and disables remote database settings.

## Remaining boundaries

Actual Anthropic connectivity, account/model access, rate limits and model output
quality require a later credentialed run. The installed SDK request shape and
configured model were checked against the official
[model reference](https://platform.claude.com/docs/en/models/overview) and
[structured output guide](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
Set `ANTHROPIC_API_KEY` locally in `pipeline/.env`; do not commit it. `--offline`
continues to prevent network generation even when the key is present.

The full npm audit reports five affected development packages from one upstream
[braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
in the Next.js ESLint dependency chain. The installed chain has no compatible
fix reported by npm; its proposed change downgrades the Next.js ESLint
configuration to another major version. This remains a development-tooling
limitation. The production-only audit is clear.

Testing used Edge on Windows and local SQLite. Other browser engines, production
Turso credentials and deployed infrastructure were not exercised.
