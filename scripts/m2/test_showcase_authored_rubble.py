"""Guard source identity, placement and contour bounds for authored rubble."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from showcase_authored_rubble import AuthoredRubble
from showcase_registration import sha


class AuthoredRubbleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'native').mkdir()
        shape = Image.new('L', (128, 64))
        ImageDraw.Draw(shape).polygon([(64, 0), (127, 32), (64, 63), (0, 32)], fill=80)
        self.indices = np.asarray(shape).copy()
        file = self.root / 'native/rubble.index'
        file.write_bytes(self.indices.tobytes())
        master = Image.new('RGBA', (1024, 512))
        draw = ImageDraw.Draw(master)
        draw.polygon([(512, 0), (1023, 256), (512, 511), (0, 256)], fill=(120, 125, 130, 255))
        draw.line([(256, 128), (768, 384)], fill=(40, 42, 44, 255), width=32)
        self.master = self.root / 'master.png'
        master.save(self.master)
        self.source = dict(sha256='original-member', bodyFrames=4, totalFrames=8, hasShadow=True,
            bindings=[dict(kind='building', role='body')],
            frames=[{}, {}, {}, dict(size=[128, 64], indexFile=file.name, indexSha256=sha(file))],
            framePalettes={'3': dict(remapable=False, role='rubble', sha256='original-iso-palette')})
        self.declaration = dict(schema='source-pinned-authored-rubble-contours-v1',
            sourceSha256=self.source['sha256'], indexSha256=sha(file), paletteSha256='original-iso-palette',
            master=str(self.master), masterSha256=sha(self.master),
            masterRgbaSha256=hashlib.sha256(master.tobytes()).hexdigest(), registration='native-bounds',
            limits=dict(areaChangeFraction=.025, symmetricDifferenceFraction=.125,
                boundaryDeviationFraction=.05, centroidShiftFraction=.025, frameBoundsNativePixels=1))

    def make(self, declaration=None, source=None):
        return AuthoredRubble({'a.shp': declaration or self.declaration},
            {'a.shp': source or self.source}, self.root)

    def test_native_placement_and_independent_antialiased_outputs(self):
        # A continuous diamond registers to its original indexed trim. Other
        # states stay outside this policy and must use their exact body donors.
        rubble = self.make()
        self.assertFalse(rubble.owns('a.shp', 0))
        self.assertFalse(rubble.owns('a.shp', 2))
        self.assertTrue(rubble.owns('a.shp', 3))
        self.assertFalse(rubble.owns('other.shp', 3))
        for density in [2, 4]:
            result = rubble.frame('a.shp', 3, density)
            self.assertEqual(result.shape, (64 * density, 128 * density, 4))
            self.assertTrue(((result[..., 3] > 0) & (result[..., 3] < 255)).any())
            self.assertFalse(result[..., :3][result[..., 3] == 0].any())
        proof = rubble.metadata('a.shp')['geometryProof']
        self.assertEqual(proof['nativeCanvasPivotsShadowsCollisionAndStateTiming'], 'UNCHANGED')

    def test_identity_or_master_drift_is_rejected(self):
        for key in ['sourceSha256', 'indexSha256', 'paletteSha256', 'masterSha256', 'masterRgbaSha256']:
            with self.subTest(key=key):
                changed = {**self.declaration, key: 'wrong'}
                with self.assertRaises(AssertionError):
                    self.make(changed)

    def test_cardinal_registration_is_bounded_and_keeps_logical_extent(self):
        rubble = self.make({**self.declaration, 'registration': 'native-cardinal-homography'})
        proof = rubble.metadata('a.shp')['geometryProof']
        self.assertLessEqual(proof['areaChangeFraction'], .025)
        self.assertLessEqual(proof['maximumFrameBoundsDifferenceNativePixels'], 1)
        self.assertEqual(rubble.frame('a.shp', 3, 4).shape, (256, 512, 4))

    def test_only_unowned_four_state_building_rubble_is_admitted(self):
        for key, value in [('bodyFrames', 3), ('totalFrames', 4), ('hasShadow', False),
                           ('bindings', [dict(kind='terrain', role='body')])]:
            with self.subTest(key=key), self.assertRaises(AssertionError):
                self.make(source={**self.source, key: value})
        changed = copy.deepcopy(self.source)
        changed['framePalettes']['3']['remapable'] = True
        with self.assertRaises(AssertionError):
            self.make(source=changed)
        self.indices[32, 64] = 12
        file = self.root / 'native/rubble.index'
        file.write_bytes(self.indices.tobytes())
        changed = copy.deepcopy(self.source)
        changed['frames'][3]['indexSha256'] = sha(file)
        with self.assertRaisesRegex(AssertionError, 'contacts'):
            self.make({**self.declaration, 'indexSha256': sha(file)}, changed)

    def test_tolerances_cannot_be_relaxed(self):
        changed = copy.deepcopy(self.declaration)
        changed['limits']['areaChangeFraction'] = .1
        with self.assertRaises(AssertionError):
            self.make(changed)

    def test_a_different_footprint_cannot_pass_by_matching_bounds(self):
        image = Image.new('RGBA', (1024, 512), (120, 125, 130, 255))
        image.save(self.master)
        changed = {**self.declaration, 'masterSha256': sha(self.master),
            'masterRgbaSha256': hashlib.sha256(image.tobytes()).hexdigest()}
        with self.assertRaisesRegex(AssertionError, 'Rubble area'):
            self.make(changed)


if __name__ == '__main__':
    unittest.main()
