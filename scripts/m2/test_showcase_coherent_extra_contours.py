"""Complementary native cuts must retain an opaque reconstructed member."""
import unittest

import numpy as np

from showcase_reconstruction import coherent_extra_alpha, extra_alpha


class CoherentExtraContoursTest(unittest.TestCase):
    def test_complementary_parts_do_not_create_a_transparent_diagonal_seam(self):
        yy, xx = np.indices((32, 32))
        first = np.zeros((32, 32, 4), np.uint8)
        second = first.copy()
        first[..., 3] = np.uint8(xx <= yy) * 255
        second[..., 3] = np.uint8(xx > yy) * 255
        whole = np.ones((32, 32), bool)
        image = dict(hasExtraData=True, offset=[0, -24], block=[32, 8])
        for density in [2, 4]:
            legacy = [extra_alpha(part, image, density).astype(float)/255 for part in [first, second]]
            old_composite = 1-(1-legacy[0])*(1-legacy[1])
            self.assertLess(old_composite[8*density:16*density, 8*density:16*density].min(), .99)
            frames = [coherent_extra_alpha(part, image, density, whole, [0, 0, 32, 32])
                      for part in [first, second]]
            composite = 1-(1-frames[0].astype(float)/255)*(1-frames[1].astype(float)/255)
            np.testing.assert_array_equal(composite, np.ones((32*density, 32*density)))
            for part, frame in zip([first, second], frames):
                np.testing.assert_array_equal(frame, part[..., 3].repeat(density, 0).repeat(density, 1))

    def test_exposed_rock_inside_main_block_has_continuous_edges(self):
        yy, xx = np.indices((24, 24))
        mask = (yy >= 3) & (yy <= 19) & (xx >= 3) & (xx <= yy)
        rgba = np.zeros((24, 24, 4), np.uint8)
        rgba[mask] = [190, 120, 55, 255]
        image = dict(hasExtraData=False, offset=[0, 0], block=[24, 24])
        for density in [2, 4]:
            exact = rgba[..., 3].repeat(density, 0).repeat(density, 1)
            default = coherent_extra_alpha(rgba, image, density, mask, [0, 0, 24, 24])
            np.testing.assert_array_equal(default, exact)
            alpha = coherent_extra_alpha(rgba, image, density, mask, [0, 0, 24, 24], exposed_rock=True)
            self.assertTrue(((alpha > 0) & (alpha < 255)).any())
            self.assertTrue((alpha != exact).any())
            self.assertTrue((alpha[8*density:15*density, 5*density:7*density] == 255).all())
            self.assertTrue((alpha[:density] == 0).all())

    def test_ground_contacts_and_complementary_rock_cuts_stay_exact(self):
        yy, xx = np.indices((24, 24))
        image = dict(hasExtraData=False, offset=[0, 0], block=[24, 24])
        ground = np.zeros((24, 24, 4), np.uint8)
        ground[xx <= yy] = [100, 115, 55, 255]
        for density in [2, 4]:
            alpha = coherent_extra_alpha(ground, image, density, ground[..., 3] > 0,
                [0, 0, 24, 24], exposed_rock=True)
            np.testing.assert_array_equal(alpha, ground[..., 3].repeat(density, 0).repeat(density, 1))
            for selection in [xx <= yy, xx > yy]:
                rock = np.zeros((24, 24, 4), np.uint8)
                rock[selection] = [190, 120, 55, 255]
                alpha = coherent_extra_alpha(rock, image, density, np.ones((24, 24), bool),
                    [0, 0, 24, 24], exposed_rock=True)
                np.testing.assert_array_equal(alpha, rock[..., 3].repeat(density, 0).repeat(density, 1))


if __name__ == '__main__':
    unittest.main()
