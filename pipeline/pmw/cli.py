"""Run the pipeline: uv run pmw build [--llm] [--top 15]

Rebuilding wipes the database, including PM decisions. That is the "fresh demo" state.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
import hashlib

from . import aspects, challenge, db, derive, evidence, ingest, score, signals, verify
from .config import DB_PATH, MARKETS, VEHICLES
from .themes import photo_topic


def build_requirements(con, vehicle: str, top: int, use_llm: bool, weights: dict) -> int:
    sigs = [dict(r) for r in con.execute(
        "SELECT * FROM signals WHERE vehicle = ? AND in_scope = 1 AND n_negative > 0 ORDER BY n_negative DESC, topic LIMIT ?", (vehicle, top))]
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
            "WHERE e.signal_id = ? AND e.role = 'supports' ORDER BY e.rowid", (s["id"],))]
        likes = [dict(r) for r in con.execute(
            "SELECT f.id, f.text FROM signal_evidence e JOIN feedback f ON f.id = e.feedback_id "
            "WHERE e.signal_id = ? AND e.role = 'contradicts' ORDER BY e.rowid", (s["id"],))]
        survey = evidence.survey_for_topic(con, vehicle, s["topic"])
        result = derive.generate(s, quotes, likes, survey, vehicle) if use_llm else None
        d = ({**result.data, "generated_by": result.source} if result and result.data
             else derive.template(s, quotes, vehicle))
        if use_llm:
            db.audit(con, actor_type="ai", actor="Requirement drafter", entity_type="signal", entity_id=s['id'],
                     action="validated AI draft" if result.data else "used offline fallback",
                     rationale=f"{result.source}; cache {result.key}; {result.error or 'validated'}")
        if quotes:
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
        unl = con.execute("SELECT COUNT(*) FROM feedback f WHERE vehicle=? AND NOT EXISTS "
                          "(SELECT 1 FROM feedback_labels l WHERE l.feedback_id=f.id AND l.topic IS NOT NULL)", (vehicle,)).fetchone()[0]
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
        drafts.append((p, s, d, pf, c, cf, markets, assumptions, uncertainties, contradictions, survey, conflicts, existing))

    drafts.sort(key=lambda x: -x[0])
    th = weights["thresholds"]
    for p, s, d, pf, c, cf, markets, assumptions, uncertainties, contradictions, survey, conflicts, existing in drafts:
        rid = 'R-' + s['id'][2:]
        ch = score.challenge_issues(s, survey=survey, representation=rep, conf=c)
        ch['priority_sensitivity'] = score.sensitivity(pf, weights['priority'], th['priority'])
        narrative, narrative_source, narrative_result = challenge.explain(d, ch, use_llm)
        ch['narrative'], ch['narrative_source'] = narrative, narrative_source
        q = score.quadrant(p, c, th)
        ts = db.now()
        a = aspects.for_topic(vehicle, photo_topic(s["topic"]))
        con.execute(
            """INSERT INTO requirements (id, vehicle, signal_id, kind, already_exists, title, customer_voice, signal_text, root_cause, customer_need,
               requirement, aspect, part, photo, focal_x, focal_y, markets, future_lens, assumptions, uncertainties, contradictions, survey, conflicts, priority,
               priority_factors, confidence, confidence_factors, quadrant, challenge, status, generated_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rid, vehicle, s["id"], "signal", db.dumps(existing), d["title"], d.get("customer_voice"),
             f"{s['n_negative']} of {s['n_comments']} distinct comments raise concerns about {s['topic']}: "
             f"{s['n_hard_to_use']} hard to use, {s['n_defect']} defects, {s['n_wants']} wishes (categories can overlap).",
             d.get("root_cause"), d.get("customer_need"), d["requirement"],
             a["aspect"], a["part"], a["photo"], a["focal_x"], a["focal_y"], db.dumps(markets), d.get("future_lens"),
             db.dumps(assumptions), db.dumps(uncertainties), db.dumps(contradictions), db.dumps(survey), db.dumps(conflicts),
             p, db.dumps(pf), c, db.dumps(cf), q, db.dumps(ch), "proposed", d["generated_by"], ts, ts))
        db.audit(con, actor_type="system" if d['generated_by'].startswith('evidence-template:') else "ai",
                 actor="Pipeline", entity_type="requirement", entity_id=rid,
                 action="drafted requirement", after=d["title"], rationale=f"From signal {s['id']} ({s['topic']}), {d['generated_by']}")
        db.audit(con, actor_type="system", actor="Scoring engine", entity_type="requirement", entity_id=rid,
                 action="scored", after=f"priority {p}, confidence {c}, quadrant {q}",
                 rationale="Deterministic weighted factors, see settings.weights")
        db.audit(con, actor_type="ai" if narrative_result else "system", actor="Challenge writer",
                 entity_type="requirement", entity_id=rid, action="prepared challenge narrative",
                 rationale=(f"{narrative_source}; cache {narrative_result.key}; {narrative_result.error or 'validated'}"
                            if narrative_result else 'Deterministic explanation of the computed issues'))
    return len(drafts) + build_quick_wins(con, vehicle, weights=weights)


