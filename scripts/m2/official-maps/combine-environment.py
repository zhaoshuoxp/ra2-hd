"""Append complete environment families and hash-check every preserved payload."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--contract', type=Path, required=True)
parser.add_argument('--base-pointer', type=Path, default=Path('.local/environment-selection.json'))
parser.add_argument('--append', nargs='+', type=Path, required=True)
parser.add_argument('--receipt', type=Path, required=True)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
pointer = json.loads(args.base_pointer.read_text())
base = Path('.local/environment-packs') / pointer['revision']
assert sha(base / 'manifest.json') == pointer['sha256']
contract = json.loads(args.contract.read_text())
result = copy.deepcopy(json.loads((base / 'manifest.json').read_text()))
assert result['theater'] == contract['theater']
result['revision'] = args.revision
destination = Path('.local/environment-packs') / args.revision
destination.mkdir(exist_ok=False)
files, appended = {}, []
for folder in [base, *args.append]:
    manifest = json.loads((folder / 'manifest.json').read_text())
    assert manifest['schema'] == result['schema'] and manifest['theater'] == contract['theater']
    for identity, family in manifest['families'].items():
        declared = contract['families'][identity]
        assert family['familyHash'] == declared['familyHash']
        assert sorted(row['member'] for row in family['members']) == declared['members']
        previous = result['families'].get(identity)
        assert previous is None or previous == family, f'Conflicting complete family: {identity}'
        if previous is None:
            result['families'][identity] = family
            appended.append(identity)
        for member in family['members']:
            member_file = folder / member['path']
            assert sha(member_file) == member['sha256']
            hd = json.loads(member_file.read_text())
            native = declared.get('sourceOverrides', {}).get(member['member'], contract['sources'].get(member['member']))
            assert native and hd['source']['member'] == member['member']
            assert hd['source']['sha256'] == native['sha256']
            assert [v['density'] for v in hd['variants']] == [2, 4]
            assert len(hd['logical']['frames']) == native['bodyFrames']
            for source in sorted(member_file.parent.rglob('*')):
                if not source.is_file():
                    continue
                relative = source.relative_to(folder)
                digest = sha(source)
                if relative.as_posix() in files:
                    assert files[relative.as_posix()] == digest, f'Conflicting payload: {relative}'
                    continue
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as stream:
                    stream.write(source.read_bytes())
                assert sha(target) == digest
                files[relative.as_posix()] = digest
with (destination / 'manifest.json').open('x') as stream:
    stream.write(json.dumps(result, separators=(',', ':')) + '\n')
receipt = {
    'schema': 'm2-3-additive-environment-assembly-v1', 'acceptedBase': pointer,
    'pack': {'schemaVersion': 1, 'revision': args.revision, 'sha256': sha(destination / 'manifest.json')},
    'preservedFamilies': sorted(json.loads((base / 'manifest.json').read_text())['families']),
    'appendedFamilies': sorted(appended), 'payloadHashes': files,
    'runtimeAcceptance': False, 'allTemperateComplete': False, 'theater': contract['theater']}
with args.receipt.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'pack': receipt['pack'], 'preservedFamilies': len(receipt['preservedFamilies']),
                  'appendedFamilies': len(appended), 'files': len(files)}))
