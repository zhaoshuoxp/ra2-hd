"""Political derivation must preserve country borders and uncertain regions."""
import unittest

import numpy as np

from source_country_regions import source_country_regions


class SourceCountryRegionsTests(unittest.TestCase):
    def setUp(self):
        self.base = np.zeros((40, 80, 3), dtype=np.uint8)
        self.base[3:-3, 3:39] = [0, 0, 100]
        self.base[3:-3, 40:-3] = [100, 0, 0]
        self.base[3:-3, 39:41] = [0, 100, 0]
        self.red = np.zeros((40, 80)); self.blue = self.red.copy()
        self.spec = dict(schema='visible-source-country-regions-v1', minimumVotes=16,
                         minimumDominance=.9, minimumFraction=.01)

    def test_partial_visible_votes_fill_the_country_without_crossing_its_green_border(self):
        self.red[10:16, 10:16] = 1; self.blue[10:16, 60:66] = 1
        before = self.base.copy()
        red, blue, report = source_country_regions(self.base, self.red, self.blue, self.spec)
        self.assertEqual(red[25, 25], 1); self.assertEqual(blue[25, 60], 1)
        self.assertEqual(red[25, 60], 0); self.assertEqual(blue[25, 25], 0)
        self.assertFalse(red[:, 39:41].any() or blue[:, 39:41].any())
        self.assertTrue(np.array_equal(before, self.base))
        self.assertEqual(report['qualifiedRegions'], 2)

    def test_conflicting_votes_preserve_local_authority_without_inventing_an_unknown_country_state(self):
        self.red[10:16, 10:16] = 1; self.blue[20:26, 10:16] = 1
        red, blue, report = source_country_regions(self.base, self.red, self.blue, self.spec)
        self.assertTrue(np.array_equal(red, self.red)); self.assertTrue(np.array_equal(blue, self.blue))
        self.assertEqual(red[25, 60], 0); self.assertEqual(blue[25, 60], 0)
        self.assertEqual(report['qualifiedRegions'], 0)

    def test_a_known_minority_province_keeps_priority_over_the_country_majority(self):
        self.blue[7:20, 7:30] = 1; self.red[24:28, 10:14] = 1
        red, blue, report = source_country_regions(self.base, self.red, self.blue, self.spec)
        self.assertEqual(report['qualifiedRegions'], 1)
        self.assertEqual(red[25, 11], 1); self.assertEqual(blue[25, 11], 0)
        self.assertEqual(blue[28, 30], 1); self.assertEqual(red[28, 30], 0)


if __name__ == '__main__':
    unittest.main()
