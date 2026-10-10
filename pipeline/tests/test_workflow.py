"""Behavioural regressions: evidence integrity, cache invalidation and real data."""
import copy
import json
import os
import re
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from pmw import ai, challenge, classify, cli, db, derive, drafts, evidence, evidence_mix, ingest, score, signals, verify
from pmw.themes import member_topics, theme_for


def connection():
    con = sqlite3.connect(':memory:')
    con.row_factory = sqlite3.Row
    con.executescript(db.SCHEMA)
    return con


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.cache = Path(self.temporary.name)
        self.draft = derive.template({'topic': 'Touchscreen and everyday controls'},
                                     [{'id': 'G70-0001', 'text': 'The menus are confusing.'}], 'G70')
        self.data = {k: self.draft[k] for k in derive.FIELDS}

    def request(self, **overrides):
        args = dict(task='test', model='test-model', instruction='Draft', payload={'evidence': 'original'},
                    schema=derive.SCHEMA, validate=lambda d: derive.validate(d, {'G70-0001'}),
                    cache_dir=self.cache)
        args.update(overrides)
        return ai.run_json(**args)

    def test_no_key_uses_valid_cache(self):
        self.request(transport=lambda _: json.dumps(self.data))
        with patch.dict(os.environ, {}, clear=True):
            result = self.request()
        self.assertEqual(result.data, self.data)
        self.assertTrue(result.source.startswith('cache:'))

    def test_offline_mode_disables_network_even_with_key(self):
        with patch.dict(os.environ, {'PMW_OFFLINE':'1','ANTHROPIC_API_KEY':'test-not-a-real-key'}):
            result=self.request()
        self.assertIsNone(result.data)
        self.assertEqual(result.source,'offline')

    def test_changed_evidence_and_model_invalidate_cache(self):
        original = self.request(transport=lambda _: json.dumps(self.data))
        with patch.dict(os.environ, {}, clear=True):
            changed = self.request(payload={'evidence': 'changed'})
            model = self.request(model='different-model')
        self.assertIsNone(changed.data)
        self.assertIsNone(model.data)
        self.assertNotEqual(original.key, changed.key)

    def test_bad_json_retries_once(self):
        answers = iter(['not json', json.dumps(self.data)])
        self.assertEqual(self.request(transport=lambda _: next(answers)).data, self.data)

    def test_unknown_citation_rejected_after_retry(self):
        invalid = {**self.data, 'root_cause': 'Hypothesis based on G70-9999.'}
        calls = []
        result = self.request(transport=lambda messages: calls.append(messages) or json.dumps(invalid))
        self.assertIsNone(result.data)
        self.assertEqual(len(calls), 2)
        self.assertFalse(list(self.cache.glob('*.json')))

    def test_numeric_claims_and_extra_score_rejected(self):
        for invalid in ({**self.data, 'priority': 99},
                        {**self.data, 'root_cause': 'Hypothesis based on G70-0001 and G70-invented.'},
                        {**self.data, 'customer_need': 'Drivers need 90% reliability.'},
                        {**self.data, 'title': 'one two three four five six seven eight nine ten'}):
            with self.assertRaises(ValueError):
                derive.validate(invalid, {'G70-0001'})

    def test_corrupt_cache_falls_back(self):
        self.request(transport=lambda _: json.dumps(self.data))
        next(self.cache.glob('*.json')).write_text('{broken', encoding='utf-8')
        with patch.dict(os.environ, {}, clear=True):
            result = self.request()
        self.assertIsNone(result.data)
        self.assertIn('cache', result.error.lower())

    def test_cache_with_valid_json_but_wrong_shape_falls_back(self):
        self.request(transport=lambda _: json.dumps(self.data))
        path=next(self.cache.glob('*.json'))
        for wrong in ([], None, 'not an object', 42):
            path.write_text(json.dumps(wrong),encoding='utf-8')
            with patch.dict(os.environ,{},clear=True):
                result=self.request()
            self.assertIsNone(result.data)
            self.assertIn('cache',result.error.lower())

    def test_transport_validation_error_does_not_leak_details(self):
        def broken(_):
            raise ValueError('secret-key-do-not-print')
        result=self.request(transport=broken)
        self.assertNotIn('secret-key',result.error)

    def test_cache_write_failure_falls_back_without_repeating_generation(self):
        calls=[]
        with patch('pmw.ai.save_cache',side_effect=OSError('private path')):
            result=self.request(transport=lambda _: calls.append(1) or json.dumps(self.data))
        self.assertIsNone(result.data)
        self.assertEqual(len(calls),1)
        self.assertNotIn('private path',result.error)

    def test_anthropic_sdk_request_and_response_without_network(self):
        import anthropic
        import httpx2 as httpx
        requests=[]
        def respond(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200,json={'id':'msg_test','type':'message','role':'assistant',
                'model':'test-model','content':[{'type':'text','text':json.dumps(self.data)}],
                'stop_reason':'end_turn','stop_sequence':None,
                'usage':{'input_tokens':10,'output_tokens':10}})
        client=anthropic.Anthropic(api_key='test-not-a-real-key',max_retries=0,
                                  http_client=httpx.Client(transport=httpx.MockTransport(respond)))
        with patch.dict(os.environ,{'ANTHROPIC_API_KEY':'test-not-a-real-key','PMW_OFFLINE':'0'}), \
             patch('anthropic.Anthropic',return_value=client):
            result=self.request()
        self.assertEqual(result.data,self.data)
        self.assertEqual(requests[0]['output_config']['format']['schema'],derive.SCHEMA)
        self.assertEqual(requests[0]['model'],'test-model')
        self.assertEqual(requests[0]['max_tokens'],2000)
        self.assertTrue(client.is_closed())

    def test_anthropic_auth_failure_falls_back_without_network(self):
        import anthropic
        import httpx2 as httpx
        client=anthropic.Anthropic(api_key='test-not-a-real-key',max_retries=0,
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(401,json={
                'type':'error','error':{'type':'authentication_error','message':'secret provider details'}}))))
        with patch.dict(os.environ,{'ANTHROPIC_API_KEY':'test-not-a-real-key','PMW_OFFLINE':'0'}), \
             patch('anthropic.Anthropic',return_value=client):
            result=self.request()
        self.assertIsNone(result.data)
        self.assertNotIn('secret provider',result.error)
        self.assertFalse(list(self.cache.glob('*.json')))
        self.assertTrue(client.is_closed())

    def test_request_exception_does_not_leak_details(self):
        def broken(_):
            raise RuntimeError('secret-key-do-not-print')
        result = self.request(transport=broken)
        self.assertNotIn('secret-key', result.error)


