"""Extend the complete Batch 78 resource ledger with the bounded road repair."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/desert-road-network-r1-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior_file = Path('.artifacts/m2-4/desert-roads-batch78-20261019/resource-handoff-v4.json')
assert sha(prior_file) == '49c35fcedc471dc899f7c824dd913b0fa7b8e6b9a86e4479b00a864eb2c3c6db'
prior = read(prior_file)
files = {r['file']: r.copy() for r in prior['files']}
added = set()


def include(file):
    file = Path(file)
    assert file.is_file(), str(file)
    entry = dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)
    files[str(file)] = entry
    added.add(str(file))


receipt = read(root/'export-and-preservation-v3.json')
pack = Path('.local/terrain-packs')/receipt['candidate']['revision']
assert sha(pack/'manifest.json') == receipt['candidate']['sha256']
for file in sorted(pack.rglob('*')):
    if file.is_file():
        include(file)
for file in sorted(root.rglob('*')):
    if file.is_file() and 'profile' not in file.parts and file.suffix in [
            '.json', '.log', '.png', '.html', '.npy', '.webm']:
        if file.name not in ['resource-handoff-v3.json', 'desktop-delivery-v3.json',
                'desktop-static-qa-v3.json', 'delivery-checkpoint-v3.json']:
            include(file)
for file in ['scripts/m2/shared_road_network.py', 'scripts/m2-4/export-desert-road-network-r1.py',
        'scripts/m2-4/review-desert-road-network-r1.py', 'scripts/m2-4/handoff-desert-road-network-r1.py',
        'desktop/terrain-theater-hd-contracts.json', '.local/terrain-desert-selection.json']:
    include(file)
include(prior_file)
# Mutable task contract pins are explicitly replaced above; all other inherited
# dependencies must still match their retained receipt, never silently repinned.
for entry in files.values():
    file = Path(entry['file'])
    assert file.is_file() and file.stat().st_size == entry['bytes'] and sha(file) == entry['sha256'], str(file)
result = dict(status='PASS_COMPLETE_INHERITED_AND_NEW_RESOURCE_HASH_CLOSURE',
    inheritedLedger=dict(file=str(prior_file), sha256=sha(prior_file), declaredFiles=prior['fileCount']),
    candidate=receipt['candidate'], runtimeSourceCommit=read(root/'active-stage-v3.json')['runtimeSourceHead'],
    files=list(files.values()), fileCount=len(files), newOrRevalidatedEntries=len(added),
    authority='Versioned isolated task resources plus inherited complete Batch 78 dependencies. No per-batch resource or game copy.',
    rawMapsAndArchives='UNCHANGED_SOURCE_PINS_REUSED', prepared='UNCHANGED_CORE_INDEX_DIRECT_RGBA_TERRAIN_PATH',
    visualAcceptance='PENDING_ROAD_NETWORK_REPAIR', windows='NOT_RUN', m24Complete=False,
    perBatchMacPackageCreated=False)
with (root/'resource-handoff-v3.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2)+'\n')
print(json.dumps(dict(files=len(files), newOrRevalidatedEntries=len(added),
    sha256=sha(root/'resource-handoff-v3.json'))))
