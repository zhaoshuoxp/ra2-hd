"""Road boundary regressions target straightness, projected curvature and tangent joins."""
import unittest
import numpy as np
from showcase_road_geometry import fit_strip, fitted_chain, fit_junction_chain, fillet, render_geometry
from showcase_contours import rasterize


class AnalyticRoadTests(unittest.TestCase):
    def test_worn_junction_corner_cannot_reverse_into_an_overhanging_arc(self):
        # Original Urban droadj05 bottom contact includes an interior wear notch.
        points = np.array([
            [75, 53], [75, 52], [74, 52], [73, 52], [73, 51], [72, 51], [71, 51], [71, 52], [71, 53],
            [70, 53], [69, 53], [69, 52], [70, 52], [70, 51], [70, 50], [70, 49], [69, 49], [68, 49],
            [68, 48], [67, 48], [66, 48], [65, 48], [65, 47], [64, 47], [64, 46], [64, 45], [64, 44],
            [63, 44], [62, 44], [61, 44], [61, 45], [60, 45], [59, 45], [58, 45], [57, 45], [56, 45],
            [55, 45], [55, 46], [55, 47], [54, 47], [54, 48], [53, 48], [52, 48], [52, 49], [51, 49],
            [50, 49], [50, 50], [49, 50], [49, 51], [48, 51], [47, 51], [47, 52], [47, 53], [47, 54],
        ], dtype=float)
        curve, model = fit_junction_chain(points)
        self.assertEqual(model['kind'], 'tangent-fillet')
        self.assertTrue((np.diff(curve[:, 0]) < 0).all())
        steps = np.diff(curve * [1, 2], axis=0)
        directions = steps / np.linalg.norm(steps, axis=1)[:, None]
        self.assertGreater(directions[0] @ directions[1], .999)
        self.assertGreater(directions[-2] @ directions[-1], .999)

    def test_short_diagonal_connector_keeps_curb_direction_when_width_exceeds_length(self):
        y, x = np.mgrid[:45, :90]
        native = np.zeros((45, 90, 4), np.uint8)
        diamond = abs((x + .5 - 45) / 45) + abs((y + .5 - 22.5) / 22.5) < 1
        native[diamond] = [190, 180, 170, 255]
        across = (x + .5) + 2 * (y + .5)
        native[diamond & (across >= 63) & (across < 117)] = [52, 52, 68, 255]
        polygons, models = fit_strip(native, curb_direction=True)
        np.testing.assert_allclose(models[0]['normal'], np.array([1, 2]) / np.sqrt(5))
        for density in [2, 4]:
            coverage, _ = render_geometry(polygons, native.shape[:2], density)
            self.assertLess(coverage[2 * density, 20 * density], .01)
            self.assertGreater(coverage[22 * density, 45 * density], .99)

    def test_native_paved_end_cap_does_not_become_a_through_road(self):
        y, x = np.mgrid[:60, :120]
        native = np.zeros((60, 120, 4), np.uint8)
        active = abs((x + .5 - 60) / 60) + abs((y + .5 - 30) / 30) < 1
        native[active] = [190, 180, 170, 255]
        across, along = (x + .5) + 2 * (y + .5), -(x + .5) + 2 * (y + .5)
        native[active & (across >= 93) & (across < 147) & (along < 0)] = [52, 52, 68, 255]
        polygons, model = fit_strip(native, curb_direction=True)
        self.assertGreaterEqual(max(model[0]['nativeEndPavingPixels']), 6)
        for density in [2, 4]:
            coverage, _ = render_geometry(polygons, native.shape[:2], density)
            self.assertGreater(coverage[20 * density, 70 * density], .99)
            self.assertLess(coverage[40 * density, 40 * density], .01)

    def test_offscreen_road_strip_does_not_wrap_negative_scanline_endpoints(self):
        contour = np.array([[-40, -20], [-30, -20], [30, 40], [20, 40]], float)
        for density in [2, 4]:
            mask = rasterize([contour], (30, 40), density)
            # At the top, both crossings are left of the image. Python's
            # negative slice endpoint must never paint a phantom road wedge.
            self.assertFalse(mask[:8 * density].any())
            self.assertTrue(mask[20 * density:25 * density, :10 * density].any())

    def test_wavy_retail_road_and_dark_paving_stains_become_parallel_straight_edges(self):
        y, x = np.mgrid[:70, :120]
        native = np.full((70, 120, 4), 255, np.uint8)
        native[..., :3] = [200, 184, 172]
        wobble = np.rint(2 * np.sin(x / 4)).astype(int)
        road = (y >= 20 + wobble) & (y < 48 + wobble)
        native[road, :3] = [52, 52, 68]
        native[8:15, 30:60, :3] = [84, 72, 52]
        polygons, _ = fit_strip(native)
        for density in [2, 4]:
            coverage, _ = render_geometry(polygons, road.shape, density)
            self.assertEqual(np.ptp(np.argmax(coverage > .5, axis=0)), 0)
            self.assertEqual(np.ptp((coverage > .5).sum(0)), 0)

    def test_a_projected_bend_is_a_single_circle_in_the_ground_plane(self):
        theta = np.linspace(-1.4, -.15, 90)
        ground = [60, 85] + 45 * np.column_stack([np.cos(theta), np.sin(theta)])
        source = np.round(ground / [1, 2])
        curve, model = fitted_chain(source)
        self.assertEqual(model['kind'], 'arc')
        radius = np.linalg.norm(curve * [1, 2] - model['center'], axis=1)
        self.assertLess(np.ptp(radius), 1e-6)

    def test_rounded_junction_arc_meets_both_port_lines_tangentially(self):
        ground = np.concatenate([np.column_stack([np.full(41, 30), np.arange(10, 51)]),
                                 np.column_stack([np.arange(31, 91), np.full(60, 50)])])
        result = fillet(ground / [1, 2])
        self.assertIsNotNone(result)
        curve, _ = result
        steps = np.diff(curve * [1, 2], axis=0)
        directions = steps / np.linalg.norm(steps, axis=1)[:, None]
        self.assertGreater(directions[0] @ directions[1], .999)
        self.assertGreater(directions[-2] @ directions[-1], .999)


if __name__ == '__main__':
    unittest.main()
