"""Check source-bound port registration against the actual three Snow roads."""
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_registration import independently_sample, register
from showcase_snow_road_contacts import coordinates, load, sample, load_material_light, register_material_light


ROOT = Path(__file__).resolve().parents[2]
AUTHOR = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/snow/authoring-roads-r3'


class SnowRoadPortTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((AUTHOR / 'source.json').read_text())
        cls.profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.layout = json.loads((AUTHOR / 'layout.json').read_text())
        cls.declarations = load(cls.profile, cls.source, AUTHOR)

    def native(self, name):
        return np.asarray(Image.open(AUTHOR / (name + '-native.png')).convert('RGBA'))

    def test_original_rgb_is_never_sampled(self):
        name = 'droads30.sno'
        info = self.layout[name]
        _, plate = register(Image.open(AUTHOR / info['board']).convert('RGBA'), info, info['boardSize'], isolated=True)
        native = self.native(name)
        changed = native.copy()
        changed[..., :3] = 255 - changed[..., :3]
        for density in (2, 4):
            self.assertTrue(np.array_equal(
                sample(plate, native, info['nativeAlphaBounds'], density, self.declarations[name]),
                sample(plate, changed, info['nativeAlphaBounds'], density, self.declarations[name])))

    def test_all_source_port_fields_retain_positive_orientation(self):
        for name, declaration in self.declarations.items():
            with self.subTest(member=name):
                native = self.native(name)
                yy, xx = np.indices((native.shape[0] * 4, native.shape[1] * 4))
                sx, sy = coordinates((xx + .5) / 4, (yy + .5) / 4, native, declaration)
                xy, xx = np.gradient(sx, .25)
                yy, yx = np.gradient(sy, .25)
                active = np.repeat(np.repeat(native[..., 3] > 0, 4, 0), 4, 1)
                active[[0, -1]] = False
                active[:, [0, -1]] = False
                self.assertGreater(float((xx * yy - xy * yx)[active].min()), .3)

    def test_distant_authored_pixels_remain_exact(self):
        name = 'droads30.sno'
        info = self.layout[name]
        native = self.native(name)
        _, plate = register(Image.open(AUTHOR / info['board']).convert('RGBA'), info, info['boardSize'], isolated=True)
        bounds = info['nativeAlphaBounds']
        for density in (2, 4):
            actual = sample(plate, native, bounds, density, self.declarations[name])
            ordinary = independently_sample(plate, (actual.shape[1], actual.shape[0]))
            # The upper-left quadrant is outside the lower-right road port.
            self.assertTrue(np.array_equal(actual[:10*density, :20*density], ordinary[:10*density, :20*density]))
            self.assertFalse(np.array_equal(actual, ordinary))

    def test_port_registration_rejects_other_source_families(self):
        wrong = json.loads(json.dumps(self.source))
        wrong['theater'] = 'TEMPERATE'
        with self.assertRaises(AssertionError):
            load(self.profile, wrong, AUTHOR)
        wrong = json.loads(json.dumps(self.source))
        wrong['members'][0]['native']['sha256'] = '0' * 64
        with self.assertRaises(AssertionError):
            load(self.profile, wrong, AUTHOR)

    def test_material_light_never_renders_source_spatial_detail(self):
        name = 'droads30.sno'
        native = self.native(name)
        file = AUTHOR.parent / 'authoring-roads-r4/yr-snow-roads-r4/inspection/droads30-sno-4x.png'
        rgb = np.asarray(Image.open(file).convert('RGB'))
        shuffled = native.copy()
        active = native[..., 3] > 0
        shuffled[active, :3] = native[active, :3][::-1]
        actual, _ = register_material_light(rgb, native)
        permuted, _ = register_material_light(rgb, shuffled)
        self.assertTrue(np.array_equal(actual, permuted))
        self.assertTrue(np.array_equal(native[..., 3], shuffled[..., 3]))

    def test_material_light_rejects_combined_global_plane_and_other_families(self):
        profile = json.loads(json.dumps(self.profile))
        profile['sourcePinnedSnowRoadMaterialLight'] = dict(schema='yr-source-snow-road-two-material-light-v1',
            members=profile['sourcePinnedSnowRoadContours'])
        with self.assertRaises(AssertionError):
            load_material_light(profile, self.source)
        del profile['sourcePinnedSnowRoadPlanarLight']
        self.assertTrue(load_material_light(profile, self.source))
        wrong = json.loads(json.dumps(self.source))
        wrong['theater'] = 'NEWURBAN'
        with self.assertRaises(AssertionError):
            load_material_light(profile, wrong)

    def test_accepted_color_controls_are_hash_pinned_and_density_specific(self):
        root = AUTHOR.parent / 'authoring-roads-r7'
        profile = json.loads((root / 'material-profile.json').read_text())
        colors = load_material_light(profile, self.source)
        self.assertEqual(set(colors), {'2', '4'})
        self.assertNotEqual(colors['2']['earth'], colors['4']['earth'])
        profile['sourcePinnedSnowRoadMaterialLight']['colorControls']['sha256'] = '0' * 64
        with self.assertRaises(AssertionError):
            load_material_light(profile, self.source)


if __name__ == '__main__':
    unittest.main()
