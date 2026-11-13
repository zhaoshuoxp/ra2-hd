"""Small pinned-donor fixtures guard mixed accepted/authored state exports."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image
from showcase_body_reuse import accepted_body_frames
from showcase_registration import sha


class AcceptedBodyCoverageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.frames = [dict(slot=i, origin=[0, 0], size=[2, 2], empty=False,
                            indexSha256=str(i + 1) * 64) for i in range(4)]
        self.native = {'target.shp': dict(sha256='a' * 64, canvas=[2, 2], frames=self.frames,
            bodyFrames=4, totalFrames=8, hasShadow=True, palette=dict(sha256='f' * 64))}
        manifest = dict(source=dict(member='donor.shp', sha256='b' * 64),
            logical=dict(canvas=[2, 2], frames=[dict(nativeFrame=i, trimOrigin=[0, 0], trimSize=[2, 2],
                legacyRenderSize=[2, 2], empty=False) for i in range(4)]),
            color=dict(representation='fixture-with-accepted-authored-contours',
                authoredFrameCoverage={str(i): dict(policy='Preserve accepted coverage') for i in range(3)}), variants=[])
        for density in [2, 4]:
            base = np.zeros((2 * density, 8 * density, 4), np.uint8)
            data = np.zeros_like(base); data[..., 3] = 255
            regions = []
            for number in range(4):
                x = number * 2 * density
                base[:, x:x + 2 * density] = [60 + number * 20, 120, 150, 255]
                if number == 2:
                    data[:, x:x + density, 0] = 128; data[:, x:x + density, 1] = 7
                regions.append(dict(nativeFrame=number, page='p0', sampleRect=[x, 0, 2 * density, 2 * density]))
            page = dict(id='p0')
            for role, pixels in [('base', base), ('data', data)]:
                file = self.root / f'{density}-{role}.png'; Image.fromarray(pixels).save(file)
                page[role] = file.name; page[role + 'Sha256'] = sha(file)
            manifest['variants'].append(dict(density=density, pages=[page], frames=regions))
        self.manifest = self.root / 'manifest.json'; self.write(self.manifest, manifest)
        self.proof = self.root / 'proof.json'
        self.write(self.proof, dict(status='PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE', rows=[
            dict(member='target.shp', sourceSha256='a' * 64, donorMember='donor.shp', donorSourceSha256='b' * 64,
                targetBodyFrames=4, donorBodyFrames=4, slots=[dict(slot=i,
                    status='ELIGIBLE_EXACT_RENDERED_BODY_DONOR' if i < 3 else 'DISTINCT_BODY_REQUIRES_AUTHORING',
                    nativeIndexSha256=self.frames[i]['indexSha256'], paletteSha256='f' * 64,
                    differingRenderedPixels=0, differingOwnerPixels=0, differingAlphaPixels=0,
                    differingContactPixels=0, differingNativeIndices=0) for i in range(4)])]))
        self.declaration = dict(sourceSha256='a' * 64, proofFile=str(self.proof), proofSha256=sha(self.proof),
            donorMember='donor.shp', manifestFile=str(self.manifest), manifestSha256=sha(self.manifest), slots=[0, 1, 2],
            preserveAcceptedCoverage=dict(schema='preserve-pinned-accepted-body-coverage-v1', slots=[0, 1, 2],
                donorManifestSha256=sha(self.manifest), donorColorSha256=hashlib.sha256(json.dumps(
                    manifest['color'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()))

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def write(file, value):
        file.write_text(json.dumps(value))

    def read(self, declaration=None, native=None):
        return accepted_body_frames(dict(acceptedNativeBodyFrames={'target.shp': declaration or self.declaration},
            nativeStructuralCoverage=dict(schema='native-structural-subpixel-coverage-v1')),
            native or self.native)

    def test_mixed_coverage_retains_complete_accepted_rgba_and_owner_samples(self):
        result = self.read()['target.shp']
        self.assertEqual(set(result), {(number, density) for number in range(3) for density in [2, 4]})
        for density in [2, 4]:
            expected = np.asarray(Image.open(self.root / f'{density}-data.png'))
            np.testing.assert_array_equal(result[2, density][1], expected[:, 4 * density:6 * density])
            self.assertEqual(int((result[2, density][1][..., 0] > 0).sum()), 2 * density * density)

    def test_different_coverage_requires_explicit_pinned_admission(self):
        declaration = copy.deepcopy(self.declaration); del declaration['preserveAcceptedCoverage']
        with self.assertRaises(AssertionError): self.read(declaration)

    def test_substituted_coverage_policy_is_rejected(self):
        declaration = copy.deepcopy(self.declaration)
        declaration['preserveAcceptedCoverage']['donorColorSha256'] = '0' * 64
        with self.assertRaises(AssertionError): self.read(declaration)

    def test_changed_donor_image_is_rejected(self):
        file = self.root / '2-base.png'; pixels = np.array(Image.open(file)); pixels[0, 0, 0] ^= 1
        Image.fromarray(pixels).save(file)
        with self.assertRaises(AssertionError): self.read()

    def test_owner_difference_cannot_be_admitted_by_updating_only_proof_hash(self):
        proof = json.loads(self.proof.read_text()); proof['rows'][0]['slots'][2]['differingOwnerPixels'] = 1
        self.write(self.proof, proof); declaration = copy.deepcopy(self.declaration)
        declaration['proofSha256'] = sha(self.proof)
        with self.assertRaises(AssertionError): self.read(declaration)

    def test_changed_target_indices_are_rejected(self):
        native = copy.deepcopy(self.native); native['target.shp']['frames'][2]['indexSha256'] = '0' * 64
        with self.assertRaises(AssertionError): self.read(native=native)


if __name__ == '__main__':
    unittest.main()
