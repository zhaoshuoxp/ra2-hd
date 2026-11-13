"""Reject altered source identities before Snow terrain export or registration."""
import copy
import json
import unittest
from pathlib import Path

from showcase_snow_scope import admit_snow_scope


ROOT = Path(__file__).resolve().parents[2]
AUTHORING = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/snow'


@unittest.skipUnless((AUTHORING / 'authoring-ground-patches-r1/source.json').is_file(),
                     'Original installed Snow authoring evidence is required')
class SnowSourceScopeTest(unittest.TestCase):
    def test_installed_families_and_altered_source_rejection(self):
        for folder, revision in [('authoring-ice-cliffs-r3', 'yr-snow-ice-cliffs-r3'),
                                 ('authoring-large-ramps-r2', 'yr-snow-large-ramps-r2'),
                                 ('authoring-ground-patches-r1', 'yr-snow-ground-patches-r1'),
                                 ('authoring-crevasses-r1', 'yr-snow-crevasses-r1'),
                                 ('authoring-roads-r1', 'yr-snow-roads-r1'),
                                 ('authoring-water-cliffs-r2', 'yr-snow-water-cliffs-r2')]:
            source = json.loads((AUTHORING / folder / 'source.json').read_text())
            profile = json.loads((AUTHORING / folder / revision / 'recipe.json').read_text())['materialProfile']
            contract, key, _ = admit_snow_scope(profile, source)
            self.assertEqual(len(source['members']), len(contract['members']))
            mutations = []
            for field, value in [('theater', 'NEWURBAN'), ('editions', ['ra2', 'yr'])]:
                altered = copy.deepcopy(source)
                altered[field] = value
                mutations.append((field, altered, profile))
            for field, value in [('sha256', '0' * 64), ('palette', {'member': 'unittem.pal'})]:
                altered = copy.deepcopy(source)
                altered['members'][0]['native'][field] = value
                mutations.append((field, altered, profile))
            altered = copy.deepcopy(source)
            altered['members'][0]['setIndex'] = 999
            mutations.append(('wrong-set', altered, profile))
            altered = copy.deepcopy(source)
            altered['members'].pop()
            mutations.append(('missing-member', altered, profile))
            altered = copy.deepcopy(profile)
            altered['sourcePinnedSnowCliffContours' if key == 'sourcePinnedSnowCrevasseContours'
                    else 'sourcePinnedSnowCrevasseContours'] = profile[key]
            mutations.append(('mixed-family', source, altered))
            for label, changed_source, changed_profile in mutations:
                with self.subTest(family=key, mutation=label), self.assertRaises(AssertionError):
                    admit_snow_scope(changed_profile, changed_source)


if __name__ == '__main__':
    unittest.main()
