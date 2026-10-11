# How scoring works

**Slide:** Priority asks “How much does this matter?” Confidence asks “How strong is the evidence?”
Both are deterministic weighted averages on a 0–100 scale. The model writes hypotheses and explanations;
it cannot set a score, weight, threshold, or evidence mix.

| Priority factor | Default weight | Confidence factor | Default weight |
|---|---:|---|---:|
| Customer impact | 35% | Evidence quantity | 25% |
| Within-sample frequency | 25% | Source diversity | 25% |
| Market relevance (2030 sales shares) | 20% | Market representation | 20% |
| Competitive mentions | 5% | Evidence agreement | 20% |
| Successor relevance (declared assumption) | 15% | Recency | 10% |

`score = round(100 × Σ(value × weight) / Σ(weight))`

Default boundaries: priority **55**, confidence **58**. High/high → Act; high/low → Validate first;
low/high → Monitor; low/low → Park. PMs can preview and apply different priority weights with a reason;
the application logs the change and recomputes ranking. Confidence stays independent of strategy weights.

**Challenge** identifies concentration, missing markets, small samples and conflicting evidence, then applies
published confidence penalties. It explains the result and records the change; priority stays unchanged.
The PM still approves, edits, rejects or requests validation. No score is a probability or an automatic approval.

**Speaker note:** “Numbers come from code; words come from the model or reviewed templates. We show every
factor, source, assumption and change. The evidence meter separates comments, surveys, inference and assumptions;
it is a provenance index, not another confidence score. China can have survey evidence and zero observed comments.”

## Five likely formula questions

### 1. Why these weights and boundaries? Are they statistically validated?

They are explicit prototype strategy choices, not fitted or validated predictions. Impact and repeat evidence
receive 60% of priority; a competitor name alone receives only 5%. Quantity and diversity share half of confidence.
55 matches the existing Should-have priority boundary; 58 approximates a reference evidence case with 30 comments,
two balanced sources, partial representation/agreement and unknown dates. Production calibration needs historical
PM decisions and outcome validation. The sensitivity panel varies each priority weight by ±20%, one at a time,
renormalizes, and flags a boundary crossing. That range is not a statistical confidence interval.

### 2. How do you stop a high-volume topic or the US sample dominating?

Frequency uses `min(1, log1p(negative comments) / max(1, log1p(largest negative count)))`, relative to that vehicle's
selected themes. Impact is `0.6 × negative share + 0.4 × severity`. IDs are deduplicated within each theme; IDs are
not necessarily unique people. Quantity saturates at `min(1, log10(n + 1) / 2)`. Source diversity uses the inverse
sum of squared source shares, plus one when mapped survey evidence exists, divided by four and capped at one.
Representation compares comment market shares with **2025** sales shares; a survey in a market with fewer than
three comments gets only partial credit (30% of that market's sales share). These measures expose bias; they do
not correct the sample into a representative population. Missing voices remain visible.

### 3. How do surveys, competitors and the 2030 assumptions affect priority and confidence?

Market relevance sums **2030** sales shares for markets with at least three topic comments or a mapped survey gap
of at least 0.3. Competitive pressure is `min(1, competitor mentions / max(6, 0.15 × comments))`. Future relevance
is a reviewed topic rule (0.70 for the configured successor-relevant topics, otherwise 0.45); it is neither a
demand forecast nor a model-generated value. Confidence agreement starts at 0.4 plus 0.6 times the fraction of
survey measures with gap ≥0.3 (0.5 if none), then subtracts half the share of comments that exclusively praise
the topic. Recency is 0.5 because dates are absent. A feature quick win uses its specific wishing comments and
no broad-topic survey as proof of demand. All these details are available beside each factor in the app.

### 4. What exactly does Challenge change, and can it keep lowering confidence?

Challenge subtracts deterministic penalties from the original confidence: 8 for ≥70% of comments from one
market; 6 for each market with ≥15% of 2025 sales and zero comments; 8 for fewer than 30 comments; 6 if ≥20% praise
the topic; 8 if every mapped survey gap is below 0.2; 4 if no survey maps; 4 for ≥80% of evidence from one source.
The result is clamped at zero. These penalties can overlap; they are a conservative review heuristic, not
independent probabilities. The action is applied once, with audit entries, and may move the quadrant. It neither
changes priority nor decides for the PM. Repeated clicks do not stack penalties.

### 5. Does “40% observed” mean 40% of the requirement has been proven?

No. Evidence composition v1 allocates transparent units: observed comments get up to four, reaching the cap at
30 distinct IDs; distinct mapped survey measures get one each, capped at four. Inference gets two for causal
hypothesis and requirement translation, one extra if multiple source topics were merged, and up to one for the
fraction of provisionally labelled comments. Assumptions get one for successor relevance and another for equipment
transfer in quick wins. Normalize to one, with deterministic rounding. These are design choices, not measured
truth fractions. Each market is computed independently, so China's observed portion is zero with this dataset.
Surveys may disagree with the draft; their direction belongs in the agreement score and evidence panel. Editing
the prose does not validate the hypothesis or change the draft's underlying provenance.

## Survey-only market-conflict candidates

The merged market-conflict builder uses the same weight sets but a separate, explicit factor mapping because
these candidates have no comment signal. Impact is the largest of the two survey gaps; frequency, quantity and
competitive pressure are zero (unknown, not invented). Market relevance and representation use the combined
**2025** CN/EU sales share. Future relevance is 0.45, source diversity and agreement are each 0.25, and recency is
0.5. Challenge subtracts 8 for unknown sample sizes and 6 for absent comment triangulation. The evidence meter
counts only the supplied survey rows plus inference and successor assumptions, even for the all-markets viewer.
See [market_requirements.py](../../pipeline/pmw/market_requirements.py). Their scores are review prompts, not
evidence that CN and EU need different products.

Implementation: [score.py](../../pipeline/pmw/score.py), [evidence_mix.py](../../pipeline/pmw/evidence_mix.py),
[web score parity](../../web/lib/score.ts), [audit actions](../../web/lib/actions.ts).
Live Anthropic generation was skipped for this delivery because no key was configured. Reviewed templates remain
labelled as such; no live before/after comparison or generated cache is claimed.
