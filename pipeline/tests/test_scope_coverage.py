import sqlite3
import unittest

from pmw import db, evidence, scope, signals


class TextScopeTests(unittest.TestCase):
    def test_product_complaints_survive_background_commercial_or_recall_mentions(self):
        for text in ('The chargers are broken during my lease.',
                     'Brakes still fail after the recall.', 'I cannot recall the name of the paint colour.',
                     'The sound system is poor for the 126k MSRP.'):
            self.assertEqual(scope.text_scope(text), (True, None))

    def test_clear_non_product_requests_have_readable_reasons(self):
        for text in ('Reduce the car price.', 'I want a discount.', 'Lease payments are too high.',
                     'Remove the emissions limit.', 'Increase the horsepower.'):
            allowed, reason = scope.text_scope(text)
            self.assertFalse(allowed, text)
            self.assertTrue(reason)

    def test_exclusions_preserve_sources_but_do_not_feed_signals_or_matches(self):
        con = sqlite3.connect(':memory:')
        con.row_factory = sqlite3.Row
        self.addCleanup(con.close)
        con.executescript(db.SCHEMA)
        for fid, text in [('scope', 'Discount the heated steering wheel.'), ('product', 'I want a heated steering wheel.')]:
            con.execute("INSERT INTO feedback VALUES (?,'G60','Source A','US','US',NULL,?,NULL,NULL,1)", (fid, text))
            con.execute("INSERT INTO feedback_labels VALUES (?,'Wants','Heated steering wheel',NULL,'bmw')", (fid,))
        con.execute("INSERT INTO equipment (vehicle,name,code,availability) VALUES ('G60','Lenkradheizung','248','optional')")
        scope.apply_text_scope(con)
        signals.build(con, 'G60')
        evidence.build_equipment_matches(con, 'G60')
        self.assertEqual(con.execute('SELECT COUNT(*) FROM feedback').fetchone()[0], 2)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM feedback_labels').fetchone()[0], 2)
        self.assertEqual(con.execute('SELECT n_negative FROM signals').fetchone()[0], 1)
        self.assertEqual(con.execute('SELECT feedback_id FROM signal_evidence').fetchone()[0], 'product')
        self.assertEqual(con.execute('SELECT feedback_ids FROM equipment_matches').fetchone()[0], '["product"]')
        self.assertTrue(con.execute("SELECT rationale FROM audit_events WHERE entity_id='scope'").fetchone()[0])


class SurveyCoverageTests(unittest.TestCase):
    def test_matching_attribute_is_used_but_roominess_is_not_entertainment_evidence(self):
        con = sqlite3.connect(':memory:')
        con.row_factory = sqlite3.Row
        self.addCleanup(con.close)
        con.executescript(db.SCHEMA)
        for attr in ('Exterior styling', 'Rear interior roominess', 'Ease of entry into and out of car'):
            con.execute("INSERT INTO survey_scores (vehicle,market,study,attribute,mean,scale,in_scope) VALUES ('G70','EU','CN_EU_2025',?,8,10,1)", (attr,))
        self.assertEqual(len(evidence.survey_for_topic(con, 'G70', 'Exterior')), 1)
        self.assertEqual(len(evidence.survey_for_topic(con, 'G70', 'Door, open / close')), 1)
        self.assertEqual(evidence.survey_for_topic(con, 'G70', 'Rear seat entertainment'), [])
        self.assertIn('Rear seat entertainment', evidence.SURVEY_COVERAGE_GAPS)
        self.assertEqual(evidence.survey_for_topic(con, 'F70', 'Exterior'), [])


class MixedCommentScopeTests(unittest.TestCase):
    def test_mixed_comment_keeps_product_content(self):
        con = sqlite3.connect(':memory:')
        con.row_factory = sqlite3.Row
        self.addCleanup(con.close)
        con.executescript(db.SCHEMA)
        rows = [('mixed', 'Rear seats do not recline far enough. Headrests are uncomfortable.\nprice is too high.'),
                ('pure', 'The price is too high.'),
                ('product', 'Rear seats do not recline far enough.')]
        for fid, text in rows:
            con.execute("INSERT INTO feedback VALUES (?,'G70','Source A','US','US',NULL,?,NULL,NULL,1)", (fid, text))
            con.execute("INSERT INTO feedback_labels VALUES (?,'Difficult to Use','Seats',NULL,'bmw')", (fid,))
        scope.apply_text_scope(con)
        flags = {r['feedback_id']: (r['in_scope'], r['reason']) for r in con.execute('SELECT * FROM feedback_scope')}
        self.assertEqual(flags['pure'][0], 0)
        self.assertEqual(flags['mixed'][0], 1)
        self.assertIn('Only the product content', flags['mixed'][1])
        self.assertNotIn('product', flags)
        signals.build(con, 'G70')
        self.assertEqual(con.execute('SELECT n_negative FROM signals').fetchone()[0], 2)
        ids = {r[0] for r in con.execute('SELECT feedback_id FROM signal_evidence')}
        self.assertEqual(ids, {'mixed', 'product'})

    def test_price_bracket_is_background_and_clauses_split(self):
        self.assertEqual(scope.text_scope('a bmw in the lower price bracket that is put together well'), (True, None))
        self.assertFalse(scope.text_scope('please lower the price')[0])
        parts = scope.sentences('no response about the oil leak, plus there is pressure toward a discount deal.')
        self.assertEqual(len(parts), 2)
        self.assertEqual([scope.text_scope(p)[0] for p in parts], [True, False])

