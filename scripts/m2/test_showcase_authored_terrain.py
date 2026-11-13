"""Guard authored thin contours, native registration and independent sampling."""
import copy
import hashlib
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

from showcase_authored_terrain import AuthoredTerrain


class AuthoredTerrainTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / 'native').mkdir()
        indices = np.zeros((32, 10), np.uint8)
        indices[2:4, 1:10] = 80
        indices[4:29, 9] = 80
        indices[29:32, 8:10] = 80
        payload = indices.tobytes()
        (self.root / 'native/body.index').write_bytes(payload)
        image = Image.new('RGBA', (240, 680))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((40, 60, 219, 99), radius=8, fill=(180, 170, 145, 255))
        draw.rectangle((197, 98, 218, 659), fill=(120, 110, 90, 255))
        file = self.root / 'master.png'; image.save(file)
        self.native = {'lamp.sno': dict(sha256='a' * 64, palette=dict(sha256='b' * 64),
            bodyFrames=1, totalFrames=2, hasShadow=True, remapable=False, framePalettes={},
            bindings=[dict(kind='terrain', role='body')], frames=[dict(slot=0, size=[10, 32],
                indexFile='body.index', indexSha256=hashlib.sha256(payload).hexdigest())])}
        self.declaration = dict(schema='source-pinned-authored-terrain-contours-v1', sourceSha256='a' * 64,
            paletteSha256='b' * 64, indexSha256=hashlib.sha256(payload).hexdigest(), master=str(file),
            masterSha256=hashlib.sha256(file.read_bytes()).hexdigest(),
            masterRgbaSha256=hashlib.sha256(np.asarray(image).tobytes()).hexdigest(),
            registration=dict(masterX=[20, 220], nativeX=[0, 10], masterY=[20, 660], nativeY=[0, 32]),
            limits=dict(areaChangeFraction=.025, minimumNativeOverlapFraction=.75,
                boundaryDeviationFraction=.05, centroidShiftFraction=.04, frameBoundsNativePixels=.5))

    def tearDown(self):
        self.temporary.cleanup()

    def build(self, declaration=None, native=None):
        return AuthoredTerrain({'lamp.sno': declaration or self.declaration}, native or self.native, self.root)

    def test_authored_post_stays_straight_across_the_original_pixel_width_step(self):
        registered = self.build()
        for density in [2, 4]:
            pixels = registered.frame('lamp.sno', 0, density)
            widths = pixels[6 * density:30 * density, :, 3].sum(1) / 255
            self.assertLess(widths.max() - widths.min(), .01)
            self.assertAlmostEqual(widths.mean(), 1.1 * density, delta=.02)
            self.assertTrue(((pixels[..., 3] > 0) & (pixels[..., 3] < 255)).any())
            self.assertFalse(pixels[..., :3][pixels[..., 3] == 0].any())
            self.assertEqual(pixels.shape, (32 * density, 10 * density, 4))

    def test_densities_sample_the_master_independently_and_record_authored_alpha(self):
        registered = self.build()
        low, high = [registered.frame('lamp.sno', 0, density) for density in [2, 4]]
        enlarged = np.asarray(Image.fromarray(low).resize((40, 128), Image.Resampling.LANCZOS))
        self.assertFalse(np.array_equal(enlarged, high))
        proof = registered.metadata('lamp.sno')['geometryProof']
        self.assertEqual(proof['alphaAuthority'], 'APPROVED_FULL_RESOLUTION_MASTER_NOT_INDEXED_MASK')
        self.assertLessEqual(proof['areaChangeFraction'], .025)

    def test_source_palette_indices_or_master_changes_are_rejected(self):
        for key in ['sourceSha256', 'paletteSha256', 'indexSha256', 'masterSha256', 'masterRgbaSha256']:
            declaration = copy.deepcopy(self.declaration); declaration[key] = 'c' * 64
            with self.assertRaises(AssertionError): self.build(declaration)

    def test_incompatible_object_kinds_shadows_and_owner_policy_are_rejected(self):
        for key, value in [('bodyFrames', 4), ('totalFrames', 8), ('hasShadow', False), ('remapable', True),
                ('bindings', [dict(kind='building', role='body')])]:
            native = copy.deepcopy(self.native); native['lamp.sno'][key] = value
            with self.assertRaises(AssertionError): self.build(native=native)

    def test_registration_cannot_fold_drift_outside_or_upscale_insufficient_detail(self):
        for axis, values in [('masterX', [220, 20]), ('nativeX', [0, 11]), ('masterY', [20, 40])]:
            declaration = copy.deepcopy(self.declaration); declaration['registration'][axis] = values
            with self.assertRaises(AssertionError): self.build(declaration)
        declaration = copy.deepcopy(self.declaration); declaration['registration']['nativeX'] = [2, 10]
        with self.assertRaises(AssertionError): self.build(declaration)

    def test_tolerances_cannot_be_relaxed(self):
        declaration = copy.deepcopy(self.declaration)
        declaration['limits']['areaChangeFraction'] = .5
        with self.assertRaises(AssertionError): self.build(declaration)


if __name__ == '__main__':
    unittest.main()
