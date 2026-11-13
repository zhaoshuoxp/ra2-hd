"""Guard new component registration against owner and source-palette corruption."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_authored_regions import AuthoredRegions


class UnownedRegionsTests(unittest.TestCase):
    def fixture(self, directory):
        indices = np.full((6, 6), 80, np.uint8)
        indices[4, 4] = 22
        index = directory / 'body.index'
        index.write_bytes(indices.tobytes())
        master = directory / 'master.png'
        Image.new('RGBA', (32, 32), (140, 150, 160, 255)).save(master)
        digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        source = dict(sha256='source', palette=dict(sha256='palette'), remapable=True,
            framePalettes={'3': dict(sha256='rubble-palette', remapable=False)}, bodyFrames=4,
            frames=[dict(slot=0, size=[6, 6], indexFile=index.name, indexSha256=digest(index))])
        region = dict(nativeFrame=0, indexSha256=digest(index), nativeBounds=[0, 0, 3, 3],
            paletteSha256='palette', master=str(master), masterSha256=digest(master), masterRect=[0, 0, 32, 32])
        declaration = dict(schema='source-pinned-unowned-authored-regions-v2', sourceSha256='source',
            paletteSha256='palette', regions=[region])
        return {'fixture.shp': source}, {'fixture.shp': declaration}

    def test_unowned_region_retains_full_member_owner_and_rubble_policies(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            sources, declarations = self.fixture(directory)
            regions = AuthoredRegions(declarations, sources, directory)
            for density in [2, 4]:
                rgb = np.zeros((6 * density, 6 * density, 3), np.uint8)
                regions.register(rgb, 'fixture.shp', sources['fixture.shp']['frames'][0], density)
                np.testing.assert_array_equal(rgb[:3*density, :3*density],
                    np.broadcast_to([140, 150, 160], (3*density, 3*density, 3)))
                self.assertFalse(rgb[3*density:].any())

    def test_owner_overlap_wrong_palette_source_and_indices_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            sources, declarations = self.fixture(directory)
            for field, value in [('nativeBounds', [0, 0, 6, 6]), ('paletteSha256', 'wrong'),
                                 ('indexSha256', 'wrong')]:
                changed = copy.deepcopy(declarations)
                changed['fixture.shp']['regions'][0][field] = value
                with self.assertRaises(AssertionError):
                    AuthoredRegions(changed, sources, directory)
            changed = copy.deepcopy(declarations)
            changed['fixture.shp']['sourceSha256'] = 'wrong'
            with self.assertRaises(AssertionError):
                AuthoredRegions(changed, sources, directory)

    def test_owned_registration_requires_the_exact_original_owner_mask(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            sources, declarations = self.fixture(directory)
            declaration = declarations['fixture.shp']
            declaration['schema'] = 'source-pinned-owned-authored-regions-v3'
            region = declaration['regions'][0]
            region['nativeBounds'] = [0, 0, 6, 6]
            mask = np.zeros((6, 6), np.uint8); mask[4, 4] = 1
            region.update(nativeOwnerPixels=1, nativeOwnerMaskSha256=hashlib.sha256(mask.tobytes()).hexdigest())
            AuthoredRegions(declarations, sources, directory)
            for field, value in [('nativeOwnerPixels', 0), ('nativeOwnerMaskSha256', 'wrong')]:
                changed = copy.deepcopy(declarations); changed['fixture.shp']['regions'][0][field] = value
                with self.assertRaises(AssertionError):
                    AuthoredRegions(changed, sources, directory)
            changed['fixture.shp']['schema'] = 'source-pinned-authored-regions-v1'
            changed['fixture.shp']['sourceSha256'] = 'source'
            with self.assertRaises(AssertionError):
                AuthoredRegions(changed, sources, directory)


if __name__ == '__main__':
    unittest.main()
