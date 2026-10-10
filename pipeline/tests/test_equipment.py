"""Regression checks for equipment evidence and feature-level requirements.

Run from pipeline/: python -m unittest discover -s tests -v
"""
import json
import sqlite3
import unittest

from pmw import cli, db, evidence, signals, verify


class EquipmentTests(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:")
        self.con.row_factory = sqlite3.Row
        self.con.executescript(db.SCHEMA)
        self.addCleanup(self.con.close)

    def feedback(self, fid, text, labels, market="US"):
        self.con.execute(
            "INSERT INTO feedback (id,vehicle,source,market,text,classified) VALUES (?,'G60','Source A',?,?,1)",
            (fid, market, text))
        self.con.executemany(
            "INSERT INTO feedback_labels (feedback_id,topic,feedback_type) VALUES (?,?,?)",
            [(fid, topic, kind) for topic, kind in labels])

    def equipment(self, name, availability, code=None, vehicle="G60", package=None, price=None):
        self.con.execute(
            "INSERT INTO equipment (vehicle,name,availability,code,package,price_eur) VALUES (?,?,?,?,?,?)",
            (vehicle, name, availability, code, package, price))

    def match(self):
        signals.build(self.con, "G60")
        evidence.build_equipment_matches(self.con, "G60")
        return [dict(r) for r in self.con.execute(
            "SELECT m.*,s.topic FROM equipment_matches m JOIN signals s ON s.id=m.signal_or_requirement_id")]

    def test_multitopic_comment_does_not_leak_or_borrow_wish_intent(self):
        self.equipment("Aktive Sitzbelüftung vorn", "optional", "4NB")
        self.feedback("wish", "I want ventilated seats", [
            ("Seating, ventilate / heat", "Wants"), ("Drivetrain", "Wants"), ("Apple CarPlay", "Wants")])
        self.feedback("problem", "Ventilated seats malfunction. I want CarPlay", [
            ("Seating, ventilate / heat", "Defect"), ("Apple CarPlay", "Wants")])
        rows = self.match()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["topic"], "Seating, ventilate / heat")
        self.assertEqual(json.loads(rows[0]["feedback_ids"]), ["wish"])

    def test_complaints_match_standard_equipment_for_every_feature(self):
        for i, (feature, rule) in enumerate(evidence.EQUIPMENT_GLOSSARY.items()):
            topic = sorted(rule["topics"])[0]
            self.equipment(rule["equipment_terms"][0], "standard")
            self.equipment(rule["equipment_terms"][0], "optional", f"X{i:02}")
            self.equipment(rule["equipment_terms"][0], "standard", vehicle="G70")
            for kind in ("Difficult to Use", "Defect"):
                self.feedback(f"{i}-{kind}", rule["customer_terms"][0], [(topic, kind)])
        rows = self.match()
        self.assertEqual({r["feature"] for r in rows}, set(evidence.EQUIPMENT_GLOSSARY))
        self.assertEqual({r["match_type"] for r in rows}, {"standard_but_failing"})
        self.assertTrue(all(len(json.loads(r["feedback_ids"])) == 2 for r in rows))

    def test_merged_theme_uses_only_the_allowed_member_label(self):
        self.equipment("Aktive Sitzbelüftung", "optional", "4NB")
        self.feedback("wish", "ventilated seats", [("Vehicle, climatization", "Wants")])
        self.feedback("unrelated", "ventilated seats", [("Air conditioning control panel", "Wants")])
        self.feedback("problem", "ventilated seats", [
            ("Vehicle, climatization", "Defect"), ("Air conditioning control panel", "Wants")])
        rows = self.match()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["topic"], "Climate control")
        self.assertEqual(json.loads(rows[0]["feedback_ids"]), ["wish"])

    def test_feature_combines_topics_and_verifier_rejects_wrong_evidence(self):
        self.equipment("Aktive Sitzbelüftung", "optional", "4NB")
        self.feedback("shared", "ventilated seats", [("Seats", "Wants"), ("Seating, ventilate / heat", "Wants")])
        self.feedback("wish", "ventilated seats", [("Seats", "Wants")])
        self.feedback("complaint", "ventilated seats", [("Seats", "Defect")])
        self.match()
        self.assertEqual(cli.build_quick_wins(self.con, "G60"), 1)
        req = dict(self.con.execute("SELECT * FROM requirements").fetchone())
        self.assertIn("2 distinct", req["signal_text"])
        self.assertEqual(verify.equipment_errors(self.con, req), [])
        matches = json.loads(req["already_exists"])
        matches[0]["feedback_ids"].append("complaint")
        req["already_exists"] = json.dumps(matches)
        self.assertTrue(any("not a wish" in error for error in verify.equipment_errors(self.con, req)))

    def test_package_wishes_keep_parent_code_price_and_deduplicate(self):
        self.equipment("Comfort Paket", "optional", "7VB", price=2750)
        self.equipment("Aktive Sitzbelüftung vorn", "package_item", package="Comfort Paket")
        for fid, kind in (("wish", "Wants"), ("defect", "Defect"), ("hard", "Difficult to Use")):
            self.feedback(fid, "ventilated seats", [("Seating, ventilate / heat", kind)] * 2)
        rows = self.match()
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["match_type"], rows[0]["code"], rows[0]["price_eur"]),
                         ("package_same_vehicle", "7VB", 2750))
        self.assertEqual(json.loads(rows[0]["feedback_ids"]), ["wish"])
        self.assertEqual(cli.build_quick_wins(self.con, "G60"), 1)
        req = self.con.execute("SELECT * FROM requirements").fetchone()
        self.assertIn("7VB", req["title"])
        self.assertIn("€2,750", req["title"])
        self.assertIn("ventilated front seats", req["requirement"])

    def test_trickle_down_requires_wishes_and_a_local_gap(self):
        self.equipment("Komfortzugang", "standard", vehicle="G70")
        self.feedback("wish", "keyless", [("Comfort Access", "Wants")])
        self.feedback("problem", "keyless", [("Comfort Access", "Difficult to Use")])
        rows = self.match()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["match_type"], "standard_other_vehicle")
        self.assertEqual(json.loads(rows[0]["feedback_ids"]), ["wish"])
        self.assertEqual(cli.build_quick_wins(self.con, "G60"), 1)
        req = self.con.execute("SELECT * FROM requirements").fetchone()
        self.assertIn("7 Series", req["title"])
        self.assertIn("G70", req["requirement"])
        self.equipment("Komfortzugang", "standard")
        evidence.build_equipment_matches(self.con, "G60")
        self.assertEqual([r[0] for r in self.con.execute("SELECT match_type FROM equipment_matches")],
                         ["standard_but_failing"])

    def test_quick_wins_rank_distinct_wishes_independent_of_top_topics(self):
        rules = list(evidence.EQUIPMENT_GLOSSARY.items())[:6]
        expected = set()
        for i, (feature, rule) in enumerate(rules):
            topic = sorted(rule["topics"])[0]
            self.equipment(rule["equipment_terms"][0], "optional", f"X{i:02}")
            # Multiple offers and duplicate labels must not inflate customer counts.
            for code in ("A00", "B00", "C00") if i == 0 else ():
                self.equipment(rule["equipment_terms"][0], "optional", code)
            for j in range(i + 1):
                self.feedback(f"wish-{i}-{j}", rule["customer_terms"][0], [(topic, "Wants")] * 2,
                              market="EU" if j == 0 else "US")
            if i:
                expected.add(feature)
        self.match()
        # There are deliberately no base requirements. Narrow topics still qualify.
        self.assertEqual(cli.build_quick_wins(self.con, "G60"), 5)
        reqs = sorted(self.con.execute("SELECT * FROM requirements"),
                      key=lambda r: -len({fid for m in json.loads(r["already_exists"]) for fid in m["feedback_ids"]}))
        self.assertEqual({json.loads(r["already_exists"])[0]["feature"] for r in reqs}, expected)
        for req, count in zip(reqs, range(6, 1, -1)):
            matches = json.loads(req["already_exists"])
            ids = {fid for match in matches for fid in match["feedback_ids"]}
            self.assertEqual(len(ids), count)
            self.assertIn(f"{count} comments", json.loads(req["confidence_factors"])["quantity"]["note"])
            self.assertEqual(json.loads(req["survey"]), [])
            self.assertIn("EU", json.loads(req["markets"]))
            self.assertTrue(any(code in req["requirement"] for code in [m["code"] for m in matches]))


if __name__ == "__main__":
    unittest.main()
