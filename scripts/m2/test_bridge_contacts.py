"""Protect native road paint topology and approved bridge pixels during registration."""
import unittest

import numpy as np

from showcase_bridge_contacts import coordinates, fit_stripes, intervals, register_bridge_contacts


def native_road(shape, shift=0):
    u, v = coordinates(shape)
    u += shift
    rgba = np.full((*shape, 4), [54, 58, 62, 255], np.uint8)
    rgba[..., 3] = np.uint8((u >= 149) & (u <= 330) & (v >= -29) & (v <= 91))*255
    for center in [171, 239.5, 245, 314]:
        rgba[np.abs(u-center) < 1.6, :3] = [150, 145, 75]
    for center in [206, 279]:
        paint = (np.abs(u-center) < 1.6) & ((v+25) % 20 < 12)
        rgba[paint, :3] = [180, 185, 190]
    return rgba


class BridgeContactsTest(unittest.TestCase):
    def test_missing_samples_do_not_join_separate_lane_dashes(self):
        runs = intervals(np.array([0, 1, 3, 4, 5, 7, 8, 20, 21, 23, 24]))
        self.assertEqual(len(runs), 2)
        self.assertLess(runs[0][1], 15)
        self.assertGreater(runs[1][0], 15)

    def test_registration_preserves_alpha_and_every_non_road_pixel(self):
        native = native_road((180, 240))
        donor = native_road((60, 120), 120)
        for density in [2, 4]:
            image = native.repeat(density, 0).repeat(density, 1)
            corrected, report = register_bridge_contacts(image, native, [donor], density)
            np.testing.assert_array_equal(corrected[..., 3], image[..., 3])
            u, _ = coordinates(image.shape[:2], density)
            protected = (u < 160) | (u > 325)
            np.testing.assert_array_equal(corrected[protected], image[protected])
            self.assertFalse(report['outsideContactBandChanged'])
            self.assertGreater(report['changedPixels'], 0)

    def test_missing_yellow_line_rejects_a_bad_source_guide(self):
        native = native_road((180, 240))
        u, _ = coordinates(native.shape[:2])
        native[np.abs(u-245) < 4, :3] = [54, 58, 62]
        with self.assertRaises(AssertionError):
            fit_stripes(native)


if __name__ == '__main__':
    unittest.main()
