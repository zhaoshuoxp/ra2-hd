"""Check source-pinned contact fades without changing interior art or Snow."""
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_snow_road_contacts import road_weight
from showcase_snow_road_material import compose_earth_material, load_earth_material, road_port_weight


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/snow'
AUTHOR = BASE / 'authoring-roads-r23'


class SnowRoadPortMaterialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = json.loads((AUTHOR / 'source.json').read_text())
        profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.materials = load_earth_material(profile, source)
        cls.interior = {k: v for k, v in cls.materials.items() if k != 'ports'}

    def cases(self):
        for name, ports in self.materials['ports']['members'].items():
            native = np.asarray(Image.open(AUTHOR / (name+'-native.png')).convert('RGBA'))
            for density in [2, 4]:
                file = BASE / 'authoring-roads-r7/yr-snow-roads-r7/inspection' / \
                    (name.replace('.', '-')+f'-{density}x.png')
                rgb = np.asarray(Image.open(file).convert('RGB'))
                yield name, density, native, rgb, ports

    def test_only_declared_earth_contacts_change(self):
        for name, density, native, rgb, ports in self.cases():
            before = compose_earth_material(rgb, self.interior, density, native, name)
            after = compose_earth_material(rgb, self.materials, density, native, name)
            band = road_port_weight(native, rgb.shape[:2], density, ports)
            outside = (band == 0) | (road_weight(rgb) == 0)
            np.testing.assert_array_equal(after[outside], before[outside])
            self.assertTrue(np.any(after[~outside] != before[~outside]), (name, density))

    def test_original_rgb_never_controls_the_port_field(self):
        for _, density, native, rgb, ports in self.cases():
            altered = native.copy()
            altered[..., :3] = 255-altered[..., :3]
            np.testing.assert_array_equal(road_port_weight(native, rgb.shape[:2], density, ports),
                road_port_weight(altered, rgb.shape[:2], density, ports))

    def test_port_field_stays_bounded_and_has_an_unchanged_interior(self):
        for name, density, native, rgb, ports in self.cases():
            band = road_port_weight(native, rgb.shape[:2], density, ports)
            self.assertGreaterEqual(float(band.min()), 0)
            self.assertLessEqual(float(band.max()), 1)
            self.assertTrue((band == 0).any(), (name, density))
            self.assertGreater(float(band.max()), .99)


if __name__ == '__main__':
    unittest.main()
