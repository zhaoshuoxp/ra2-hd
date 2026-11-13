"""Check real shore contacts against their original open-water perimeter."""
import json
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_shore import load_shore, render_shore


class SourceShoreContactsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path('.local/source-art/yr-campaign-v1/terrain-remaining-r1/newurban')
        cls.authoring = cls.root / 'authoring-shore-r11'
        read = lambda file: json.loads(file.read_text())
        cls.colors = read(cls.root / 'coastal-water-reference-r1/source-control.json')['colors']
        cls.models, cls.plates, cls.water, _ = load_shore(
            read(cls.authoring / 'material-profile.json'), read(cls.authoring / 'source.json'), cls.authoring)

    def test_original_open_water_stays_exact_at_both_member_edges(self):
        for name in ('shore13.ubn', 'shore12.ubn'):
            native = np.asarray(Image.open(self.authoring / (name + '-native.png')).convert('RGBA'))
            active = native[..., 3] > 0
            deep = np.zeros(active.shape, bool)
            for color in self.colors:
                deep |= np.all(native[..., :3] == color, axis=2)
            deep &= active
            distance = ndimage.distance_transform_edt(~((~deep) & active))
            boundary = active & ndimage.binary_dilation(~np.pad(active, 1))[1:-1, 1:-1]
            perimeter = boundary & (distance >= 6)
            self.assertGreater(perimeter.sum(), 40)
            for density in (2, 4):
                with self.subTest(member=name, density=density):
                    actual = render_shore(self.models[name], self.plates[name], self.water, density)
                    yy, xx = np.indices(actual.shape[:2])
                    expected = self.water[density][yy % (14*density), xx % (30*density)]
                    mask = perimeter.repeat(density, 0).repeat(density, 1)
                    np.testing.assert_array_equal(actual[mask], expected[mask],
                        err_msg='Original open-water edges must retain exact accepted sea RGB')


if __name__ == '__main__':
    unittest.main()
