"""Extend accepted actor availability only after exact target dependency closure."""
import copy
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/newurban-accepted-reuse-batch63-v1')
root.mkdir(exist_ok=False)
urban_file = Path('desktop/environment-urban-hd-contract.json')
target_file = Path('desktop/environment-newurban-hd-contract.json')
urban, target = read(urban_file), read(target_file)
acceptance_file = Path('.artifacts/m2-4/urban-actors-native-batch62-v1/user-acceptance-20261017.json')
acceptance = read(acceptance_file)
assert acceptance['visual'] == 'USER_ACCEPTED'
guide_files = [Path('.artifacts/m2-4') / folder / 'source.json' for folder in
    ['urban-actors-native-batch62-v1', 'newurban-native-v1']]
guides = [read(file) for file in guide_files]
inventory_file = Path(guides[1]['inventoryFile'])
assert sha(inventory_file) == guides[1]['inventorySha256']
inventory = read(inventory_file)
names = ['JEEP', 'YCAB', 'BCAB', 'AMBU', 'FTRK', 'CIVP']
records, files = [], {}
for name in names:
    assert name in acceptance['identities']
    member = name.lower() + '.vxl'
    sources = [next(s for s in guide['sources'] if s['member'] == member) for guide in guides]
    donor, native = sources
    for field in ['sha256', 'hasShadow', 'remapable', 'nativeArt', 'nativeRules']:
        assert donor[field] == native[field], (name, field)
    assert donor['palette']['sha256'] == native['palette']['sha256']
    assert donor['hva']['sha256'] == native['hva']['sha256']
    for guide_file, source in zip(guide_files, sources, strict=True):
        for item, file in [(source, guide_file.parent / 'native' / source['nativeFile']),
                           (source['hva'], guide_file.parent / 'native' / source['hva']['nativeFile']),
                           (source['palette'], guide_file.parent / 'native' / (source['palette']['sha256'] + '.pal'))]:
            assert sha(file) == item['sha256']
            files[str(file)] = item['sha256']
    rows = [row for row in inventory['rows'] if row['theater'] == 'NEWURBAN' and row['id'] == name]
    assert rows and {row['edition'] for row in rows} == {'yr'}
    inactive = []
    for row in rows:
        assert row['source']['sha256'] == native['sha256']
        for dependency in row['dependencies']:
            role, source = dependency['role'], dependency['source']
            if role == 'HVA':
                assert source['sha256'] == native['hva']['sha256']
            elif role == 'VPL':
                assert source['sha256'] == '2d75fff8a6872ffe98308c7009858a9e904696e1529bc649181a44993979081c'
            else:
                assert name == 'JEEP' and role == 'TUR' and native['nativeRules']['Turret'] == 'no'
                assert source['sha256'] == '80d630cd03fd82baa4c51d9c53eb3c9fba25929f2d2e964769e1f047f014214a'
                inactive.append(dependency)
    declaration = urban['vxl'][name]
    assert declaration['theaters'] == ['URBAN'] and declaration['authoringTheater'] == 'URBAN'
    assert {v['density'] for v in declaration['variants']} == {2, 4}
    for variant in declaration['variants']:
        file = Path('.local') / variant['path']
        assert sha(file) == variant['hash']
        metadata = read(file)
        assert metadata['identity'] == name and metadata['theater'] == 'URBAN'
        assert metadata['density'] == variant['density']
        assert metadata['sources'] == {member: native['sha256'], native['hva']['member']: native['hva']['sha256']}
        files[str(file)] = variant['hash']
        for part in metadata['parts']:
            assert [f['heading'] for f in part['frames']] == list(range(0, 360, 45))
            for asset in part['files'].values():
                page = file.parent / asset['file']
                assert page.stat().st_size == asset['bytes'] and sha(page) == asset['sha256']
                files[str(page)] = asset['sha256']
    records.append(dict(identity=name, sourceSha256=native['sha256'], hvaSha256=native['hva']['sha256'],
        fullPaletteSha256=native['palette']['sha256'], descriptor=copy.deepcopy(declaration),
        maps=sorted({map_id for b in native['bindings'] for map_id in b['mapIds']}),
        inactiveOriginalDependencies=inactive))
baseline = dict(urban=urban, newurban=target)
for name in names:
    urban['vxl'][name]['theaters'].append('NEWURBAN')
target['vxl'] = copy.deepcopy(urban['vxl'])
assert set(target['vxl']) == set(names + ['WINI', 'TRUCKB'])
receipt = dict(status='EXACT_ACCEPTED_DUAL_DENSITY_VXL_REUSE_STATIC_PASS_NATIVE_PENDING',
    batch=63, theater='NEWURBAN', donorAcceptance=dict(file=str(acceptance_file), sha256=sha(acceptance_file)),
    priorContracts=baseline, sourceGuides=[dict(file=str(p), sha256=sha(p)) for p in guide_files],
    inventory=dict(file=str(inventory_file), sha256=sha(inventory_file)), records=records, files=files,
    policy='Only six verified availability lists extend. Authored metadata and every page remain byte-identical. Full palette equality proves every fixed VPL color row. Preserve inactive JEEP turret provenance without inventing an active part. Existing raster selections and all native maps/rules remain unchanged.',
    visual='EXACT_USER_ACCEPTED_ART_REUSED', native='NOT_RUN', windows='NOT_RUN', m24Complete=False)
with (root / 'qualification-v1.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
for file, contract in [(urban_file, urban), (target_file, target)]:
    file.write_text(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(qualifiedActors=len(records), unchangedPayloadFiles=len(files),
    sourceMapIds=sorted({m for row in records for m in row['maps']}))))
