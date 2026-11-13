"""Small formal-route fixtures guard immutable bridge revision retirement."""
import copy
import hashlib
from pathlib import Path
import tempfile
import unittest

from campaign_bridge_art import retire_bridge_predecessor_routes


class BridgeRouteTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ra2-bridge-routes-')
        self.directory = Path(self.temporary.name) / 'all08u'; self.directory.mkdir()
        rows = []
        for number in range(131):
            name = f'bridge-old-{number}.png'; payload = f'old-{number}'.encode()
            (self.directory / name).write_bytes(payload)
            rows.append(dict(name=name, bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest()))
        self.predecessor = dict(theater='URBAN', mission=dict(mission='all08u.map'), files=rows,
                                bundle=dict(members=list(range(26)), revision='bridge-old'))
        self.campaign = dict(mission='all08u.map', files=copy.deepcopy(rows) + [dict(name='all08u.map'), dict(name='bridge-new.json')])

    def tearDown(self):
        self.temporary.cleanup()

    def test_retirement_preserves_payloads_and_unrelated_active_routes(self):
        before = {file.name: file.read_bytes() for file in self.directory.iterdir()}
        retired = retire_bridge_predecessor_routes(self.campaign, self.directory, self.predecessor)
        self.assertEqual(len(retired), 131)
        self.assertEqual(self.campaign['files'], [dict(name='all08u.map'), dict(name='bridge-new.json')])
        self.assertEqual(before, {file.name: file.read_bytes() for file in self.directory.iterdir()})

    def test_stale_payload_aborts_before_unpublishing_any_route(self):
        (self.directory / 'bridge-old-130.png').write_bytes(b'changed')
        before = copy.deepcopy(self.campaign)
        with self.assertRaises(AssertionError):
            retire_bridge_predecessor_routes(self.campaign, self.directory, self.predecessor)
        self.assertEqual(self.campaign, before)

    def test_replacement_never_retires_an_original_map(self):
        self.predecessor['files'][0]['name'] = 'all08u.map'
        with self.assertRaises(AssertionError):
            retire_bridge_predecessor_routes(self.campaign, self.directory, self.predecessor)

    def test_mismatched_metadata_does_not_mutate_current_catalog(self):
        self.campaign['files'][120]['sha256'] = '0' * 64
        before = copy.deepcopy(self.campaign)
        with self.assertRaises(AssertionError):
            retire_bridge_predecessor_routes(self.campaign, self.directory, self.predecessor)
        self.assertEqual(self.campaign, before)

    def test_other_missions_are_rejected(self):
        self.campaign['mission'] = 'sov01t.map'
        with self.assertRaises(AssertionError):
            retire_bridge_predecessor_routes(self.campaign, self.directory, self.predecessor)


if __name__ == '__main__':
    unittest.main()
