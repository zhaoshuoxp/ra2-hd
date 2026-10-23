"""Regression checks for subpixel geometry and native remap semantics."""
import unittest

import numpy as np

from showcase_contours import coverage, register_contours


class StructuralCoverageTests(unittest.TestCase):
    def test_diagonal_owner_strip_keeps_width_and_has_subpixel_edges(self):
        mask = np.zeros((24, 32), bool)
        for x in range(4, 26):
            mask[3 + x // 2, x] = True
        for density in [2, 4]:
            result = coverage(mask, density, linear_strips=True)
            self.assertTrue(((result > 0) & (result < 255)).any())
            self.assertAlmostEqual(result.sum() / 255 / density**2, mask.sum(), delta=mask.sum() * .025)
            # A reconstructed diagonal crosses each row continuously.
            for row in result:
                positions = np.flatnonzero(row)
                if len(positions):
                    self.assertEqual(len(positions), positions[-1] - positions[0] + 1)

    def test_tiny_fixture_and_rectangular_hole_stay_exact(self):
        mask = np.zeros((12, 16), bool)
        mask[3:10, 4:14] = True
        mask[5:7, 7:9] = False
        mask[0, 0] = True
        for density in [2, 4]:
            np.testing.assert_array_equal(coverage(mask, density), mask.repeat(density, 0).repeat(density, 1) * 255)

    def test_native_owner_shades_contacts_and_padding(self):
        indices = np.zeros((20, 24), np.uint8)
        indices[2:18, 3:21] = 80
        indices[17, 3:21] = 12
        indices[5, 4:20] = np.arange(16, 32)
        for density in [2, 4]:
            expanded = indices.repeat(density, 0).repeat(density, 1)
            base = np.zeros((22*density, 26*density, 4), np.uint8)
            base[:20*density, :24*density, :3] = 140
            base[:20*density, :24*density, 3] = (expanded != 0) * 255
            data = np.zeros_like(base)
            data[..., 3] = 255
            owner = (expanded >= 16) & (expanded <= 31)
            data[:20*density, :24*density, 0][owner] = 255
            data[:20*density, :24*density, 1][owner] = expanded[owner] - 16
            before = base.copy()
            b, d = register_contours(base, data, indices, density, True)
            np.testing.assert_array_equal(b[17*density:18*density, 3*density:21*density],
                                          before[17*density:18*density, 3*density:21*density])
            np.testing.assert_array_equal(d[:20*density, :24*density, 1][owner], expanded[owner] - 16)
            self.assertFalse(b[20*density:, :, 3].any())
            self.assertFalse(d[20*density:, :, 0].any())
            self.assertFalse(((d[..., 0] > 0) & (b[..., 3] == 0)).any())
            self.assertLessEqual(d[..., 1].max(), 15)
            self.assertTrue((d[..., 3] == 255).all())

    def test_single_pixel_owner_cap_at_diagonal_boundary_keeps_full_area(self):
        indices = np.zeros((8, 8), np.uint8)
        for y in range(2, 7):
            indices[y, 2:y+1] = 80
        indices[3, 3] = 22
        for density in [2, 4]:
            expanded = indices.repeat(density, 0).repeat(density, 1)
            base = np.zeros((*expanded.shape, 4), np.uint8)
            base[..., :3] = 140
            base[..., 3] = (expanded != 0) * 255
            data = np.zeros_like(base)
            data[..., 3] = 255
            data[..., 0][expanded == 22] = 255
            data[..., 1][expanded == 22] = 6
            b, d = register_contours(base, data, indices, density, True)
            self.assertEqual(d[..., 0].sum() / 255, density**2)
            self.assertTrue((b[3*density:4*density, 3*density:4*density, 3] == 255).all())

    def test_thin_rim_with_large_hole_keeps_native_painted_area(self):
        mask = np.zeros((48, 64), bool)
        for x in range(6, 58):
            top = 8 + x // 3
            mask[top:top+2, x] = True
            mask[top+22:top+24, x] = True
        mask[10:34, 6:8] = True
        mask[27:47, 56:58] = True
        for density in [2, 4]:
            result = coverage(mask, density, linear_strips=True)
            self.assertAlmostEqual(result.sum()/255/density**2, mask.sum(), delta=mask.sum()*.025)
            self.assertTrue(((result>0)&(result<255)).any())


if __name__ == '__main__':
    unittest.main()
