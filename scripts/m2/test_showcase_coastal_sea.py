"""Protect cliff faces and independent accepted sea pixels at native contacts."""
import unittest

import numpy as np

from showcase_coastal_sea import (original_floor_water, render_coastal_sea,
    coastal_sea_pixels, coastal_sea_weight, disconnected_coastal_water)


class CoastalSeaTests(unittest.TestCase):
    def native(self):
        native = np.full((90, 60, 4), [60, 72, 110, 255], np.uint8)
        native[60:, :, 3] = 0
        for row in range(30):
            half_width = 2 + 2*min(row, 29-row)
            native[60+row, 30-half_width:30+half_width, 3] = 255
        return native

    def source(self, height=0, native_offset=100):
        source = dict(images=[dict(subTile=0, nativeOffset=native_offset, height=height,
                                  offset=[0, -60], block=[60, 30])])
        layout = dict(parts=[dict(subTile=0, rect=[0, 0, 60, 90])])
        return source, layout

    def test_blue_extra_cliff_faces_are_excluded_from_floor_water(self):
        native = self.native()
        source, layout = self.source()
        mask = original_floor_water(native, source, layout)
        self.assertTrue(mask.any())
        self.assertFalse(mask[:60].any())
        self.assertFalse((mask & (native[..., 3] == 0)).any())

    def test_original_raster_perimeter_cannot_be_trimmed_to_an_analytic_diamond(self):
        native = self.native()
        source, layout = self.source()
        mask = original_floor_water(native, source, layout)
        self.assertEqual(native[64, 20, 3], 255)
        self.assertTrue(mask[64, 20])
        self.assertFalse(mask[64, 19])

    def test_pinned_original_water_grays_remain_sea_at_the_exact_perimeter(self):
        native = self.native()
        native[64, 20, :3] = [64, 64, 72]
        source, layout = self.source()
        self.assertTrue(original_floor_water(native, source, layout, [[64, 64, 72]])[64, 20])
        self.assertFalse(original_floor_water(native, source, layout, [[64, 64, 72]])[20, 20])

    def test_raised_tile_and_placeholder_cannot_supply_water_ownership(self):
        native = np.full((90, 60, 4), [60, 72, 110, 255], np.uint8)
        for source, layout in [self.source(height=4), self.source(native_offset=0)]:
            self.assertFalse(original_floor_water(native, source, layout).any())

    def test_typed_ice_extra_overlapping_a_sea_main_block_remains_dry(self):
        native = self.native()
        source, layout = self.source()
        extra = np.indices(native.shape[:2])[0] < 69
        prior = original_floor_water(native, source, layout)
        fixed = original_floor_water(native, source, layout, protected_extra=extra)
        self.assertTrue((prior & extra).any())
        self.assertFalse((fixed & extra).any())
        np.testing.assert_array_equal(fixed[~extra], prior[~extra])

    def test_isolated_blue_rock_highlight_remains_cliff_material(self):
        native = np.full((90, 60, 4), [90, 65, 35, 255], np.uint8)
        native[77:, :, :3] = [60, 72, 110]
        native[62, 29, :3] = [60, 72, 110]
        source, layout = self.source()
        mask = original_floor_water(native, source, layout)
        self.assertTrue(mask[88, 29])
        self.assertFalse(mask[62, 29])

    def test_sea_uses_its_own_density_and_dry_cliff_rgb_stays_exact(self):
        mask = dict(water=np.indices((30, 60))[1] < 20, active=np.ones((30, 60), bool))
        water = {}
        for density in [2, 4]:
            yy, xx = np.indices((14*density, 30*density))
            water[density] = np.stack([50+xx % 31, 60+yy % 21, np.full_like(xx, 100+density)], -1).astype(np.uint8)
        for density in [2, 4]:
            body = np.full((30*density, 60*density, 3), [165, 115, 65], np.uint8)
            rendered = render_coastal_sea(body, mask, water, density)
            expected = coastal_sea_pixels(water, body.shape[:2], density)
            np.testing.assert_array_equal(rendered[:, :18*density], expected[:, :18*density])
            np.testing.assert_array_equal(rendered[:, 23*density:], body[:, 23*density:])
            self.assertTrue(np.all(rendered[:, :18*density, 2] == 100+density))

    def test_an_undeclared_density_is_rejected(self):
        with self.assertRaises(AssertionError):
            coastal_sea_pixels({}, (90, 180), 3)

    def test_disconnected_source_water_requires_a_transparent_gap(self):
        water = np.zeros((30, 30), bool)
        water[20:28, 3:12] = True
        active = water.copy()
        active[2:12, 17:27] = True
        self.assertTrue(disconnected_coastal_water(dict(water=water, active=active)))
        active[19, 3] = True
        self.assertFalse(disconnected_coastal_water(dict(water=water, active=active)))

    def test_disconnected_water_requires_both_body_and_water(self):
        water = np.zeros((30, 30), bool)
        self.assertFalse(disconnected_coastal_water(dict(water=water, active=~water)))
        water[20:28, 3:12] = True
        self.assertFalse(disconnected_coastal_water(dict(water=water, active=water)))

    def contact(self):
        yy, xx = np.indices((24, 32))
        water = yy >= 12+(xx % 3 == 0)*2
        return dict(water=water, active=np.ones_like(water), floor=yy >= 8,
            shoreContact=dict(nativeRect=[0, 8, 32, 16],
                controlPoints=[[0, 12], [16, 12], [32, 12]], waterSide='below',
                interpolation='monotone-cubic', maximumNativeRoleDeviation=6))

    def test_source_beach_sampling_teeth_do_not_reappear_at_either_density(self):
        mask = self.contact()
        for density in [2, 4]:
            weight = coastal_sea_weight(mask, density)
            np.testing.assert_array_equal(weight[12*density:], 1)
            np.testing.assert_array_equal(weight[9*density:12*density], 0)

    def test_shore_reconstruction_cannot_recolor_a_raised_cliff_face(self):
        mask = self.contact()
        mask['floor'][13:16, 7:12] = False
        unchanged = coastal_sea_weight({k: v for k, v in mask.items() if k != 'shoreContact'}, 4)
        weight = coastal_sea_weight(mask, 4)
        np.testing.assert_array_equal(weight[52:64, 28:48], unchanged[52:64, 28:48])

    def test_shore_redesign_far_from_the_original_contact_is_rejected(self):
        mask = self.contact()
        mask['shoreContact']['controlPoints'] = [[0, 21], [16, 21], [32, 21]]
        with self.assertRaisesRegex(AssertionError, 'original role-boundary'):
            coastal_sea_weight(mask, 4)

    def test_opposite_beach_side_reconstructs_the_same_source_contact(self):
        mask = self.contact()
        mask['water'] = ~mask['water']
        mask['shoreContact']['waterSide'] = 'above'
        for density in (2, 4):
            weight = coastal_sea_weight(mask, density)
            np.testing.assert_array_equal(weight[9*density:12*density], 1)
            np.testing.assert_array_equal(weight[12*density:], 0)

    def test_unknown_water_side_is_rejected(self):
        mask = self.contact()
        mask['shoreContact']['waterSide'] = 'left'
        with self.assertRaises(AssertionError):
            coastal_sea_weight(mask, 4)


if __name__ == '__main__':
    unittest.main()
