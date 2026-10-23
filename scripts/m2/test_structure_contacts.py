"""Regress generated contact rims without erasing independently authored detail."""
import unittest

import numpy as np

from showcase_structure_contacts import continuous_structure_contacts


class StructureContactTest(unittest.TestCase):
    def test_black_generated_rim_is_removed_and_interior_is_exact(self):
        native = np.full((24, 40, 4), [120, 150, 60, 255], np.uint8)
        for density in (2, 4):
            y, x = np.indices((24 * density, 40 * density))
            authored = np.full((*x.shape, 3), [120, 150, 60], np.uint8)
            authored += ((x + y) % 3)[..., None].astype(np.uint8)
            authored[:density] = 0
            corrected, report = continuous_structure_contacts(authored, native, density)
            self.assertGreater(int(corrected[0].min()), 45)
            np.testing.assert_array_equal(corrected[5*density:-5*density, 5*density:-5*density],
                authored[5*density:-5*density, 5*density:-5*density])
            self.assertFalse(report['alphaChanged'])
            self.assertGreater(float(corrected[0, :, 0].std()), .2)

    def test_transparent_native_rgb_cannot_pollute_the_contact(self):
        native = np.full((30, 40, 4), [150, 170, 70, 255], np.uint8)
        native[:5] = [0, 0, 0, 0]
        authored = np.full((120, 160, 3), [145, 170, 75], np.uint8)
        corrected, _ = continuous_structure_contacts(authored, native, 4)
        self.assertGreater(int(corrected[20:24, 24:136].min()), 60)

    def test_wide_natural_contact_excludes_a_deep_painted_rim(self):
        native = np.full((32, 40, 4), [120, 150, 60, 255], np.uint8)
        authored = np.full((128, 160, 3), [120, 150, 60], np.uint8)
        authored[:16] = [40, 65, 15]
        policy = dict(schema='continuous-natural-contact-v2', nativeColorSigma=.65,
            contactWidthNativePixels=8, detailAmplitude=8)
        corrected, record = continuous_structure_contacts(authored, native, 4, policy)
        self.assertGreater(int(corrected[:4].min()), 50)
        self.assertEqual(record['contactWidthNativePixels'], 8)
        self.assertLessEqual(record['afterP95EdgeDarkening'], 9)
        np.testing.assert_array_equal(corrected[40:88, 40:120], authored[40:88, 40:120])


if __name__ == '__main__':
    unittest.main()
