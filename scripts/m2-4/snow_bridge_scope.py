"""Validate the explicit unused-source proof without treating it as HD coverage."""
import hashlib
import json
from pathlib import Path


UNUSED_ENDS = {f'lobrdge{index}.sno' for index in range(1, 5)}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verified_unused_ends(path, inventory_sha):
    proof = json.loads(Path(path).read_text())
    assert proof['status'] == 'PASS_UNUSED_IN_SCOPE_NOT_HD_COVERED'
    assert sha(proof['inventoryPath']) == proof['inventorySha256'] == inventory_sha
    assert sha('src/offline/officialSkirmishCatalog.json') == proof['catalogSha256']
    assert sha('.artifacts/m2-4/source-audit-v3/audit.json') == proof['sourceAuditSha256']
    assert {row['member'] for row in proof['excludedSourceGroups']} == UNUSED_ENDS
    assert all(row['theater'] == 'SNOW' and row['kind'] == 'overlay'
               for row in proof['excludedSourceGroups'])
    assert len(proof['maps']) == 91 and proof['placementCount'] == 0
    assert len({row['sourceSha256'] for row in proof['maps']}) == proof['distinctMapSources'] == 65
    assert sum(row['overlays'] for row in proof['maps']) == proof['overlayPlacementsExamined'] == 62623
    for row in proof['maps']:
        assert not row['placements'] and not row['unknownActionTypes']
        assert all(action in (99, 108) for action in row['actionTypes'])
        assert row['crateImages'] == dict(land='CRATE', water='WCRATE')
    for row in proof['runtimePath']:
        assert sha(row['file']) == row['sha256']
    assert {row['edition'] for row in proof['declarations']} == {'ra2', 'yr'}
    assert all(row['ends'] == {str(index + 121): f'LOBRDGE{index}' for index in range(1, 5)}
               for row in proof['declarations'])
    return proof
