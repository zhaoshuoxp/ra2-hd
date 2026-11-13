"""Source broad light may change while native pixel grain stays excluded."""
import unittest

import numpy as np

from showcase_materials import register_snow_planar_photometry


class SnowPlanarLightTest(unittest.TestCase):
    def test_source_checkerboard_cannot_become_hd_surface_detail(self):
        yy, xx = np.indices((32, 48))
        native = np.full((32, 48, 4), [130, 145, 160, 255], np.uint8)
        checker = np.where((xx+yy) % 2, 24, -24)
        alternate = native.copy()
        alternate[..., :3] = native[..., :3].astype(int) + checker[..., None]
        for density in (2, 4):
            y, x = np.indices((32*density, 48*density))
            detail = 8*np.sin(x*1.7) + 5*np.cos(y*1.1)
            authored = np.uint8(np.clip(145 + detail[..., None] + np.array([0, 8, 16]), 0, 255))
            first, _ = register_snow_planar_photometry(authored, native)
            second, _ = register_snow_planar_photometry(authored, alternate)
            self.assertLessEqual(np.abs(first.astype(int)-second.astype(int)).max(), 1)
            self.assertGreater(np.diff(first[10*density, :, 0].astype(float)).std(), 5)

    def test_source_broad_light_changes_preserve_authored_local_contrast(self):
        native = np.full((32, 48, 4), [120, 135, 150, 255], np.uint8)
        brighter = native.copy()
        brighter[..., :3] += 12
        for density in (2, 4):
            y, x = np.indices((32*density, 48*density))
            detail = 12*np.sin(x*1.3) + 6*np.cos(y*.7)
            authored = np.uint8(np.clip(135 + detail[..., None] + np.array([0, 8, 16]), 0, 255))
            first, _ = register_snow_planar_photometry(authored, native)
            second, _ = register_snow_planar_photometry(authored, brighter)
            difference = second.astype(int)-first.astype(int)
            self.assertLessEqual(np.abs(difference-12).max(), 1)
            self.assertGreater(np.diff(second[10*density, :, 0].astype(float)).std(), 8)


if __name__ == '__main__':
    unittest.main()