class ClassificationTests(unittest.TestCase):
    def test_generic_praise_and_empty_survey_answer_abstain(self):
        for text in ('Great car!', 'None. That is the one thing could be most improved about the engine/motor of my vehicle.'):
            self.assertEqual(classify.offline(text, set(classify.RULES)), [])

    def test_mixed_sentiment_is_per_topic(self):
        labels = classify.offline('I love the seats but the touchscreen is confusing.', set(classify.RULES))
        self.assertIn(('Seats', 'Likes'), {(l['topic'], l['feedback_type']) for l in labels})
        self.assertIn(('Touch screen, operation', 'Difficult to Use'), {(l['topic'], l['feedback_type']) for l in labels})

    def test_negation_is_not_a_defect(self):
        labels = classify.offline('No problems with the touchscreen.', set(classify.RULES))
        self.assertEqual(labels[0]['feedback_type'], 'Likes')

    def test_steering_wheel_does_not_become_tyre_feedback(self):
        text='heated steering wheel feature. That is the one thing I love most about the interior of my vehicle.'
        labels=classify.offline(text,set(classify.RULES))
        self.assertEqual([r['topic'] for r in labels],['Heated steering wheel'])

    def test_brand_only_survey_answer_abstains(self):
        text='it is a BMW. That is the one thing I love most about the driving feel of my vehicle.'
        self.assertEqual(classify.offline(text,set(classify.RULES)),[])

    def test_survey_context_supplies_topic_but_not_a_missing_answer(self):
        text = 'Functions perfectly. That is the one thing I love most about the infotainment system in my vehicle.'
        result = classify.offline(text, set(classify.RULES))
        self.assertEqual(result[0]['topic'], 'ConnectedDrive and Infotainment, overall technology')

    def test_ai_batch_requires_known_ids_and_literal_spans(self):
        comments = [{'id': 'G70-0001', 'text': 'The seats are comfortable.'}]
        valid = {'comments': [{'id': 'G70-0001', 'labels': [{'topic': 'Seats', 'feedback_type': 'Likes', 'evidence': 'seats are comfortable'}]}]}
        classify.validate_batch(valid, comments, {'Seats'})
        for field, value in [('topic', 'Invented'), ('evidence', 'not in the comment')]:
            invalid = copy.deepcopy(valid)
            invalid['comments'][0]['labels'][0][field] = value
            with self.assertRaises(ValueError):
                classify.validate_batch(invalid, comments, {'Seats'})
        with self.assertRaises(ValueError):
            classify.validate_batch({'comments': []}, comments, {'Seats'})


