# Happiness Meter data for Gokul

Call `await happiness(viewer, vehicle)` from `web/lib/gate.ts`. This is live approval coverage, not a measurement of actual satisfaction or predicted customer happiness. No caching is applied.

Each authorized market returns `market`, `negativeComments`, `coveredComments`, `share`, and `salesWeight`. `share` is a fraction from zero to one, or `null` when there is no eligible negative feedback. China remains unknown. `salesWeight` is that market's share of global vehicle sales in 2025; missing sales totals return `null`. Do not renormalize the weight merely because the viewer sees one market.

Counts use distinct IDs from all negative comments on in-scope signals. They do not use the limited quote sample. A comment appearing in several signals counts once. Approved core requirements cover their full signals; approved quick wins cover only their own matching comment IDs. Survey-only conflict requirements do not imply coverage of customer comments. Editing, rejection, validation requests, and reopening remove coverage until approved again.

Schema addition: `signal_feedback(signal_id, feedback_id)` retains the complete negative-comment membership. Rebuild the local database after pulling this change; the TypeScript mirror is `SignalFeedback`. The display sample remains in `signal_evidence`.

If the UI computes a sales-weighted portfolio figure, report the sales share with known evidence alongside it. Never silently substitute zero or full coverage for missing markets.
