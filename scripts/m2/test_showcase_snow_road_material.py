"""Verify independent earth detail without changing Snow or source scope."""
import copy
import json
import unittest
from pathlib import Path

import numpy as np

from showcase_snow_road_material import KEY, compose_earth_material, load_earth_material


ROOT = Path(__file__).resolve().parents[2]
AUTHOR = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/snow/authoring-roads-r12'


class SnowRoadMaterialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((AUTHOR / 'source.json').read_text())
        cls.profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.materials = load_earth_material(cls.profile, cls.source)

    def test_other_profiles_keep_their_existing_material_pipeline(self):
        self.assertEqual(load_earth_material({}, {}), {})

    def test_wrong_source_or_theater_cannot_use_snow_road_materials(self):
        for fault in ['theater', 'edition', 'member', 'missing']:
            source = copy.deepcopy(self.source)
            if fault == 'theater':
                source['theater'] = 'TEMPERATE'
            elif fault == 'edition':
                source['editions'] = ['ra2']
            elif fault == 'member':
                source['members'][0]['native']['sha256'] = '0'*64
            else:
                source['members'].pop()
            with self.subTest(fault=fault), self.assertRaises(AssertionError):
                load_earth_material(self.profile, source)

    def test_rehashed_contract_cannot_substitute_a_foreign_material(self):
        profile = copy.deepcopy(self.profile)
        profile[KEY]['sha256'] = '0'*64
        with self.assertRaises(AssertionError):
            load_earth_material(profile, self.source)

    def test_earth_interior_keeps_each_density_and_excludes_blue_snow(self):
        for density, pixels in self.materials.items():
            self.assertEqual(pixels.shape, (6*density, 21*density, 3))
            red, _, blue = np.moveaxis(pixels.astype(int), -1, 0)
            self.assertFalse(((blue-red > 2) & (blue > 170)).any())
        self.assertFalse(np.array_equal(self.materials[4], self.materials[2].repeat(2, 0).repeat(2, 1)))

    def test_snow_rgb_stays_exact_while_earth_receives_qualified_detail(self):
        for density in [2, 4]:
            rgb = np.full((30*density, 60*density, 3), [232, 244, 251], np.uint8)
            rgb[:, 30*density:] = [141, 124, 98]
            output = compose_earth_material(rgb, self.materials, density)
            np.testing.assert_array_equal(output[:, :30*density], rgb[:, :30*density])
            self.assertFalse(np.array_equal(output[:, 30*density:], rgb[:, 30*density:]))

    def test_two_x_does_not_read_four_x_material(self):
        rgb = np.full((60, 120, 3), [141, 124, 98], np.uint8)
        changed = dict(self.materials)
        changed[4] = np.zeros_like(self.materials[4])
        np.testing.assert_array_equal(compose_earth_material(rgb, self.materials, 2),
            compose_earth_material(rgb, changed, 2))


if __name__ == '__main__':
    unittest.main()
