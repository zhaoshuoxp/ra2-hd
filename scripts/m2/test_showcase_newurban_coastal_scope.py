"""Exercise source eligibility using the actual retained original TMP records."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_newurban_coastal_scope import (
    CONTRACT, WALL_CONTRACT, WATER_ONLY_CONTRACT, CAP_CONTRACT, BRIDGE_CONTRACT, coastal_set_indices,
    coastal_profile_indices)
from showcase_coastal_sea import bridge_coastal_extra_coverage, original_floor_water, load_coastal_sea


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/newurban/authoring-r1/source.json'
CONTRACT_FILE = ROOT / 'docs/campaign-art/yr-v1' / CONTRACT


class NewUrbanCoastalScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = json.loads(SOURCE.read_text())
        cls.contract = json.loads(CONTRACT_FILE.read_text())
        cls.walls = json.loads((ROOT / 'docs/campaign-art/yr-v1' / WALL_CONTRACT).read_text())
        cls.water_only = json.loads((ROOT / 'docs/campaign-art/yr-v1' / WATER_ONLY_CONTRACT).read_text())
        cls.caps = json.loads((ROOT / 'docs/campaign-art/yr-v1' / CAP_CONTRACT).read_text())
        cls.bridges = json.loads((ROOT / 'docs/campaign-art/yr-v1' / BRIDGE_CONTRACT).read_text())

    def family(self, contract=None):
        contract = self.contract if contract is None else contract
        source = copy.deepcopy(self.original)
        source['editions'] = ['yr']
        source['members'] = [member for member in source['members']
                             if member['member'] in contract['members']]
        return source

    def test_exact_complete_wood_and_half_timber_wall_family_is_admitted(self):
        self.assertEqual(coastal_set_indices(self.family(self.walls)), self.walls['setIndices'])

    def test_complete_water_only_wall_family_retains_its_original_set(self):
        self.assertEqual(coastal_set_indices(self.family(self.water_only)), self.water_only['setIndices'])
        for name in self.water_only['members']:
            with self.subTest(missing=name):
                source = self.family(self.water_only)
                source['members'] = [member for member in source['members'] if member['member'] != name]
                with self.assertRaises(AssertionError):
                    coastal_set_indices(source)

    def test_complete_disconnected_water_cap_pair_retains_original_set85(self):
        self.assertEqual(coastal_set_indices(self.family(self.caps)), dict.fromkeys(self.caps['members'], 85))

    def test_complete_bridge_pier_states_retain_original_set19(self):
        self.assertEqual(coastal_set_indices(self.family(self.bridges)),
            dict.fromkeys(self.bridges['members'], 19))

    def test_bridge_piers_reject_partial_states_and_source_context_drift(self):
        for name in self.bridges['members']:
            for changed in ['missing', 'source', 'palette', 'set', 'native-name', 'sf-end']:
                with self.subTest(member=name, changed=changed):
                    source = self.family(self.bridges)
                    member = next(member for member in source['members'] if member['member'] == name)
                    if changed == 'missing':
                        source['members'].remove(member)
                    elif changed == 'source':
                        member['native']['sha256'] = '0' * 64
                    elif changed == 'palette':
                        member['native']['palette']['sha256'] = '0' * 64
                    elif changed == 'set':
                        member['setIndex'] = 121
                    elif changed == 'native-name':
                        member['native']['member'] = 'ovrps01.ubn'
                    else:
                        source['members'].append(copy.deepcopy(next(member for member in self.original['members']
                            if member['member'] == 'sfbrdg01.ubn')))
                    with self.assertRaises(AssertionError):
                        coastal_set_indices(source)

    def test_damaged_bridge_main_diamond_wall_cannot_become_sea(self):
        source = self.family(self.bridges)
        authoring = SOURCE.parent
        layout = json.loads((authoring / 'layout.json').read_text())
        base = authoring.parent
        declaration = dict(schema='yr-source-newurban-bridge-extra-ownership-v1',
            members=self.bridges['members'], preparedDirectory=str(base / 'original-r1'),
            originalTmpDirectory=str(base / 'bridge-originals-r1'))
        protected = bridge_coastal_extra_coverage(source, layout, declaration)
        member = next(member for member in source['members'] if member['member'] == 'ovrps09.ubn')
        native = np.asarray(Image.open(authoring / 'ovrps09.ubn-native.png').convert('RGBA'))
        colors = json.loads((base / 'coastal-water-reference-r1/source-control.json').read_text())['colors']
        mask = original_floor_water(native, member['native'], layout['ovrps09.ubn'], colors,
            protected['ovrps09.ubn'])
        color_only = original_floor_water(native, member['native'], layout['ovrps09.ubn'], colors)
        self.assertTrue(color_only[74, 152])
        self.assertFalse(mask[74, 152])
        self.assertTrue(mask[86, 190])
        self.assertTrue(mask[140, 100])
        self.assertFalse((mask & protected['ovrps09.ubn']).any())

    def test_bridge_contact_cannot_drift_inside_a_newly_hashed_mask_document(self):
        profile = json.loads((ROOT / 'docs/campaign-art/yr-v1/terrain-newurban-bridge-piers-recipe-r2.json')
            .read_text())['materialProfile']
        masks, water = load_coastal_sea(profile, self.family(self.bridges), SOURCE.parent)
        self.assertEqual(set(masks), set(self.bridges['members']))
        self.assertEqual(set(water), {2, 4})
        document = json.loads(Path(profile['sourcePinnedCoastalSea']['file']).read_text())
        document['members']['ovrps09.ubn']['shoreContact']['controlPoints'][2][1] += 1
        with tempfile.TemporaryDirectory() as temporary:
            file = Path(temporary) / 'masks.json'
            file.write_text(json.dumps(document))
            profile['sourcePinnedCoastalSea'] = dict(file=str(file),
                sha256=hashlib.sha256(file.read_bytes()).hexdigest())
            with self.assertRaises(AssertionError):
                load_coastal_sea(profile, self.family(self.bridges), SOURCE.parent)

    def test_only_exact_floor_caps_may_omit_exposed_contour_alpha(self):
        profile = dict(continuousAuthoredRgb=self.caps['members'], sourcePinnedCoastalSea={})
        self.assertEqual(coastal_profile_indices(profile, self.family(self.caps)),
            dict.fromkeys(self.caps['members'], 85))
        for family in (self.contract, self.walls, self.water_only, self.bridges):
            with self.subTest(family=family['schema']):
                with self.assertRaises(AssertionError):
                    coastal_profile_indices(profile, self.family(family))

    def test_floor_caps_reject_retail_rgb_or_unknown_profile_modes(self):
        for extra in ['nativeSubTileContacts', 'unknown']:
            profile = dict(continuousAuthoredRgb=self.caps['members'], sourcePinnedCoastalSea={})
            profile[extra] = True
            with self.subTest(extra=extra), self.assertRaises(AssertionError):
                coastal_profile_indices(profile, self.family(self.caps))

    def test_water_cap_pair_rejects_missing_source_palette_and_mixed_caps(self):
        for name in self.caps['members']:
            for changed in ['missing', 'source', 'palette', 'set', 'land-cap']:
                with self.subTest(member=name, changed=changed):
                    source = self.family(self.caps)
                    member = next(member for member in source['members'] if member['member'] == name)
                    if changed == 'missing':
                        source['members'].remove(member)
                    elif changed == 'source':
                        member['native']['sha256'] = '0' * 64
                    elif changed == 'palette':
                        member['native']['palette']['sha256'] = '0' * 64
                    elif changed == 'set':
                        member['native']['setIndex'] = 15
                    else:
                        source['members'].append(copy.deepcopy(next(member for member in self.original['members']
                            if member['member'] == 'cliffc01.ubn')))
                    with self.assertRaises(AssertionError):
                        coastal_set_indices(source)

    def test_water_only_wall_family_drift_and_partial_sand_family_are_rejected(self):
        for name in self.water_only['members']:
            for changed in ['source', 'palette', 'set', 'one-sand-member']:
                with self.subTest(member=name, changed=changed):
                    source = self.family(self.water_only)
                    member = next(member for member in source['members'] if member['member'] == name)
                    if changed == 'source':
                        member['native']['sha256'] = '0' * 64
                    elif changed == 'palette':
                        member['native']['palette']['sha256'] = '0' * 64
                    elif changed == 'set':
                        member['native']['setIndex'] = 83
                    else:
                        source['members'].append(copy.deepcopy(next(member for member in self.original['members']
                            if member['member'] == 'wclifb01.ubn')))
                    with self.assertRaises(AssertionError):
                        coastal_set_indices(source)

    def test_wall_family_missing_members_and_native_drift_are_rejected(self):
        for name in self.walls['members']:
            for changed in ['missing', 'source', 'palette', 'palette-name', 'native-set', 'source-set', 'native-name']:
                with self.subTest(member=name, changed=changed):
                    source = self.family(self.walls)
                    member = next(member for member in source['members'] if member['member'] == name)
                    native = member['native']
                    if changed == 'missing':
                        source['members'].remove(member)
                    elif changed == 'source':
                        native['sha256'] = '0' * 64
                    elif changed == 'palette':
                        native['palette']['sha256'] = '0' * 64
                    elif changed == 'palette-name':
                        native['palette']['member'] = 'isosno.pal'
                    elif changed == 'native-set':
                        native['setIndex'] = 112
                    elif changed == 'source-set':
                        member['setIndex'] = 112
                    else:
                        native['member'] = 'wcliff99.ubn'
                    with self.assertRaises(AssertionError):
                        coastal_set_indices(source)

    def test_wall_family_rejects_cross_context_and_mixed_source_sets(self):
        for changed in ['theater', 'edition', 'prepared-source', 'duplicate', 'mixed']:
            with self.subTest(changed=changed):
                source = self.family(self.walls)
                if changed == 'theater':
                    source['theater'] = 'SNOW'
                elif changed == 'edition':
                    source['editions'] = ['ra2']
                elif changed == 'prepared-source':
                    source['preparedSourceSha256'] = '0' * 64
                elif changed == 'duplicate':
                    source['members'].append(copy.deepcopy(source['members'][0]))
                else:
                    source['members'].append(copy.deepcopy(self.family()['members'][0]))
                with self.assertRaises(AssertionError):
                    coastal_set_indices(source)

    def test_exact_complete_waterfront_family_is_admitted(self):
        self.assertEqual(coastal_set_indices(self.family()), dict.fromkeys(self.contract['members'], 78))

    def test_original_natural_coastal_scope_is_unchanged(self):
        source = self.family()
        source['members'] = [copy.deepcopy(member) for member in self.original['members']
                             if member['member'].startswith('wclifx')]
        self.assertGreater(len(source['members']), 6)
        self.assertEqual(coastal_set_indices(source), dict.fromkeys(
            [member['member'] for member in source['members']], 112))

    def test_every_incomplete_family_is_rejected(self):
        for missing in self.contract['members']:
            with self.subTest(missing=missing):
                source = self.family()
                source['members'] = [member for member in source['members'] if member['member'] != missing]
                with self.assertRaises(AssertionError):
                    coastal_set_indices(source)

    def test_native_hash_palette_and_set_drift_are_rejected(self):
        for name in self.contract['members']:
            for changed in ['source', 'palette', 'palette-name', 'native-set', 'source-set', 'native-name']:
                with self.subTest(member=name, changed=changed):
                    source = self.family()
                    member = next(member for member in source['members'] if member['member'] == name)
                    native = member['native']
                    if changed == 'source':
                        native['sha256'] = '0' * 64
                    elif changed == 'palette':
                        native['palette']['sha256'] = '0' * 64
                    elif changed == 'palette-name':
                        native['palette']['member'] = 'isosno.pal'
                    elif changed == 'native-set':
                        native['setIndex'] = 112
                    elif changed == 'source-set':
                        member['setIndex'] = 112
                    else:
                        native['member'] = 'wclifa99.ubn'
                    with self.assertRaises(AssertionError):
                        coastal_set_indices(source)

    def test_cross_context_and_mixed_families_are_rejected(self):
        for changed in ['theater', 'edition', 'prepared-source', 'duplicate', 'mixed', 'empty', 'unknown']:
            with self.subTest(changed=changed):
                source = self.family()
                if changed == 'theater':
                    source['theater'] = 'SNOW'
                elif changed == 'edition':
                    source['editions'] = ['ra2']
                elif changed == 'prepared-source':
                    source['preparedSourceSha256'] = '0' * 64
                elif changed == 'duplicate':
                    source['members'].append(copy.deepcopy(source['members'][0]))
                elif changed == 'mixed':
                    source['members'].append(copy.deepcopy(next(member for member in self.original['members']
                        if member['member'].startswith('wclifx'))))
                elif changed == 'empty':
                    source['members'] = []
                else:
                    source['members'][0]['member'] = 'wclifa99.ubn'
                with self.assertRaises(AssertionError):
                    coastal_set_indices(source)


if __name__ == '__main__':
    unittest.main()
