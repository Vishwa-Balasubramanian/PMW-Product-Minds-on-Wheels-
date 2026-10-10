# Validated AI cache

Live calls write `derive_<sha256>.json`, `classify_<sha256>.json` and
`challenge_<sha256>.json` here. Commit successful outputs with the implementation
so teammates can run `uv run pmw build --offline` without an API key.

The hash covers the model, system instructions, task instructions, schema and
complete evidence payload. Each file stores input/output hashes, producer and
validated output. Cache reads repeat semantic validation, including citation IDs
and literal classification spans. Changed evidence or prompts produce new keys.
Corrupt or unsupported caches fall back explicitly and write an audit event.

No live generation was run for the offline deliverable. Offline task profiles and
lexical rules live in source code and are never presented as cached API output.
Unit-test responses are temporary fixtures, never committed here as real results.

Do not add credentials, request headers, environment files, or exception bodies.
Before sharing generated classifications, review their short evidence spans as
you would the original customer data.
