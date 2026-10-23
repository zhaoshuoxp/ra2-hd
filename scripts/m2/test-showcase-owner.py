"""Focused material regression: fixed red, native ownership, detail, and density."""
import unittest
import numpy as np
from showcase_owner import register_owner_material, register_fixed_owner_trim


class OwnerMaterialTests(unittest.TestCase):
    def fixture(self, density=2):
        indices = np.full((12, 48), 50, np.uint8)
        indices[:, 2:4] = np.arange(16, 28, dtype=np.uint8)[:, None]
        native = np.full((12, 48, 4), 90, np.uint8)
        native[..., 3] = 255
        native[3:8, 8:12, :3] = [150, 35, 25]  # A fixed medical/brick material.
        rgb = np.full((12 * density, 48 * density, 3), [170, 30, 25], np.uint8)
        return indices, native, rgb

    def test_owner_shades_remain_categorical_and_fixed_red_is_preserved(self):
        indices, native, rgb = self.fixture()
        result, changed = register_owner_material(rgb, native, indices, 2)
        self.assertTrue(changed.any())
        np.testing.assert_array_equal(result[:, 4:8], rgb[:, 4:8])
        np.testing.assert_array_equal(result[6:16, 16:24], rgb[6:16, 16:24])
        np.testing.assert_array_equal(indices[:, 2], np.arange(16, 28))

    def test_false_red_is_neutral_and_fine_luminance_survives(self):
        indices, native, rgb = self.fixture()
        rgb[::2, 10:14] = [200, 45, 35]
        result, _ = register_owner_material(rgb, native, indices, 2)
        self.assertLess(abs(int(result[0, 11, 0]) - int(result[0, 11, 1])), 2)
        self.assertGreater(int(result[0, 11, 0]), int(result[1, 11, 0]))

    def test_no_owner_and_contact_cells_are_unchanged(self):
        indices, native, rgb = self.fixture()
        indices[:, :5] = 12
        result, changed = register_owner_material(rgb, native, indices, 2)
        np.testing.assert_array_equal(result, rgb)
        self.assertFalse(changed.any())

    def test_native_radius_is_density_independent(self):
        for density in [2, 4]:
            indices, native, rgb = self.fixture(density)
            result, changed = register_owner_material(rgb, native, indices, density)
            self.assertFalse(changed[:, 36 * density:].any())
            np.testing.assert_array_equal(result[:, 36 * density:], rgb[:, 36 * density:])

    def test_excess_trim_paint_returns_to_original_brick_hue(self):
        indices, native, rgb = self.fixture()
        native[:, 4:6, :3] = [80, 32, 16]
        result, changed = register_owner_material(rgb, native, indices, 2)
        self.assertTrue(changed[:, 8:12].any())
        self.assertGreater(int(result[12, 10, 1]), int(rgb[12, 10, 1]))
        rgb[:, 8:12] = [80, 32, 16]
        result, changed = register_owner_material(rgb, native, indices, 2)
        self.assertFalse(changed[:, 8:12].any())

    def test_dim_native_red_brick_does_not_protect_bright_window_spill(self):
        for density in [2, 4]:
            indices, native, rgb = self.fixture(density)
            native[..., :3] = [52, 4, 0]
            rgb[:] = [150, 4, 0]
            result, changed = register_fixed_owner_trim(rgb, native, indices, density)
            self.assertTrue(changed[:, 4 * density:6 * density].all())
            self.assertLess(int(result[6 * density, 5 * density, 0]), 70)
            np.testing.assert_array_equal(result[:, 2 * density:4 * density],
                                          rgb[:, 2 * density:4 * density])
            np.testing.assert_array_equal(result[:, 11 * density:], rgb[:, 11 * density:])

    def test_fixed_trim_preserves_native_material_contacts_and_nonowner_states(self):
        indices, native, rgb = self.fixture()
        native[..., :3] = [52, 4, 0]
        rgb[:] = [52, 4, 0]
        result, changed = register_fixed_owner_trim(rgb, native, indices, 2)
        np.testing.assert_array_equal(result, rgb)
        self.assertFalse(changed.any())
        rgb[:] = [150, 4, 0]
        indices[:, 4:6] = 12
        result, _ = register_fixed_owner_trim(rgb, native, indices, 2)
        np.testing.assert_array_equal(result[:, 8:12], rgb[:, 8:12])
        indices[indices < 32] = 50
        result, changed = register_fixed_owner_trim(rgb, native, indices, 2)
        np.testing.assert_array_equal(result, rgb)
        self.assertFalse(changed.any())


if __name__ == '__main__':
    unittest.main()
