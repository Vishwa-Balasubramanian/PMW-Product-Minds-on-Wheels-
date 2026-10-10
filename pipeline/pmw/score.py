"""Step 5 - Score. Priority and confidence are computed separately, by code, never by the LLM.

"Language reasoning comes from AI. Decision metrics come from deterministic computation."
Owner: Vishwa. Weights live in DEFAULT_WEIGHTS and are copied into the settings table so the web app can show them.
"""
from __future__ import annotations

import math

DEFAULT_WEIGHTS = {
    # Customer pain + repeat evidence account for 60%; market reach contributes 20%.
    # Competitor name-drops are weak evidence (5%). Future relevance is a stated
    # strategy assumption (15%), never inferred market demand or projected revenue.
    "priority": {"impact": 0.35, "frequency": 0.25, "market": 0.20, "competitive": 0.05, "future": 0.15},
    # Breadth and independent perspectives matter as much as sample quantity.
    # Unknown dates receive neutral recency, never fabricated freshness.
    "confidence": {"quantity": 0.25, "sources": 0.25, "representation": 0.20, "agreement": 0.20, "recency": 0.10},
    # 55 retains the UI's Should-have boundary. 58 approximates a reference case:
    # 30 comments, two balanced sources, half-market coverage, partial agreement,
    # and unknown recency. Scores express evidence sufficiency, not probabilities.
    "thresholds": {"priority": 55, "confidence": 58},
}

FACTOR_LABELS = {
    "impact": "Customer impact", "frequency": "Frequency", "market": "Market relevance (2030 sales)",
    "competitive": "Competitive pressure", "future": "Future relevance (3-5 years)",
    "quantity": "Evidence quantity", "sources": "Source variety", "representation": "Market representation",
    "agreement": "Evidence agreement", "recency": "Recency",
}

# Topics likely to matter more by 2030. Marked as an assumption wherever used.
FUTURE_TOPICS = ("eSIM", "Connected", "App", "CarPlay", "charging", "Range", "assistant", "Assistant",
                 "Operating", "Touch screen", "Navigation", "Highway", "Driver assistance", "Remote")
FUTURE_LENS_SCORE = {"current_pain": 0.45, "emerging": 0.7, "future_must_have": 0.9}


def _weighted(factors: dict, weights: dict) -> int:
    total = sum(weights.values()) or 1
    return round(100 * sum(factors[k]["value"] * w for k, w in weights.items()) / total)


def priority(signal: dict, *, max_negative: int, survey: list[dict], market_shares_2030: dict, future_lens: str | None,
             weights: dict) -> tuple[int, dict]:
    neg_share = signal["n_negative"] / max(1, signal["n_comments"])
    impact = 0.6 * neg_share + 0.4 * signal["severity"]
    # Diminishing returns prevent a merged high-volume theme from suppressing
    # every smaller actionable topic. This is within-sample frequency, not prevalence.
    frequency = min(1.0, math.log1p(signal["n_negative"]) / max(1.0, math.log1p(max_negative)))
    markets_present = {m for m, n in signal["by_market"].items() if n >= 3}
    markets_present |= {r["market"] for r in survey if r["gap"] >= 0.3}
    market = sum(market_shares_2030.get(m, 0) for m in markets_present)
    competitive = min(1.0, signal["competitor_mentions"] / max(6.0, 0.15 * signal["n_comments"]))
    # A wording/model change must never silently change numeric decision metrics.
    # The LLM's future lens is explanatory only; strategy comes from this reviewed rule.
    hit = any(k.lower() in signal["topic"].lower() for k in FUTURE_TOPICS)
    future, fnote = (0.70 if hit else 0.45), "Assumption: reviewed topic rule for successor relevance; not a demand forecast"
    f = {
        "impact": {"value": round(impact, 3), "note": f"{neg_share:.0%} of comments negative, severity {signal['severity']:.2f}"},
        "frequency": {"value": round(frequency, 3), "note": f"{signal['n_negative']} negative comments (top topic = 1.0)"},
        "market": {"value": round(market, 3), "note": "2030 sales share of markets with evidence: " + (", ".join(sorted(markets_present)) or "none")},
        "competitive": {"value": round(competitive, 3), "note": f"{signal['competitor_mentions']} comments name a competitor"},
        "future": {"value": round(future, 3), "note": fnote},
    }
    for k in f:
        f[k]["weight"] = weights[k]
    return _weighted(f, weights), f


