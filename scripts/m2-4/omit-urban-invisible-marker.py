"""Retain an original invisible system overlay without requesting unused artwork."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('patch_revision')
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
contract, pointer = read(contract_file), read(selector)
assert contract['selectedPack'] == pointer
native_file = Path('.artifacts/m2-4/urban-overlay-native-batch45-v1/source.json')
source, = [row for row in read(native_file)['sources'] if row['member'] == 'srock01.urb']
assert all(row['id'] == 'RUBBLE_OVERLAY' and row['nativeRules']['IsRubble'].lower() == 'yes'
           for row in source['bindings'])
assert sha(native_file.parent / 'native' / source['nativeFile']) == source['sha256']
renderer = Path('src/engine/renderable/entity/Overlay.ts')
assert 'if (this.objectRules.isRubble || this.gameObject.isBridgePlaceholder())' in renderer.read_text()
assert 'this.isInvisible = true;\n            return;' in renderer.read_text()
family = 'urban-srock01'
assert contract['families'][family]['identities'] == ['RUBBLE_OVERLAY']
assert contract['families'][family]['members'] == ['srock01.urb']
old_contract_sha = sha(contract_file)
old_new = set(contract['extensions']['newFamilies'])
assert len(old_new) == 9 and family in old_new
base = Path('.local/environment-packs') / pointer['revision']
assert sha(base / 'manifest.json') == pointer['sha256']
pack = read(base / 'manifest.json')
removed = pack['families'].pop(family)
files = []


def export(destination, payload):
    destination.mkdir(exist_ok=False)
    for record in payload['families'].values():
        for member in record['members']:
            source_file = base / member['path']
            assert sha(source_file) == member['sha256']
            target = destination / Path(member['path']).parent
            shutil.copytree(source_file.parent, target)
            for file in source_file.parent.rglob('*'):
                if file.is_file():
                    copied = target / file.relative_to(source_file.parent)
                    assert sha(file) == sha(copied)
                    files.append(dict(file=str(copied), sha256=sha(copied)))
    (destination / 'manifest.json').write_text(json.dumps(payload, separators=(',', ':')) + '\n')


pack['revision'] = args.revision
destination = Path('.local/environment-packs') / args.revision
export(destination, pack)
patch = dict(pack, revision=args.patch_revision,
             families={key: value for key, value in pack['families'].items() if key in old_new - {family}})
assert len(patch['families']) == 8
export(Path('.local/environment-packs') / args.patch_revision, patch)
del contract['families'][family]
del contract['sources']['srock01.urb']
for identities in contract['identities'].values():
    if identities.get('RUBBLE_OVERLAY') == family:
        del identities['RUBBLE_OVERLAY']
pointer_new = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer_new
contract['extensions']['newFamilies'] = sorted(old_new - {family})
contract['extensions']['bindings'] = [row for row in contract['extensions']['bindings'] if row['family'] != family]
contract['extensions']['omittedInvisibleSystemMarkers'] = [dict(identity='RUBBLE_OVERLAY',
    member=source['member'], sourceSha256=source['sha256'], nativeRules=source['bindings'][0]['nativeRules'])]
receipt = dict(status='PASS_ORIGINAL_INVISIBLE_MARKER_RETAINED_ALL_OTHER_PAYLOADS_EXACT',
    previousPack=pointer, selectedPack=pointer_new, priorContractSha256=old_contract_sha,
    renderer=dict(file=str(renderer), sha256=sha(renderer)), sourceGuideSha256=sha(native_file),
    originalSource=source, excludedCandidateFamily=removed, files=files,
    policy='Raw maps and resources remain unchanged. The original IsRubble renderer returns before creating a sprite. Historical candidate art remains preserved and is not submitted for visual acceptance.')
with args.receipt.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
contract_file.write_text(json.dumps(contract, indent=2) + '\n')
selector.write_text(json.dumps(pointer_new, indent=2) + '\n')
print(json.dumps(dict(selectedPack=pointer_new, newVisibleFamilies=8, preservedFamilies=len(pack['families']))))
