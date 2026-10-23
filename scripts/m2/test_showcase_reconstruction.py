"""Check source geometry protection and exclusion of retail RGB grain."""
import unittest
import numpy as np
from showcase_reconstruction import extra_alpha, continuous_water_detail, continuous_water_weight


class ReconstructionTests(unittest.TestCase):
    def test_main_footprint_stays_exact_when_extra_outline_is_rebuilt(self):
        original = np.zeros((20, 20, 4), np.uint8)
        for y in range(20):
            original[y, 2+y//3:18, 3] = 255
        image = dict(hasExtraData=True, offset=[0, -12], block=[20, 8])
        for density in (2, 4):
            exact = original[..., 3].repeat(density, 0).repeat(density, 1)
            alpha = extra_alpha(original, image, density)
            self.assertTrue(np.array_equal(alpha[11*density:], exact[11*density:]))
            self.assertGreater(np.count_nonzero(alpha[:11*density] != exact[:11*density]), 0)
            plain = extra_alpha(original, dict(image, hasExtraData=False), density)
            self.assertTrue(np.array_equal(plain, exact))

    def test_sea_uses_anchor_mean_without_copying_its_checkerboard_pixels(self):
        anchor = np.full((16, 16, 4), [50, 60, 80, 255], np.uint8)
        anchor[::2, ::2, :3] += 20
        anchor[1::2, 1::2, :3] -= 20
        for density in (2, 4):
            yy, xx = np.indices((32*density, 32*density))
            plane = 80+xx*.2+yy*.1
            fine = (xx % 2)*4
            authored = np.uint8(np.repeat((plane+fine)[..., None], 3, axis=2))
            a = continuous_water_detail(authored, anchor, density)
            b = continuous_water_detail(authored, anchor[::-1].copy(), density)
            self.assertTrue(np.array_equal(a, b))
            self.assertGreater(a[..., 0].std(), 0)
            self.assertLess(a[..., 0].std(), 4)
            self.assertLess(abs(a[..., 0].mean()-50), 2)

    def test_water_tile_cut_never_exposes_extruded_mother_margin(self):
        yy, xx = np.indices((16, 16))
        active = abs(xx-8)+abs(yy-8) < 8
        for density in (2, 4):
            expected = active.repeat(density, 0).repeat(density, 1).astype(float)
            self.assertTrue(np.array_equal(continuous_water_weight(active, active, density), expected))
            water = active & (xx < 8)
            weight = continuous_water_weight(water, active, density)
            exact = water.repeat(density, 0).repeat(density, 1).astype(float)
            self.assertTrue(np.array_equal(weight[:, :5*density], exact[:, :5*density]))


if __name__ == '__main__':
    unittest.main()
