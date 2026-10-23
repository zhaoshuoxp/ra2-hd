"""Keep authored road markings while rejecting transparent-edge generation residue."""
import unittest

import numpy as np
from showcase_registration import authored_coverage
from showcase_materials import authored_pool_water_weight, reject_new_matte, opaque_water_patch


class StructureRegistrationTest(unittest.TestCase):
    def test_edge_residue_is_excluded_but_interior_markings_survive(self):
        image = np.full((40, 50, 4), [90, 92, 93, 255], dtype=np.uint8)
        image[:3, :, 3] = 0
        image[3, 20, :3] = [254, 239, 14]
        image[20, 20:30, :3] = [254, 239, 14]
        coverage = authored_coverage(image, 180, True)
        self.assertFalse(coverage[3, 20])
        self.assertTrue(coverage[20, 20:30].all())
        self.assertTrue(coverage[3, 19])
        self.assertTrue(authored_coverage(image, 180)[3, 20])

    def test_native_tan_stone_and_white_trim_are_retained_at_edge(self):
        image = np.full((12, 12, 4), [196, 160, 116, 255], dtype=np.uint8)
        image[0, 3:8, :3] = [240, 240, 230]
        self.assertTrue(authored_coverage(image, 180, True).all())

    def test_pool_keeps_authored_curve_and_excludes_disconnected_blue_noise(self):
        y, x = np.mgrid[:40, :60]
        native = ((x - 30) ** 2 / 24 ** 2 + (y - 20) ** 2 / 12 ** 2) < 1
        for density in (2, 4):
            hy, hx = np.mgrid[:40 * density, :60 * density]
            smooth = ((hx / density - 30) ** 2 / 24 ** 2 + (hy / density - 20) ** 2 / 12 ** 2) < 1
            image = np.full((*smooth.shape, 3), [180, 175, 150], dtype=np.uint8)
            image[smooth] = [35, 48, 75]
            image[0, 0] = [35, 48, 75]
            weight, record = authored_pool_water_weight(image, native, density)
            self.assertEqual(weight[0, 0], 0)
            self.assertEqual(weight[20 * density, 30 * density], 1)
            self.assertGreater(record['overlap'], .95)
            self.assertTrue(((weight > 0) & (weight < 1)).any())

    def test_displaced_pool_is_rejected(self):
        native = np.zeros((30, 40), bool)
        native[5:25, 10:30] = True
        image = np.full((60, 80, 3), [190, 185, 160], dtype=np.uint8)
        image[10:50, 50:75] = [35, 48, 75]
        with self.assertRaises(AssertionError):
            authored_pool_water_weight(image, native, 2)

    def test_calibration_matte_does_not_replace_native_bright_material(self):
        native = np.full((10, 10, 4), [196, 160, 116, 255], np.uint8)
        native[4, 4, :3] = [255, 255, 0]
        rgb = native[..., :3].repeat(4, 0).repeat(4, 1)
        rgb[3, 3] = [255, 245, 14]
        corrected, count = reject_new_matte(rgb, native, 4)
        self.assertEqual(count, 1)
        np.testing.assert_array_equal(corrected[3, 3], [196, 160, 116])
        np.testing.assert_array_equal(corrected[16:20, 16:20], rgb[16:20, 16:20])

    def test_water_patch_excludes_extruded_diamond_corners_and_meets_at_mirror_edges(self):
        y, x = np.mgrid[:30, :60]
        active = np.abs(x - 29.5) / 30 + np.abs(y - 14.5) / 15 < 1
        for density in (2, 4):
            image = np.full((30 * density, 60 * density, 3), [255, 0, 0], np.uint8)
            inside = active.repeat(density, 0).repeat(density, 1)
            image[inside] = [35, 48, 75]
            patch, rect = opaque_water_patch(image, active, density)
            self.assertTrue((patch[..., 0] == 35).all())
            self.assertGreater(rect[2] * rect[3], 100)
            middle = patch.shape[1] // 2
            np.testing.assert_array_equal(patch[:, middle - 1], patch[:, middle])
            np.testing.assert_array_equal(patch[:, 0], patch[:, -1])


if __name__ == '__main__':
    unittest.main()
