"""Exercise source-pinned repeated bridge paint and retained damaged artwork."""
import copy
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_bridge_road_paint import load_bridge_paint, reconstruct_bridge_paint, retain_bridge_main_rgb
from showcase_registration import extrude


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/newurban'


class BridgeRoadPaintTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.authoring = BASE / 'authoring-bridge-piers-r6'
        cls.source = json.loads((cls.authoring / 'source.json').read_text())
        cls.layout = json.loads((cls.authoring / 'layout.json').read_text())
        cls.profile = json.loads((cls.authoring / 'material-profile.json').read_text())
        cls.document = load_bridge_paint(cls.profile, cls.source, cls.authoring)

    def test_complete_original_family_admits_only_two_intact_models(self):
        self.assertEqual(set(self.document['models']), {'ovrps07.ubn', 'ovrps12.ubn'})
        self.assertEqual(self.document['retainedDamagedMember'], 'ovrps09.ubn')

    def test_missing_corrupt_and_cross_theater_sources_fail_closed(self):
        for changed in ['missing', 'source', 'palette', 'theater', 'edition', 'prepared']:
            with self.subTest(changed=changed):
                source = copy.deepcopy(self.source)
                if changed == 'missing':
                    source['members'].pop()
                elif changed == 'source':
                    source['members'][0]['native']['sha256'] = '0' * 64
                elif changed == 'palette':
                    source['members'][0]['native']['palette']['sha256'] = '0' * 64
                elif changed == 'theater':
                    source['theater'] = 'SNOW'
                elif changed == 'edition':
                    source['editions'] = ['ra2']
                else:
                    source['preparedSourceSha256'] = '0' * 64
                with self.assertRaises(AssertionError):
                    load_bridge_paint(self.profile, source, self.authoring)

    def test_changed_paint_contract_pin_is_rejected(self):
        profile = copy.deepcopy(self.profile)
        profile['sourcePinnedBridgeRoadPaint']['sha256'] = '0' * 64
        with self.assertRaises(AssertionError):
            load_bridge_paint(profile, self.source, self.authoring)

    def test_native_vertical_faces_sea_and_broken_member_remain_exact(self):
        for density in (2, 4):
            for member in self.source['members']:
                name, native = member['member'], member['native']
                with self.subTest(member=name, density=density):
                    file = BASE / 'authoring-bridge-piers-r2/yr-newurban-bridge-piers-r2/inspection' \
                        / f'{name.replace(".", "-")}-{density}x.png'
                    rgba = np.asarray(Image.open(file).convert('RGBA'))
                    old = rgba[..., :3]
                    result = reconstruct_bridge_paint(old, native, self.layout[name], density, self.document)
                    if name == 'ovrps09.ubn':
                        np.testing.assert_array_equal(result, old)
                    else:
                        changed = np.any(result != old, axis=2)
                        self.assertTrue(changed.any())
                        # Original road is above the first78 source rows. All
                        # lower concrete wall and water samples must stay exact.
                        self.assertFalse(changed[78*density:].any())
                        self.assertEqual(result.dtype, np.uint8)

    def test_repeated_center_blocks_have_no_baked_yellow_endpoint_steps(self):
        for density in (2, 4):
            for name, index, sign, center in [('ovrps07.ubn', 4, -1, -2.5),
                    ('ovrps12.ubn', 2, 1, 62.5)]:
                with self.subTest(member=name, density=density):
                    native = next(m['native'] for m in self.source['members'] if m['member'] == name)
                    file = BASE / 'authoring-bridge-piers-r2/yr-newurban-bridge-piers-r2/inspection' \
                        / f'{name.replace(".", "-")}-{density}x.png'
                    rgb = np.asarray(Image.open(file).convert('RGB'))
                    result = reconstruct_bridge_paint(rgb, native, self.layout[name], density, self.document)
                    x, y, width, height = next(p['rect'] for p in self.layout[name]['parts']
                        if p['subTile'] == index)
                    image = native['images'][index]
                    alpha = np.frombuffer((BASE / 'original-r1/native' / image['file']).read_bytes(), np.uint8)
                    active = alpha.reshape(height, width, 4)[..., 3] > 0
                    active = active.repeat(density, 0).repeat(density, 1)
                    py, px = (np.indices(active.shape)+.5)/density
                    gx = px+image['origin'][0]+image['offset'][0]
                    gy = py+image['origin'][1]+image['offset'][1]-15*image['height']
                    distance = (gx+sign*2*gy-center)/np.sqrt(2)
                    error = np.abs(np.abs(distance)-2.12)
                    def paint_error(pixels):
                        red, green, blue = np.moveaxis(pixels.astype(float), -1, 0)
                        yellow = active & (red-blue > 70) & (green-blue > 55)
                        self.assertGreater(int(yellow.sum()), 20)
                        return float(error[yellow].max())
                    current = result[y*density:(y+height)*density, x*density:(x+width)*density]
                    self.assertLess(paint_error(current), 1.2)
                    if name == 'ovrps12.ubn' and density == 4:
                        old = rgb[y*density:(y+height)*density, x*density:(x+width)*density]
                        self.assertGreater(paint_error(old), 1.2)

    def test_every_original_extra_sprite_is_free_of_displaced_center_paint(self):
        for density in (2, 4):
            for name, sign, center in [('ovrps07.ubn', -1, -2.5), ('ovrps12.ubn', 1, 62.5)]:
                native = next(m['native'] for m in self.source['members'] if m['member'] == name)
                file = BASE / 'authoring-bridge-piers-r2/yr-newurban-bridge-piers-r2/inspection' \
                    / f'{name.replace(".", "-")}-{density}x.png'
                rgb = np.asarray(Image.open(file).convert('RGB'))
                result = reconstruct_bridge_paint(rgb, native, self.layout[name], density, self.document)
                for part in self.layout[name]['parts']:
                    image = native['images'][part['subTile']]
                    with self.subTest(member=name, density=density, subTile=image['subTile']):
                        x, y, width, height = part['rect']
                        pixels = result[y*density:(y+height)*density, x*density:(x+width)*density]
                        raw = (BASE / 'original-r1/native' / image['file']).read_bytes()
                        active = np.frombuffer(raw, np.uint8).reshape(height, width, 4)[..., 3] > 0
                        active = active.repeat(density, 0).repeat(density, 1)
                        py, px = (np.indices(active.shape)+.5)/density
                        gx = px+image['origin'][0]+image['offset'][0]
                        gy = py+image['origin'][1]+image['offset'][1]-15*image['height']
                        distance = (gx+sign*2*gy-center)/np.sqrt(2)
                        red, green, blue = np.moveaxis(pixels.astype(float), -1, 0)
                        yellow = active & (red-blue > 70) & (green-blue > 55) & (np.abs(distance) < 8)
                        self.assertFalse((yellow & (np.abs(np.abs(distance)-2.12) > 1.2)).any())

    def test_transparent_diagonal_contacts_keep_the_continuous_paint_field(self):
        name, density = 'ovrps12.ubn', 4
        native = next(m['native'] for m in self.source['members'] if m['member'] == name)
        file = BASE / 'authoring-bridge-piers-r2/yr-newurban-bridge-piers-r2/inspection/ovrps12-ubn-4x.png'
        rgb = np.asarray(Image.open(file).convert('RGB'))
        whole = reconstruct_bridge_paint(rgb, native, self.layout[name], density, self.document)
        image = native['images'][2]
        x, y, width, height = next(p['rect'] for p in self.layout[name]['parts'] if p['subTile'] == 2)
        crop = whole[y*density:(y+height)*density, x*density:(x+width)*density]
        raw = (BASE / 'original-r1/native' / image['file']).read_bytes()
        alpha = np.frombuffer(raw, np.uint8).reshape(height, width, 4)[..., 3]
        alpha = alpha.repeat(density, 0).repeat(density, 1)
        old = extrude(crop, alpha > 0)
        current = retain_bridge_main_rgb(old, crop, alpha, image, density, self.document)
        # The real source fixture has invisible corner colors clamped from
        # opaque paint. Bilinear texture filtering sees those corner colors.
        self.assertGreater(int(np.any(old != crop, axis=2)[alpha == 0].sum()), 20)
        np.testing.assert_array_equal(current[alpha == 0], crop[alpha == 0])
        np.testing.assert_array_equal(current[alpha > 0], old[alpha > 0])


if __name__ == '__main__':
    unittest.main()
