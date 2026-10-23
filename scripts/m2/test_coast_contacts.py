"""Retain actual authored microtexture at native internal coast contacts."""
import unittest
import numpy as np
from showcase_materials import register_coast_contacts, register_contacts


class CoastContactTests(unittest.TestCase):
    def test_native_contact_light_retains_authored_fine_texture_at_both_densities(self):
        native = np.full((2, 2, 4), [80, 80, 80, 255], np.uint8)
        for density in (2, 4):
            y, x = np.indices((2 * density, 2 * density))
            grain = np.where((x + y) % 2, 14, -14)
            authored = np.repeat((120 + grain)[..., None], 3, axis=2).astype(np.uint8)
            previous = register_contacts(authored, native, density, diffuse=True)
            self.assertEqual(float(previous.std()), 0, 'This fixture must expose the original flat contact band')
            corrected = register_coast_contacts(authored, native, density)
            self.assertGreater(float(corrected.std()), 10)
            self.assertLess(abs(float(corrected.mean()) - 80), 1.5)
            self.assertEqual(corrected.shape, authored.shape)


if __name__ == '__main__':
    unittest.main()