class ThemeTests(unittest.TestCase):
    def test_members_share_theme_but_generic_scope_is_preserved(self):
        self.assertEqual(theme_for('Personal eSIM'), theme_for('Apple CarPlay'))
        self.assertEqual(theme_for('Body equipment, overall technology'), 'Body equipment, overall technology')

    def test_same_comment_with_two_member_labels_counts_once(self):
        con = connection()
        self.addCleanup(con.close)
        con.execute("INSERT INTO feedback VALUES ('G70-0001','G70','Source B','US','US','ICE','Connection failed',NULL,NULL,1)")
        for topic in ('Personal eSIM', 'Apple CarPlay'):
            con.execute("INSERT INTO feedback_labels VALUES ('G70-0001','Defect',?,NULL,'bmw')", (topic,))
        signals.build(con, 'G70')
        row = con.execute('SELECT * FROM signals').fetchone()
        self.assertEqual(row['n_comments'], 1)
        self.assertEqual(row['n_negative'], 1)

    def test_evidence_selection_keeps_minority_market(self):
        comments = {f'G70-{i:04d}': {'market':'US','source':'Source B','severity':None,'text':'short'} for i in range(50)}
        comments['G70-9999'] = {'market':'EU','source':'Source A','severity':None,'text':'a longer minority-market response'}
        self.assertIn('G70-9999', dict(signals.select_evidence(comments, 4)))

    def test_equipment_matches_survive_theme_merging(self):
        con = connection()
        self.addCleanup(con.close)
        con.execute("INSERT INTO feedback VALUES ('G70-0001','G70','Source B','US','US','ICE','Ventilated seats not working',NULL,NULL,1)")
        con.execute("INSERT INTO feedback_labels VALUES ('G70-0001','Defect','Vehicle, climatization',NULL,'bmw')")
        con.execute("INSERT INTO equipment (vehicle,name,availability) VALUES ('G70','Aktive Sitzbelüftung','standard')")
        signals.build(con, 'G70')
        evidence.build_equipment_matches(con, 'G70')
        match=con.execute('SELECT * FROM equipment_matches').fetchone()
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'standard_but_failing')
        self.assertEqual(json.loads(match['feedback_ids']), ['G70-0001'])


class ScoreTests(unittest.TestCase):
    def test_model_future_lens_cannot_change_scores(self):
        signal = {'n_negative': 20, 'n_comments': 30, 'severity': .5, 'by_market': {'US':30},
                  'competitor_mentions': 1, 'topic':'Touchscreen'}
        args = dict(max_negative=50, survey=[], market_shares_2030={'US':.5}, weights=score.DEFAULT_WEIGHTS['priority'])
        self.assertEqual(score.priority(signal, future_lens='current_pain', **args),
                         score.priority(signal, future_lens='future_must_have', **args))

    def test_all_quadrants_have_exact_boundaries(self):
        t = score.DEFAULT_WEIGHTS['thresholds']
        for p, c, expected in [(55,58,'act'),(55,57,'validate'),(54,58,'monitor'),(54,57,'park')]:
            self.assertEqual(score.quadrant(p,c,t), expected)

    def test_sensitivity_does_not_mutate_weights(self):
        weights={'a':.5,'b':.5}
        result=score.sensitivity({'a':{'value':1},'b':{'value':0}},weights,55)
        self.assertEqual(weights, {'a':.5,'b':.5})
        self.assertLess(result['min'],50)
        self.assertGreater(result['max'],50)

    def test_empty_challenge_is_safe(self):
        result=score.challenge_issues({'by_market':{},'by_source':{},'n_comments':0,'n_likes':0},
                                      survey=[],representation={},conf=5)
        self.assertEqual(result['revised_confidence'],0)


class SuppliedDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.con = connection()
        cls.stats = ingest.run(cls.con)
        cls.original_labels = cls.con.execute("SELECT COUNT(*) FROM feedback_labels WHERE label_source='bmw'").fetchone()[0]
        weights=score.DEFAULT_WEIGHTS
        cls.con.execute("INSERT INTO settings VALUES ('weights',?)", (db.dumps(weights),))
        for vehicle in ('F70','G60','G70'):
            signals.classify_unlabelled(cls.con,vehicle)
            signals.build(cls.con,vehicle)
            evidence.build_representation(cls.con,vehicle)
            evidence.build_conflicts(cls.con,vehicle)
            evidence.build_equipment_matches(cls.con,vehicle)
            cli.build_requirements(cls.con,vehicle,15,False,weights)
        evidence_mix.refresh(cls.con)
        cls.con.commit()

    @classmethod
    def tearDownClass(cls):
        cls.con.close()

    def test_complete_contract_and_all_eight_inputs(self):
        report=verify.inspect(self.con)
        self.assertTrue(report['passed'], report['errors'])
        self.assertEqual(len(report['data_sha256']),8)

    def test_original_labels_are_preserved_and_no_fake_ai_labels(self):
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM feedback_labels WHERE label_source='bmw'").fetchone()[0],self.original_labels)
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM feedback_labels WHERE label_source='ai'").fetchone()[0],0)

    def test_classification_is_idempotent(self):
        before=self.con.execute('SELECT COUNT(*) FROM feedback_labels').fetchone()[0]
        self.assertEqual(signals.classify_unlabelled(self.con,'G70'),0)
        self.assertEqual(before,self.con.execute('SELECT COUNT(*) FROM feedback_labels').fetchone()[0])

    def test_china_has_no_invented_comments(self):
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM feedback WHERE market='CN'").fetchone()[0],0)

    def test_all_requirements_have_normalized_global_and_market_mixes(self):
        for row in self.con.execute('SELECT evidence_mix, evidence_mix_by_market FROM requirements'):
            regional = json.loads(row['evidence_mix_by_market'])
            self.assertEqual(set(regional), {'US', 'EU', 'CN', 'ROW'})
            for mix in [json.loads(row['evidence_mix']), *regional.values()]:
                self.assertEqual(set(mix), set(evidence_mix.KEYS))
                self.assertAlmostEqual(sum(mix.values()), 1, places=6)
                self.assertTrue(all(0 <= v <= 1 for v in mix.values()))

    def test_survey_only_china_and_comment_heavy_us_use_their_own_sources(self):
        rows = self.con.execute("SELECT evidence_mix_by_market FROM requirements WHERE vehicle='G70' AND kind='signal'").fetchall()
        candidates = [json.loads(r[0]) for r in rows]
        candidate = next(m for m in candidates if m['CN']['survey'] > 0 and m['US']['observed'] > 0)
        self.assertEqual(candidate['CN']['observed'], 0)
        self.assertGreater(candidate['US']['observed'], candidate['CN']['observed'])
        self.assertTrue(all(m['CN']['observed'] == 0 for m in candidates))

    def test_quick_win_composition_uses_feature_wishes_not_parent_theme(self):
        for row in self.con.execute("SELECT * FROM requirements WHERE kind='quick_win'"):
            ids = {fid for m in json.loads(row['already_exists']) for fid in m['feedback_ids']}
            mix = json.loads(row['evidence_mix'])
            self.assertEqual(mix['survey'], 0)
            # Two assumption units vs four observed units at the 30-comment cap.
            self.assertAlmostEqual(mix['observed'] / mix['assumed'], 2 * min(len(ids), 30) / 30, places=4)

    def test_legacy_backfill_preserves_decisions_and_is_idempotent(self):
        con = connection()
        self.addCleanup(con.close)
        self.con.commit()
        self.con.backup(con)
        con.execute('ALTER TABLE requirements DROP COLUMN evidence_mix')
        con.execute('ALTER TABLE requirements DROP COLUMN evidence_mix_by_market')
        con.execute("UPDATE requirements SET status='approved', requirement='PM reviewed wording', challenged=1 WHERE id=(SELECT id FROM requirements LIMIT 1)")
        before = [dict(r) for r in con.execute('SELECT * FROM requirements ORDER BY id')]
        audits = [dict(r) for r in con.execute('SELECT * FROM audit_events ORDER BY id')]
        con.commit()
        with con:
            con.execute('BEGIN IMMEDIATE')
            self.assertEqual(evidence_mix.refresh(con), len(before))
        after = [{k: r[k] for k in before[0]} for r in con.execute('SELECT * FROM requirements ORDER BY id')]
        self.assertEqual(before, after)
        self.assertEqual(audits, [dict(r) for r in con.execute('SELECT * FROM audit_events ORDER BY id')][:-1])
        with con:
            self.assertEqual(evidence_mix.refresh(con), 0)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0], len(audits) + 1)

    def test_failed_backfill_rolls_back_schema_and_history(self):
        con = connection()
        self.addCleanup(con.close)
        con.execute('ALTER TABLE requirements DROP COLUMN evidence_mix')
        con.execute('ALTER TABLE requirements DROP COLUMN evidence_mix_by_market')
        con.commit()
        with patch.object(evidence_mix, 'profiles', side_effect=ValueError('Invalid evidence')):
            with self.assertRaises(ValueError), con:
                con.execute('BEGIN IMMEDIATE')
                evidence_mix.refresh(con)
        self.assertNotIn('evidence_mix', {r[1] for r in con.execute('PRAGMA table_info(requirements)')})
        self.assertEqual(con.execute('SELECT COUNT(*) FROM audit_events').fetchone()[0], 0)

    def test_verify_rejects_tampered_evidence_mix(self):
        self.con.execute('SAVEPOINT changed_mix')
        try:
            self.con.execute("UPDATE requirements SET evidence_mix='{}' WHERE id=(SELECT id FROM requirements LIMIT 1)")
            self.assertTrue(any('evidence composition' in e for e in verify.inspect(self.con)['errors']))
        finally:
            self.con.execute('ROLLBACK TO changed_mix')
            self.con.execute('RELEASE changed_mix')

    def test_theme_survey_is_deduplicated_union(self):
        theme='Connected services and phone integration'
        rows=evidence.survey_for_topic(self.con,'G70',theme)
        key=lambda r:(r['market'],r['study'],r['attribute'],r['variant'])
        expected={key(r) for member in member_topics(theme) for r in evidence.survey_for_topic(self.con,'G70',member)}
        self.assertEqual({key(r) for r in rows},expected)
        self.assertEqual(len(rows),len(expected))

    def test_g70_has_at_least_two_in_each_quadrant(self):
        values=dict(self.con.execute("SELECT quadrant,COUNT(*) FROM requirements WHERE vehicle='G70' AND kind='signal' GROUP BY quadrant"))
        self.assertEqual(set(values),{'act','validate','monitor','park'})
        self.assertTrue(all(n>=2 for n in values.values()),values)

    def test_verify_detects_changed_metrics_after_a_challenge(self):
        self.con.execute('SAVEPOINT changed_score')
        try:
            rid=self.con.execute("SELECT id FROM requirements WHERE vehicle='G70' LIMIT 1").fetchone()[0]
            self.con.execute("UPDATE requirements SET challenged=1,confidence=json_extract(challenge,'$.revised_confidence') WHERE id=?",(rid,))
            row=self.con.execute('SELECT priority,confidence FROM requirements WHERE id=?',(rid,)).fetchone()
            self.con.execute('UPDATE requirements SET quadrant=? WHERE id=?',
                             (score.quadrant(*row,score.DEFAULT_WEIGHTS['thresholds']),rid))
            self.assertTrue(verify.inspect(self.con)['passed'])
            self.con.execute('UPDATE requirements SET priority=priority-1,confidence=confidence+1 WHERE id=?',(rid,))
            errors=verify.inspect(self.con)['errors']
            self.assertIn(f'{rid}: inconsistent priority',errors)
            self.assertIn(f'{rid}: inconsistent confidence',errors)
        finally:
            self.con.execute('ROLLBACK TO changed_score')
            self.con.execute('RELEASE changed_score')

    def test_equipment_quick_wins_keep_specific_customer_tasks(self):
        quick=self.con.execute("SELECT COUNT(*) FROM requirements WHERE kind='quick_win' AND already_exists!='[]'").fetchone()[0]
        self.assertGreater(quick,0)
        topics=[r[0] for r in self.con.execute('SELECT s.topic FROM requirements r JOIN signals s ON r.signal_id=s.id')]
        missing=[t for t in topics if not any(re.search(pattern,t,re.I) for pattern,_ in drafts.PROFILES)]
        self.assertEqual(missing,[])
        matches=self.con.execute("SELECT price_eur FROM equipment_matches WHERE vehicle='G60' AND code='7VB'").fetchall()
        self.assertTrue(matches)
        self.assertTrue(all(r['price_eur']==2750 for r in matches))


if __name__ == '__main__':
    unittest.main()
