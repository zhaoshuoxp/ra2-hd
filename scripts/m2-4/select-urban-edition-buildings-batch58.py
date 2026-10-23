"""Select both complete original edition variants through one additive, hash-distinct assembly."""
import copy
import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p))


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
root = base / 'urban-edition-buildings-native-batch58-v1'
root.mkdir(exist_ok=False)
contract_file = Path('desktop/environment-urban-hd-contract.json')
selector = Path('.local/environment-urban-selection.json')
old = read(contract_file)
old_sha = sha(contract_file)
accepted = read(Path('docs/m2-4-urban-city-flags-batch57-20261016.json'))
assert accepted['visual'] == 'USER_ACCEPTED' and accepted['selectedEnvironment'] == old['selectedPack']
assert read(selector) == old['selectedPack'] and len(old['families']) == 238
patch = dict(schema=old['schema'], theater='URBAN', sources={}, families={},
    identities={'ra2': {}, 'yr': {}}, aliases={})
guides, patches, verifications, edition_sources = [], [], [], {}
for edition in ['ra2', 'yr']:
    native = base / f'urban-edition-buildings-native-batch58-{edition}-v1'
    art = base / f'urban-edition-buildings-authoring-batch58-{edition}-v1'
    c = read(native / 'contract.json')
    guide = read(native / 'source.json')
    v = read(art / 'verification-v1.json')
    assert v['status'] == 'PASS' and v['counts']['densityFrames'] == 32 and v['counts']['families'] == 4
    pack_root = Path(v['pack'])
    assert sha(pack_root / 'manifest.json') == v['sha256']
    patches.append(pack_root)
    verifications.append(pin(art / 'verification-v1.json'))
    assert not set(patch['families']) & set(c['families'])
    patch['families'].update(c['families'])
    patch['identities'][edition] = c['identities'][edition]
    if edition == 'ra2':
        patch['sources'] = copy.deepcopy(c['sources'])
    else:
        for family in c['families'].values():
            name, = family['members']
            assert family['sourceOverrides'][name] == c['sources'][name]
            assert family['sourceOverrides'][name]['sha256'] != patch['sources'][name]['sha256']
    guides.extend(guide['sources'])
    edition_sources[edition] = {s['member']: s for s in guide['sources']}


def rendered_trim(pack_root, family, slot, density):
    member, = read(pack_root / 'manifest.json')['families'][family]['members']
    file = pack_root / member['path']
    manifest = read(file)
    variant = next(v for v in manifest['variants'] if v['density'] == density)
    frame = variant['frames'][slot]
    x, y, w, h = frame['sampleRect']
    return [np.asarray(Image.open(file.parent / str(density) / frame['page'] / (role + '.png'))
        .convert('RGBA').crop((x, y, x + w, y + h))).copy() for role in ['base', 'data']]


shared = []
for identity, name in [('CAPARS11', 'cgpars11.shp'), ('CAWASH14', 'cgwash14.shp'), ('CAWASH15', 'cgwash15.shp')]:
    for slot in range(3):
        a, b = [edition_sources[e][name]['frames'][slot] for e in ['ra2', 'yr']]
        assert a['indexSha256'] == b['indexSha256'] and a['rgbaSha256'] == b['rgbaSha256'] and a['size'] == b['size']
        for density in [2, 4]:
            images = [rendered_trim(p, f'urban-{identity.lower()}-{e}', slot, density)
                for p, e in zip(patches, ['ra2', 'yr'])]
            assert all(np.array_equal(a, b) for a, b in zip(*images))
        shared.append(dict(identity=identity, member=name, nativeSlot=slot, indexSha256=a['indexSha256'],
            sameTrimSize=a['size'], originalOrigins=dict(ra2=a['origin'], yr=b['origin']),
            independentDensityPixelParity=True, bothOriginalCanvasesPreserved=True))
