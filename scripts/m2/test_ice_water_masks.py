"""Verify pinned sea ownership cannot recolor equally blue shadowed ice."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
from showcase_materials import pinned_ice_water_mask, pinned_native_water_mask, register_water, reject_new_matte


class IceWaterMaskTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.native = np.full((2, 2, 4), [24, 64, 96, 255], np.uint8)
        self.file = self.root / 'mask.bin'
        self.file.write_bytes(bytes([1, 0, 0, 0]))
        self.declaration = {
            'classification': 'NATIVE_SNOW_ICE_WITH_WATER', 'sourceSha256': 'source',
            'maximumNativeWaterChannel': 128,
            'mask': {'file': self.file.name, 'logical': [2, 2],
                     'sha256': hashlib.sha256(self.file.read_bytes()).hexdigest(),
                     'nativeRgbaSha256': hashlib.sha256(self.native.tobytes()).hexdigest()},
        }

    def test_equal_blue_ice_stays_authored_at_both_densities(self):
        mask = pinned_ice_water_mask(self.native, self.declaration, 'source', self.root)
        for density in (2, 4):
            authored = np.full((2 * density, 2 * density, 3), 160, np.uint8)
            result = register_water(authored, self.native, density, mask=mask)
            self.assertFalse(np.array_equal(result[:density, :density], authored[:density, :density]))
            self.assertTrue(np.array_equal(result[:density, density:], authored[:density, density:]))
            self.assertTrue(np.array_equal(result[density:], authored[density:]))

    def test_calibration_residue_is_removed_without_erasing_original_bright_material(self):
        native = self.native.copy()
        native[0, 0, :3] = [245, 251, 13]
        for density in (2, 4):
            authored = np.full((2 * density, 2 * density, 3), 96, np.uint8)
            authored[0, 0] = [245, 251, 13]
            authored[-1, -1] = [245, 251, 13]
            result, removed = reject_new_matte(authored, native, density)
            self.assertEqual(removed, 1)
            self.assertTrue(np.array_equal(result[0, 0], authored[0, 0]))
            self.assertTrue(np.array_equal(result[-1, -1], [96, 96, 96]))

    def test_wrong_source_native_or_mask_hash_is_rejected(self):
        with self.assertRaises(AssertionError):
            pinned_ice_water_mask(self.native, self.declaration, 'wrong-source', self.root)
        changed = self.native.copy()
        changed[0, 1, 0] += 1
        with self.assertRaises(AssertionError):
            pinned_ice_water_mask(changed, self.declaration, 'source', self.root)
        self.file.write_bytes(bytes([0, 1, 0, 0]))
        with self.assertRaises(AssertionError):
            pinned_ice_water_mask(self.native, self.declaration, 'source', self.root)

    def test_bridge_and_urban_extra_shadows_remain_authored(self):
        for classification in ('NATIVE_SNOW_BRIDGE_WITH_WATER', 'NATIVE_URBAN_COAST_WITH_WATER',
                               'NATIVE_THEATER_COAST_WITH_WATER', 'NATIVE_THEATER_STRUCTURE_WITH_WATER'):
            spec = copy.deepcopy(self.declaration)
            spec['classification'] = classification
            mask = pinned_native_water_mask(self.native, spec, 'source', self.root)
            for density in (2, 4):
                authored = np.full((2 * density, 2 * density, 3), 160, np.uint8)
                result = register_water(authored, self.native, density, mask=mask)
                self.assertFalse(np.array_equal(result[:density, :density], authored[:density, :density]))
                self.assertTrue(np.array_equal(result[:density, density:], authored[:density, density:]))
                self.assertTrue(np.array_equal(result[density:], authored[density:]))
            with self.assertRaises(AssertionError):
                pinned_ice_water_mask(self.native, spec, 'source', self.root)
            with self.assertRaises(AssertionError):
                pinned_native_water_mask(self.native, spec, 'wrong-source', self.root)
        spec['classification'] = 'UNKNOWN_BLUE_OBJECT'
        with self.assertRaises(AssertionError):
            pinned_native_water_mask(self.native, spec, 'source', self.root)

    def test_invalid_ownership_and_foreign_paths_are_rejected(self):
        for raw in (bytes([2, 0, 0, 0]), bytes([0, 0, 0, 0]), bytes([1, 1, 1, 1])):
            self.file.write_bytes(raw)
            spec = copy.deepcopy(self.declaration)
            spec['mask']['sha256'] = hashlib.sha256(raw).hexdigest()
            with self.assertRaises(AssertionError):
                pinned_ice_water_mask(self.native, spec, 'source', self.root)
        spec = copy.deepcopy(self.declaration)
        spec['mask']['file'] = '../mask.bin'
        with self.assertRaises(AssertionError):
            pinned_ice_water_mask(self.native, spec, 'source', self.root)


if __name__ == '__main__':
    unittest.main()
