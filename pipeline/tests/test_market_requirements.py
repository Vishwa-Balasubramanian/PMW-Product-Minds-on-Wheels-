import json
import sqlite3
import unittest

from pmw import db, evidence, market_requirements, score


class MarketRequirementTests(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(':memory:')
        self.con.row_factory = sqlite3.Row
        self.con.executescript(db.SCHEMA)
        self.addCleanup(self.con.close)
        for market, volume in [('CN', 10000), ('EU', 13000), ('US', 12000), ('ROW', 7000)]:
            self.con.execute('INSERT INTO sales VALUES (?,?,2025,?)', ('G70', market, volume))
        for attribute, cn, eu, in_scope in [
            ('Front interior roominess', 7.69, 9.69, 1), ('Rear interior roominess', 7.52, 9.41, 1),
            ('Braking', 7.82, 9.60, 1), ('Sportiness', 8.64, 6.97, 1), ('Value for money', 2, 9, 0)]:
            for market, mean in [('CN', cn), ('EU', eu)]:
                self.con.execute('INSERT INTO survey_scores (vehicle,market,study,attribute,mean,scale,in_scope) '
                                 "VALUES ('G70',?,'CN_EU_2025',?,?,10,?)", (market, attribute, mean, in_scope))
        evidence.build_conflicts(self.con, 'G70')

    def test_top_three_are_survey_only_and_traceable(self):
        self.assertEqual(market_requirements.build(self.con, 'G70', score.DEFAULT_WEIGHTS), 3)
        rows = [dict(r) for r in self.con.execute('SELECT * FROM requirements')]
        self.assertEqual({json.loads(r['conflicts'])[0]['attribute'] for r in rows},
                         {'Front interior roominess', 'Rear interior roominess', 'Braking'})
        for row in rows:
            self.assertEqual(market_requirements.errors(self.con, row), [])
            self.assertIsNone(row['customer_voice'])
            self.assertEqual(json.loads(row['markets']), ['CN', 'EU'])
            self.assertLess(row['confidence'], score.DEFAULT_WEIGHTS['thresholds']['confidence'])
            self.assertNotEqual(row['part'], 'Whole vehicle')
            self.assertIn('global requirement or market-specific', row['requirement'])
            weights = json.loads(row['conflicts'])[0]['sales_weights']
            self.assertAlmostEqual(weights['CN'], 10000 / 42000)
            self.assertAlmostEqual(weights['EU'], 13000 / 42000)
            for metric in ('priority', 'confidence'):
                self.assertEqual(row[metric], score._weighted(json.loads(row[f'{metric}_factors']), score.DEFAULT_WEIGHTS[metric]))

    def test_verifier_rejects_changed_source_numbers(self):
        market_requirements.build(self.con, 'G70', score.DEFAULT_WEIGHTS)
        row = dict(self.con.execute('SELECT * FROM requirements LIMIT 1').fetchone())
        survey = json.loads(row['survey'])
        survey[0]['mean'] = 1
        row['survey'] = json.dumps(survey)
        self.assertTrue(market_requirements.errors(self.con, row))

    def test_ids_survive_ranking_changes_and_no_china_means_no_card(self):
        self.assertEqual(market_requirements.build(self.con, 'F70', score.DEFAULT_WEIGHTS), 0)
        market_requirements.build(self.con, 'G70', score.DEFAULT_WEIGHTS)
        ids = {r['title']: r['id'] for r in self.con.execute('SELECT * FROM requirements')}
        self.con.execute('DELETE FROM requirements')
        self.con.execute("UPDATE market_conflicts SET delta=3 WHERE attribute='Braking'")
        market_requirements.build(self.con, 'G70', score.DEFAULT_WEIGHTS)
        self.assertEqual(ids, {r['title']: r['id'] for r in self.con.execute('SELECT * FROM requirements')})