def build_quick_wins(con, vehicle: str, limit: int = 5, *, weights: dict | None = None) -> int:
    """Draft the five strongest feature-level offers already evidenced in BMW equipment."""
    rows = [dict(r) for r in con.execute(
        "SELECT * FROM equipment_matches WHERE vehicle=? AND match_type IN "
        "('option_same_vehicle','package_same_vehicle','standard_other_vehicle')", (vehicle,))]
    by_feature: dict[str, list[dict]] = {}
    for row in rows:
        row["feedback_ids"] = json.loads(row["feedback_ids"])
        by_feature.setdefault(row["feature"], []).append(row)
    ranked = sorted(by_feature.items(), key=lambda item: (-len({fid for r in item[1] for fid in r["feedback_ids"]}), item[0]))[:limit]
    weights = weights or score.DEFAULT_WEIGHTS
    max_neg = con.execute("SELECT MAX(n_negative) FROM signals WHERE vehicle=? AND in_scope=1", (vehicle,)).fetchone()[0] or 1
    shares = evidence.sales_shares(con, vehicle, 2030)
    rep = {r["market"]: dict(r) for r in con.execute("SELECT * FROM representation WHERE vehicle=?", (vehicle,))}
    created = 0
    for feature, matches in ranked:
        created += 1
        rid = f"R-{vehicle}-Q" + hashlib.sha256(feature.encode()).hexdigest()[:10]
        ids = sorted({fid for match in matches for fid in match["feedback_ids"]})
        # Keep a topic link for navigation; all evidence and scores below belong to this feature.
        matches.sort(key=lambda m: (-len(m["feedback_ids"]), m["signal_or_requirement_id"], m["code"] or "", m["source_vehicle"]))
        representative = matches[0]
        topic = con.execute("SELECT topic FROM signals WHERE id=?", (representative["signal_or_requirement_id"],)).fetchone()[0]
        a = aspects.for_topic(vehicle, photo_topic(topic))
        standard = next((m for m in matches if m["match_type"] == "standard_other_vehicle"), None)
        packaged = next((m for m in matches if m["match_type"] == "package_same_vehicle"), None)
        option = next((m for m in matches if m["match_type"] == "option_same_vehicle"), None)
        if standard:
            source = VEHICLES[standard["source_vehicle"]]["short"]
            title = f"Bring standard {feature} from the {source} to the {VEHICLES[vehicle]['short']}"
            requirement = f"Offer {feature} on the successor {VEHICLES[vehicle]['short']}. BMW lists it as standard on the {source} ({standard['source_vehicle']}) in the German price list."
        elif packaged:
            package = con.execute("SELECT name FROM equipment WHERE vehicle=? AND code=? LIMIT 1",
                                  (vehicle, packaged["code"])).fetchone()
            label = package[0].title() if package else f"package {packaged['code']}"
            price = f"€{packaged['price_eur']:,.0f} " if packaged["price_eur"] is not None else ""
            title = f"Offer {feature} outside {price}{label} ({packaged['code']})"
            requirement = f"Make {feature} available on the successor without requiring {label} ({packaged['code']}). The German price list includes this feature in that package."
        else:
            title = f"Offer {feature} as a clear option ({option['code']})"
            requirement = f"Offer {feature} as a clear standalone option ({option['code']}) on the successor."
        quotes = con.execute(f"SELECT * FROM feedback WHERE id IN ({','.join('?' for _ in ids)}) ORDER BY id",
                             ids).fetchall()
        severities = [signals.SEVERITY_SCORE[q["severity"]] for q in quotes if q["severity"] in signals.SEVERITY_SCORE]
        feature_signal = {
            "topic": feature, "n_comments": len(quotes), "n_negative": len(quotes), "n_likes": 0,
            "severity": round(0.75 * (sum(severities) / len(severities) if severities else 0.5), 3),
            "competitor_mentions": sum(bool(q["competitors"]) for q in quotes),
            "by_market": dict(Counter(q["market"] for q in quotes)),
            "by_source": dict(Counter(q["source"] for q in quotes)),
        }
        # A general topic survey does not establish demand for this particular feature.
        p, pf = score.priority(feature_signal, max_negative=max_neg, survey=[], market_shares_2030=shares,
                               future_lens="current_pain", weights=weights["priority"])
        pf["frequency"]["note"] = f"{len(ids)} distinct wishing customer comments (relative to the top topic)"
        c, cf = score.confidence(feature_signal, survey=[], representation=rep, weights=weights["confidence"])
        ch = score.challenge_issues(feature_signal, survey=[], representation=rep, conf=c)
        ch["priority_sensitivity"] = score.sensitivity(pf, weights["priority"], weights["thresholds"]["priority"])
        narrative, narrative_source, _ = challenge.explain({}, ch, False)
        ch["narrative"], ch["narrative_source"] = narrative, narrative_source
        quadrant = score.quadrant(p, c, weights["thresholds"])
        markets = sorted({row["market"] for row in quotes}, key=MARKETS.index)
        voice = f"“{quotes[0]['text'][:260]}” ({quotes[0]['id']})" if quotes else None
        ts = db.now()
        assumptions = ["Equipment availability and package pricing use the German July 2026 price list.",
                       "Existing equipment is assumed transferable to the successor; feasibility needs validation."]
        uncertainties = ["This quick win is based on customer wishes, not a confirmed market-wide offer decision.",
                         "Distinct comment IDs are counted; the data does not identify unique people across comments."]
        con.execute(
            """INSERT INTO requirements (id,vehicle,signal_id,kind,already_exists,title,customer_voice,signal_text,root_cause,customer_need,
               requirement,aspect,part,photo,focal_x,focal_y,markets,future_lens,assumptions,uncertainties,contradictions,survey,conflicts,
               priority,priority_factors,confidence,confidence_factors,quadrant,challenge,status,generated_by,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rid, vehicle, representative["signal_or_requirement_id"], "quick_win", db.dumps(matches), title, voice,
             f"{len(ids)} distinct customer comments wish for {feature}; BMW already lists matching equipment.",
             "Customer wishes concern a feature listed in BMW equipment; why customers lack it still needs validation.",
             f"Drivers want {feature} without an avoidable equipment gap.", requirement,
             a["aspect"], a["part"], a["photo"], a["focal_x"], a["focal_y"], db.dumps(markets), "current_pain",
             db.dumps(assumptions), db.dumps(uncertainties), db.dumps([]), db.dumps([]), db.dumps([]),
             p, db.dumps(pf), c, db.dumps(cf), quadrant,
             db.dumps(ch), "proposed", "equipment_matcher", ts, ts))
        db.audit(con, actor_type="system", actor="Pipeline", entity_type="requirement", entity_id=rid,
                 action="drafted equipment quick win", after=title, rationale=f"{len(ids)} wishing customer comments: {', '.join(ids)}")
        db.audit(con, actor_type="system", actor="Scoring engine", entity_type="requirement", entity_id=rid,
                 action="scored", after=f"priority {p}, confidence {c}, quadrant {quadrant}",
                 rationale="Deterministic factors from distinct feature-specific wishing comments")
    return created


def build(args) -> None:
    con = db.connect()
    db.reset(con)
    weights = score.DEFAULT_WEIGHTS
    con.execute("INSERT INTO settings (key, value) VALUES ('weights', ?)", (db.dumps(weights),))
    con.execute("INSERT INTO settings (key, value) VALUES ('factor_labels', ?)", (db.dumps(score.FACTOR_LABELS),))
    stats = ingest.run(con)
    for code in VEHICLES:
        stats[code]['new_labels'] = signals.classify_unlabelled(con, code, args.llm)
        stats[code]['unclassified'] = con.execute(
            "SELECT COUNT(*) FROM feedback f WHERE vehicle=? AND NOT EXISTS "
            "(SELECT 1 FROM feedback_labels l WHERE l.feedback_id=f.id AND l.topic IS NOT NULL)", (code,)).fetchone()[0]
        signals.build(con, code)
        evidence.build_representation(con, code)
        evidence.build_conflicts(con, code)
        evidence.build_equipment_matches(con, code)
        n = build_requirements(con, code, args.top, args.llm, weights)
        stats[code]["requirements"] = n
    con.commit()
    print(f"Database: {DB_PATH}")
    for code, s in stats.items():
        print(f"  {code}: {s['comments']:>5} comments, {s['unclassified']:>4} unlabelled, {s['new_labels']:>3} newly labelled, {s['requirements']:>2} requirements")
    q = con.execute("SELECT vehicle, quadrant, COUNT(*) n FROM requirements GROUP BY vehicle, quadrant").fetchall()
    print("  Quadrants:", ", ".join(f"{r['vehicle']} {r['quadrant']}={r['n']}" for r in q))


def main() -> None:
    ap = argparse.ArgumentParser(prog="pmw")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="Run the full pipeline and rebuild the database")
    b.add_argument("--llm", action="store_true", help="Use validated AI classification, drafts and challenges (API key or cache; offline fallback)")
    b.add_argument('--offline', action='store_true', help='Read validated AI caches with network generation disabled; otherwise use offline drafts')
    b.add_argument("--top", type=int, default=15, help="Requirements per vehicle")
    v = sub.add_parser('verify', help='Check citations, scores and data contracts without rebuilding')
    v.add_argument('--report', help='Write aggregate JSON report to this path')
    v.add_argument('--top', type=int, default=15, help='Expected requirements per vehicle')
    args = ap.parse_args()
    if args.cmd == "build":
        if args.top < 1:
            ap.error('--top must be positive')
        if args.offline:
            import os
            os.environ['PMW_OFFLINE'] = '1'
            args.llm = True
        build(args)
    elif args.cmd == 'verify':
        from pathlib import Path
        con = db.connect()
        report = verify.inspect(con, args.top)
        con.close()
        if args.report:
            destination = Path(args.report)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, indent=2))
        if not report['passed']:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
