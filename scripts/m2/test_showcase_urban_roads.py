"""Check paint geometry and material-edge antialiasing independently of exported art."""
import unittest
import numpy as np
from scipy import ndimage
from showcase_urban_roads import continuous_coverage, paint_strokes, register_urban_road, source_regions


class ContinuousRoadTests(unittest.TestCase):
    def test_temperate_redo_does_not_repaint_brown_curb_wear_as_yellow_lines(self):
        native = np.full((60, 80, 4), 255, np.uint8)
        native[..., :3] = [200, 184, 172]
        native[15:45, :, :3] = [52, 52, 68]
        native[28:30, 8:72, :3] = [84, 84, 52]
        native[28:30, 30:40, :3] = [116, 100, 68]
        native[18:21, 10:65, :3] = [84, 72, 52]
        active, _, paint = source_regions(native, precise_paint=True)
        self.assertFalse(paint[18:21, 10:65].any())
        self.assertTrue(paint[28:30, 8:72].all())

    def test_temperate_redo_retains_colored_wear_instead_of_gray_noise(self):
        native = np.full((60, 80, 4), 255, np.uint8)
        native[..., :3] = [200, 184, 172]
        native[20:40, :, :3] = [52, 52, 68]
        y, x = np.mgrid[:512, :512]
        material = np.stack([90 + 18 * np.sin(x / 9), 95 + 15 * np.cos(y / 7),
                             100 + 15 * np.sin((x + y) / 11)], axis=-1).astype(np.uint8)
        materials = {role: material for role in ['asphalt', 'paving']}
        style = dict(policy='ACCEPTED_TEMPERATE_WORN_MATERIALS_V1', targets={
            'asphalt': dict(mean=[60, 64, 69], contrast=14),
            'paving': dict(mean=[197, 196, 193], contrast=18)})
        for density in [2, 4]:
            result = register_urban_road(np.zeros((60 * density, 80 * density, 3), np.uint8),
                native, density, materials, style).astype(float)
            road = result[24 * density:36 * density, 10 * density:70 * density]
            self.assertGreater((road[..., 0] - road[..., 2]).std(), 3)
            np.testing.assert_allclose(road.mean((0, 1)), [60, 64, 69], atol=8)

    def test_small_dark_paving_marks_are_not_false_asphalt_islands(self):
        native = np.full((60, 80, 4), 255, np.uint8)
        native[..., :3] = [200, 184, 172]
        native[20:40, :, :3] = [52, 52, 68]
        native[8:11, 20:23, :3] = [84, 72, 52]
        _, road, _ = source_regions(native)
        self.assertFalse(road[8:11, 20:23].any())
        self.assertTrue(road[25:35, 10:70].all())

    def test_curved_road_retains_native_area_and_has_subpixel_edge_coverage(self):
        y, x = np.mgrid[:60, :80]
        mask = (x - 40) ** 2 + (y - 45) ** 2 < 25 ** 2
        active = np.ones(mask.shape, bool)
        for density in (2, 4):
            coverage = continuous_coverage(mask, active, density)
            self.assertAlmostEqual(coverage.sum(dtype=np.float64) / density ** 2, mask.sum(), delta=.001)
            self.assertGreater(((coverage > .05) & (coverage < .95)).sum(), 50)
            self.assertTrue((coverage[30 * density:40 * density, 35 * density:45 * density] == 1).all())

    def test_continuous_bend_follows_original_arc_without_pixel_width_pulsing(self):
        y, x = np.mgrid[:64, :64]
        radius = np.sqrt((x - 30) ** 2 + (y - 48) ** 2)
        mask = (np.abs(radius - 25) < .6) & (x >= 30) & (y <= 48)
        active = np.ones(mask.shape, bool)
        for density in (2, 4):
            paint = paint_strokes(mask, active, density)
            labels, count = ndimage.label(paint > .25)
            self.assertEqual(count, 1)
            yy, xx = np.where(paint > .5)
            drawn_radius = np.sqrt(((xx + .5) / density - 30.5) ** 2
                                   + ((yy + .5) / density - 48.5) ** 2)
            self.assertLess(np.quantile(np.abs(drawn_radius - 25), .95), 1)
            self.assertGreater(((paint > 0) & (paint < 1)).sum(), 30)

    def test_separate_junction_markings_and_small_paint_fragments_are_retained(self):
        mask = np.zeros((50, 80), bool)
        mask[15, 5:70] = True
        mask[23:40, 30] = True
        mask[42:44, 72:74] = True
        for density in (2, 4):
            paint = paint_strokes(mask, np.ones(mask.shape, bool), density)
            self.assertEqual(ndimage.label(paint > .25)[1], 3)
            self.assertGreater(paint[42 * density:45 * density, 71 * density:75 * density].max(), .5)

    def test_empty_and_uniform_materials_do_not_invent_an_edge(self):
        active = np.ones((20, 30), bool)
        for density in (2, 4):
            self.assertFalse(continuous_coverage(np.zeros_like(active), active, density).any())
            self.assertTrue((continuous_coverage(active, active, density) == 1).all())

    def test_bright_and_dark_original_paint_remain_one_complete_curve(self):
        y, x = np.mgrid[:64, :64]
        radius = np.sqrt((x - 30) ** 2 + (y - 48) ** 2)
        road = np.abs(radius - 25) < 8
        stripe = (np.abs(radius - 25) < .6) & (x >= 30) & (y <= 48)
        native = np.full((64, 64, 4), 255, np.uint8)
        native[..., :3] = [200, 184, 172]
        native[road, :3] = [52, 52, 68]
        native[stripe, :3] = [84, 84, 52]
        native[stripe & (y % 12 < 6), :3] = [168, 172, 112]
        materials = {role: np.full((256, 256, 3), value, np.uint8)
                     for role, value in [('asphalt', 60), ('paving', 180)]}
        active, _, paint = source_regions(native)
        self.assertTrue(paint[stripe].all())
        for density in (2, 4):
            self.assertEqual(ndimage.label(paint_strokes(paint, active, density) > .25)[1], 1)
            result = register_urban_road(np.zeros((64 * density, 64 * density, 3), np.uint8),
                                         native, density, materials).astype(float)
            yellow = np.minimum(result[..., 0], result[..., 1]) - result[..., 2] > 20
            yellow &= result.mean(2) < 170
            labels, _ = ndimage.label(yellow)
            sizes = np.bincount(labels.ravel())[1:]
            # Thresholding antialiasing may isolate one faint endpoint sample;
            # the structural stroke itself must remain a single component above.
            self.assertGreater(sizes.max() / sizes.sum(), .995)


if __name__ == '__main__':
    unittest.main()
