import unittest

from pmw.evidence_mix import compute


class EvidenceMixTests(unittest.TestCase):
    def test_empty_evidence_is_never_observed(self):
        mix = compute(comments=0, survey=[])
        self.assertEqual(mix['observed'], 0)
        self.assertEqual(mix['survey'], 0)
        self.assertAlmostEqual(sum(mix.values()), 1)

    def test_duplicate_survey_rows_do_not_inflate_composition(self):
        row = {'market': 'CN', 'study': 'CN_EU_2025', 'variant': 'G70', 'attribute': 'Ease of use'}
        self.assertEqual(compute(comments=0, survey=[row]), compute(comments=0, survey=[row] * 20))
        self.assertGreater(compute(comments=0, survey=[row])['survey'], 0)

    def test_caps_prevent_volume_from_erasing_inference_and_assumptions(self):
        capped = compute(comments=30, survey=[])
        self.assertEqual(capped, compute(comments=10000, survey=[]))
        self.assertGreater(capped['inferred'], 0)
        self.assertGreater(capped['assumed'], 0)

    def test_provisional_labels_and_merging_add_inference(self):
        base = compute(comments=20, survey=[])
        self.assertGreater(compute(comments=20, survey=[], provisional=20)['inferred'], base['inferred'])
        self.assertGreater(compute(comments=20, survey=[], merged=True)['inferred'], base['inferred'])

    def test_equipment_transfer_is_an_extra_assumption(self):
        self.assertGreater(compute(comments=5, survey=[], quick_win=True)['assumed'],
                           compute(comments=5, survey=[])['assumed'])

    def test_invalid_counts_fail_explicitly(self):
        for comments, provisional in [(-1, 0), (0, 1), (10, -1)]:
            with self.assertRaises(ValueError):
                compute(comments=comments, survey=[], provisional=provisional)
