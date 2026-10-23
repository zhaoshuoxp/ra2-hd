"""Repair two metadata identifiers while preserving every authored texture payload."""
import copy
import os
from pathlib import Path

from newurban_batch89_io import ROOT, pin, read, sha, write

export = read(ROOT / 'export-and-preservation-v1.json')
assert read('.local/environment-newurban-selection.json') == export['candidate']
source = Path('.local/environment-packs') / export['candidate']['revision']
revision = 'newurban-environment-linked-buildings-batch89-v3-combined'
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
manifest = read(source / 'manifest.json')
targets = {row['member']: row for row in export['records'] if row['linked']}
assert set(targets) == {'cgmach_f.shp', 'cgla10_a.shp'}
skip = {Path(row['metadata']['file']).relative_to(source) for row in targets.values()}
preserved = {}
for file in sorted(source.rglob('*')):
    if not file.is_file() or file == source / 'manifest.json' or file.relative_to(source) in skip:
        continue
    relative = file.relative_to(source)
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    preserved[str(relative)] = sha(file)
repaired = []
for name, row in targets.items():
    old = Path(row['metadata']['file'])
    metadata = read(old)
    assert '_' in metadata['packId']
    prior = copy.deepcopy(metadata)
    metadata['packId'] = metadata['packId'].replace('_', '-')
    file = destination / old.relative_to(source)
    write(file, metadata)
    assert {key: value for key, value in prior.items() if key != 'packId'} == {
        key: value for key, value in metadata.items() if key != 'packId'}
    entry, = [e for e in manifest['families'][row['family']]['members'] if e['member'] == name]
    entry['sha256'] = sha(file)
    repaired.append(dict(member=name, previous=pin(old), current=pin(file),
        previousPackId=prior['packId'], currentPackId=metadata['packId'], changedFields=['packId']))
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
for row in export['records']:
    file = destination / Path(row['metadata']['file']).relative_to(source)
    row['metadata'] = pin(file)
export['supersedes'] = pin(ROOT / 'export-and-preservation-v1.json')
export['candidate'] = candidate
export['headerRepair'] = 'Only two packId fields change from invalid underscores to valid hyphens. All image pages and logical/source/palette/timing data are exact.'
write(ROOT / 'export-and-preservation-v2.json', export)
contract = read(ROOT / 'contract-candidate-v1.json')
contract['selectedPack'] = candidate
write(ROOT / 'contract-candidate-v2.json', contract)
write(ROOT / 'linked-header-repair-v1.json', dict(status='REPAIRED_TWO_HEADER_IDS_ALL_TEXTURE_PAYLOADS_EXACT',
    failedNative=pin(ROOT / 'native-2x-v1/report.json'), failure='Both complete linked families correctly fell back to Original because their packId contained an underscore, which resolveHdSprite rejects. The runtime and original sources are correct.',
    corrected=pin(Path('scripts/m2-4/export-newurban-linked-buildings-batch89.py')), repaired=repaired,
    priorCandidate=read(ROOT / 'export-and-preservation-v1.json')['candidate'], candidate=candidate,
    preservedPayloadHashes=preserved, originalSourcesOrGameplayChanged=False,
    applicationSourceChanged=False, artPayloadChanges=0, windows='NOT_RUN', m24Complete=False))
print(candidate)
