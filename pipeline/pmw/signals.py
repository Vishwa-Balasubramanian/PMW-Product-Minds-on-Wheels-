"""Step 2 - Signals. Group customer comments into themes per vehicle.

Base version groups by BMW's own topic labels (taxonomy level 2).
Owner: Vishwa (AI). Next: classify_unlabelled() with the LLM, merge topics into real themes, detect root causes.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict

from . import db
from .scope import topic_scope

NEGATIVE = {"Difficult to Use", "Defect", "Wants"}
SEVERITY_SCORE = {"very minor": 0.2, "minor": 0.4, "moderate": 0.6, "serious": 0.8, "very serious": 1.0}
SOURCE_RANK = {"Source C": 0, "Source B": 1, "Source A": 2, "Source D": 3}


def classify_unlabelled(con, vehicle: str) -> int:
    """TODO (Vishwa): send unlabelled comments to the LLM in batches, write labels with label_source='ai'.

    Return the number of comments labelled. Must log one audit event per batch.
    """
    return 0


def build(con, vehicle: str) -> list[str]:
    rows = con.execute(
        """SELECT f.id, f.source, f.market, f.text, f.severity, f.competitors,
                  l.feedback_type, l.topic, l.subtopic
           FROM feedback f JOIN feedback_labels l ON l.feedback_id = f.id
           WHERE f.vehicle = ? AND l.topic IS NOT NULL""", (vehicle,)).fetchall()

    by_topic: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        c = by_topic[r["topic"]].setdefault(r["id"], {
            "source": r["source"], "market": r["market"], "text": r["text"], "severity": r["severity"],
            "competitors": r["competitors"], "types": set(), "subtopics": []})
        if r["feedback_type"]:
            c["types"].add(r["feedback_type"])
        if r["subtopic"]:
            c["subtopics"].append((r["feedback_type"], r["subtopic"]))

    stats = []
    for topic, comments in by_topic.items():
        neg = {fid: c for fid, c in comments.items() if c["types"] & NEGATIVE}
        likes = {fid: c for fid, c in comments.items() if "Likes" in c["types"] and not (c["types"] & NEGATIVE)}
        sev_vals = [SEVERITY_SCORE[c["severity"]] for c in neg.values() if c["severity"] in SEVERITY_SCORE]
        defect_share = sum(1 for c in neg.values() if "Defect" in c["types"]) / max(1, len(neg))
        severity = (sum(sev_vals) / len(sev_vals)) if sev_vals else 0.5
        severity = min(1.0, 0.75 * severity + 0.25 * defect_share)
        dom = Counter(s for c in neg.values() for t, s in c["subtopics"] if t in NEGATIVE).most_common(1)
        stats.append({
            "topic": topic, "comments": comments, "neg": neg, "likes": likes,
            "n_hard": sum(1 for c in comments.values() if "Difficult to Use" in c["types"]),
            "n_defect": sum(1 for c in comments.values() if "Defect" in c["types"]),
            "n_wants": sum(1 for c in comments.values() if "Wants" in c["types"]),
            "severity": round(severity, 3),
            "dominant": dom[0][0] if dom else None,
            "competitors": sum(1 for c in comments.values() if c["competitors"]),
            "by_market": dict(Counter(c["market"] for c in comments.values())),
            "by_source": dict(Counter(c["source"] for c in comments.values())),
        })

    stats.sort(key=lambda s: len(s["neg"]), reverse=True)
    ids = []
    for i, s in enumerate(stats, 1):
        sid = f"S-{vehicle}-{i:03d}"
        ok, why = topic_scope(s["topic"])
        con.execute(
            """INSERT INTO signals (id, vehicle, topic, n_comments, n_negative, n_likes, n_hard_to_use, n_defect, n_wants,
               dominant_issue, severity, competitor_mentions, by_market, by_source, in_scope, scope_reason)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (sid, vehicle, s["topic"], len(s["comments"]), len(s["neg"]), len(s["likes"]), s["n_hard"], s["n_defect"],
             s["n_wants"], s["dominant"], s["severity"], s["competitors"], json.dumps(s["by_market"]),
             json.dumps(s["by_source"]), int(ok), why))
        # Evidence: most severe negatives first, structured sources before free text.
        sup = sorted(s["neg"].items(), key=lambda kv: (
            -SEVERITY_SCORE.get(kv[1]["severity"] or "", 0.5), SOURCE_RANK.get(kv[1]["source"], 9), len(kv[1]["text"])))
        for fid, _ in sup[:40]:
            con.execute("INSERT INTO signal_evidence (signal_id, feedback_id, role) VALUES (?,?,?)", (sid, fid, "supports"))
        for fid, _ in sorted(s["likes"].items(), key=lambda kv: len(kv[1]["text"]))[:10]:
            con.execute("INSERT INTO signal_evidence (signal_id, feedback_id, role) VALUES (?,?,?)", (sid, fid, "contradicts"))
        if not ok:
            db.audit(con, actor_type="ai", actor="Scope guard", entity_type="signal", entity_id=sid,
                     action="excluded signal from requirements", rationale=why)
        ids.append(sid)
    db.audit(con, actor_type="ai", actor="Pipeline", entity_type="dataset", entity_id=vehicle,
             action="detected signals", after=f"{len(ids)} topics with customer comments")
    return ids
