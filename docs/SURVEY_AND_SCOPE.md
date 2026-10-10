# Survey coverage and text scope

Reviewed mappings now cover 9/15 F70, 12/15 G60 and 13/15 G70 core themes on the supplied files. New direct matches include exterior styling, mirror visibility, door entry/handles, trunk operation and customization. US-only mappings remain unavailable for F70, which has no US study.

Deliberate gaps are documented in `SURVEY_COVERAGE_GAPS` and shown in Data health. Public charging, high-voltage charging, key/locking operation and rear entertainment lack direct study questions. Rear roominess was removed as an inappropriate proxy for rear entertainment. Missing evidence is preferable to a misleading match.

`feedback_scope(feedback_id, in_scope, reason)` records explicit text-based exclusions without modifying raw feedback or BMW labels. Clear pricing/financing requests, regulatory content and engineering specifications are excluded from signal counts, selected quotes, AI classification and equipment matches. The supplied files contain 13 flagged comments: F70 3, G60 7, G70 3. Each has an audit event and readable reason; Data health summarizes the categories.

Background mentions of leases, MSRP or recalls do not automatically exclude a valid product complaint. Mixed comments that match an exclusion are retained in the source table for review and separation of any usable product content. The conservative rules are inspectable heuristics, not a claim of perfect classification.

The async `feedbackScope(viewer, vehicle)` gate returns only authorized-market IDs and reasons. `FeedbackScope` mirrors the additive table in TypeScript. Rebuild after pulling.

These new source mappings intentionally change some scores through the existing deterministic formulas. No scoring weights or thresholds were changed. G70 still spans all four quadrants; its core distribution is now Act 7, Validate first 1, Monitor 4, Park 3. The previous two-per-quadrant test quota was replaced with the meaningful all-quadrants check.