def confidence(signal: dict, *, survey: list[dict], representation: dict, weights: dict) -> tuple[int, dict]:
    n = signal["n_comments"]
    quantity = min(1.0, math.log10(n + 1) / 2.0)
    sources = len([s for s, c in signal["by_source"].items() if c >= 3])
    # Effective diversity discounts many nominal sources dominated by one channel.
    counts = [c for c in signal['by_source'].values() if c > 0]
    total = sum(counts) or 1
    effective = 1 / sum((c / total) ** 2 for c in counts) if counts else 0
    variety = min(1.0, (effective + (1 if survey else 0)) / 4)
    # How well does the evidence cover the markets where the car sells?
    fb_total = sum(signal["by_market"].values()) or 1
    overlap = sum(min(signal["by_market"].get(m, 0) / fb_total, r["sales_share"]) for m, r in representation.items())
    survey_markets = {r["market"] for r in survey}
    overlap += 0.3 * sum(r["sales_share"] for m, r in representation.items() if m in survey_markets and signal["by_market"].get(m, 0) < 3)
    rep = min(1.0, overlap)
    if survey:
        agree = sum(1 for r in survey if r["gap"] >= 0.3) / len(survey)
        agreement = 0.4 + 0.6 * agree
    else:
        agreement = 0.5
    contra = signal["n_likes"] / max(1, n)
    agreement = max(0.0, agreement - 0.5 * contra)
    f = {
        "quantity": {"value": round(quantity, 3), "note": f"{n} comments (100+ = full marks)"},
        "sources": {"value": round(variety, 3), "note": f"{sources} sources with 3+ comments; effective diversity {effective:.2f}" + (", plus survey" if survey else ", no survey match")},
        "representation": {"value": round(rep, 3), "note": "Overlap between where the evidence comes from and where the car sells"},
        "agreement": {"value": round(agreement, 3), "note": (f"{sum(1 for r in survey if r['gap'] >= 0.3)}/{len(survey)} survey measures agree" if survey else "No survey measure mapped")
                      + f"; {signal['n_likes']} comments praise this topic"},
        "recency": {"value": 0.5, "note": "The data has no dates, so recency cannot be checked"},
    }
    for k in f:
        f[k]["weight"] = weights[k]
    return _weighted(f, weights), f


def quadrant(p: int, c: int, thresholds: dict) -> str:
    hp, hc = p >= thresholds["priority"], c >= thresholds["confidence"]
    if hp and hc:
        return "act"
    if hp:
        return "validate"
    if hc:
        return "monitor"
    return "park"


def sensitivity(factors: dict, weights: dict, threshold: int) -> dict:
    """One-at-a-time strategy sensitivity, not a statistical confidence interval."""
    values = [_weighted(factors, weights)]
    for key in weights:
        for multiplier in (0.8, 1.2):
            alternative = {**weights, key: weights[key] * multiplier}
            values.append(_weighted(factors, alternative))
    return {"min": min(values), "max": max(values),
            "crosses_threshold": min(values) < threshold <= max(values)}


def challenge_issues(signal: dict, *, survey: list[dict], representation: dict, conf: int) -> dict:
    """Deterministic red-team check. The web app applies it when the PM clicks Challenge.

    Vishwa: add an LLM narrative on top, but keep these numbers as the basis.
    """
    issues = []
    total = sum(signal["by_market"].values()) or 1
    top_mk, top_n = max(signal["by_market"].items(), key=lambda kv: kv[1], default=("unknown", 0))
    if top_n / total >= 0.7:
        issues.append({"penalty": 8, "text": f"{top_n / total:.0%} of the comments come from {top_mk}."})
    for m, r in representation.items():
        if r["sales_share"] >= 0.15 and signal["by_market"].get(m, 0) == 0:
            issues.append({"penalty": 6, "text": f"No comments from {m}, which is {r['sales_share']:.0%} of 2025 sales."})
    if signal["n_comments"] < 30:
        issues.append({"penalty": 8, "text": f"Small base: only {signal['n_comments']} comments."})
    if signal["n_likes"] / max(1, signal["n_comments"]) >= 0.2:
        issues.append({"penalty": 6, "text": f"{signal['n_likes']} comments praise this topic, which partly contradicts the requirement."})
    disagree = [r for r in survey if r["gap"] < 0.2]
    if survey and len(disagree) == len(survey):
        issues.append({"penalty": 8, "text": "The survey does not show dissatisfaction on the mapped questions."})
    if not survey:
        issues.append({"penalty": 4, "text": "No survey question maps to this topic, so only comments support it."})
    src_total = sum(signal["by_source"].values()) or 1
    top_src, top_src_n = max(signal["by_source"].items(), key=lambda kv: kv[1], default=("unknown", 0))
    if top_src_n / src_total >= 0.8:
        issues.append({"penalty": 4, "text": f"{top_src_n / src_total:.0%} of the evidence comes from one source ({top_src})."})
    revised = max(0, conf - sum(i["penalty"] for i in issues))
    return {"issues": issues, "revised_confidence": revised}
