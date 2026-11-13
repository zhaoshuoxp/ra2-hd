"""Original-index geometry checks with small, generated material fixtures."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/m2'))
from showcase_component_assembly import SourcePinnedComponentAssembly
from showcase_contours import coverage


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


class ComponentAssemblyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='ra2-component-assembly-')
        cls.directory = Path(cls.temporary.name)
        cls.prepared = cls.directory / 'prepared'; (cls.prepared / 'native').mkdir(parents=True)
        fixture = json.loads((ROOT / 'scripts/campaign-completion/fixtures/snow-v3-native-v50.json').read_text())
        cls.source = fixture['source']; cls.name = cls.source['member']
        for frame in cls.source['frames']: frame['indexFile'] = 'native-indices.bin'
        cls.indices = np.frombuffer(base64.b64decode(fixture['indices']), np.uint8).reshape(75, 63)
        (cls.prepared / 'native' / cls.source['frames'][0]['indexFile']).write_bytes(base64.b64decode(fixture['indices']))
        (cls.prepared / 'native/unitsno.pal').write_bytes(base64.b64decode(fixture['palette']))
        recipe = json.loads((ROOT / 'docs/campaign-art/all05-missile-rack-recipe-v50-r2.json').read_text())
        cls.declaration = recipe['sourcePinnedComponentAssembly'][cls.name]
        # Synthetic material fields test sampling and guards; these are never game artwork.
        body = Image.new('RGBA', (1150, 1370)); draw = ImageDraw.Draw(body)
        direction = np.array([788, 530]); normal = np.array([-530, 788]) / np.linalg.norm(direction)
        for offset in [0, 453]:
            start = np.array([350, 280 + offset]); end = start + direction
            corners = [tuple(point) for point in [start - normal * 40, end - normal * 40,
                                                  end + normal * 40, start + normal * 40]]
            draw.polygon(corners, fill=(226, 226, 234, 255))
            nose = [tuple(point) for point in [end - direction * .12 - normal * 40,
                                               end, end - direction * .12 + normal * 40]]
            draw.polygon(nose, fill=(180, 8, 8, 255))
        draw.rectangle((350, 100, 444, 249), fill=(136, 5, 5, 255))
        body_file = cls.directory / 'body.png'; body.save(body_file)
        yy, xx = np.indices((1370, 1150)); light = (140 + xx * 60 / 1149).astype(np.uint8)
        frame = np.dstack((light, light - 4, light - 22, np.full(light.shape, 255, np.uint8)))
        frame_file = cls.directory / 'frame.png'; Image.fromarray(frame).save(frame_file)
        for role, file in [('body', body_file), ('frame', frame_file), ('fin', body_file)]:
            cls.declaration['components'][role].update(file=str(file), sha256=digest(file.read_bytes()))
        cls.assembly = cls.make()

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    @classmethod
    def make(cls, declaration=None, source=None):
        return SourcePinnedComponentAssembly({cls.name: declaration or copy.deepcopy(cls.declaration)},
            {cls.name: source or copy.deepcopy(cls.source)}, cls.prepared)

    def test_source_has_four_distinct_noses_and_only_body_slots_are_owned(self):
        self.assertTrue(all(self.assembly.owns(self.name, frame) for frame in range(3)))
        self.assertFalse(self.assembly.owns(self.name, 3))
        self.assertFalse(self.assembly.owns('other.shp', 0))
        with self.assertRaises(AssertionError):
            self.assembly.frame(self.name, 3)

    def test_both_densities_keep_area_rebuild_body_shades_and_sample_independently(self):
        two, four = [self.assembly.frame(self.name, density) for density in (2, 4)]
        for density, image in [(2, two), (4, four)]:
            self.assertEqual(image.shape, (75 * density, 63 * density, 4))
            original = coverage(self.indices != 0, density, linear_strips=True)
            self.assertLess(abs(image[..., 3].sum() / original.sum() - 1), .025)
            shade = (self.indices == 12).repeat(density, 0).repeat(density, 1)
            self.assertGreater(np.count_nonzero(image[..., :3][shade].max(1) > 64), shade.sum() * .8)
            self.assertGreater(np.count_nonzero((image[..., 3] > 0) & (image[..., 3] < 255)), 100)
        self.assertFalse(np.array_equal(two, np.asarray(Image.fromarray(four).resize((126, 150), Image.Resampling.LANCZOS))))

    def test_palette_shading_cannot_be_copied_into_authored_materials(self):
        file = self.prepared / 'native/unitsno.pal'; saved = file.read_bytes()
        try:
            palette = np.frombuffer(saved, np.uint8).copy().reshape(256, 3)
            palette[:] = (palette + 9) % 64
            payload = palette.tobytes(); file.write_bytes(payload)
            source, declaration = copy.deepcopy(self.source), copy.deepcopy(self.declaration)
            source['palette']['sha256'] = declaration['paletteSha256'] = digest(payload)
            other = self.make(declaration, source)
            np.testing.assert_array_equal(other.frame(self.name, 2), self.assembly.frame(self.name, 2))
        finally:
            file.write_bytes(saved)

    def test_duplicate_tip_binding_is_rejected(self):
        declaration = copy.deepcopy(self.declaration); declaration['nativeTips'][1] = declaration['nativeTips'][0]
        with self.assertRaises(AssertionError): self.make(declaration)

    def test_source_and_palette_identity_changes_are_rejected(self):
        for key in ['sourceSha256', 'paletteSha256']:
            declaration = copy.deepcopy(self.declaration); declaration[key] = '0' * 64
            with self.assertRaises(AssertionError): self.make(declaration)

    def test_ownership_or_distinct_native_pose_cannot_be_silently_reused(self):
        for mutation in ['owner', 'pose']:
            source = copy.deepcopy(self.source)
            if mutation == 'owner': source['remapable'] = True
            else: source['frames'][1]['indexSha256'] = '0' * 64
            with self.assertRaises(AssertionError): self.make(source=source)

    def test_material_identity_and_out_of_bounds_controls_are_rejected(self):
        declaration = copy.deepcopy(self.declaration); declaration['components']['body']['sha256'] = '0' * 64
        with self.assertRaises(AssertionError): self.make(declaration)
        declaration = copy.deepcopy(self.declaration); declaration['frameNativeControls'][0] = [100, 100]
        with self.assertRaises(AssertionError): self.make(declaration)

    def test_coverage_cannot_expand_beyond_the_admitted_envelope(self):
        declaration = copy.deepcopy(self.declaration); declaration['coverageEnvelopeNativePixels'] = .8
        with self.assertRaises(AssertionError): self.make(declaration)


if __name__ == '__main__':
    unittest.main()
