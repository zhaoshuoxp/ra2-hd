"""Extend the accepted task resource ledger with complete faction binding evidence."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior_file = Path('.artifacts/m2-4/desert-road-geometry-r2-20261019/resource-handoff-v5.json')
assert sha(prior_file) == '2c6cc8bf778b1aa6db7e204ed925a40e24bf1ed87cd2996687d8eeb6c824a492'
prior = read(prior_file)
files = {row['file']: row.copy() for row in prior['files']}


def include(file):
    files[str(file)] = dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)


for name in ['desert', 'newurban']:
    authority = read(root/f'{name}-authority-v1.json')
    for entry in authority['files']:
        file = Path(entry['file'])
        assert file.stat().st_size == entry['bytes'] and sha(file) == entry['sha256']
        include(file)
for file in root.rglob('*'):
    if file.is_file() and 'profile' not in file.parts and file.suffix in ['.json', '.png', '.log']:
        if file.name not in ['resource-handoff-v1.json', 'delivery-checkpoint-v1.json']:
            include(file)
for name in ['audit-remaining-faction-original-closure.ts', 'audit-remaining-faction-payloads.ts',
        'native-remaining-faction-bindings.mjs', 'close-remaining-faction-coverage.py',
        'handoff-remaining-faction-coverage.py']:
    include(Path('scripts/m2-4')/name)
include(prior_file)
include(Path('.artifacts/m2-4/desert-road-geometry-r2-20261019/user-acceptance-20261019.json'))
for entry in files.values():
    file = Path(entry['file'])
    assert file.is_file() and file.stat().st_size == entry['bytes'] and sha(file) == entry['sha256'], str(file)
result = dict(status='PASS_COMPLETE_ACCEPTED_RESOURCE_AND_INCREMENTAL_EVIDENCE_HASH_CLOSURE',
    inheritedLedger=dict(file=str(prior_file), sha256=sha(prior_file), files=prior['fileCount']),
    fileCount=len(files), files=list(files.values()), newlyVerifiedGroups=69,
    newArtwork=0, resourcesChanged=False, sourceMapsChanged=False,
    windows='NOT_RUN', m24Complete=False, perBatchMacPackageCreated=False,
    authority='Versioned accepted task resources plus pinned original sources and actual native density bindings. No copied game or resource directory.')
with (root/'resource-handoff-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2)+'\n')
print(json.dumps(dict(files=len(files), sha256=sha(root/'resource-handoff-v1.json'))))
