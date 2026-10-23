"""Extend the accepted resource ledger with complete Desert bridge dependencies."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
prior_file = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019/resource-handoff-v7.json')
assert sha(prior_file) == 'c08d76e2e56cae7331699357f5267135202cbbd9a12aa97592698dbde09204b3'
prior = read(prior_file)
files = {entry['file']: entry.copy() for entry in prior['files']}
repinned = []
allowed = {'desktop/environment-desert-hd-contract.json', '.local/environment-desert-selection.json',
           'scripts/m2-4/urban-bridge-loading.test.ts'}


def include(file):
    file = Path(file)
    entry = dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)
    previous = files.get(str(file))
    if previous and previous['sha256'] != entry['sha256']:
        assert str(file) in allowed, str(file)
        repinned.append(dict(file=str(file), before=previous['sha256'], after=entry['sha256']))
    files[str(file)] = entry


export = read(root / 'export-and-preservation-v2.json')
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
for file in pack.rglob('*'):
    if file.is_file():
        include(file)
for file in root.rglob('*'):
    if not file.is_file() or 'profile' in file.parts or file.name in {
        'resource-handoff-v2.json', 'desktop-delivery-v2.json', 'desktop-static-qa-v2.json', 'delivery-checkpoint-v2.json'}:
        continue
    if file.suffix in ['.json', '.png', '.log', '.html', '.webm']:
        include(file)
guide_file = Path(export['guide']['file'])
include(guide_file)
guide = read(guide_file)
names = {record['member'] for record in export['records']}
for source in guide['sources']:
    if source['member'] not in names:
        continue
    include(guide_file.parent / 'native' / source['nativeFile'])
    include(guide_file.parent / 'native' / (source['palette']['sha256'] + '.pal'))
    for frame in source['frames']:
        for key in ['file', 'indexFile']:
            include(guide_file.parent / 'native' / frame[key])
donor_contract_file = Path(export['donorContract']['file'])
include(donor_contract_file)
donor_contract = read(donor_contract_file)
donor = Path('.local/environment-packs') / donor_contract['selectedPack']['revision']
include(donor / 'manifest.json')
for member in read(donor / 'manifest.json')['families']['environment-lobrdg']['members']:
    metadata = donor / member['path']
    include(metadata)
    for file in metadata.parent.rglob('*.png'):
        include(file)
for file in Path('.artifacts/m2-4/remaining-overlays-batch82-preparation-20261019').glob('*'):
    if file.is_file():
        include(file)
for name in ['export-desert-low-bridge-batch82.py', 'audit-desert-low-bridge-batch82.py',
             'close-desert-low-bridge-batch82.py', 'native-desert-broken-bridge-ends.mjs',
             'review-desert-low-bridge-batch82.py', 'handoff-desert-low-bridge-batch82.py',
             'audit-remaining-overlay-raster-equivalence.ts', 'urban-bridge-loading.test.ts']:
    include(Path('scripts/m2-4') / name)
include(Path('desktop/environment-desert-hd-contract.json'))
include(Path('.local/environment-desert-selection.json'))
include(prior_file)
include(Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019/user-acceptance-20261019.json'))
for entry in files.values():
    file = Path(entry['file'])
    assert file.is_file() and file.stat().st_size == entry['bytes'] and sha(file) == entry['sha256'], str(file)
result = dict(status='PASS_COMPLETE_INHERITED_AND_NEW_BRIDGE_RESOURCE_HASH_CLOSURE',
    inheritedLedger=dict(file=str(prior_file), sha256=sha(prior_file), files=prior['fileCount']),
    candidate=export['candidate'], fileCount=len(files), files=list(files.values()), mutableTaskPinsRepinned=repinned,
    runtimeSourceCommit=read(root / 'active-stage-v2.json')['runtimeSourceHead'], exactAcceptedMembers=22,
    newlyAdaptedBrokenEnds=4, completeFamilyMembers=26, sourceGuide=export['guide'], donorContract=export['donorContract'],
    storage='Existing isolated task resources, complete original source guides and accepted donor. No per-batch application/resource copy.',
    preparedCore='UNCHANGED_ENVIRONMENT_PAGES_VALIDATED_AT_FAMILY_LOAD', visualAcceptance='PENDING_FOUR_BROKEN_ENDS',
    windows='NOT_RUN', m24Complete=False)
with (root / 'resource-handoff-v2.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(files=len(files), sha256=sha(root / 'resource-handoff-v2.json'), repinned=repinned)))
