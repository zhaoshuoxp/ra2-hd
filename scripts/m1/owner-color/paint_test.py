"""Semantic mask cases: displaced paint, death clothing, neutral materials and fire."""
import unittest
import numpy as np
from paint import complete_data


class PaintTests(unittest.TestCase):
    def image(self):
        rgba = np.zeros((24, 32, 4), np.uint8)
        data = np.zeros_like(rgba)
        data[..., 3] = 255
        return rgba, data

    def test_displaced_panels_and_unseeded_death_clothing(self):
        rgba, data = self.image()
        rgba[3:12, 3:12] = [180, 18, 23, 255]
        data[4:6, 4:6, 0] = 255
        rgba[15:22, 22:30] = [140, 16, 19, 255]
        result, added, _ = complete_data(rgba, data, 2, 'E1', 'gi.shp')
        self.assertEqual(added, 81 + 56 - 4)
        self.assertTrue(np.all(result[3:12, 3:12, 0] == 255))
        self.assertTrue(np.all(result[15:22, 22:30, 0] == 255))
        self.assertTrue(np.array_equal(result[..., 2:], data[..., 2:]))
        self.assertEqual(complete_data(rgba, result, 2, 'E1', 'gi.shp')[1], 0)

    def test_fire_skin_and_fixed_masonry_are_preserved(self):
        rgba, data = self.image()
        rgba[2:10, 2:10] = [220, 30, 10, 255]
        rgba[4:8, 4:8] = [255, 220, 20, 255]
        rgba[15:20, 3:9] = [220, 160, 120, 255]
        result, added, _ = complete_data(rgba, data, 2, 'GGI', 'ggi.shp')
        self.assertEqual(added, 0)
        self.assertTrue(np.array_equal(result, data))
        rgba[15:22, 22:30] = [160, 15, 20, 255]
        for name, member in [('SPY', 'spy.shp'), ('NAWALL', 'ntwall.shp')]:
            result, added, _ = complete_data(rgba, data, 2, name, member)
            self.assertEqual(added, 0)

    def test_art_remapable_tag_and_empty_native_support_do_not_clip_building_paint(self):
        rgba, data = self.image()
        rgba[3:16, 3:16] = [200, 10, 25, 255]
        for name in ['GAGAP', 'ATESLA', 'NAWEAP', 'NANRCT']:
            result, added, _ = complete_data(rgba, data, 4, name, 'body.shp')
            self.assertEqual(added, 169)
            self.assertTrue(np.all(result[3:16, 3:16, 0] == 255))

    def test_death_clothing_touching_skin_is_not_fire(self):
        rgba, data = self.image()
        rgba[3:12, 3:12] = [210, 18, 24, 255]
        rgba[12:19, 3:12] = [245, 170, 100, 255]
        rgba[12:15, 10:12] = [210, 92, 86, 255]
        rgba[3:8, 12:18] = [144, 58, 32, 255]
        result, added, _ = complete_data(rgba, data, 2, 'TANY', 'tany.shp')
        self.assertEqual(added, 81)
        self.assertTrue(np.all(result[3:12, 3:12, 0] == 255))
        self.assertTrue(np.all(result[12:19, 3:12, 0] == 0))
        self.assertTrue(np.all(result[3:8, 12:18, 0] == 0))


if __name__ == '__main__':
    unittest.main()
