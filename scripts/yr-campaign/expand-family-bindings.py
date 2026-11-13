"""Admit original campaign aliases only after complete native render-binding checks."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('inventory', type=Path)
parser.add_argument('receipt', type=Path)
parser.add_argument('--kind', choices=['building', 'terrain', 'overlay'], default='building')
args = parser.parse_args()
stage = args.stage.resolve()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
assert not (stage / 'pack').exists() and not args.receipt.exists()
original, contract, inventory = read(stage / 'prepared/source.json'), read(stage / 'contract.json'), read(args.inventory)
assert original['edition'] == 'yr'
family, declared = next(iter(contract['families'].items()))
assert declared['kinds'] == [args.kind]
body, = [source for source in original['sources'] if not source.get('bindingRole')]
sources = {source['member']: source for source in original['sources']}
proofs, admitted = [], []
for row in inventory['rows']:
    if row['theater'] != original['theater'] or row['kind'] != args.kind or row['source'].get('sha256') != body['sha256']:
        continue
    members = [dict(source=row['source'], palette=row['palette'], nativeArt=row['nativeArt'],
        nativeRules=row['nativeRules'], hasShadow=row['hasShadow'], remapable=row['remapable'], role='body'),
        *[dict(item, role='ACTIVE' if item['role'] == 'ACTIVE' else item['role']) for item in row['dependencies']]]
    assert {item['source']['member'] for item in members} == set(sources), 'Complete native member closure is required'
    bindings = []
    for item in members:
        name = item['source']['member']
        native = sources[name]
        assert native['sha256'] == item['source']['sha256'] and native['canvas'] == item['source']['canvas']
        assert native['totalFrames'] == item['source']['totalFrames'] and native['hasShadow'] == item['hasShadow']
        assert native['palette']['sha256'] == item['palette']['sha256']
        assert native['nativeArt'] == item['nativeArt'], 'Native state ranges, geometry and animation rates must match'
        remapable = item.get('remapable')
        if remapable is None:
            assert item['role'] == 'RULES_DESTROY_ANIMATION'
            assert native['bindingRole'] == 'DESTROY_ANIMATION'
            assert native['identity'] == item['animation']
            assert native['parentRules'] == row['nativeRules']
            assert item['animation'] in row['nativeRules']['DestroyAnim'].split(',')
            remapable = str(item['nativeArt'].get('Remapable', 'no')).lower() in ['yes', 'true', '1']
        if native['remapable'] != remapable:
            assert not any(16 <= value <= 31 for frame in native['frames'][:native['bodyFrames']]
                for value in (stage / 'prepared/native' / frame['indexFile']).read_bytes()), 'Ownership policy differs on used owner pixels'
        bindings.append(dict(member=name, sourceSha256=native['sha256'], paletteSha256=native['palette']['sha256'],
            role=item['role'], nativeArt=item['nativeArt'], ownerFlagEquivalentOnEveryOriginalBodyPixel=True))
        native['bindings'].append(dict(identity=row['id'], kind=args.kind, role=item['role'],
            nativeRules=row['nativeRules'], nativeArt=item['nativeArt']))
    admitted.append(row['id'])
    proofs.append(dict(identity=row['id'], missions=list(row['usage']), members=bindings))
assert set(declared['identities']).issubset(admitted)
declared['identities'] = sorted(set(admitted))
missions = sorted({mission for row in proofs for mission in row['missions']})
declared['sourceScope']['campaignSources'] = [dict(edition='yr', mission=mission,
    sha256=next(row['sourceSha256'] for row in inventory['maps'] if row['mission'] == mission)) for mission in missions]
for item in declared['sourceScope']['campaignSources']:
    assert sha(Path('.local/campaign/yr') / item['mission'][:-4] / item['mission']) == item['sha256']
basis = dict(theater=original['theater'], members=contract['sources'], identities=declared['identities'])
declared['familyHash'] = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
for source in original['sources']:
    unique = {json.dumps(binding, sort_keys=True): binding for binding in source['bindings']}
    source['bindings'] = list(unique.values())
write(stage / 'contract.json', contract)
write(stage / 'prepared/source.json', original)
report = dict(status='PASS_EXACT_COMPLETE_ORIGINAL_RENDER_BINDINGS', family=family,
    inventory=dict(file=str(args.inventory), sha256=sha(args.inventory)), identities=declared['identities'],
    familyHash=declared['familyHash'], campaignSources=declared['sourceScope']['campaignSources'], bindings=proofs,
    sourceMapsChanged=0, acceptedPayloadsReplaced=0, userVisualAcceptance='PENDING')
write(args.receipt, report)
print(json.dumps(dict(family=family, identities=len(declared['identities']), missions=missions)))
