"""Reject broad body-shade exemptions outside their original body identity."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from showcase_body_material import BodyIndex12Material


class BodyMaterialTests(unittest.TestCase):
    def test_admission_requires_separate_shadows_and_exact_body_indices_palette(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / 'frame.index'; file.write_bytes(bytes([0, 12, 16, 80]))
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
            source = dict(sha256='source', palette=dict(sha256='palette'), hasShadow=True,
                totalFrames=2, bodyFrames=1, bindings=[dict(kind='building', role='body')],
                frames=[dict(slot=0, indexFile=file.name, indexSha256=digest)])
            declaration = dict(schema='source-pinned-body-index12-material-v1',
                classification='AUTHORED_BODY_SHADE_WITH_SEPARATE_NATIVE_SHADOWS',
                sourceSha256='source', paletteSha256='palette',
                frames={'0': dict(indexSha256=digest, paletteSha256='palette', bodyShadePixels=1)})
            admitted = BodyIndex12Material({'a.shp': declaration}, {'a.shp': source}, root)
            self.assertTrue(admitted.owns('a.shp', 0))
            self.assertFalse(admitted.owns('a.shp', 1))
            self.assertFalse(BodyIndex12Material({}, {'a.shp': source}, root).owns('a.shp', 0))
            for key, value in [('hasShadow', False), ('totalFrames', 1), ('sha256', 'wrong')]:
                changed = {**source, key: value}
                with self.assertRaises(AssertionError):
                    BodyIndex12Material({'a.shp': declaration}, {'a.shp': changed}, root)
            for key, value in [('indexSha256', 'wrong'), ('paletteSha256', 'wrong'), ('bodyShadePixels', 2)]:
                changed = copy.deepcopy(declaration); changed['frames']['0'][key] = value
                with self.assertRaises(AssertionError):
                    BodyIndex12Material({'a.shp': changed}, {'a.shp': source}, root)


if __name__ == '__main__':
    unittest.main()
