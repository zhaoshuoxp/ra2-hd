"""Check that mesh registration keeps dark interstices and independent metal detail."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_materials import register_thin_metal


class ThinMetalTests(unittest.TestCase):
    def test_dark_interstices_do_not_become_bright_faces(self):
        index = np.array([[0, 12], [32, 33]], np.uint8)
        native = np.zeros((2, 2, 4), np.uint8)
        native[1, 0, :3], native[1, 1, :3] = 150, 20
        for density in (2, 4):
            with self.subTest(density=density):
                authored = np.full((2 * density, 2 * density, 3), 150, np.uint8)
                output = register_thin_metal(authored, native, index, density)
                self.assertLess(output[density:, density:].max(), 25)
                self.assertGreater(output[density:, :density].min(), 200)

    def test_author_detail_and_protected_pixels_survive(self):
        index = np.array([[0, 12], [32, 33]], np.uint8)
        native = np.full((2, 2, 4), 150, np.uint8)
        for density in (2, 4):
            with self.subTest(density=density):
                row = np.arange(2 * density, dtype=np.uint8) * 4 + 90
                authored = np.broadcast_to(row[None, :, None], (2 * density, 2 * density, 3)).copy()
                output = register_thin_metal(authored, native, index, density)
                np.testing.assert_array_equal(output[:density], authored[:density])
                self.assertGreater(np.ptp(output[density:, :density, 0]), 0)
                self.assertFalse(np.all(output[density:, :density] == native[1, 0, :3]))

    def test_empty_body_and_wrong_density_shape_are_rejected(self):
        index = np.zeros((2, 2), np.uint8)
        native = np.full((2, 2, 4), 150, np.uint8)
        authored = np.full((4, 4, 3), 100, np.uint8)
        with self.assertRaises(AssertionError):
            register_thin_metal(authored, native, index, 2)
        index[1] = 32
        with self.assertRaises(AssertionError):
            register_thin_metal(authored, native, index, 4)


if __name__ == '__main__':
    unittest.main()
