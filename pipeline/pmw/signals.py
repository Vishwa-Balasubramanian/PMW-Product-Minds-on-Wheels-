"""Step 2 - Signals. Group customer comments into themes per vehicle.

Base version groups by BMW's own topic labels (taxonomy level 2).
Owner: Vishwa (AI). Next: classify_unlabelled() with the LLM, merge topics into real themes, detect root causes.
"""
from __future__ import annotations

import json
import hashlib
from collections import Counter, defaultdict, deque

from . import classify, db
from .scope import topic_scope
from .themes import THEME_VERSION, theme_for

NEGATIVE = {"Difficult to Use", "Defect", "Wants"}
SEVERITY_SCORE = {"very minor": 0.2, "minor": 0.4, "moderate": 0.6, "serious": 0.8, "very serious": 1.0}
SOURCE_RANK = {"Source C": 0, "Source B": 1, "Source A": 2, "Source D": 3}


def select_evidence(comments: dict, limit: int) -> list[tuple]:
    """Round-robin market/source groups; severity determines order inside a group.

    Counts always use the full dataset. The bounded prompt sample preserves minority
    market voices instead of allowing short US dealer notes to take every slot.
    """
    groups = defaultdict(list)
    for fid, c in comments.items():
        groups[(c['market'], c['source'])].append((fid, c))
    queues = []
    for key in sorted(groups):
        items = sorted(groups[key], key=lambda kv: (
            -SEVERITY_SCORE.get(kv[1]['severity'] or '', 0.5), len(kv[1]['text']), kv[0]))
        queues.append(deque(items))
    selected = []
    while len(selected) < limit and any(queues):
        for queue in queues:
            if queue and len(selected) < limit:
                selected.append(queue.popleft())
    return selected


def classify_unlabelled(con, vehicle: str, use_llm: bool = False) -> int:
    """Keep BMW labels intact; record AI and conservative rule labels separately."""
    comments = [dict(r) for r in con.execute(
        "SELECT f.id, f.text FROM feedback f WHERE f.vehicle=? AND f.classified=0 "
        "AND NOT EXISTS (SELECT 1 FROM feedback_labels l WHERE l.feedback_id=f.id AND l.topic IS NOT NULL) "
        "ORDER BY f.id", (vehicle,))]
    topics = {r[0] for r in con.execute(
        "SELECT DISTINCT l.topic FROM feedback_labels l JOIN feedback f ON f.id=l.feedback_id "
        "WHERE f.vehicle=? AND l.label_source='bmw' AND l.topic IS NOT NULL", (vehicle,))}
    counts = Counter()
    for start in range(0, len(comments), 40):
        chunk = comments[start:start + 40]
        result = classify.batch(chunk, topics) if use_llm else None
        if result and result.data:
            entries, source = result.data["comments"], "ai"
        else:
            entries = [{"id": c["id"], "labels": classify.offline(c["text"], topics)} for c in chunk]
            source = "rule"
        labelled = 0
        for entry in entries:
            if entry["labels"]:
                labelled += 1
                counts[source] += 1
            for label in entry["labels"]:
                con.execute("INSERT INTO feedback_labels (feedback_id,feedback_type,topic,subtopic,label_source) "
                            "VALUES (?,?,?,?,?)", (entry["id"], label["feedback_type"], label["topic"], None, source))
        db.audit(con, actor_type="ai" if source == "ai" else "system", actor="Feedback classifier",
                 entity_type="dataset", entity_id=vehicle, action="classified feedback batch",
                 after=db.dumps({"reviewed": len(chunk), "labelled": labelled, "abstained": len(chunk)-labelled,
                                 "source": source, "ids": [c["id"] for c in chunk]}),
                 rationale=(f"{result.source}; cache {result.key}; {result.error or 'validated'}" if result else classify.RULE_VERSION))
    remaining = con.execute(
        "SELECT COUNT(*) FROM feedback f WHERE vehicle=? AND NOT EXISTS "
        "(SELECT 1 FROM feedback_labels l WHERE l.feedback_id=f.id AND l.topic IS NOT NULL)", (vehicle,)).fetchone()[0]
    totals = dict(con.execute('SELECT l.label_source, COUNT(DISTINCT l.feedback_id) FROM feedback_labels l '
                             'JOIN feedback f ON f.id=l.feedback_id WHERE f.vehicle=? GROUP BY l.label_source', (vehicle,)))
    con.execute("UPDATE data_issues SET description=?, handling=? WHERE dataset='feedback' AND vehicle=? "
                "AND (description LIKE '%have no topic label.%' OR description LIKE '%comments remain without a topic label;%')",
                (f"{remaining} comments remain without a topic label; {totals.get('ai',0)} AI-labelled and {totals.get('rule',0)} rule-labelled.",
                 "Original BMW labels preserved. Rule labels are provisional; ambiguous comments abstain. Counts are per comment ID.", vehicle))
    return sum(counts.values())


def build(con, vehicle: str) -> list[str]:
    rows = con.execute(
        """SELECT f.id, f.source, f.market, f.text, f.severity, f.competitors,
                  l.feedback_type, l.topic, l.subtopic
           FROM feedback f JOIN feedback_labels l ON l.feedback_id = f.id
           WHERE f.vehicle = ? AND l.topic IS NOT NULL ORDER BY f.id, l.topic, l.feedback_type""", (vehicle,)).fetchall()

    by_topic: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        c = by_topic[theme_for(r["topic"])].setdefault(r["id"], {
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

    stats.sort(key=lambda s: (-len(s["neg"]), s["topic"]))
    ids = []
    for i, s in enumerate(stats, 1):
        # Stable identity survives changing counts/rank when new comments arrive.
        sid = f"S-{vehicle}-" + hashlib.sha256(s["topic"].encode()).hexdigest()[:10]
        ok, why = topic_scope(s["topic"])
        con.execute(
            """INSERT INTO signals (id, vehicle, topic, n_comments, n_negative, n_likes, n_hard_to_use, n_defect, n_wants,
               dominant_issue, severity, competitor_mentions, by_market, by_source, in_scope, scope_reason)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (sid, vehicle, s["topic"], len(s["comments"]), len(s["neg"]), len(s["likes"]), s["n_hard"], s["n_defect"],
             s["n_wants"], s["dominant"], s["severity"], s["competitors"], json.dumps(s["by_market"]),
             json.dumps(s["by_source"]), int(ok), why))
        for fid, _ in select_evidence(s['neg'], 40):
            con.execute("INSERT INTO signal_evidence (signal_id, feedback_id, role) VALUES (?,?,?)", (sid, fid, "supports"))
        for fid, _ in select_evidence(s['likes'], 10):
            con.execute("INSERT INTO signal_evidence (signal_id, feedback_id, role) VALUES (?,?,?)", (sid, fid, "contradicts"))
        if not ok:
            db.audit(con, actor_type="ai", actor="Scope guard", entity_type="signal", entity_id=sid,
                     action="excluded signal from requirements", rationale=why)
        ids.append(sid)
    db.audit(con, actor_type="ai", actor="Pipeline", entity_type="dataset", entity_id=vehicle,
             action="detected signals", after=f"{len(ids)} themes with customer comments; map {THEME_VERSION}")
    return ids
