"""Exercise authorized building refinement and reject stale or unrelated evidence."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
read = lambda path: json.loads(path.read_text())
write = lambda path, value: path.write_text(json.dumps(value, indent=2) + '\n')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


class BuildingRefinementTests(unittest.TestCase):
    def fixture(self, root):
        scripts = root / 'scripts/campaign-completion'
        scripts.mkdir(parents=True)
        for name in ['register-approved-shp.py', 'campaign_bridge_art.py']:
            shutil.copy2(ROOT / 'scripts/campaign-completion' / name, scripts / name)
        baseline = read(ROOT / '.local/source-art/yr-campaign-v1/material-and-snow-quality-r1/opera-formal-baseline-r1.json')
        contract = root / 'desktop/environment-urban-hd-contract.json'
        contract.parent.mkdir()
        write(contract, baseline['contract'])
        directory = root / '.local/campaign/yr/all05umd'
        directory.mkdir(parents=True)
        source = ROOT / '.local/campaign/yr/all05umd'
        campaign = read(source / 'manifest.json')
        old_names = {Path(row['file']).name for row in baseline['previousPhysicalFiles']}
        campaign['files'] = [row for row in campaign['files'] if row['name'] in old_names]
        write(directory / 'manifest.json', campaign)
        shutil.copy2(source / 'all05umd.map', directory / 'all05umd.map')
        predecessor = root / 'previous.json'
        previous = copy.deepcopy(baseline['previousRegistration'])
        for member in previous['bundle']['members']:
            shutil.copy2(source / member['manifest'], directory / member['manifest'])
        write(predecessor, previous)
        feedback = root / 'feedback.json'
        evidence = read(ROOT / 'docs/campaign-art/yr-v1/material-detail-reopening-20261105.json')
        example = next(row for row in evidence['examples'] if row['identity'] == 'CASYDN03')
        example.update(registration=str(predecessor), registrationSha256=sha(predecessor))
        write(feedback, evidence)
        return contract, directory, predecessor, feedback

    def register(self, root, predecessor, feedback):
        return subprocess.run(['python3', str(root / 'scripts/campaign-completion/register-approved-shp.py'),
            str(ROOT / '.artifacts/yr-campaign/task-urban-casydn03-stage-r2'), 'opera-test-r2',
            str(root / 'receipt.json'), '--building-predecessor', str(predecessor),
            '--art-feedback', str(feedback)], capture_output=True, text=True)

    def test_refinement_retains_previous_family_routes_and_sources(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract, directory, predecessor, feedback = self.fixture(root)
            before, catalog = read(contract), read(directory / 'manifest.json')
            old = read(predecessor)['bundle']['members'][0]['manifest']
            old_hash = sha(directory / old)
            result = self.register(root, predecessor, feedback)
            self.assertEqual(result.returncode, 0, result.stderr)
            after = read(contract)
            self.assertEqual(after['identities']['yr']['CASYDN03'], 'yr-task-urban-casydn03-v2')
            self.assertEqual(after['sources'], before['sources'])
            for name, family in before['families'].items():
                self.assertEqual(after['families'][name], family)
            self.assertEqual(sha(directory / old), old_hash)
            self.assertEqual(read(directory / 'manifest.json')['files'][:len(catalog['files'])], catalog['files'])
            self.assertTrue(read(root / 'receipt.json')['buildingRefinement']['oldFamilyAndPayloadsRetained'])

    def test_unrelated_or_stale_feedback_cannot_replace_the_selected_family(self):
        for changed in ['status', 'registrationSha256']:
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                contract, directory, predecessor, feedback = self.fixture(root)
                evidence = read(feedback)
                example = next(row for row in evidence['examples'] if row['identity'] == 'CASYDN03')
                example[changed] = 'UNRELATED_OR_STALE'
                write(feedback, evidence)
                before = contract.read_bytes(), (directory / 'manifest.json').read_bytes()
                self.assertNotEqual(self.register(root, predecessor, feedback).returncode, 0)
                self.assertEqual((contract.read_bytes(), (directory / 'manifest.json').read_bytes()), before)
                self.assertFalse((root / 'receipt.json').exists())

    def test_changed_native_geometry_is_rejected_before_writing_resources(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract, directory, predecessor, feedback = self.fixture(root)
            previous = read(predecessor)
            member = previous['bundle']['members'][0]
            metadata = directory / member['manifest']
            changed = read(metadata)
            changed['logical']['canvas'][0] += 1
            write(metadata, changed)
            member['sha256'] = sha(metadata)
            write(predecessor, previous)
            evidence = read(feedback)
            next(row for row in evidence['examples'] if row['identity'] == 'CASYDN03')['registrationSha256'] = sha(predecessor)
            write(feedback, evidence)
            before = contract.read_bytes(), (directory / 'manifest.json').read_bytes()
            self.assertNotEqual(self.register(root, predecessor, feedback).returncode, 0)
            self.assertEqual((contract.read_bytes(), (directory / 'manifest.json').read_bytes()), before)
            self.assertFalse((root / 'receipt.json').exists())


if __name__ == '__main__':
    unittest.main()
