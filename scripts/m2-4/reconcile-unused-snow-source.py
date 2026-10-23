"""Record a proven unused Snow source without claiming artwork or removing maps."""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prior-delta', type=Path, required=True)
parser.add_argument('--usage', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
prior, usage = read(args.prior_delta), read(args.usage)
assert usage['status'] == 'PASS_UNUSED_IN_SCOPE_NOT_HD_COVERED'
assert usage['inventorySha256'] == prior['baseInventorySha256'] == sha(Path(prior['baseInventory']))
assert usage['catalogSha256'] == sha(Path('src/offline/officialSkirmishCatalog.json'))
for dependency in usage['runtimePaths']:
    assert sha(Path(dependency['file'])) == dependency['sha256']
assert len(usage['maps']) == 91 and usage['distinctMapSources'] == 65 and usage['placementCount'] == 0
assert all(not row['placements'] and not row['monsters'] for row in usage['maps'])
assert all(set(row['actionTypes']) <= {99, 108} and row['crateImages'] == dict(land='CRATE', water='WCRATE')
           for row in usage['maps'])
vein_ids = {row['edition']: set(row['veinIds']) for row in usage['declarations']}
assert all(not set(ids) & vein_ids[row['mapId'].split(':')[0]]
           for row in usage['maps'] for ids in row['generatedOverlayIds'].values())
group, = usage['unusedSourceGroups']
assert group['theater'] == 'SNOW' and group['member'] == 'veins.sno'
assert group['identities'] == ['VEINS'] and group['decisions'] == ['MISSING_AUTHORED_FAMILY']
assert read(Path('.local/environment-snow-selection.json')) == prior['selectedEnvironment']
assert read(Path('.local/terrain-snow-selection.json')) == prior['selectedTerrain']
delta = copy.deepcopy(prior)
delta.update(priorDelta=str(args.prior_delta), priorDeltaSha256=sha(args.prior_delta), covered=[],
    newSourceGroups=0, verifiedDensityFrames=0, newlyProvenUnusedSourceGroups=1,
    status='PASS_EXPLICIT_UNUSED_SOURCE_RECONCILIATION_NO_ARTWORK_CLAIM')
delta['remainingSnow']['total'] -= 1
delta['additionalUnusedNotHdCovered'] = [dict(proof=str(args.usage), sha256=sha(args.usage), sources=[group])]
delta.pop('reuseReceipt', None)
with args.output.open('x') as stream:
    json.dump(delta, stream, indent=2)
    stream.write('\n')
print(json.dumps(dict(status=delta['status'], remainingSnow=delta['remainingSnow'],
    mapEntriesRemoved=0, newHdSourceGroups=0, provenUnusedSources=1)))
