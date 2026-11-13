"""Check immutable mother sampling and independent accepted sea contacts."""
import unittest
from pathlib import Path

import numpy as np
from showcase_shore import load_shore, render_shore, sample_authored_shore, sample_shore_land


def model():
    return dict(logical=[24, 20], nativeAlphaBounds=[0, 0, 24, 20], center=[12, 10],
                normal=[0, 1], alongScale=12, sourceCurves=dict(sand=[0], deep=[3]),
                transitionWidth=4, roleColorOffsets=dict(sand=[0, 0, 0], shallow=[0, 0, 0]),
                sourceRgbUsedAsOutputTexture=False)


def mother():
    yy, xx = np.indices((80, 96))
    return np.uint8(np.stack((xx, yy, np.full_like(xx, 100)), axis=-1))


class ShoreMaterialsTest(unittest.TestCase):
    def test_full_density_preserves_mother_detail_without_geometry_deformation(self):
        pixels = mother()
        np.testing.assert_array_equal(sample_authored_shore(model(), pixels, 4), pixels)

    def test_lower_density_comes_from_the_real_mother(self):
        output = sample_authored_shore(model(), mother(), 2)
        yy, xx = np.indices(output.shape[:2])
        np.testing.assert_allclose(output[..., 0], 2*xx+.5, atol=.51)
        np.testing.assert_allclose(output[..., 1], 2*yy+.5, atol=.51)
        np.testing.assert_array_equal(output[..., 2], 100)

    def test_deep_sea_uses_each_accepted_density_and_continuous_repeats(self):
        document = model()
        document['sourceCurves'] = dict(sand=[-100], deep=[-90])
        water = {2: np.asarray([[[70, 75, 95], [71, 76, 96]]], np.uint8),
                 4: np.asarray([[[72, 77, 97], [73, 78, 98], [74, 79, 99]]], np.uint8)}
        for density in [2, 4]:
            output = render_shore(document, mother(), water, density)
            length = water[density].shape[1]
            for y, x in [(0, 0), (1, 1), (7, 11), (20*density-1, 24*density-1)]:
                phase = x % (2*length)
                expected = water[density][0, min(phase, 2*length-1-phase)]
                np.testing.assert_array_equal(output[y, x], expected)
            self.assertLessEqual(np.abs(np.diff(output[0].astype(int), axis=0)).max(), 1)

    def test_retail_rgb_texture_is_excluded(self):
        document = model()
        document['sourceRgbUsedAsOutputTexture'] = True
        with self.assertRaises(AssertionError):
            render_shore(document, mother(), {2: np.zeros((2, 2, 3), np.uint8)}, 2)

    def test_land_reuse_cannot_enter_other_terrain_profiles(self):
        self.assertEqual(load_shore({}, {}, Path('.')), ({}, {}, {}, None, []))
        with self.assertRaises(AssertionError):
            load_shore({'acceptedShoreLand': {}}, {}, Path('.'))

    def test_beach_material_keeps_density_and_complete_interior_pixels(self):
        for density in [2, 4]:
            yy, xx = np.indices((12*density, 28*density))
            pixels = np.uint8(np.stack((xx % 251, yy, np.full_like(xx, density)), axis=-1))
            field = sample_shore_land([120, 90], pixels, density)
            np.testing.assert_array_equal(field[:12*density, :28*density], pixels)
            np.testing.assert_array_equal(field[12*density:24*density, 28*density:56*density], pixels)

    def test_accepted_land_keeps_sea_and_uses_each_independent_density(self):
        document = model()
        document['member'] = 'shore38.ubn'
        land = {density: np.full((12*density, 28*density, 3), 170+density, np.uint8)
                for density in [2, 4]}
        water = {density: np.full((2, 2, 3), 50, np.uint8) for density in [2, 4]}
        for density in [2, 4]:
            baseline = render_shore(document, mother(), water, density)
            result = render_shore(document, mother(), water, density, land)
            np.testing.assert_array_equal(result[12*density:], baseline[12*density:])
            self.assertTrue(np.any(result[:5*density] != baseline[:5*density]))
            document['sourceCurves']['sand'] = [100]
            document['sourceCurves']['deep'] = [110]
            np.testing.assert_array_equal(render_shore(document, mother(), water, density, land), 170+density)
            document['sourceCurves'] = dict(sand=[0], deep=[3])


if __name__ == '__main__':
    unittest.main()
