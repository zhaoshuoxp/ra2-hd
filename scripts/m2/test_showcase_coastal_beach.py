"""Retain real wall RGB, source floor ownership and independent beach material."""
import copy
import json
import unittest
from pathlib import Path

import numpy as np

from showcase_coastal_beach import load_coastal_beach, beach_weight, lifted_distance, render_coastal_beach
from showcase_newurban_coastal_scope import coastal_set_indices


ROOT = Path(__file__).resolve().parents[2]
AUTHOR = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/newurban/authoring-sand-foot-walls-r3'


class CoastalBeachTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.source = json.loads((AUTHOR / 'source.json').read_text())
        cls.masks, cls.land = load_coastal_beach(cls.profile, cls.source, AUTHOR)

    def test_only_both_complete_original_set83_members_are_admitted(self):
        self.assertEqual(coastal_set_indices(self.source), dict.fromkeys(self.masks, 83))
        for name in self.masks:
            for fault in ['missing', 'source', 'palette', 'set']:
                source = copy.deepcopy(self.source)
                member = next(m for m in source['members'] if m['member'] == name)
                if fault == 'missing':
                    source['members'].remove(member)
                elif fault == 'set':
                    member['setIndex'] = 15
                elif fault == 'palette':
                    member['native']['palette']['sha256'] = '0'*64
                else:
                    member['native']['sha256'] = '0'*64
                with self.subTest(member=name, fault=fault), self.assertRaises(AssertionError):
                    load_coastal_beach(self.profile, source, AUTHOR)

    def test_shared_material_cannot_enter_an_unrelated_profile(self):
        profile = dict(self.profile, sourcePinnedSnowCoastalContours={})
        with self.assertRaises(AssertionError):
            load_coastal_beach(profile, self.source, AUTHOR)
        self.assertEqual(load_coastal_beach({}, {}, AUTHOR), ({}, {}))

    def test_original_mixed_main_block_keeps_raised_sand_and_wall_separate(self):
        mask = self.masks['wclifb01.ubn']
        self.assertTrue(mask['floor'][80, 50])
        self.assertFalse(mask['body'][80, 50])
        self.assertFalse(mask['floor'][80, 70])
        self.assertTrue(mask['body'][80, 70])

    def test_visible_wall_and_authored_occlusion_keep_all_rgb_bytes(self):
        for name, mask in self.masks.items():
            self.assertFalse((mask['floor'] & mask['body']).any())
            for density in [2, 4]:
                shape = tuple(n*density for n in mask['floor'].shape)
                yy, xx = np.indices(shape)
                rgb = np.uint8(np.stack((80+xx % 81, 70+yy % 91, np.full_like(xx, 60)), -1))
                output = render_coastal_beach(rgb, mask, self.land, density)
                body = mask['body'].repeat(density, 0).repeat(density, 1)
                np.testing.assert_array_equal(output[body], rgb[body])
                protected = xx+.5 >= 55*density if name == 'wclifb01.ubn' else yy+.5 <= 82*density
                np.testing.assert_array_equal(output[protected], rgb[protected])

    def test_wet_sand_and_wall_contact_shadows_retain_authored_rgb(self):
        for mask in self.masks.values():
            for density in [2, 4]:
                shape = tuple(n*density for n in mask['floor'].shape)
                rgb = np.full((*shape, 3), [195, 165, 110], np.uint8)
                preserved = (lifted_distance(mask['water'], density) <= 2) \
                    | (lifted_distance(mask['body'], density) <= 1)
                output = render_coastal_beach(rgb, mask, self.land, density)
                self.assertTrue(preserved.any())
                np.testing.assert_array_equal(output[preserved], rgb[preserved])

    def test_each_real_density_uses_its_own_material_in_the_open_floor(self):
        land = {density: np.full((12*density, 28*density, 3), 180+density, np.uint8)
                for density in [2, 4]}
        for mask in self.masks.values():
            for density in [2, 4]:
                weight = beach_weight(mask, density)
                self.assertTrue((weight == 1).any())
                rgb = np.full((*weight.shape, 3), 100, np.uint8)
                output = render_coastal_beach(rgb, mask, land, density)
                np.testing.assert_array_equal(output[weight == 1], 180+density)
                np.testing.assert_array_equal(output[weight == 0], rgb[weight == 0])


if __name__ == '__main__':
    unittest.main()
