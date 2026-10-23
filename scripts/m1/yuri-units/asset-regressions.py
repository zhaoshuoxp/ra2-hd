"""Focused regressions for detached effects and authored owner materials."""
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from authored_slots import isolated_cells

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'owner-color'))
from paint import complete_data


class AssetRegressions(unittest.TestCase):
    def test_small_detached_effect_survives_large_body(self):
        image = Image.new('RGBA', (512, 512))
        draw = ImageDraw.Draw(image)
        draw.rectangle((130, 180, 380, 440), fill=(90, 90, 90, 255))
        draw.rectangle((220, 90, 223, 94), fill=(255, 170, 20, 255))
        detail, bounds = isolated_cells(image, 1, 1)[0]
        self.assertEqual(bounds[1], 88)
        self.assertGreater(detail.getchannel('A').getbbox()[3], 300)

    def test_extra_subject_in_unoccupied_cell_is_rejected(self):
        image = Image.new('RGBA', (512, 256))
        draw = ImageDraw.Draw(image)
        draw.rectangle((40, 40, 180, 200), fill='red')
        draw.rectangle((300, 40, 450, 200), fill='red')
        with self.assertRaisesRegex(AssertionError, 'unused cell'):
            isolated_cells(image, 2, 1, 1)

    def test_owner_paint_outside_native_support_and_neutral_effects(self):
        image = Image.new('RGBA', (128, 128))
        draw = ImageDraw.Draw(image)
        draw.rectangle((20, 30, 50, 90), fill=(165, 18, 22, 255))
        draw.rectangle((70, 80, 90, 100), fill=(130, 10, 16, 255))
        draw.rectangle((20, 10, 45, 25), fill=(172, 112, 86, 255))
        draw.rectangle((80, 20, 112, 55), fill=(190, 15, 12, 255))
        draw.rectangle((85, 25, 108, 50), fill=(255, 185, 12, 255))
        rgba = np.array(image)
        native_data = np.zeros_like(rgba)
        native_data[..., 3] = 255
        result, _, _ = complete_data(rgba, native_data, 4, 'E2', 'init.shp')
        self.assertEqual(result[50, 30, 0], 255)
        self.assertEqual(result[90, 80, 0], 255)
        self.assertEqual(result[15, 30, 0], 0)
        self.assertEqual(result[22, 82, 0], 0)
        self.assertEqual(result[40, 90, 0], 0)


if __name__ == '__main__':
    unittest.main()
