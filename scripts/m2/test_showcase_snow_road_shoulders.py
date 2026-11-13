"""Regress complete Snow body light and separate compacted mud from shoulders."""
import copy
import json
import unittest
from pathlib import Path

import numpy as np

from showcase_snow_road_material import compose_earth_material, load_earth_material


ROOT = Path(__file__).resolve().parents[2]
AUTHOR = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/snow/authoring-roads-r21'


class SnowRoadShoulderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = json.loads((AUTHOR / 'source.json').read_text())
        profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.materials = load_earth_material(profile, source)

    def fixture(self, density):
        rgb = np.full((30*density, 60*density, 3), [232, 244, 251], np.uint8)
        rgb[:, 20*density:40*density] = [141, 124, 98]
        native = np.full((30, 60, 4), 255, np.uint8)
        return rgb, native

    def test_controls_measure_complete_neighbor_snow_bodies(self):
        np.testing.assert_allclose(self.materials['controls'][2]['snow'],
            [216.81298940011388, 232.06909815974046, 239.39667307455625], rtol=0, atol=1e-8)
        np.testing.assert_allclose(self.materials['controls'][4]['snow'],
            [217.12007345317812, 232.39609518761577, 239.76530365529374], rtol=0, atol=1e-8)
        np.testing.assert_allclose(self.materials['controls'][4]['mud'],
            [119.640625, 93.6953125, 65.71484375], rtol=0, atol=1e-8)

    def test_compacted_center_keeps_mud_while_only_shoulders_receive_gravel(self):
        for density in [2, 4]:
            rgb, native = self.fixture(density)
            output = compose_earth_material(rgb, self.materials, density, native)
            control = self.materials['controls'][density]
            for column, role in [(10, 'snow'), (30, 'mud')]:
                expected = np.broadcast_to(np.rint(control[role]).astype(np.uint8),
                    output[:, column*density].shape)
                np.testing.assert_array_equal(output[:, column*density], expected)
            self.assertFalse(np.array_equal(output[:, 20*density:21*density],
                np.broadcast_to(np.rint(control['mud']).astype(np.uint8),
                    output[:, 20*density:21*density].shape)))

    def test_snow_and_native_coverage_are_not_replaced_by_shoulder_texture(self):
        for density in [2, 4]:
            rgb, native = self.fixture(density)
            saved = native.copy()
            changed = copy.deepcopy(self.materials)
            changed[density][:] = 0
            a = compose_earth_material(rgb, self.materials, density, native)
            b = compose_earth_material(rgb, changed, density, native)
            np.testing.assert_array_equal(a[:, :20*density], b[:, :20*density])
            np.testing.assert_array_equal(native, saved)

    def test_two_x_uses_only_its_own_material_and_color_controls(self):
        rgb, native = self.fixture(2)
        changed = copy.deepcopy(self.materials)
        changed[4][:] = 0
        changed['controls'][4]['snow'][:] = 0
        changed['controls'][4]['mud'][:] = 0
        np.testing.assert_array_equal(compose_earth_material(rgb, self.materials, 2, native),
            compose_earth_material(rgb, changed, 2, native))

    def test_missing_original_coverage_cannot_qualify_body_controls(self):
        rgb, _ = self.fixture(2)
        with self.assertRaises(AssertionError):
            compose_earth_material(rgb, self.materials, 2)

    def test_missing_authored_mud_stays_a_failure(self):
        rgb, native = self.fixture(2)
        rgb[:] = [232, 244, 251]
        with self.assertRaises(AssertionError):
            compose_earth_material(rgb, self.materials, 2, native)


if __name__ == '__main__':
    unittest.main()
