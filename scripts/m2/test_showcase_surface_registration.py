"""Preserve native surface clips while continuing authored atlas edge colors."""
import hashlib
import unittest

import numpy as np
from PIL import Image

from showcase_registration import independently_sample, reflect_padding, register


class SurfaceRegistrationTest(unittest.TestCase):
    def fixture(self):
        yy, xx = np.indices((100, 100))
        silhouette = (np.abs(xx-50)+np.abs(yy-50)) < 40
        interior = (np.abs(xx-50)+np.abs(yy-50)) < 32
        pixels = np.zeros((100, 100, 4), np.uint8)
        pixels[silhouette] = [65, 60, 30, 255]
        pixels[interior] = [120, 130, 70, 255]
        image = Image.fromarray(pixels)
        original = image.tobytes()
        info = dict(slotRect=[0, 0, 100, 100], nativeAlphaBounds=[0, 0, 10, 10], exteriorSurfaceContinuation=dict(
            schema='hd-authored-exterior-color-continuation-v1', maximumNativeInset=1,
            masterRgbaSha256=hashlib.sha256(original).hexdigest(), masterPixels=6))
        return image, info

    def test_color_continuation_covers_diagonal_edges_with_unchanged_native_registration(self):
        image, info = self.fixture()
        original = image.tobytes()
        rect, surface = register(image, info, image.size)
        np.testing.assert_array_equal(surface, np.broadcast_to([120, 130, 70], surface.shape))
        for density in [2, 4]:
            sampled = independently_sample(surface, (10*density, 10*density))
            np.testing.assert_array_equal(sampled, np.broadcast_to([120, 130, 70], sampled.shape))
        self.assertEqual(image.tobytes(), original)
        default = {key: value for key, value in info.items() if key != 'exteriorSurfaceContinuation'}
        default_rect, default_surface = register(image, default, image.size)
        self.assertEqual(rect, default_rect)
        self.assertTrue((default_surface[..., 0] == 65).any())

    def test_changed_mothers_and_excessive_color_continuation_are_rejected(self):
        image, info = self.fixture()
        image.putpixel((50, 50), (0, 0, 0, 255))
        with self.assertRaises(AssertionError):
            register(image, info, image.size)
        image, info = self.fixture()
        info['exteriorSurfaceContinuation']['masterPixels'] = 9
        with self.assertRaises(AssertionError):
            register(image, info, image.size)
        info['exteriorSurfaceContinuation']['masterPixels'] = 8
        with self.assertRaises(AssertionError):
            register(image, info, image.size)

    def test_padding_continues_nonuniform_material_without_modifying_authored_pixels(self):
        yy, xx = np.indices((48, 64))
        pixels = np.stack([xx * 3, yy * 4, xx + yy], axis=2).astype(np.uint8)
        valid = np.zeros((48, 64), bool)
        valid[12:36, 16:48] = True
        padded = reflect_padding(pixels, valid)
        np.testing.assert_array_equal(padded[valid], pixels[valid])
        self.assertGreater(np.ptp(padded[24, 4:16, 0]), 0)
        authored_colors = {tuple(color) for color in pixels[valid]}
        self.assertTrue(all(tuple(color) in authored_colors for color in padded[~valid]))
        image, info = self.fixture()
        info['exteriorSurfaceContinuation']['padding'] = 'unknown'
        with self.assertRaises(AssertionError):
            register(image, info, image.size)


if __name__ == '__main__':
    unittest.main()
