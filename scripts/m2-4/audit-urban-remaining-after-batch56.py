"""Audit remaining exact-source groups without changing catalogs or selected resources."""
import collections
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p))
delta_file = Path('.artifacts/m2-4/urban-buildings-batch56-v1/coverage-delta.json')
delta = read(delta_file)
inventory_file = Path(delta['baseline']['file'])
assert sha(inventory_file) == delta['baseline']['sha256']
inventory = read(inventory_file)
rows = {row['key']: row for row in inventory['rows']}
gaps = delta['remainingGaps']
assert len(gaps) == 63 and collections.Counter(g['kind'] for g in gaps) == dict(building=54, infantry=3, vehicle=6)
guides = [Path('.artifacts/m2-4/urban-civilians-native-batch49-v1/source.json'),
          Path('.artifacts/m2-4/urban-native-v2/source.json')]
prepared = collections.defaultdict(list)
raw_sources = {}
for guide in guides:
    for source in read(guide)['sources']:
        prepared[source['member'], source['sha256']].append((guide, source))
        raw_sources[source['member'], source['sha256']] = guide.parent / 'native' / source['nativeFile']
        if source.get('hva'):
            hva = source['hva']
            raw_sources[hva['member'], hva['sha256']] = guide.parent / 'native' / hva['nativeFile']
vpl_file = Path('.artifacts/m2-2/prepared-native-v2/native/voxels.vpl')
raw_sources['voxels.vpl', sha(vpl_file)] = vpl_file
by_name = collections.defaultdict(set)
for group in gaps:
    by_name[group['member']].add(group['sha256'])
variants = {name: sorted(hashes) for name, hashes in by_name.items() if len(hashes) > 1}
assert set(variants) == {'cgpars11.shp', 'cgwash01.shp', 'cgwash14.shp', 'cgwash15.shp'}
groups = []
for group in gaps:
    members = [rows[key] for key in group['rowKeys']]
    assert all((row['source']['member'], row['source']['sha256']) == (group['member'], group['sha256']) for row in members)
    dependencies = {}
    for row in members:
        for dependency in row['dependencies']:
            dependencies[json.dumps(dependency, sort_keys=True)] = dependency
    dependencies = list(dependencies.values())
    category = ('NEUTRAL_VEHICLE' if group['kind'] == 'vehicle' else
                'NEUTRAL_INFANTRY' if group['kind'] == 'infantry' else
                'EDITION_SOURCE_VARIANT' if group['member'] in variants else
                'LINKED_BUILDING_FAMILY' if dependencies else 'SINGLE_MEMBER_BUILDING')
    matches = prepared.get((group['member'], group['sha256']), [])
    assert matches, (group['member'], group['sha256'], 'Missing exact prepared source')
    guide, source = matches[0]
    file = guide.parent / 'native' / source['nativeFile']
    assert sha(file) == group['sha256']
    if source['format'] == 'shp':
        for frame in source['frames']:
            for field, hash_field in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                assert sha(guide.parent / 'native' / frame[field]) == frame[hash_field]
    groups.append(dict(key=group['key'], category=category, member=group['member'], sha256=group['sha256'],
        identities=group['identities'], maps=group['maps'], editionRows=[dict(edition=row['edition'],
            id=row['id'], key=row['key'], nativeRules=row['nativeRules'], nativeArt=row['nativeArt'],
            palette=row['palette'], states=row['states'], usage=row['usage']) for row in members],
        completeDependencies=dependencies, exactPreparedGuide=pin(guide), originalFile=pin(file),
        format=source['format'], sourceCanvas=source.get('canvas'),
        nativeFrameCounts=dict(total=source.get('totalFrames'), body=len(source.get('frames', [])) // 2)
            if source['format'] == 'shp' else None,
        maximumBodyTrim=[max(frame['size'][axis] for frame in source['frames'][:source['totalFrames'] // 2])
            for axis in [0, 1]] if source['format'] == 'shp' else None,
        selectedHdCoverage=False, originalMapEligibilityChanged=False))
counts = dict(collections.Counter(group['category'] for group in groups))
assert counts == dict(SINGLE_MEMBER_BUILDING=36, EDITION_SOURCE_VARIANT=8, LINKED_BUILDING_FAMILY=10,
                     NEUTRAL_INFANTRY=3, NEUTRAL_VEHICLE=6)
dependency_sources = {}
for group in groups:
    for dependency in group['completeDependencies']:
        source = dependency['source']
        key = source['member'], source['sha256']
        file = raw_sources[key]
        assert sha(file) == source['sha256']
        dependency_sources[key] = dict(member=source['member'], archive=source['archive'], original=pin(file))
assert len(dependency_sources) == 19
accepted = read(Path('docs/m2-4-urban-buildings-batch56-20261016.json'))
assert accepted['visual'] == 'USER_ACCEPTED'
out = dict(schema='m2-4-urban-remaining-source-readiness-v1', status='PASS_EXACT_SOURCE_AUDIT_NO_RUNTIME_MUTATION',
    baseline=pin(inventory_file), currentCoverageDelta=pin(delta_file), exactPreparedGuides=[pin(p) for p in guides],
    counts=counts, remainingSourceGroups=len(groups), remainingCatalogRows=sum(len(g['editionRows']) for g in groups),
    sameFilenameDifferentSource=variants, groups=groups, verifiedDependencySources=list(dependency_sources.values()),
    acceptedBatch56Handoff=pin(Path('docs/m2-4-urban-buildings-batch56-20261016.json')),
    sourceVariantImplementation=dict(status='REQUIRED_BEFORE_SELECTING_THESE_EIGHT_HD_SOURCE_GROUPS',
        finding='Runtime source checks and Desktop registration currently read one descriptor per original filename. Complete-family lookup and resource paths must preserve each edition-specific source hash.',
        inspectedFiles=[pin(Path(p)) for p in ['src/engine/renderable/builder/environmentHdContract.ts',
            'src/engine/renderable/builder/loadEnvironmentHd.ts', 'desktop/environment-profile.mjs',
            'scripts/m2/export-showcase-shp.py', 'scripts/m2/official-maps/combine-environment.py']],
        boundary='HD coverage work only. Do not disable original maps, alias unequal source files, change source archives or replace one edition with another.'),
    linkedFamilyPolicy='Include all exact ACTIVE, BUILDUP, UNBUILD and other declared dependencies; determine native applicability from unchanged original rules. Do not select a detached body-only family.',
    selectedResourcesChanged=False, originalMapsChanged=False, technicalCoverageAdded=0,
    batch56='USER_ACCEPTED_MAC_PASS', windows='NOT_RUN', m24Complete=False)
target = Path('docs/m2-4-urban-remaining-after-batch56-20261016.json')
if target.exists():
    previous = Path('.artifacts/m2-4/urban-remaining-after-batch56-initial-source-audit-v1.json')
    with previous.open('xb') as stream:
        stream.write(target.read_bytes())
    out['initialSourceAudit'] = pin(previous)
    target.write_text(json.dumps(out, indent=2) + '\n')
else:
    with target.open('x') as stream:
        stream.write(json.dumps(out, indent=2) + '\n')
print(json.dumps(dict(status=out['status'], groups=len(groups), counts=counts, rows=out['remainingCatalogRows'])))
