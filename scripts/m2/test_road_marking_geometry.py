"""Regression checks for crossing topology, parking continuity and material phase."""
import unittest

import numpy as np
from PIL import Image, ImageDraw

from road_marking_geometry import repair_member, sample_asphalt, strip_markings


class RoadMarkingTests(unittest.TestCase):
    def test_crosswalk_bars_do_not_become_a_longitudinal_painted_spine(self):
        yy, xx = np.indices((60, 180))
        offsets = [10, 25, 40, 55, 70, 85, 100]
        paint = np.minimum.reduce([abs(xx + .5 - 2 * (yy + .5) - value) for value in offsets]) < 1.3
        native = np.full((60, 180, 4), 255, np.uint8)
        native[..., :3] = 52
        native[paint, :3] = 210
        material = np.full((120, 120, 3), 55.)
        for density in [2, 4]:
            authored = native.repeat(density, 0).repeat(density, 1)
            result, _ = repair_member(authored, native, (0, 0), density, material, crosswalk=True)
            y, x = (np.indices(result.shape[:2]) + .5) / density
            allowed = np.minimum.reduce([abs(x - 2 * y - value) for value in offsets]) < 3
            white = result[..., :3].mean(2) > 160
            self.assertLess((white & ~allowed).sum(), max(5, white.sum() * .015))
            for offset in offsets:
                bar = (abs(x - 2 * y - offset) < .3) & (y > 8) & (y < 50)
                self.assertGreater(white[bar].mean(), .9)

    def test_parking_lines_bridge_weathering_without_painting_the_driving_aisle(self):
        mask = Image.new('L', (240, 130))
        draw = ImageDraw.Draw(mask)
        for start in range(20, 180, 20):
            draw.line([(start, 15), (start + 40, 35)], fill=255, width=1)
            draw.line([(start + 10, 90), (start + 50, 110)], fill=255, width=1)
        full = np.array(mask) > 0
        native = np.full((130, 240, 4), 255, np.uint8)
        native[..., :3] = 52
        weathered = full.copy()
        weathered[:, 50:53] = False
        weathered[:, 130:133] = False
        native[weathered, :3] = 210
        material = np.full((120, 120, 3), 55.)
        for density in [2, 4]:
            authored = native.repeat(density, 0).repeat(density, 1)
            result, _ = repair_member(authored, native, (0, 0), density, material, parking=True)
            white = result[..., :3].mean(2) > 150
            self.assertFalse(white[48 * density:77 * density].any())
            expected = full.repeat(density, 0).repeat(density, 1)
            self.assertGreater(white[expected].mean(), .5)

    def test_repaired_paint_preserves_every_source_alpha_sample(self):
        native = np.full((60, 120, 4), 255, np.uint8)
        native[..., :3] = 52
        native[20:22, 15:105, :3] = 210
        native[:4, :, 3] = 0
        for density in [2, 4]:
            authored = native.repeat(density, 0).repeat(density, 1)
            result, _ = repair_member(authored, native, (-30, 15), density,
                np.full((120, 120, 3), 55.))
            np.testing.assert_array_equal(result[..., 3], authored[..., 3])

    def test_unmarked_road_does_not_acquire_a_parking_grid(self):
        native = np.full((60, 120, 4), 255, np.uint8)
        native[..., :3] = 52
        authored = native.repeat(4, 0).repeat(4, 1)
        result, detail = repair_member(authored, native, (0, 0), 4, np.full((120, 120, 3), 55.))
        self.assertFalse(detail['changed'])
        np.testing.assert_array_equal(result, authored)

    def test_shared_asphalt_keeps_the_same_phase_at_adjacent_native_cells(self):
        y, x = np.indices((120, 120))
        material = np.stack([50 + 5 * np.sin(x / 9), 50 + 5 * np.cos(y / 7), np.full(x.shape, 50)], axis=-1)
        for density in [2, 4]:
            first = sample_asphalt(material, (30, 60), (0, 0), density)
            second = sample_asphalt(material, (30, 60), (30, 15), density)
            np.testing.assert_allclose(first, second, atol=1e-10)

    def test_straight_center_pair_does_not_acquire_transverse_end_caps(self):
        yy, xx = np.indices((90, 180))
        distance = (xx + .5 - 60 + 2 * (yy + .5) - 122.5) / np.sqrt(2)
        yellow = np.minimum(abs(distance - 2.12), abs(distance + 2.12)) < .9
        native = np.full((90, 180, 4), 255, np.uint8)
        native[..., :3] = 52
        native[yellow, :3] = [225, 184, 65]
        for density in [2, 4]:
            white, paint, _ = strip_markings(native, (-60, 0), density, 0)
            y, x = (np.indices(paint.shape) + .5) / density
            actual_distance = (x - 60 + 2 * y - 122.5) / np.sqrt(2)
            allowed = np.minimum(abs(actual_distance - 2.12), abs(actual_distance + 2.12)) < 1.1
            self.assertFalse((paint[~allowed] > .01).any())
            center = abs(actual_distance - 2.12) < .35
            self.assertTrue(center.any())
            self.assertGreater(paint[center].mean(), .99)
            lane = abs(actual_distance - 25.45) < .35
            self.assertTrue(lane.any())
            self.assertGreater((white[lane] > .9).mean(), .35)
            self.assertGreater((white[lane] < .01).mean(), .2)

    def test_intersection_guides_keep_clear_gaps_between_dashes(self):
        yy, xx = np.indices((90, 180))
        native = np.full((90, 180, 4), 255, np.uint8)
        native[..., :3] = 52
        native[abs(xx + .5 + 2 * (yy + .5) - 120) < 1.4, :3] = 210
        for density in [2, 4]:
            authored = native.repeat(density, 0).repeat(density, 1)
            result, _ = repair_member(authored, native, (0, 0), density,
                np.full((120, 120, 3), 55.), member='proad03.urb')
            y, x = (np.indices(result.shape[:2]) + .5) / density
            center = (abs(x + 2 * y - 120) < .55) & (x > 20) & (x < 100)
            self.assertTrue(center.any())
            white = result[..., :3].mean(2) > 150
            self.assertGreater(white[center].mean(), .3)
            self.assertGreater((~white[center]).mean(), .2)


if __name__ == '__main__':
    unittest.main()
