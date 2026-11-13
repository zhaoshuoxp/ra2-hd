"""Raised Snow ground contacts must remain opaque beside neighboring tiles."""
import unittest

import numpy as np
from scipy import ndimage

from showcase_reconstruction import coherent_extra_alpha


class SnowGroundContactTest(unittest.TestCase):
    def test_raised_snow_contact_stays_closed_while_exposed_ice_is_antialiased(self):
        yy, xx = np.indices((50, 70))
        mask = (xx >= 5+yy//3) & (xx < 65-yy//4) & (yy >= np.abs(xx-35)//2+2) & (yy < 45)
        original = np.zeros((50, 70, 4), np.uint8)
        original[mask] = [45, 90, 140, 255]
        snow = mask & (yy < 22)
        original[snow] = [220, 230, 240, 255]
        image = dict(hasExtraData=True, offset=[0, -40], block=[60, 30])
        protected = ndimage.maximum_filter(snow, 3)
        for density in (2, 4):
            prior = coherent_extra_alpha(original, image, density, mask, [0, 0, 70, 50])
            fixed = coherent_extra_alpha(original, image, density, mask, [0, 0, 70, 50], snow_ground=True)
            contact = protected.repeat(density, 0).repeat(density, 1)
            exact = np.uint8(mask.repeat(density, 0).repeat(density, 1))*255
            self.assertTrue(np.any(prior[contact] != exact[contact]))
            np.testing.assert_array_equal(fixed[contact], exact[contact])
            np.testing.assert_array_equal(fixed[~contact], prior[~contact])
            self.assertTrue(np.any((fixed[~contact] > 0) & (fixed[~contact] < 255)))


if __name__ == '__main__':
    unittest.main()
