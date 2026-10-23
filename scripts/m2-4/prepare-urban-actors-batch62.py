"""Prepare all nine remaining Urban actors without changing selected resources."""
import collections
import copy
import hashlib
import json
import os
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
delta_file = base / 'urban-linked-batch61-v1/coverage-delta.json'
audit_file = Path('docs/m2-4-urban-remaining-after-batch56-20261016.json')
delta, audit = read(delta_file), read(audit_file)
remaining = {row['key'] for row in delta['remainingGaps']}
groups = [copy.deepcopy(g) for g in audit['groups'] if g['key'] in remaining]
assert len(groups) == 9
assert collections.Counter(g['category'] for g in groups) == dict(NEUTRAL_INFANTRY=3, NEUTRAL_VEHICLE=6)
guide_file = base / 'urban-native-v2/source.json'
guide = read(guide_file)
prepared, raw = {}, {}
for source in guide['sources']:
    prepared[source['member'], source['sha256']] = source
    raw[source['member'], source['sha256']] = guide_file.parent / 'native' / source['nativeFile']
    if source.get('hva'):
        hva = source['hva']
        raw[hva['member'], hva['sha256']] = guide_file.parent / 'native' / hva['nativeFile']
vpl = Path('.artifacts/m2-2/prepared-native-v2/native/voxels.vpl')
assert sha(vpl) == '2d75fff8a6872ffe98308c7009858a9e904696e1529bc649181a44993979081c'
raw['voxels.vpl', sha(vpl)] = vpl
root = base / 'urban-actors-native-batch62-v1'
root.mkdir()
os.symlink((guide_file.parent / 'native').resolve(), root / 'native')
sources, dependency_files, poses, canonical = [], set(), [], {}
visible, shadows = 0, 0
for group in groups:
    source = copy.deepcopy(prepared[group['member'], group['sha256']])
    original = raw[source['member'], source['sha256']]
    assert sha(original) == source['sha256']
    dependency_files.add(original)
    palette = root / 'native' / (source['palette']['sha256'] + '.pal')
    assert sha(palette) == source['palette']['sha256']
    dependency_files.add(palette)
    if source['format'] == 'shp':
        assert source['hasShadow'] and source['totalFrames'] % 2 == 0
        count = source['totalFrames'] // 2
        visible += count
        shadows += count
        for frame in source['frames']:
            for field, hash_field in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                file = root / 'native' / frame[field]
                assert sha(file) == frame[hash_field]
        for index, frame in enumerate(source['frames'][:count]):
            key = f'{source["member"]}-{index:03d}'
            signature = json.dumps({k: frame[k] for k in ['size', 'rgbaSha256', 'indexSha256']}, sort_keys=True)
            signature += ':' + source['palette']['sha256']
            canonical.setdefault(signature, key)
            poses.append(dict(key=key, member=source['member'], sourceFrame=index, canonical=canonical[signature],
                sourceSha256=source['sha256'], paletteSha256=source['palette']['sha256'],
                frame=frame, status='NOT_AUTHORED'))
    else:
        assert source['format'] == 'vxl'
    for dependency in group['completeDependencies']:
        for descriptor in [dependency['source']] + ([dependency['hva']] if dependency.get('hva') else []):
            file = raw[descriptor['member'], descriptor['sha256']]
            assert sha(file) == descriptor['sha256']
            dependency_files.add(file)
    sources.append(source)
assert len(sources) == 9 and visible == shadows == 602
assert len([r for r in poses if r['member'] == 'civbbp.shp']) == 190
assert len([r for r in poses if r['member'] == 'pres.shp']) == 182
assert len([r for r in poses if r['member'] == 'ssrv.shp']) == 230
prepared_source = dict(schema=guide['schema'], theater='URBAN', sources=sources,
    inventoryFile=str(audit_file), inventorySha256=sha(audit_file),
    scope='Nine actor roots with exact original SHP/VXL/HVA/palette references; no new HD selection or coverage.')
(root / 'source.json').write_text(json.dumps(prepared_source, indent=2) + '\n')
(root / 'infantry-source-worklist.json').write_text(json.dumps(dict(status='ORIGINAL_GUIDES_ONLY_NOT_HD_ART',
    visibleSourceSlots=602, exactMaterialGroups=len(canonical), poses=poses,
    duplicatePolicy='Only byte-identical decoded color/index masks, sizes and palettes are material candidates. Original frame offsets, shadows, sequence membership and timing remain per slot; no accepted donor is claimed.'), indent=2) + '\n')
report = dict(schema='m2-4-urban-actors-batch62-source-preflight-v1', status='PASS_NINE_ORIGINAL_ACTOR_SOURCES_PREPARED_NO_HD_COVERAGE',
    priorDelta=pin(delta_file), sourceAudit=pin(audit_file), originalGuide=pin(guide_file),
    preparedSource=pin(root / 'source.json'), infantryWorklist=pin(root / 'infantry-source-worklist.json'),
    families=9, infantryFamilies=3, vehicleFamilies=6, infantryVisibleSlots=602, untouchedNativeShadowSlots=602,
    minimumInfantryDensityFrames=1204, distinctInfantryMaterialCandidates=len(canonical),
    groups=groups, originalDependencies=[pin(p) for p in sorted(dependency_files)],
    vehiclePolicy='Retain exact complete VXL/HVA and full 32-row VPL identities. JEEP also retains jeeptur.vxl plus jeeptur.hva source dependencies; its original Turret=no rule remains unchanged. Any reuse needs actual fixed-color and complete-family proof before selection.',
    productionOrder='Prepare the three infantry and six vehicle families as one grouped actor production/review effort; never claim a single portrait or orientation as complete.',
    selectedResourcesChanged=False, originalMapsChanged=False, technicalCoverageAdded=0,
    nativeAcceptance=False, visual='NOT_AUTHORED', windows='NOT_RUN', m24Complete=False)
target = Path('docs/m2-4-urban-actors-batch62-preflight-20261016.json')
with target.open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status', 'families', 'infantryVisibleSlots', 'distinctInfantryMaterialCandidates']}))
