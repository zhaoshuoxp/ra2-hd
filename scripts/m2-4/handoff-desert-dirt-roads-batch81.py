"""Hash complete dirt-road dependencies together with the inherited accepted resource ledger."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior_file = Path('.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/resource-handoff-v1.json')
assert sha(prior_file) == '235347ff167d1a06af202efa91fee04b8ef81863bed937520e5af61716b7bcfa'
prior = read(prior_file)
files = {row['file']: row.copy() for row in prior['files']}
repinned = []


def include(file):
    file = Path(file)
    entry = dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)
    if str(file) in files and files[str(file)]['sha256'] != entry['sha256']:
        assert str(file) in ['desktop/terrain-theater-hd-contracts.json', '.local/terrain-desert-selection.json']
        repinned.append(dict(file=str(file), before=files[str(file)]['sha256'], after=entry['sha256']))
    files[str(file)] = entry


export = read(root/'export-and-preservation-v7.json')
pack = Path('.local/terrain-packs')/export['candidate']['revision']
assert sha(pack/'manifest.json') == export['candidate']['sha256']
for file in pack.rglob('*'):
    if file.is_file():
        include(file)
proof = read(root/'preparation-v1.json')
donor = Path('.local/terrain-packs')/proof['acceptedDonor']['revision']
manifest = read(donor/'manifest.json')
include(donor/'manifest.json')
for group in manifest['groups']:
    if group['id'] in {row['donorGroup'] for row in proof['rows']}:
        for variant in group['variants']:
            include(donor/variant['file'])
for file in root.rglob('*'):
    if file.is_file() and 'profile' not in file.parts and file.suffix in ['.json', '.png', '.rgba', '.tmp', '.log', '.html', '.npy']:
        if file.name not in ['resource-handoff-v7.json', 'desktop-delivery-v7.json',
                'desktop-static-qa-v7.json', 'delivery-checkpoint-v7.json']:
            include(file)
mother = Path(export['acceptedSandMother']['file'])
assert sha(mother) == export['acceptedSandMother']['sha256']
for file in mother.parent.glob('tmp-set00-1254-3x4-01*'):
    if file.is_file():
        include(file)
for name in ['material-profile.json', 'imagegen-jobs.json', 'batches.json']:
    include(mother.parent/name)
for name in ['prepare-desert-dirt-roads-batch81.ts', 'export-desert-dirt-roads-batch81.py',
        'audit-desert-dirt-roads-batch81.py', 'audit-desert-dirt-road-patterns-batch81.ts',
        'close-desert-dirt-roads-batch81.py', 'review-desert-dirt-roads-batch81.py',
        'handoff-desert-dirt-roads-batch81.py']:
    include(Path('scripts/m2-4')/name)
include(Path('desktop/terrain-theater-hd-contracts.json'))
include(Path('.local/terrain-desert-selection.json'))
include(prior_file)
for entry in files.values():
    file = Path(entry['file'])
    assert file.is_file() and file.stat().st_size == entry['bytes'] and sha(file) == entry['sha256'], str(file)
result = dict(status='PASS_COMPLETE_INHERITED_AND_NEW_DIRT_ROAD_RESOURCE_HASH_CLOSURE',
    inheritedLedger=dict(file=str(prior_file), sha256=sha(prior_file), files=prior['fileCount']),
    candidate=export['candidate'], fileCount=len(files), files=list(files.values()), mutableTaskPinsRepinned=repinned,
    runtimeSourceCommit=read(root/'active-stage-v7.json')['runtimeSourceHead'],
    newNativeSets=3, newMembers=81, newActualDensitySubtiles=1042,
    artAuthority='Accepted Temperate track detail and accepted Desert sand mother; all target native coverage retained.',
    storage='Versioned isolated task resources and original source guides. No per-batch game/resource copy.',
    preparedCore='UNCHANGED_DIRECT_RGBA_TMP_PATH', visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False)
with (root/'resource-handoff-v7.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2)+'\n')
print(json.dumps(dict(files=len(files), sha256=sha(root/'resource-handoff-v7.json'))))
