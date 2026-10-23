"""Verify tone correction retains authored detail and excludes native contacts."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_materials import register_frame_tone


class NativeFrameToneTest(unittest.TestCase):
    def test_both_densities_preserve_detail_and_protected_pixels(self):
        indices = np.array([[0, 12, 40], [41, 42, 43]], np.uint8)
        native = np.full((2, 3, 4), [80, 140, 116, 255], np.uint8)
        for density in (2, 4):
            with self.subTest(density=density):
                authored = np.full((2 * density, 3 * density, 3), [140, 88, 50], np.uint8)
                authored[::2, ::2] += 18
                result, proof = register_frame_tone(authored, native, indices, density)
                body = np.repeat(np.repeat((indices != 0) & (indices != 12), density, 0), density, 1)
                self.assertTrue(np.array_equal(result[~body], authored[~body]))
                self.assertGreater(result[body].std(0).min(), 0)
                self.assertTrue(np.all(abs(result[body].mean(0) - [80, 140, 116]) <
                                       abs(authored[body].mean(0) - [80, 140, 116])))
                self.assertEqual(proof['bodyPixels'], 4 * density * density)

    def test_native_palette_indices_remain_material_in_non_remappable_rubble(self):
        # Rubble uses isotem; indices 16..31 are ordinary material in this palette.
        indices = np.array([[16, 31]], np.uint8)
        native = np.full((1, 2, 3), [184, 196, 188], np.uint8)
        authored = np.full((2, 4, 3), [100, 80, 50], np.uint8)
        result, _ = register_frame_tone(authored, native, indices, 2)
        self.assertTrue((result > authored).all())

    def test_empty_and_wrong_density_are_rejected(self):
        pixels = np.zeros((2, 2, 3), np.uint8)
        with self.assertRaises(AssertionError):
            register_frame_tone(pixels, pixels, np.zeros((2, 2), np.uint8), 1)
        with self.assertRaises(AssertionError):
            register_frame_tone(pixels, pixels, np.full((2, 2), 40, np.uint8), 2)


if __name__ == '__main__':
    unittest.main()
