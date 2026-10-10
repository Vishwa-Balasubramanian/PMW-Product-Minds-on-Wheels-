"""Run the pipeline: uv run pmw build [--llm] [--top 15]

Rebuilding wipes the database, including PM decisions. That is the "fresh demo" state.
"""
from __future__ import annotations

import argparse
import json

from . import aspects, db, derive, evidence, ingest, score, signals
from .config import DB_PATH, MARKETS, VEHICLES


def build_requirements(con, vehicle: str, top: int, use_llm: bool, weights: dict) -> int:
    top_sigs = [dict(r) for r in con.execute(
        "SELECT * FROM signals WHERE vehicle = ? AND in_scope = 1 ORDER BY n_negative DESC LIMIT ?", (vehicle, top))]
    top_ids = {s["id"] for s in top_sigs}
    quick_ids = {r[0] for r in con.execute(
        "SELECT DISTINCT signal_or_requirement_id FROM equipment_matches WHERE vehicle = ?", (vehicle,))} - top_ids
    sigs = top_sigs + [dict(r) for r in con.execute(
        f"SELECT * FROM signals WHERE id IN ({','.join('?' for _ in quick_ids)}) ORDER BY n_negative DESC, id",
        tuple(sorted(quick_ids)))] if quick_ids else top_sigs
    if not sigs:
        return 0
    for s in sigs:
        s["by_market"] = json.loads(s["by_market"])
        s["by_source"] = json.loads(s["by_source"])
    max_neg = max(s["n_negative"] for s in sigs)
    shares_2030 = evidence.sales_shares(con, vehicle, 2030)
    rep = {r["market"]: dict(r) for r in con.execute("SELECT * FROM representation WHERE vehicle = ?", (vehicle,))}

    drafts = []
    for s in sigs:
        quotes = [dict(r) for r in con.execute(
            "SELECT f.id, f.text, f.market FROM signal_evidence e JOIN feedback f ON f.id = e.feedback_id "
            "WHERE e.signal_id = ? AND e.role = 'supports'", (s["id"],))]
        likes = [dict(r) for r in con.execute(
            "SELECT f.id, f.text FROM signal_evidence e JOIN feedback f ON f.id = e.feedback_id "
            "WHERE e.signal_id = ? AND e.role = 'contradicts'", (s["id"],))]
        survey = evidence.survey_for_topic(con, vehicle, s["topic"])
        d = (derive.llm(s, quotes, likes, survey, vehicle) if use_llm else None) or derive.template(s, quotes, vehicle)
        if use_llm and d["generated_by"] != "template" and quotes:
            d.setdefault("customer_voice", f"“{quotes[0]['text'][:260]}” ({quotes[0]['id']})")
        p, pf = score.priority(s, max_negative=max_neg, survey=survey, market_shares_2030=shares_2030,
                               future_lens=d.get("future_lens"), weights=weights["priority"])
        c, cf = score.confidence(s, survey=survey, representation=rep, weights=weights["confidence"])
        markets = sorted({m for m, n in s["by_market"].items() if n > 0} | {r["market"] for r in survey},
                         key=MARKETS.index)
        assumptions = list(d.get("assumptions") or [])
        if pf["future"]["note"].startswith("Assumption"):
            assumptions.append("Future relevance comes from a keyword rule on the topic, not from trend research yet.")
        if any(m != "EU" for m in markets):
            assumptions.append("Equipment comparisons use the German price list for every market.")
        uncertainties = list(d.get("uncertainties") or [])
        unl = con.execute("SELECT COUNT(*) FROM feedback WHERE vehicle = ? AND classified = 0", (vehicle,)).fetchone()[0]
        if unl:
            uncertainties.append(f"{unl} comments for this vehicle are still unlabelled and could change these counts.")
        contradictions = []
        if s["n_likes"]:
            ex = f" For example {likes[0]['id']}: “{likes[0]['text'][:140]}”" if likes else ""
            contradictions.append(f"{s['n_likes']} comments praise this topic.{ex}")
        conflicts = evidence.conflicts_for(con, vehicle, survey)
        for cf_row in conflicts:
            contradictions.append(f"Markets disagree on '{cf_row['attribute']}': China {cf_row['cn']} vs Europe {cf_row['eu']}.")
        existing = [dict(r) for r in con.execute(
            "SELECT * FROM equipment_matches WHERE vehicle=? AND signal_or_requirement_id=?", (vehicle, s["id"]))]
        for m in existing:
            m["feedback_ids"] = json.loads(m["feedback_ids"])
        drafts.append((p, s, d, pf, c, cf, markets, assumptions, uncertainties, contradictions, survey, conflicts,
                       "signal" if s["id"] in top_ids else "quick_win", existing))

    drafts.sort(key=lambda x: -x[0])
    th = weights["thresholds"]
    for i, (p, s, d, pf, c, cf, markets, assumptions, uncertainties, contradictions, survey, conflicts, kind, existing) in enumerate(drafts, 1):
        rid = f"R-{vehicle}-{i:03d}"
        ch = score.challenge_issues(s, survey=survey, representation=rep, conf=c)
        q = score.quadrant(p, c, th)
        ts = db.now()
        a = aspects.for_topic(vehicle, s["topic"])
        con.execute(
            """INSERT INTO requirements (id, vehicle, signal_id, kind, already_exists, title, customer_voice, signal_text, root_cause, customer_need,
               requirement, aspect, part, photo, focal_x, focal_y, markets, future_lens, assumptions, uncertainties, contradictions, survey, conflicts, priority,
               priority_factors, confidence, confidence_factors, quadrant, challenge, status, generated_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rid, vehicle, s["id"], kind, db.dumps(existing), d["title"], d.get("customer_voice"),
             f"{s['n_negative']} of {s['n_comments']} customers raise {s['topic']}: {s['n_hard_to_use']} hard to use, "
             f"{s['n_defect']} defects, {s['n_wants']} wishes.",
             d.get("root_cause"), d.get("customer_need"), d["requirement"],
             a["aspect"], a["part"], a["photo"], a["focal_x"], a["focal_y"], db.dumps(markets), d.get("future_lens"),
             db.dumps(assumptions), db.dumps(uncertainties), db.dumps(contradictions), db.dumps(survey), db.dumps(conflicts),
             p, db.dumps(pf), c, db.dumps(cf), q, db.dumps(ch), "proposed", d["generated_by"], ts, ts))
        db.audit(con, actor_type="ai", actor="Pipeline", entity_type="requirement", entity_id=rid,
                 action="drafted requirement", after=d["title"], rationale=f"From signal {s['id']} ({s['topic']}), {d['generated_by']}")
        db.audit(con, actor_type="ai", actor="Scoring engine", entity_type="requirement", entity_id=rid,
                 action="scored", after=f"priority {p}, confidence {c}, quadrant {q}",
                 rationale="Deterministic weighted factors, see settings.weights")
    return len(drafts)


def build(args) -> None:
    con = db.connect()
    db.reset(con)
    weights = score.DEFAULT_WEIGHTS
    con.execute("INSERT INTO settings (key, value) VALUES ('weights', ?)", (db.dumps(weights),))
    con.execute("INSERT INTO settings (key, value) VALUES ('factor_labels', ?)", (db.dumps(score.FACTOR_LABELS),))
    stats = ingest.run(con)
    for code in VEHICLES:
        signals.classify_unlabelled(con, code)
        signals.build(con, code)
        evidence.build_representation(con, code)
        evidence.build_conflicts(con, code)
        evidence.build_equipment_matches(con, code)
        n = build_requirements(con, code, args.top, args.llm, weights)
        stats[code]["requirements"] = n
    con.commit()
    print(f"Database: {DB_PATH}")
    for code, s in stats.items():
        print(f"  {code}: {s['comments']:>5} comments, {s['unclassified']:>4} unlabelled, {s['requirements']:>2} requirements")
    q = con.execute("SELECT vehicle, quadrant, COUNT(*) n FROM requirements GROUP BY vehicle, quadrant").fetchall()
    print("  Quadrants:", ", ".join(f"{r['vehicle']} {r['quadrant']}={r['n']}" for r in q))


def main() -> None:
    ap = argparse.ArgumentParser(prog="pmw")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="Run the full pipeline and rebuild the database")
    b.add_argument("--llm", action="store_true", help="Use the LLM for the derive step (needs ANTHROPIC_API_KEY or cache)")
    b.add_argument("--top", type=int, default=15, help="Requirements per vehicle")
    args = ap.parse_args()
    if args.cmd == "build":
        build(args)


if __name__ == "__main__":
    main()
