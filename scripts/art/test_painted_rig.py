"""Regressions for opaque component coverage and rigid foundation registration."""
import unittest

import numpy as np
from PIL import Image

from painted_motion import reduce_material
from painted_rig import encode_owner, material_surface, over, place, project_rgba


class PaintedRigTests(unittest.TestCase):
    def setUp(self):
        self.palette = np.full((256, 3), 80, np.uint8)
        self.palette[16:32] = [[255 - n * 12, 0, 0] for n in range(16)]

    def test_growing_upper_parts_do_not_move_foundation_alpha_or_owner_material(self):
        floor = Image.new("RGBA", (40, 20), (120, 110, 95, 255))
        pixels = np.array(floor)
        pixels[10:14, 25:30] = (220, 12, 8, 255)
        foundation = place(Image.fromarray(pixels), (4, 20, 28, 31), (32, 32))
        reference = encode_owner(foundation, self.palette)
        pole = Image.new("RGBA", (8, 40), (140, 160, 180, 255))
        for top in (18, 12, 3):
            upper = place(pole, (15, top, 18, 25), (32, 32))
            pair = encode_owner(over(upper, foundation), self.palette)
            for density in (4, 2):
                actual = pair if density == 4 else reduce_material(pair, self.palette)
                expected = reference if density == 4 else reduce_material(reference, self.palette)
                safe = np.array(Image.fromarray(upper[..., 3]).resize(
                    (32*density, 32*density), Image.Resampling.BOX)) == 0
                for current, baseline in zip(actual, expected):
                    np.testing.assert_array_equal(current[safe], baseline[safe])

    def test_neutral_rust_cannot_change_player_color_before_owner_paint_exists(self):
        weathering = np.full((8, 8, 4), (80, 25, 6, 201), np.uint8)
        base, data = encode_owner(weathering, self.palette, allow_owner=False)
        np.testing.assert_array_equal(base, weathering)
        self.assertFalse(data[..., :3].any())
        recolored_palette = self.palette.copy()
        recolored_palette[16:32] = recolored_palette[16:32, ::-1]
        other_base, other_data = encode_owner(weathering, recolored_palette, allow_owner=False)
        np.testing.assert_array_equal(other_base, base)
        np.testing.assert_array_equal(other_data, data)
        self.assertTrue(encode_owner(weathering, self.palette)[1][..., 0].any())

    def test_real_foundation_holes_survive_upper_growth(self):
        image = np.full((16, 32, 4), (120, 120, 120, 255), np.uint8)
        image[4:12, 4:10] = 0
        image[4:12, 22:28] = 0
        base = place(Image.fromarray(image), (0, 16, 32, 32), (32, 32))
        upper = place(Image.new("RGBA", (8, 40), (210, 15, 5, 255)), (14, 2, 18, 25), (32, 32))
        result = over(upper, base)
        self.assertFalse(result[94:98, 25:31, 3].any())
        self.assertFalse(result[94:98, 97:103, 3].any())

    def test_dark_launch_cavities_are_opaque_material_not_background(self):
        part = np.full((12, 20, 4), (170, 175, 180, 255), np.uint8)
        part[3:8, 4:8] = (12, 12, 12, 255)
        part[3:8, 12:16] = (12, 12, 12, 255)
        registered = place(Image.fromarray(part), (4, 3, 24, 15), (32, 32))
        base, _ = encode_owner(registered, self.palette)
        self.assertTrue((base[28:36, 36:44, 3] == 255).all())

    def test_surface_guides_cannot_introduce_guide_rgb_or_future_coverage(self):
        texture = Image.new("RGBA", (12, 12), (213, 35, 14, 255))
        mask = np.zeros((20, 20), bool)
        mask[3:8, 12:15] = True
        layer = material_surface(texture, mask)
        opaque = layer[..., 3] == 255
        self.assertTrue(opaque.any())
        np.testing.assert_array_equal(layer[..., :3][opaque], np.tile([213, 35, 14], (opaque.sum(), 1)))
        self.assertFalse(layer[40:, :40, 3].any())

    def test_affine_registration_preserves_complete_opaque_component(self):
        source = Image.new("RGBA", (8, 6), (120, 140, 160, 255))
        projected = project_rgba(source, [[1, 0, 4], [0, 1, 8]], (24, 24))
        self.assertTrue((projected[34:54, 18:46, 3] == 255).all())
        self.assertFalse(projected[:30, :, 3].any())


if __name__ == "__main__":
    unittest.main()
