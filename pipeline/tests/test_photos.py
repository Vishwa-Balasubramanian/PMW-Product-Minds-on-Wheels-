from pathlib import Path
import unittest

from pmw import aspects, evidence
from pmw.config import ROOT, VEHICLES
from pmw.themes import THEMES


class PhotoTests(unittest.TestCase):
    def test_features_and_conflict_topics_have_real_assets_and_valid_focal_points(self):
        topics = set(evidence.EQUIPMENT_GLOSSARY) | set(THEMES) | {
            'Front interior roominess', 'Rear interior roominess', 'Braking', 'Exterior styling',
            'Quality of ride', 'Sportiness', 'Rear seat entertainment',
        }
        for vehicle in VEHICLES:
            for topic in topics:
                with self.subTest(vehicle=vehicle, topic=topic):
                    photo = aspects.for_topic(vehicle, topic)
                    self.assertNotEqual(photo['part'], 'Whole vehicle')
                    self.assertTrue((ROOT / 'web' / 'public' / Path(photo['photo'].lstrip('/'))).is_file())
                    self.assertTrue(0 <= photo['focal_x'] <= 100 and 0 <= photo['focal_y'] <= 100)

    def test_specific_parts_win_over_broad_keywords(self):
        for vehicle in VEHICLES:
            self.assertEqual(aspects.for_topic(vehicle, 'ventilated front seats')['part'], 'Seats')
            self.assertEqual(aspects.for_topic(vehicle, 'Front interior roominess')['part'], 'Cabin space')
            self.assertEqual(aspects.for_topic(vehicle, 'Rear seat entertainment')['part'], 'Rear entertainment')
            self.assertEqual(aspects.for_topic(vehicle, 'Highway assistant')['part'], 'Sensors and assistance')
            self.assertEqual(aspects.for_topic(vehicle, 'heated steering wheel')['part'], 'Steering wheel')
