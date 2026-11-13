"""Guard pinned RGB extrusion while retaining subject bounds and dark details."""
import hashlib
import unittest

import numpy as np
from PIL import Image
from showcase_registration import register


class ExteriorExtrusionTests(unittest.TestCase):
    def test_exterior_matte_is_excluded_without_changing_geometry_or_interior(self):
        pixels = np.zeros((30, 30, 4), np.uint8)
        pixels[2:28, 2:28] = [140, 150, 160, 255]
        pixels[2:4, 2:28, :3] = 0
        pixels[12:18, 12:18, :3] = 0
        pixels[14:16, 14:16, 3] = 0
        master = Image.fromarray(pixels)
        info = dict(slotRect=[0, 0, 30, 30])
        bounds, original = register(master, info, [30, 30], isolated=True)
        guard = dict(schema='pinned-exterior-dark-matte-extrusion-v1',
            masterRgbaSha256=hashlib.sha256(master.tobytes()).hexdigest(),
            maximumInsetMasterPixels=2, maximumChannel=24)
        after_bounds, guarded = register(master, {**info, 'exteriorDarkMatteExtrusion': guard},
            [30, 30], isolated=True)
        self.assertEqual(bounds, after_bounds)
        self.assertTrue((original[:2] == 0).all())
        self.assertTrue((guarded[:2] == [140, 150, 160]).all())
        np.testing.assert_array_equal(guarded[10:16, 10:16], original[10:16, 10:16])
        guard['masterRgbaSha256'] = 'wrong'
        with self.assertRaises(AssertionError):
            register(master, {**info, 'exteriorDarkMatteExtrusion': guard}, [30, 30], isolated=True)


if __name__ == '__main__':
    unittest.main()
