"""Hash selected resources, originals and incremental evidence for one review."""
import hashlib
import json
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = Path('.artifacts/m2-4')
root = base / 'facilities-coast-closure-batches73-75-v1'
root.mkdir(exist_ok=False)
buckets = {key: {} for key in ['selected', 'authoring', 'originals', 'evidence']}


def pin(file, bucket, expected=None):
    assert file.is_file(), file
    digest = sha(file)
    assert expected is None or digest == expected, file
    record = dict(file=str(file), bytes=file.stat().st_size, sha256=digest)
    assert buckets[bucket].setdefault(str(file), record) == record
    return record


def pin_tree(folder, bucket):
    for file in sorted(folder.rglob('*')):
        if file.is_file():
            pin(file, bucket)


def source_records(native, count):
    guide = read(native / 'source.json')
    assert len(guide['sources']) == count
    pin(native / 'source.json', 'originals')
    for source in guide['sources']:
        required = [(source['nativeFile'], source['sha256']),
            (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]
        for frame in source.get('frames', source.get('images', [])):
            required.append((frame['file'], frame['rgbaSha256']))
            if 'indexFile' in frame:
                required.append((frame['indexFile'], frame['indexSha256']))
        for relative, digest in required:
            pin(native / 'native' / relative, 'originals', digest)
    return guide


preservation, coverage, modes, native_cases = [], [], [], []
facilities = base / 'newurban-facilities-native-batch73-v1'
facility_selection = read(facilities / 'selection-v1.json')
facility_contract = read(Path('desktop/environment-newurban-hd-contract.json'))
assert facility_contract['selectedPack'] == facility_selection['selectedPack']
prior = facility_selection['priorContract']
assert len(prior['families']) == 92 and len(facility_contract['families']) == 111
prior_root = Path('.local/environment-packs') / prior['selectedPack']['revision']
selected_root = Path('.local/environment-packs') / facility_contract['selectedPack']['revision']
old_pack, pack = read(prior_root / 'manifest.json'), read(selected_root / 'manifest.json')
for family, declaration in prior['families'].items():
    assert declaration == facility_contract['families'][family]
    assert old_pack['families'][family] == pack['families'][family]
    for member in old_pack['families'][family]['members']:
        for file in (prior_root / member['path']).parent.rglob('*'):
            if file.is_file():
                assert sha(file) == sha(selected_root / file.relative_to(prior_root))
assert prior.get('vxl') == facility_contract.get('vxl')
preservation.append(dict(theater='NEWURBAN', exactPriorEnvironmentFamilies=92,
    unchangedPriorPayloads=True, unchangedVoxels=True, addedFacilityFamilies=19))
source_records(facilities, 19)
facility_author = base / 'newurban-facilities-authoring-batch73-v1'
assert read(facility_author / 'verification-v1.json')['status'] == 'PASS'
pin_tree(facility_author, 'authoring')
for name in ['technical-closure-v1.json', 'native-plan-v2.json', 'selection-v1.json', 'assembly-v1.json',
        'active-stage-v2.json', 'native-downtown-2x-v1/report.json']:
    pin(facilities / name, 'evidence')
facility_plan = read(facilities / 'native-plan-v2.json')
covered = {2: set(), 4: set()}
for case in facility_plan['cases']:
    file = Path(case['output']) / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    item = dict(batch=73, map=case['map'], density=case['density'], report=pin(file, 'evidence'))
    if case['density'] != 'Original':
        props = report['urbanNativeProps']
        covered[case['density']].update(record['name'] for record in props['originals'])
        assert {record['name'] for record in props['originals']} == set(case['names'])
        assert {record['name'] for record in props['actions']} == set(case['actions'])
        assert all(record['damaged']['frame'] == 0 and record['removed']['destroyed']
            and not record['removed']['spawned'] and not record['removed']['batchedEntryPresent']
            for record in props['actions'])
        item.update(worldBytes=report['combinedWorldAllocation']['total'],
            preparedPeakBytes=report['graphics']['prepared']['peakBytes'], actions=case['actions'])
    native_cases.append(item)
assert covered[2] == covered[4] == set(facility_plan['names']) and len(covered[2]) == 19

terrain_contract = read(Path('desktop/terrain-theater-hd-contracts.json'))
coast_plan = read(base / 'coast-batches74-75-native-plan-v1.json')
pin(base / 'coast-batches74-75-native-plan-v1.json', 'evidence')
for theater, batch, previous_batch, prior_groups, added_groups, version in [
        ('newurban', 74, 71, 12, 4, 3), ('desert', 75, 72, 11, 3, 1)]:
    native = base / f'{theater}-coast-native-batch{batch}-v1'
    author = base / f'{theater}-coast-authoring-batch{batch}-v1'
    selection = read(native / 'selection-v1.json')
    assert selection['selectedTerrain'] == terrain_contract[theater.upper()]
    assert selection['environmentSelection'] == read(Path(f'.local/environment-{theater}-selection.json'))
    prior_root = Path('.local/terrain-packs') / selection['priorTerrain']['revision']
    selected_root = Path('.local/terrain-packs') / selection['selectedTerrain']['revision']
    old_pack, pack = read(prior_root / 'manifest.json'), read(selected_root / 'manifest.json')
    assert len(old_pack['groups']) == prior_groups and len(pack['groups']) == prior_groups + added_groups
    assert old_pack['groups'] == pack['groups'][:prior_groups]
    for group in old_pack['groups']:
        for variant in group['variants']:
            assert sha(prior_root / variant['file']) == sha(selected_root / variant['file']) == variant['sha256']
    preservation.append(dict(theater=theater.upper(), exactPriorTerrainGroups=prior_groups,
        unchangedPriorTerrainPayloads=True, addedGroups=added_groups))
    source_records(native, 92)
    pin_tree(author, 'authoring')
    capacities = []
    for job in read(author / 'imagegen-jobs.json')['jobs']:
        capacity = read(author / (job['id'] + '-capacity-v1.json'))
        assert capacity['status'] == 'PASS' and sha(Path(job['destination'])) == capacity['masterSha256']
        capacities.extend(record['capacity'] for record in capacity['members'])
    assert min(capacities) >= 4
    for name in ['selection-v1.json', 'urban-reuse-audit-v1.json']:
        pin(native / name, 'evidence')
    validation = read(author / f'{theater}-m2-4-coast-batch{batch}-v{version}/validation.json')
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    for case in [item for item in coast_plan['cases'] if item['theater'] == theater.upper()]:
        file = Path(case['output']) / 'report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        item = dict(batch=batch, map=case['map'], density=case['density'], report=pin(file, 'evidence'))
        if case['density'] != 'Original':
            assert len(report['requestedTerrainGroups']) == added_groups
            assert all(any(group['id'] == name and group['status'] == 'PUBLISHED'
                for group in report['terrain']['groups']) for name in report['requestedTerrainGroups'])
            assert report['graphics']['glError'] == 0
            world, peak = report['combinedWorldAllocation']['total'], report['graphics']['prepared']['peakBytes']
            assert world <= (512 if case['density'] == 2 else 1280)*1024**2 and peak <= 128*1024**2
            item.update(worldBytes=world, preparedPeakBytes=peak, groups=report['requestedTerrainGroups'])
            if theater == 'newurban':
                assert report['requestedTerrainMembers'] == ['water07.ubn', 'water08.ubn', 'water14.ubn']
            if case['density'] == 4:
                for event in ['release', 'crossTheater']:
                    for kind in ['environment', 'terrain']:
                        assert report[event][kind]['disposed'] and report[event][kind]['worldChargeBytes'] == 0
                item['originalResetReentryAndCrossTheaterDisposal'] = 'PASS'
        native_cases.append(item)
    inventory_file = base / f'inventory-{theater}-after-batch{batch}-v1/inventory.json'
    inventory = read(inventory_file)
    previous = read(base / f'inventory-{theater}-after-batch{previous_batch}-v1/inventory.json')
    assert not inventory['issues']
    assert {row['mapId']: row['source'] for row in inventory['maps']} == {
        row['mapId']: row['source'] for row in previous['maps']}
    assert all(row['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
        and row['unifiedSkirmish']['sourceVerified'] for row in inventory['maps'])
    summary = next(row for row in inventory['theaters'] if row['theater'] == theater.upper())
    coverage.append(dict(theater=theater.upper(), directoryEntries=len(inventory['maps']),
        uniqueMapSources=len({row['source']['sha256'] for row in inventory['maps']}),
        originalModeLabelBindings=sum(len(row['unifiedSkirmish']['originalModes']) for row in inventory['maps']),
        selectableEntries=len(inventory['maps']), parserIssues=0,
        newlyAuthoredMembers=111 if theater == 'newurban' else 92,
        minimumCoastMotherCapacity=min(capacities), remainingSourceGroups=summary['gapResources'],
        remainingByKind=summary['gapsByKind'],
        unresolvedOutsideAuthoredCount='22 legacy smudge names and four deliberate native exceptions per theater'))
    modes.extend(dict(mapId=row['mapId'], source=row['source'], starts=row['starts'],
        originalModes=row['unifiedSkirmish']['originalModes'], unified=row['unifiedSkirmish'],
        geometryHash=row['geometryHash'], placementHash=row['placementHash'],
        native='PRIOR_UNIFIED_MODE_SOURCE_SIMULATION_REUSED; NEW_MATERIAL_PATHS_VERIFIED_INCREMENTALLY')
        for row in inventory['maps'])
    pin(inventory_file, 'evidence')
    for archive in inventory['archivePins']:
        pin(Path('.local/assets') / ('yr' if 'md' in archive['name'] else 'ra2') / archive['name'],
            'originals', archive['sha256'])
    for kind in ['terrain', 'environment']:
        pointer_file = Path(f'.local/{kind}-{theater}-selection.json')
        selected = read(pointer_file)
        selected_root = Path(f'.local/{kind}-packs') / selected['revision']
        pin(selected_root / 'manifest.json', 'selected', selected['sha256'])
        pin_tree(selected_root, 'selected')
        pin(pointer_file, 'selected')
    pin(Path(f'desktop/environment-{theater}-hd-contract.json'), 'selected')

pin_tree(base / 'newurban-reef-bodies-batch74-v2', 'authoring')
for file in ['desktop/terrain-theater-hd-contracts.json', 'desktop/prepared-hd-contract.json']:
    pin(Path(file), 'selected')
reused = [pin(base / file, 'evidence') for file in ['trees-closure-batches71-72-v1/closure.json',
    'trees-closure-batches71-72-v1/resource-handoff.json',
    'trees-closure-batches71-72-v1/user-acceptance-20261017.json',
    'checkpoint-2-v3/mode-adaptation.json', 'native-evidence-v3.json']]
for file in ['coast-batches74-75-loading-v1.log', 'coast-batches74-75-typecheck-v2.log',
        'coast-batches74-75-water-mask-tests-v2.log', 'coast-batches74-75-build-v1.log',
        'newurban-coast-native-batch74-v1/active-stage-v1.json']:
    pin(base / file, 'evidence')
review = base / 'facilities-coast-review-batches73-75-v1'
qa = read(review / 'static-qa-v1.json')
assert qa['decodedPngs'] == 499
delivery = read(review / 'desktop-delivery-v1.json')
for item in delivery['files']:
    assert sha(Path(item['file'])) == item['sha256']
for file in review.glob('*.json'):
    pin(file, 'evidence')
handoff = dict(schema='m2-4-facilities-coast-resource-handoff-v1',
    status='PASS_SELECTED_AUTHORING_ORIGINAL_AND_REUSED_EVIDENCE_HASHES',
    files={key: list(value.values()) for key, value in buckets.items()},
    counts={key: len(value) for key, value in buckets.items()}, preservation=preservation,
    reusedUnchangedEvidence=reused,
    policy='Complete selected changed theater graphs, original sources and authoring hashes retained. '
        'Accepted unaffected factions, UI, Snow and Urban reuse prior evidence. No per-batch game copy; '
        'final independent app/resource handoff remains separate.')
handoff_file = root / 'resource-handoff.json'
with handoff_file.open('x') as stream:
    stream.write(json.dumps(handoff, indent=2) + '\n')
runtime = read(base / 'newurban-coast-native-batch74-v1/active-stage-v1.json')['runtimeSourceHead']
assert not subprocess.run(['git', 'diff', '--quiet', runtime, '--', 'src', 'desktop', 'public']).returncode
closure = dict(schema='m2-4-facilities-coast-closure-v1', status='MAC_TECHNICAL_PASS_NEW_ART_VISUAL_PENDING',
    runtimeCommit=runtime, facilityRuntimeCommit=read(facilities / 'active-stage-v2.json')['runtimeSourceHead'],
    batches=[73, 74, 75], families=26, members=203, nativeCases=native_cases,
    coverage=coverage, modes=modes, resourceHandoff=dict(file=str(handoff_file), sha256=sha(handoff_file),
        counts=handoff['counts']), review=read(review /
        'M2.4-NewUrban-Desert-Facilities-Coast-Batches73-75-Embedded.json')['html'],
    desktop=delivery, visual='PENDING_USER_REVIEW', windows='NOT_RUN',
    perBatchGamePackageCreated=False, m24Complete=False,
    separatePending=['CIVP original ownership decision', 'Historical Batch59 acceptance',
        'Unselected rejected Desert roads', 'Remaining authored and legacy source groups',
        'Final independent Mac app/resource delivery'])
with (root / 'closure.json').open('x') as stream:
    stream.write(json.dumps(closure, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], cases=len(native_cases), coverage=coverage, handoff=handoff['counts'])))
