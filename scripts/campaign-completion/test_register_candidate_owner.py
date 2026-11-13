"""Guard ownership-only refinement of an unaccepted campaign building family."""
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
PREVIOUS = ROOT / 'docs/campaign-art/yr-v1/task-newurban-yarock-registration-r4.json'
STAGE = ROOT / '.artifacts/yr-campaign/task-newurban-yarock-stage-r5'


class CandidateOwnerTests(unittest.TestCase):
    def fixture(self, root):
        scripts = root / 'scripts/campaign-completion'
        scripts.mkdir(parents=True)
        for name in ['register-approved-shp.py', 'campaign_bridge_art.py']:
            shutil.copy2(ROOT / 'scripts/campaign-completion' / name, scripts / name)
        contract = root / 'desktop/environment-newurban-hd-contract.json'
        contract.parent.mkdir()
        selection = read(ROOT / contract.relative_to(root))
        selection['families'].pop('yr-task-newurban-yarock-v2', None)
        selection['identities']['yr']['YAROCK'] = 'yr-task-newurban-yarock-v1'
        write(contract, selection)
        directory = root / '.local/campaign/yr/sov05umd'
        directory.mkdir(parents=True)
        source = ROOT / '.local/campaign/yr/sov05umd'
        campaign = read(source / 'manifest.json')
        campaign['files'] = [row for row in campaign['files'] if not row['name'].startswith('rocket-owner-test-')
            and not row['name'].startswith('yr-task-newurban-yarock-r5-')
            and row['name'] != 'environment-family-yr-task-newurban-yarock-r5.json']
        write(directory / 'manifest.json', campaign)
        shutil.copy2(source / 'sov05umd.map', directory / 'sov05umd.map')
        predecessor = root / 'previous.json'
        previous = read(PREVIOUS)
        for member in previous['bundle']['members']:
            shutil.copy2(source / member['manifest'], directory / member['manifest'])
        write(predecessor, previous)
        ledger = root / 'docs/campaign-art/yr-v1/task-buildings.json'
        ledger.parent.mkdir(parents=True)
        write(ledger, dict(families=[dict(identity='YAROCK', theater='NEWURBAN',
            userVisualAcceptance='PENDING', registration=str(predecessor))]))
        return contract, directory, predecessor, ledger

    def register(self, root, predecessor):
        return subprocess.run(['python3', str(root / 'scripts/campaign-completion/register-approved-shp.py'),
            str(STAGE), 'rocket-owner-test-r5', str(root / 'receipt.json'),
            '--candidate-owner-predecessor', str(predecessor)], capture_output=True, text=True)

    def test_pending_refinement_retains_previous_family_and_catalog(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract, directory, predecessor, _ = self.fixture(root)
            before, catalog = read(contract), read(directory / 'manifest.json')
            original = {row['manifest']: sha(directory / row['manifest'])
                for row in read(predecessor)['bundle']['members']}
            result = self.register(root, predecessor)
            self.assertEqual(result.returncode, 0, result.stderr)
            after = read(contract)
            self.assertEqual(after['identities']['yr']['YAROCK'], 'yr-task-newurban-yarock-v2')
            self.assertEqual(after['sources'], before['sources'])
            for name, family in before['families'].items():
                self.assertEqual(after['families'][name], family)
            self.assertEqual({name: sha(directory / name) for name in original}, original)
            self.assertEqual(read(directory / 'manifest.json')['files'][:len(catalog['files'])], catalog['files'])
            self.assertTrue(read(root / 'receipt.json')['candidateOwnerRefinement']['previousFamilyAndPayloadsRetained'])

    def test_accepted_or_unrelated_registration_is_rejected_before_writing(self):
        for field, value in [('userVisualAcceptance', 'ACCEPTED'), ('registration', 'unrelated.json')]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                contract, directory, predecessor, ledger = self.fixture(root)
                evidence = read(ledger)
                evidence['families'][0][field] = value
                write(ledger, evidence)
                before = contract.read_bytes(), (directory / 'manifest.json').read_bytes()
                self.assertNotEqual(self.register(root, predecessor).returncode, 0)
                self.assertEqual((contract.read_bytes(), (directory / 'manifest.json').read_bytes()), before)
                self.assertFalse((root / 'receipt.json').exists())

    def test_changed_base_rgba_page_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            contract, directory, predecessor, _ = self.fixture(root)
            previous = copy.deepcopy(read(predecessor))
            member = previous['bundle']['members'][0]
            metadata_file = directory / member['manifest']
            metadata = read(metadata_file)
            metadata['variants'][0]['pages'][0]['baseSha256'] = '0' * 64
            write(metadata_file, metadata)
            member['sha256'] = sha(metadata_file)
            write(predecessor, previous)
            before = contract.read_bytes(), (directory / 'manifest.json').read_bytes()
            self.assertNotEqual(self.register(root, predecessor).returncode, 0)
            self.assertEqual((contract.read_bytes(), (directory / 'manifest.json').read_bytes()), before)
            self.assertFalse((root / 'receipt.json').exists())


if __name__ == '__main__':
    unittest.main()