write(root / 'shared-body-pixel-parity-v1.json', dict(status='PASS_NINE_SHARED_SOURCE_STATES_18_DENSITY_PIXEL_PAIRS',
    cases=shared, comparedBaseAndData=True, copiedSourceMetadata=False, userAcceptance=False))
os.symlink((base / 'urban-civilians-native-batch49-v1/native').resolve(), root / 'native')
write(root / 'source.json', dict(schema=guide['schema'], theater='URBAN',
    sources=guides, policy='Eight actual original sources. Repeated filenames retain their full source hashes and edition bindings.'))
patch['preparedSourceSha256'] = sha(root / 'source.json')
write(root / 'contract.json', patch)
full = copy.deepcopy(old)
assert not set(old['sources']) & set(patch['sources'])
full['sources'].update(patch['sources'])
full['families'].update(patch['families'])
for edition in ['ra2', 'yr']:
    assert not set(old['identities'][edition]) & set(patch['identities'][edition])
    full['identities'][edition].update(patch['identities'][edition])
full['preparedSourceSha256'] = patch['preparedSourceSha256']
full['extensions'] = dict(milestone='M2.4', batch=58, newFamilies=sorted(patch['families']),
    baselineSelectedPack=old['selectedPack'], baselineContractSha256=old_sha,
    omittedInvisibleSystemMarkers=old['extensions']['omittedInvisibleSystemMarkers'],
    state='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    policy='Four original identities, eight exact edition families. All 32 native body slots and 32 original shadows retained, including inactive duplicate slots. Preserve all 238 earlier families and original rules.')
full_file = root / 'contract-full-v1.json'
write(full_file, full)
assembly_file = root / 'assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py',
    'urban-environment-m2-4-edition-buildings-batch58-v1', '--contract', str(full_file),
    '--base-pointer', str(selector), '--append', *map(str, patches), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 238 and len(assembly['appendedFamilies']) == 8
selected = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(selected / 'manifest.json') == assembly['pack']['sha256']
for name, digest in assembly['payloadHashes'].items():
    assert sha(selected / name) == digest
full['selectedPack'] = assembly['pack']
contract_file.write_text(json.dumps(full, indent=2) + '\n')
selector.write_text(json.dumps(assembly['pack'], indent=2) + '\n')
write(root / 'selection-v1.json', dict(status='STATIC_COMPLETE_NATIVE_AND_VISUAL_PENDING',
    priorContract=old, priorContractSha256=old_sha,
    selectedPack=assembly['pack'], verifications=verifications, assembly=pin(assembly_file),
    preservedFamilies=238, newFamilies=sorted(patch['families']), payloadFiles=len(assembly['payloadHashes']), windows='NOT_RUN'))
cases = []
for edition, prefix in [('ra2', ''), ('yr', 'x')]:
    for group, suffix, names in [('paris', 'mp33u4.map', ['CAPARS11']),
        ('washington', 'mp34u4.map', ['CAWASH01', 'CAWASH14', 'CAWASH15'])]:
        cases.append(dict(id=f'{edition}-{group}', edition=edition, runtimeName=prefix + suffix,
            families=[f'urban-{n.lower()}-{edition}' for n in names], identities=names,
            captureName=names[0], checkRelease=group == 'washington',
            output=f'.artifacts/m2-4/urban-edition-buildings-batch58-v1/native-{edition}-{group}'))
write(root / 'native-plan-v1.json', dict(schema='m2-4-urban-exact-edition-building-native-plan-v1', cases=cases,
    sourceContractSha256=sha(root / 'contract.json'),
    deduplication='Four actual maps cover all eight source hashes, each at 2X/4X. Paris and Washington native state paths are distinct; each edition keeps its original geometry, owner indices, palette and shadows. Other maps with the same exact source hashes reuse these loader/state cases. Original placement files are unchanged.'))
print(json.dumps(dict(selectedPack=assembly['pack'], families=len(full['families']),
    files=len(assembly['payloadHashes']) + 1, maps=4)))
