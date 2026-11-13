"""Check original road scope, qualified pixels and continuous median coverage."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from showcase_accepted_roads import load_accepted_roads, render_accepted_road
from showcase_road_geometry import render_geometry


ROOT = Path(__file__).resolve().parents[2]
AUTHOR = ROOT / '.local/source-art/yr-campaign-v1/terrain-remaining-r1/newurban/authoring-paved-roads-r3'


class AcceptedRoadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((AUTHOR / 'source.json').read_text())
        cls.profile = json.loads((AUTHOR / 'material-profile.json').read_text())
        cls.geometry, cls.materials, cls.records = load_accepted_roads(cls.profile, cls.source, AUTHOR)

    def test_incomplete_or_changed_original_source_cannot_enter_the_family(self):
        for name in self.geometry:
            for fault in ['missing', 'source', 'palette', 'set', 'extra']:
                source = copy.deepcopy(self.source)
                member = next(m for m in source['members'] if m['member'] == name)
                if fault == 'missing':
                    source['members'].remove(member)
                elif fault == 'source':
                    member['native']['sha256'] = '0'*64
                elif fault == 'palette':
                    member['native']['palette']['sha256'] = '0'*64
                elif fault == 'set':
                    member['setIndex'] = 16
                else:
                    member['native']['images'][-1]['hasExtraData'] = True
                with self.subTest(member=name, fault=fault), self.assertRaises(AssertionError):
                    load_accepted_roads(self.profile, source, AUTHOR)

    def test_other_profiles_and_editions_cannot_use_the_new_road_materials(self):
        self.assertEqual(load_accepted_roads({}, {}, AUTHOR), ({}, {}, []))
        for editions in [['ra2'], ['ra2', 'yr']]:
            source = dict(self.source, editions=editions)
            with self.assertRaises(AssertionError):
                load_accepted_roads(self.profile, source, AUTHOR)

    def test_rehashed_foreign_material_pixels_cannot_claim_an_accepted_atlas(self):
        document = json.loads(Path(self.profile['acceptedRoadMaterials']['file']).read_text())
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            item = document['roles']['asphalt']['densities']['2']
            pixels = np.asarray(Image.open(item['file']).convert('RGBA')).copy()
            pixels[0, 0, 0] ^= 1
            file = directory / 'foreign.png'
            Image.fromarray(pixels).save(file)
            item.update(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
            file = directory / 'materials.json'
            file.write_text(json.dumps(document))
            profile = dict(self.profile, acceptedRoadMaterials=dict(file=str(file),
                sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
            with self.assertRaisesRegex(AssertionError, 'exact accepted density pixels'):
                load_accepted_roads(profile, self.source, AUTHOR)

    def test_vertical_native_ports_share_the_same_continuous_median_phase(self):
        phases = [self.geometry[name]['paint']['offset']
            for name in ['droads37.ubn', 'droads38.ubn', 'droads44.ubn']]
        self.assertEqual(phases, [59.5]*3)

    def test_joined_medians_keep_the_qualified_neighbor_width(self):
        # The retained vertical neighbor has a five-pixel median at native 4X.
        # A ten-pixel line produced a visible step despite an aligned center.
        for name in ['droads37.ubn', 'droads38.ubn', 'droads44.ubn']:
            model = self.geometry[name]
            output = render_accepted_road(model, self.materials, 4)
            center = model['paint']['offset']*4
            yellow = self.materials['yellow'][4]
            for row in [output.shape[0]//2, output.shape[0]*2//3]:
                x = np.arange(output.shape[1])+.5
                deviation = np.max(np.abs(output[row].astype(int)-yellow), axis=1)
                core = np.flatnonzero((deviation <= 2) & (np.abs(x-center) < 10))
                self.assertGreaterEqual(len(core), 4, (name, row))
                self.assertLessEqual(len(core), 5, (name, row))

    def test_median_stays_unbroken_inside_its_original_road_body(self):
        for name, model in self.geometry.items():
            for density in [2, 4]:
                output = render_accepted_road(model, self.materials, density)
                width, height = model['logical']
                coverage, curb = render_geometry(model['contours'], (height, width), density)
                yy, xx = (np.indices(coverage.shape)+.5)/density
                paint = model['paint']
                nx, ny = paint['normal']
                distance = np.abs(nx*xx+ny*yy-paint['offset'])
                interior = (coverage == 1) & (distance <= paint['width']/2-.5/density)
                self.assertGreater(int(interior.sum()), 10*density)
                np.testing.assert_array_equal(output[interior],
                    np.broadcast_to(self.materials['yellow'][density], output[interior].shape))
                unpainted_paving = (coverage == 0) & (curb == 0)
                self.assertTrue(unpainted_paving.any())


if __name__ == '__main__':
    unittest.main()
