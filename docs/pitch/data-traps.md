# Traps we found in BMW's data

| Trap | How PMW handles it |
| --- | --- |
| **Broken sales formula** — F70 China 2024 contains `=-D3-C10`. | Flag the source error. The demo importer uses 0, consistent with the other supplied years; this is a fallback, not a recovered measurement. Priority weights use 2025 sales. |
| **Comments split across label rows** | Reassemble one comment per source ID and store its labels separately. Count comment IDs, not spreadsheet rows or unique people. |
| **Unlabelled comments** | Preserve BMW's labels; distinguish new rule/AI labels and retain abstentions. Expose classification gaps instead of silently discarding feedback. |
| **No China comments** | Use the supplied China survey summaries with limited confidence. Hide unavailable quotes; Happiness coverage is unknown (`null`), never fabricated as 0% or 100%. |
| **Germany-only price lists (July 2026)** | Cite the equipment/package evidence and mark transfer to other markets as an assumption. German availability does not establish US or China availability. |
| **Empty US survey questions** | Skip unanswered questions and show the gap in Data health. Missing answers provide no survey support; they are not zero satisfaction. |
| **Identical text under different IDs** | Flag repeated text but retain the distinct source records. Coverage deduplicates by comment ID across signals, without claiming distinct respondents. |

**Takeaway:** Keep the source traceable, expose uncertainty, and leave the product decision with the PM.

<!-- Presenter references, not additional slide content:
pipeline/pmw/ingest.py: ingest_feedback, ingest_studies, ingest_sales, ingest_equipment.
pipeline/pmw/signals.py: classify_unlabelled and full signal membership.
pipeline/pmw/scope.py: readable text-scope exclusions (pricing/regulatory).
web/lib/gate.ts: regional access and live Happiness coverage.
docs/HAPPINESS_DATA.md and docs/SURVEY_AND_SCOPE.md describe the Phase 2 implementation.
The source-error fallback is intentionally disclosed; no missing source value was reconstructed.
-->
