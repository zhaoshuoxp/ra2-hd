"""Check independent material pixels and continuous antialiased flat joins."""
import unittest

import numpy as np

from showcase_urban_ground import (partition_weights, render_urban_ground, sample_accepted_plane,
    continue_accepted_hd_border)


class FlatGroundTests(unittest.TestCase):
    def model(self):
        return dict(kind='polynomial-material-partition', degree=1, roles=['left', 'right'],
            coefficients=[[.017, -1, .27], [-.017, 1, -.27]])

    def test_both_density_joins_form_a_complete_partition(self):
        for density in [2, 4]:
            weights = partition_weights(self.model(), density)
            left, right = weights['left'], weights['right']
            np.testing.assert_array_equal(left+right, np.ones_like(left))
            self.assertTrue(np.any((left > 0) & (left < 1)))
            self.assertLess(int(((left > 0) & (left < 1)).sum()), 45*density)

    def test_each_density_retains_its_own_material_pixels(self):
        swatches = {role: {} for role in ['left', 'right']}
        for density in [2, 4]:
            for index, role in enumerate(swatches):
                rgba = np.full((30*density, 60*density, 4), 255, dtype=np.uint8)
                rgba[..., :3] = [20+index*80+density, 40+index*20+density, 90-index*10+density]
                swatches[role][density] = rgba
            weights = partition_weights(self.model(), density)
            output = render_urban_ground(self.model(), swatches, density)
            for role, weight in weights.items():
                interior = weight == 1
                self.assertTrue(interior.any())
                np.testing.assert_array_equal(output[interior], swatches[role][density][..., :3][interior])
            self.assertTrue(np.any((weights['left'] > 0) & (weights['left'] < 1)))

    def test_a_third_density_is_rejected(self):
        with self.assertRaises(AssertionError):
            partition_weights(self.model(), 3)

    def test_rotated_mirror_plane_keeps_every_source_texel_at_its_native_density(self):
        specification = dict(schema='accepted-fixed-scale-plane-v1', nativeRect=[2, 2, 2, 3],
            quarterTurns=1, repeat='mirror')
        for density in [2, 4]:
            yy, xx = np.indices((30*density, 60*density))
            source = np.stack([xx % 251, yy % 251, np.full_like(xx, density), np.full_like(xx, 255)], -1).astype(np.uint8)
            result = sample_accepted_plane(source, specification, density)
            patch = np.rot90(source[2*density:5*density, 2*density:4*density])
            np.testing.assert_array_equal(result[:patch.shape[0], :patch.shape[1]], patch)
            np.testing.assert_array_equal(result[:, patch.shape[1]-1], result[:, patch.shape[1]])
            self.assertEqual(set(np.unique(result[..., 2])), {density})

    def test_legacy_native_border_uses_hd_interior_without_changing_alpha_or_interior(self):
        from scipy import ndimage
        policy = dict(schema='accepted-hd-native-boundary-mirror-v1', nativeInset=1)
        yy, xx = np.indices((30, 60))
        native = np.abs((xx+.5-30)/30)+np.abs((yy+.5-15)/15) < 1
        interior = ndimage.binary_erosion(native, structure=np.ones((3, 3), bool))
        for density in [2, 4]:
            yy, xx = np.indices((30*density, 60*density))
            active = native.repeat(density, 0).repeat(density, 1)
            safe = interior.repeat(density, 0).repeat(density, 1)
            pixels = np.stack([30+xx % 90, 40+yy % 80, np.full_like(xx, 100+density), active*255], -1).astype(np.uint8)
            pixels[active & ~safe, :3] = [252, 0, 252]
            result = continue_accepted_hd_border(pixels, policy, density)
            np.testing.assert_array_equal(result[..., 3], pixels[..., 3])
            np.testing.assert_array_equal(result[safe], pixels[safe])
            self.assertFalse(np.any(np.all(result[active, :3] == [252, 0, 252], axis=1)))
            self.assertGreater(len(np.unique(result[active & ~safe, :3], axis=0)), 100)

    def test_asphalt_border_cannot_sample_the_neighboring_white_curb(self):
        from scipy import ndimage
        policy = dict(schema='accepted-hd-native-boundary-mirror-v1', nativeInset=1)
        yy, xx = np.indices((30, 60))
        native = np.abs((xx+.5-30)/30)+np.abs((yy+.5-15)/15) < 1
        role = xx < 30
        core = ndimage.binary_erosion(native, structure=np.ones((3, 3), bool))
        for density in [2, 4]:
            active = native.repeat(density, 0).repeat(density, 1)
            pixels = np.full((30*density, 60*density, 4), 255, np.uint8)
            pixels[..., :3] = [220, 220, 220]
            pixels[role.repeat(density, 0).repeat(density, 1), :3] = [30, 40, 50]
            pixels[..., 3] = active*255
            result = continue_accepted_hd_border(pixels, policy, density, role)
            border = active & ~core.repeat(density, 0).repeat(density, 1)
            self.assertTrue(np.all(result[border, :3] == [30, 40, 50]))
            np.testing.assert_array_equal(result[..., 3], pixels[..., 3])

    def test_verified_road_lane_sampling_copies_only_its_original_density_texels(self):
        specification = dict(schema='accepted-road-asphalt-plane-v1',
            longitudinalRange=[.1, .9], nativeCrossRange=[-20, -12])
        for density in [2, 4]:
            yy, xx = np.indices((30*density, 60*density))
            source = np.stack([xx % 251, yy % 251, np.full_like(xx, density), np.full_like(xx, 255)], -1).astype(np.uint8)
            result = sample_accepted_plane(source, specification, density)
            self.assertEqual(result.shape, source.shape)
            self.assertTrue(np.all(result[..., 3] == 255))
            self.assertEqual(set(np.unique(result[..., 2])), {density})
            source_colors = {tuple(color) for color in source.reshape(-1, 4)}
            self.assertTrue(all(tuple(color) in source_colors for color in result.reshape(-1, 4)))


if __name__ == '__main__':
    unittest.main()
