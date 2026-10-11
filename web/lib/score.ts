// The priority formula from pipeline/pmw/score.py, reproduced exactly so the web app can re-rank requirements
// under different strategy weights. Pure functions, shared by server and client. Confidence is never recomputed here:
// it measures evidence, not strategy, and a challenge may have lowered it.
//
//   priority = round(100 × Σ weight·value / Σ weight)     (Python round: halves go to the even integer)
//   quadrant = Act if priority ≥ T_p and confidence ≥ T_c, Validate first if only priority, Monitor if only confidence, else Park
//
// Keep in sync with score.py (_weighted, quadrant, sensitivity). scripts/test-score.mjs proves that the default
// weights reproduce every stored priority and quadrant in the database.

export const PRIORITY_FACTORS = ["impact", "frequency", "market", "competitive", "future"] as const;
export type PriorityFactor = (typeof PRIORITY_FACTORS)[number];
export type PriorityWeights = Record<PriorityFactor, number>;
export type Thresholds = { priority: number; confidence: number };
export type QuadrantKey = "act" | "validate" | "monitor" | "park";

/** Python's round() for a float: nearest integer, exact halves to the even neighbour. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff === 0.5) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

/** score._weighted. Sums in the canonical factor order so the floating-point result matches Python bit for bit. */
export function weightedScore(values: Partial<Record<string, number>>, weights: PriorityWeights): number {
  let total = 0;
  for (const k of PRIORITY_FACTORS) total += weights[k];
  if (!total) total = 1;
  let sum = 0;
  for (const k of PRIORITY_FACTORS) sum += (values[k] ?? 0) * weights[k];
  return pyRound((100 * sum) / total);
}

/** score.quadrant */
export function quadrantOf(priority: number, confidence: number, t: Thresholds): QuadrantKey {
  const hp = priority >= t.priority;
  const hc = confidence >= t.confidence;
  return hp && hc ? "act" : hp ? "validate" : hc ? "monitor" : "park";
}

/** score.sensitivity: each weight ×0.8 and ×1.2 in turn. A strategy check, not a statistical interval. */
export function sensitivity(values: Partial<Record<string, number>>, weights: PriorityWeights, threshold: number) {
  const out = [weightedScore(values, weights)];
  for (const k of PRIORITY_FACTORS) {
    for (const m of [0.8, 1.2]) out.push(weightedScore(values, { ...weights, [k]: weights[k] * m }));
  }
  const min = Math.min(...out), max = Math.max(...out);
  return { min, max, crosses_threshold: min < threshold && threshold <= max };
}

/** Scale weights to sum to 1, rounded to four decimals. Used by the action that stores them and by the live preview. */
export function normalise(raw: Record<PriorityFactor, number>): PriorityWeights {
  const total = PRIORITY_FACTORS.reduce((s, k) => s + raw[k], 0) || 1;
  return Object.fromEntries(PRIORITY_FACTORS.map((k) => [k, Math.round((raw[k] / total) * 10000) / 10000])) as PriorityWeights;
}

/** Factor values (0..1) from a requirement's stored priority_factors. */
export function factorValues(factors: Record<string, { value: number }>): Record<PriorityFactor, number> {
  return Object.fromEntries(PRIORITY_FACTORS.map((k) => [k, factors[k]?.value ?? 0])) as Record<PriorityFactor, number>;
}

// ---------- strategy presets ----------
// One place for the presets. Each set sums to 1. The five factors are not market-specific: "market" is the 2030 sales
// share of the markets where a topic has evidence, so a market preset cannot select one country. It shifts emphasis
// towards what that market is known to reward and leans on the market-reach factor.
export const PRESETS: { key: string; label: string; idea: string; weights: PriorityWeights }[] = [
  {
    key: "customer_first",
    label: "Customer first",
    // What hurts the most customers the most: pain and repeat evidence dominate, strategy bets are minor.
    idea: "Customer pain and how often it is raised decide the ranking.",
    weights: { impact: 0.45, frequency: 0.35, market: 0.1, competitive: 0.05, future: 0.05 },
  },
  {
    key: "premium_experience",
    label: "Premium experience",
    // A flagship is judged on how bad a flaw feels and on where rivals are ahead, less on raw volume.
    idea: "Severity of the flaw and pressure from rival flagships count more than volume.",
    weights: { impact: 0.4, frequency: 0.1, market: 0.1, competitive: 0.2, future: 0.2 },
  },
  {
    key: "quick_wins",
    label: "Quick wins",
    // Today's frequent, widely sold problems first; long-term bets wait for the next cycle.
    idea: "Frequent problems in big markets today; future bets wait.",
    weights: { impact: 0.25, frequency: 0.4, market: 0.25, competitive: 0.05, future: 0.05 },
  },
  {
    key: "china_focus",
    label: "China focus",
    // China buyers weigh connected and digital features heavily, so market reach and future relevance go up.
    idea: "Market reach and connected, future-facing topics, which Chinese buyers weigh heavily.",
    weights: { impact: 0.25, frequency: 0.1, market: 0.35, competitive: 0.05, future: 0.25 },
  },
  {
    key: "europe_focus",
    label: "Europe focus",
    // Europe is the largest 2030 market and the home of the direct rivals: market reach and competitive pressure go up.
    idea: "Market reach and pressure from European premium rivals.",
    weights: { impact: 0.3, frequency: 0.15, market: 0.3, competitive: 0.15, future: 0.1 },
  },
  {
    key: "us_focus",
    label: "US focus",
    idea: "Prioritise customer impact and market reach, with recurring problems ahead of future bets.",
    weights: { impact: 0.4, frequency: 0.2, market: 0.25, competitive: 0.1, future: 0.05 },
  },
];

export function presetLabel(key: string | null | undefined): string {
  if (!key || key === "custom") return "Custom weights";
  return PRESETS.find((p) => p.key === key)?.label ?? key;
}
