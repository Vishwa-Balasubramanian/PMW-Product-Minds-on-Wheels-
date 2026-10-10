"""Deterministic provenance composition; neither confidence nor proof of a claim.

Judge rule (v1): assign observed comments up to four units, rising linearly to
30 distinct comments; assign one unit per distinct mapped survey measure, capped
at four (survey rows are measures, not respondents, and may also contradict the
draft). Reserve two inference units for the causal hypothesis and its translation
to a requirement, plus one when multiple source topics were merged and up to one
for the fraction of comments with provisional AI/rule labels. Reserve one
assumption unit for successor/2030 relevance, plus one for equipment transfer in
quick wins. Normalize these units to 100%. Apply the identical rule separately
to each market, using its comments and survey rows; never borrow other markets'
comments. These explicit, versioned design choices describe the draft's basis,
not measured fractions of truth; rewriting prose cannot change the result.
"""
from __future__ import annotations

import json
from collections import defaultdict

from . import db
from .config import MARKETS
from .themes import theme_for

VERSION = "evidence-mix:v1"
KEYS = ("observed", "survey", "inferred", "assumed")


def compute(*, comments: int, survey: list[dict], provisional: int = 0,
            merged: bool = False, quick_win: bool = False) -> dict[str, float]:
    if comments < 0 or not 0 <= provisional <= comments:
        raise ValueError("Invalid comment counts")
    measures = {(r.get("market"), r.get("study"), r.get("variant"), r["attribute"]) for r in survey}
    units = (4 * min(comments, 30) / 30, min(len(measures), 4),
             2 + int(merged) + provisional / max(1, comments), 1 + int(quick_win))
    # Largest remainder allocation: stable, nonnegative, totals exactly 1,000,000 units.
    scaled = [v / sum(units) * 1_000_000 for v in units]
    integers = [int(v) for v in scaled]
    for i in sorted(range(4), key=lambda i: -(scaled[i] - integers[i]))[:1_000_000 - sum(integers)]:
        integers[i] += 1
    return {k: v / 1_000_000 for k, v in zip(KEYS, integers)}


def profiles(con) -> dict[str, dict[str, dict[str, float]]]:
    """One batched scan of source labels, not the bounded prompt/quote sample."""
    by_theme = defaultdict(dict)
    feedback = {r["id"]: dict(r) for r in con.execute("SELECT id, market, vehicle FROM feedback")}
    labels = con.execute("SELECT feedback_id, topic, label_source FROM feedback_labels WHERE topic IS NOT NULL")
    provisional_ids = set()
    for label in labels:
        f = feedback[label["feedback_id"]]
        provisional = label["label_source"] != "bmw"
        if provisional:
            provisional_ids.add(f["id"])
        entry = by_theme[(f["vehicle"], theme_for(label["topic"]))].setdefault(
            f["id"], {**f, "topics": set(), "provisional": False})
        entry["topics"].add(label["topic"])
        entry["provisional"] |= provisional
    topics = {r["id"]: r["topic"] for r in con.execute("SELECT id, topic FROM signals")}
    result = {}
    for req in con.execute("SELECT id, vehicle, signal_id, kind, already_exists, survey FROM requirements"):
        quick = req["kind"] == "quick_win"
        if quick:
            # Feature-specific wishes only: don't inflate a quick win with its parent theme.
            ids = {fid for m in json.loads(req["already_exists"]) for fid in m["feedback_ids"]}
            comments = [{**feedback[fid], "topics": set(), "provisional": fid in provisional_ids}
                        for fid in sorted(ids) if fid in feedback and feedback[fid]["vehicle"] == req["vehicle"]]
        else:
            comments = list(by_theme[(req["vehicle"], topics[req["signal_id"]])].values())
        survey = json.loads(req["survey"])
        regional = {}
        for market in ("ALL", *MARKETS):
            selected = [f for f in comments if market == "ALL" or f["market"] == market]
            measures = [s for s in survey if market == "ALL" or s["market"] == market]
            regional[market] = compute(comments=len(selected), survey=measures,
                provisional=sum(f["provisional"] for f in selected),
                merged=len({topic for f in selected for topic in f["topics"]}) > 1,
                quick_win=quick)
        result[req["id"]] = regional
    return result


def refresh(con) -> int:
    """Add columns and backfill atomically, preserving decisions, scores and history.

    Caller owns the transaction. Safe to rerun; only changed rows receive new
    metadata. No customer text or IDs are added to the aggregate migration event.
    """
    columns = {r[1] for r in con.execute("PRAGMA table_info(requirements)")}
    if "evidence_mix" not in columns:
        con.execute("ALTER TABLE requirements ADD COLUMN evidence_mix TEXT")
    if "evidence_mix_by_market" not in columns:
        con.execute("ALTER TABLE requirements ADD COLUMN evidence_mix_by_market TEXT NOT NULL DEFAULT '{}'")
    existing = {r["id"]: (r["evidence_mix"], r["evidence_mix_by_market"])
                for r in con.execute("SELECT id, evidence_mix, evidence_mix_by_market FROM requirements")}
    changed = 0
    for rid, regional in profiles(con).items():
        values = (db.dumps(regional.pop("ALL")), db.dumps(regional))
        if values == existing[rid]:
            continue
        con.execute("UPDATE requirements SET evidence_mix=?, evidence_mix_by_market=? WHERE id=?", (*values, rid))
        changed += 1
    con.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('evidence_mix_rule', ?)",
                (db.dumps({"version": VERSION, "description": __doc__}),))
    if changed:
        db.audit(con, actor_type="system", actor="Evidence composition", entity_type="dataset",
                 action="computed evidence mixes", after=f"{changed} requirements", rationale=VERSION)
    return changed
