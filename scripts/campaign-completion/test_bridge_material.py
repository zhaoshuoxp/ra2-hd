"""Synthetic authored gradients exercise material projection without game art."""
import copy
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/m2'))
from showcase_authored_rubble import cardinal_points
from showcase_bridge_material import BridgePlanarMaterial
from showcase_registration import authored_coverage


class BridgeMaterialTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ra2-bridge-material-')
        self.root = Path(self.temporary.name)
        (self.root / 'native').mkdir()
        mask = Image.new('L', (24, 14))
        ImageDraw.Draw(mask).polygon([(17, 0), (23, 3), (6, 13), (0, 10)], fill=1)
        indices = np.array(mask, dtype=np.uint8)
        index = self.root / 'native/frame.index'; index.write_bytes(indices.tobytes())
        self.master = self.root / 'master.png'
        yy, xx = np.indices((140, 240))
        rgba = np.dstack((40 + xx // 4, 70 + yy // 3, 120 + xx // 8, np.array(mask.resize((240, 140), Image.Resampling.NEAREST)) * 255)).astype(np.uint8)
        Image.fromarray(rgba).save(self.master)
        self.source = dict(sha256='a' * 64, palette=dict(sha256='b' * 64), bodyFrames=3,
            remapable=False, bindings=[dict(kind='overlay')], frames=[{}, dict(size=[24, 14],
            indexFile='frame.index', indexSha256=hashlib.sha256(indices.tobytes()).hexdigest())])
        self.declaration = dict(schema='source-pinned-bridge-planar-material-v1', sourceSha256='a' * 64,
            paletteSha256='b' * 64, nativeFrame=1, indexSha256=self.source['frames'][1]['indexSha256'],
            master=str(self.master), masterSha256=hashlib.sha256(self.master.read_bytes()).hexdigest(),
            masterRgbaSha256=hashlib.sha256(rgba.tobytes()).hexdigest(),
            nativePoints=cardinal_points(indices != 0).tolist(),
            masterPoints=cardinal_points(authored_coverage(rgba, 180, fringe_guard=True)).tolist())

    def tearDown(self):
        self.temporary.cleanup()

    def material(self, declaration=None, source=None):
        return BridgePlanarMaterial({'lobrdb01.urb': declaration or self.declaration},
            {'lobrdb01.urb': source or self.source}, self.root)

    def test_independent_densities_preserve_source_and_sample_real_authored_color(self):
        before = (self.root / 'native/frame.index').read_bytes()
        material = self.material()
        two, four = material.frame('lobrdb01.urb', 2), material.frame('lobrdb01.urb', 4)
        self.assertEqual(two.shape, (28, 48, 3)); self.assertEqual(four.shape, (56, 96, 3))
        self.assertGreater(np.unique(four.reshape(-1, 3), axis=0).shape[0], 200)
        self.assertEqual((self.root / 'native/frame.index').read_bytes(), before)
        self.assertTrue(material.owns('lobrdb01.urb', 1)); self.assertFalse(material.owns('lobrdb01.urb', 0))

    def test_stale_master_or_native_landmark_is_rejected(self):
        for key in ['masterSha256', 'nativePoints']:
            declaration = copy.deepcopy(self.declaration)
            if key == 'masterSha256': declaration[key] = '0' * 64
            else: declaration[key][0][0] += 1
            with self.assertRaises(AssertionError): self.material(declaration)

    def test_wrong_palette_or_ownership_policy_is_rejected(self):
        declaration = copy.deepcopy(self.declaration); declaration['paletteSha256'] = '0' * 64
        with self.assertRaises(AssertionError): self.material(declaration)
        source = copy.deepcopy(self.source); source['remapable'] = True
        with self.assertRaises(AssertionError): self.material(source=source)

    def test_undersized_authored_master_is_rejected(self):
        image = Image.open(self.master).resize((48, 28), Image.Resampling.NEAREST)
        image.save(self.master); rgba = np.array(image)
        declaration = copy.deepcopy(self.declaration)
        declaration.update(masterSha256=hashlib.sha256(self.master.read_bytes()).hexdigest(),
            masterRgbaSha256=hashlib.sha256(rgba.tobytes()).hexdigest(),
            masterPoints=cardinal_points(authored_coverage(rgba, 180, fringe_guard=True)).tolist())
        with self.assertRaises(AssertionError): self.material(declaration)


if __name__ == '__main__':
    unittest.main()
