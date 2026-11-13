"""Protect original Temperate road contacts and independent density materials."""
import copy
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_registration import independently_sample, register
from showcase_temperate_road_contacts import KEY, coordinates, load, render_materials, sample_plate


ROOT = Path(__file__).resolve().parents[2]
AUTHOR = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/temperate/authoring-dirtroads-r6'


class TemperateRoadContactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((AUTHOR / 'source.json').read_text())
        cls.profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.layout = json.loads((AUTHOR / 'layout.json').read_text())
        cls.models, cls.materials = load(cls.profile, cls.source, AUTHOR)

    def test_other_profiles_keep_their_existing_pipeline(self):
        self.assertEqual(load({}, {}, AUTHOR), ({}, {}))

    def test_foreign_source_palette_and_geometry_are_rejected(self):
        for fault in ['edition', 'theater', 'source', 'palette', 'set', 'missing', 'height']:
            source = copy.deepcopy(self.source)
            if fault == 'edition':
                source['editions'] = ['ra2']
            elif fault == 'theater':
                source['theater'] = 'SNOW'
            elif fault == 'source':
                source['members'][0]['native']['sha256'] = '0'*64
            elif fault == 'palette':
                source['members'][0]['native']['palette']['sha256'] = '0'*64
            elif fault == 'set':
                source['members'][0]['setIndex'] = 18
            elif fault == 'missing':
                source['members'].pop()
            else:
                source['members'][0]['native']['images'][1]['height'] = 1
            with self.subTest(fault=fault), self.assertRaises(AssertionError):
                load(self.profile, source, AUTHOR)
        profile = copy.deepcopy(self.profile)
        profile[KEY]['sha256'] = '0'*64
        with self.assertRaises(AssertionError):
            load(profile, self.source, AUTHOR)

    def test_source_contacts_include_the_placeholder_corner(self):
        # The original Sov07 placements join other roads inside the empty first slot.
        cases = [('droadc24.tem', 60, -41.25, 'v', -36.6875),
                 ('droadc24.tem', 39.7, -30, 'u', 42.0625),
                 ('droadc06.tem', 36.25, -15, 'u', 39.5625)]
        for member, u, v, axis, expected in cases:
            x, y = coordinates(np.asarray(u-v), np.asarray((u+v)/2), self.models[member]['fields'])
            actual = x/2+y if axis == 'u' else -x/2+y
            with self.subTest(member=member, axis=axis):
                self.assertAlmostEqual(float(actual), expected, places=6)

    def test_uv_map_retains_real_four_x_capacity_without_folds(self):
        for member, model in self.models.items():
            audit = model['mappedDensity']
            with self.subTest(member=member):
                self.assertGreater(audit['minimumMappedDensity'], 4)
                self.assertGreater(audit['minimumUvDeterminant'], .4)
                self.assertLess(audit['maximumDisplacementNative'], 7)

    def test_unregistered_regions_keep_independent_mother_sampling(self):
        plate = np.asarray(Image.open(AUTHOR / self.layout['droadc24.tem']['board']).convert('RGB'))
        for density in [2, 4]:
            output = sample_plate(plate, [0, 0, 150, 59], density, [])
            expected = independently_sample(plate, (150*density, 59*density))
            np.testing.assert_array_equal(output, expected)

    def test_original_rgb_is_not_used_as_spatial_detail(self):
        name = 'droadc24.tem'
        info = self.layout[name]
        native = np.asarray(Image.open(AUTHOR / (name+'-native.png')).convert('RGBA'))
        master = Image.open(AUTHOR / info['board']).convert('RGBA')
        _, plate = register(master, info, info['boardSize'], isolated=True)
        changed = native.copy()
        changed[..., :3] = 0
        for density in [2, 4]:
            rgb = np.zeros((native.shape[0]*density, native.shape[1]*density, 3), np.uint8)
            rgb[:59*density] = sample_plate(plate, info['nativeAlphaBounds'], density, self.models[name]['fields'])
            expected = render_materials(rgb, native, self.models[name], self.materials, density)
            np.testing.assert_array_equal(expected,
                render_materials(rgb, changed, self.models[name], self.materials, density))
            materials = copy.deepcopy(self.materials)
            other = 4 if density == 2 else 2
            materials['grass'][other][:] = 0
            materials['soil'][other][:] = 0
            np.testing.assert_array_equal(expected,
                render_materials(rgb, native, self.models[name], materials, density))


if __name__ == '__main__':
    unittest.main()
