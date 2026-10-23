"""Close changed tree bindings with additive artwork and source-hashed evidence."""
import hashlib
import json
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = Path('.artifacts/m2-4')
root = base / 'trees-closure-batches71-72-v1'
root.mkdir(exist_ok=False)
buckets = {key: {} for key in ['selected', 'authoring', 'originals', 'evidence']}


def pin(file, bucket, expected=None):
    assert file.is_file(), file
    digest = sha(file)
    assert expected is None or digest == expected, file
    record = dict(file=str(file), bytes=file.stat().st_size, sha256=digest)
    previous = buckets[bucket].setdefault(str(file), record)
    assert previous == record
    return record


plan_file = base / 'trees-batches71-72-native-plan-v2.json'
plan = read(plan_file)
pin(plan_file, 'evidence')
comparison = read(base / 'trees-batches71-72-source-comparison-v1.json')
assert comparison['status'] == 'NO_EXACT_ACCEPTED_URBAN_SOURCE_REUSE' and len(comparison['records']) == 39
pin(base / 'trees-batches71-72-source-comparison-v1.json', 'evidence')
cases, coverage, preservation, modes = [], [], [], []
for theater, batch, prior_count, count in [('newurban', 71, 69, 23), ('desert', 72, 62, 16)]:
    native = base / f'{theater}-tree-native-batch{batch}-v1'
    author = base / f'{theater}-tree-authoring-batch{batch}-v1'
    selection = read(native / 'selection-v1.json')
    contract_file = Path(f'desktop/environment-{theater}-hd-contract.json')
    contract = read(contract_file)
    pointer_file = Path(f'.local/environment-{theater}-selection.json')
    assert read(pointer_file) == selection['selectedPack'] == contract['selectedPack']
    terrain_pointer = Path(f'.local/terrain-{theater}-selection.json')
    assert read(terrain_pointer) == selection['unchangedTerrainSelection']
    pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
    pin(pack_root / 'manifest.json', 'selected', contract['selectedPack']['sha256'])
    for file in pack_root.rglob('*'):
        if file.is_file():
            pin(file, 'selected')
    prior = selection['priorContract']
    prior_root = Path('.local/environment-packs') / prior['selectedPack']['revision']
    old_pack, new_pack = read(prior_root / 'manifest.json'), read(pack_root / 'manifest.json')
    assert len(prior['families']) == prior_count and len(contract['families']) == prior_count + count
    for family, declared in prior['families'].items():
        assert declared == contract['families'][family]
        assert old_pack['families'][family] == new_pack['families'][family]
        for member in old_pack['families'][family]['members']:
            for file in (prior_root / member['path']).parent.rglob('*'):
                if file.is_file():
                    assert sha(file) == sha(pack_root / file.relative_to(prior_root))
    assert prior.get('vxl') == contract.get('vxl')
    preservation.append(dict(theater=theater.upper(), exactPriorFamilies=prior_count,
        exactPriorSources=True, exactPriorPayloads=True, unchangedVoxelDeclarations=True,
        unchangedTerrainSelection=read(terrain_pointer)))
    for file in [contract_file, pointer_file, terrain_pointer]:
        pin(file, 'selected')
    guide_file = native / 'source.json'
    guide = read(guide_file)
    assert len(guide['sources']) == count
    pin(guide_file, 'originals')
    for source in guide['sources']:
        assert source['totalFrames'] == 2 and len(source['frames']) == 2
        required = [(source['nativeFile'], source['sha256']),
            (source['palette']['sha256'] + '.pal', source['palette']['sha256'])]
        for frame in source['frames']:
            required.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
        for relative, digest in required:
            pin(native / 'native' / relative, 'originals', digest)
    for file in author.rglob('*'):
        if file.is_file():
            pin(file, 'authoring')
    assert read(author / 'verification-v1.json')['status'] == 'PASS'
    assert read(author / 'loading-v1.json')['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
    capacities = []
    for job in read(author / 'imagegen-jobs.json')['jobs']:
        receipt = read(author / (job['id'] + '-capacity-v1.json'))
        assert receipt['status'] == 'PASS' and sha(Path(job['destination'])) == receipt['masterSha256']
        capacities.extend(item['capacity'] for item in receipt['slots'])
    assert min(capacities) >= 4
    for file in [native / 'selection-v1.json', native / 'assembly-v1.json',
            author / 'verification-v1.json', author / 'loading-v1.json']:
        pin(file, 'evidence')
    covered = {2: set(), 4: set()}
    for case in [item for item in plan['cases'] if item['theater'] == theater.upper()]:
        file = Path(case['output']) / 'report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        result = dict(theater=theater.upper(), map=case['map'], density=case['density'], report=pin(file, 'evidence'))
        if case['density'] != 'Original':
            density = case['density']
            trees = report['urbanNativeTrees']
            assert trees['status'] == 'PASS_ORIGINAL_TREE_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL'
            names = {item['name'] for item in trees['originals']}
            assert names == set(case['names'])
            covered[density].update(names)
            assert set(case['actions']) == {item['name'] for item in trees['actions']}
            assert all(item['damaged']['frame'] == 0 and item['removed']['destroyed']
                and not item['removed']['spawned'] and not item['removed']['batchedEntryPresent'] for item in trees['actions'])
            assert report['graphics']['glError'] == 0
            world, peak = report['combinedWorldAllocation']['total'], report['graphics']['prepared']['peakBytes']
            assert world <= (512 if density == 2 else 1280) * 1024**2 and peak <= 128 * 1024**2
            result.update(worldBytes=world, preparedPeakBytes=peak, originalNames=sorted(names),
                nativeActions=case['actions'], nativeBindingCount=len(report['newNativeBindings']))
            if case['map'] in ['rushhr.map', 'pcofdune.map'] and density == 4:
                for event in ['release', 'crossTheater']:
                    for kind in ['environment', 'terrain']:
                        assert report[event][kind]['disposed'] and report[event][kind]['worldChargeBytes'] == 0
                result['originalResetReentryAndCrossTheaterDisposal'] = 'PASS'
        cases.append(result)
    assert covered[2] == covered[4] == set(plan['coveredNames'][theater.upper()])
    inventory_file = base / f'inventory-{theater}-after-batch{batch}-v1/inventory.json'
    inventory = read(inventory_file)
    before = read(base / f'inventory-{theater}-after-batch{batch-2}-v1/inventory.json')
    assert not inventory['issues'] and len(inventory['maps']) == (8 if theater == 'newurban' else 13)
    assert {row['mapId']: row['source'] for row in inventory['maps']} == {
        row['mapId']: row['source'] for row in before['maps']}
    assert all(row['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
        and row['unifiedSkirmish']['sourceVerified'] for row in inventory['maps'])
    summary = next(row for row in inventory['theaters'] if row['theater'] == theater.upper())
    pin(inventory_file, 'evidence')
    coverage.append(dict(theater=theater.upper(), directoryEntries=len(inventory['maps']),
        uniqueMapSourceHashes=len({row['source']['sha256'] for row in inventory['maps']}),
        originalModeLabelBindings=sum(len(row['unifiedSkirmish']['originalModes']) for row in inventory['maps']),
        selectableEntries=len(inventory['maps']), newFamilies=count, minimumActualMotherCapacity=min(capacities),
        remainingSourceGroups=summary['gapResources'], remainingByKind=summary['gapsByKind'], parserIssues=0))
    modes.extend(dict(mapId=row['mapId'], source=row['source'], starts=row['starts'],
        originalModes=row['unifiedSkirmish']['originalModes'], unified=row['unifiedSkirmish'],
        geometryHash=row['geometryHash'], placementHash=row['placementHash'],
        native='UNCHANGED_MODE_SOURCE_SIMULATION_REUSED; NEW_TREE_SOURCES_VERIFIED_BY_MINIMAL_OFFICIAL_MAP_COVER')
        for row in inventory['maps'])
    for archive in inventory['archivePins']:
        pin(Path('.local/assets') / ('yr' if 'md' in archive['name'] else 'ra2') / archive['name'],
            'originals', archive['sha256'])

for file in ['desktop/terrain-theater-hd-contracts.json', 'desktop/prepared-hd-contract.json']:
    pin(Path(file), 'selected')
reused = [pin(base / path, 'evidence') for path in [
    'ground-transitions-closure-batches69-70-v1/closure.json',
    'ground-transitions-closure-batches69-70-v1/resource-handoff.json',
    'ground-transitions-closure-batches69-70-v1/user-acceptance-20261017.json',
    'checkpoint-2-v3/mode-adaptation.json', 'native-evidence-v3.json']]
review = base / 'trees-review-batches71-72-v1'
qa = read(review / 'static-qa-v1.json')
assert qa['decodedPngs'] == 184
delivery = read(review / 'desktop-delivery-v1.json')
for item in delivery['files']:
    assert sha(Path(item['file'])) == item['sha256']
for file in review.glob('*.json'):
    pin(file, 'evidence')
handoff = dict(schema='m2-4-tree-resource-handoff-v1', status='PASS_CHANGED_SELECTED_AUTHORING_AND_ORIGINAL_HASHES',
    files={key: list(value.values()) for key, value in buckets.items()},
    counts={key: len(value) for key, value in buckets.items()},
    reusedUnchangedEvidence=reused, preservation=preservation,
    policy='Changed selected environment graphs are fully hash checked. Unchanged faction, UI, terrain '
        'and historical native matrices reuse pinned accepted receipts. Final independent app and full '
        'milestone resource transfer remain separate; no per-batch game copy.')
handoff_file = root / 'resource-handoff.json'
with handoff_file.open('x') as stream:
    stream.write(json.dumps(handoff, indent=2) + '\n')
runtime = read(base / 'newurban-tree-native-batch71-v1/active-stage.json')['runtimeSourceHead']
assert not subprocess.run(['git', 'diff', '--quiet', runtime, '--', 'src', 'desktop', 'public']).returncode
closure = dict(schema='m2-4-tree-closure-v1', status='MAC_TECHNICAL_PASS_NEW_ART_VISUAL_PENDING',
    runtimeCommit=runtime, coverage=coverage, modes=modes, nativeCases=cases,
    resourceHandoff=dict(file=str(handoff_file), sha256=sha(handoff_file), counts=handoff['counts']),
    review=read(review / 'M2.4-NewUrban-Desert-Trees-Batches71-72-Embedded.json')['html'],
    visual='PENDING_USER_REVIEW', windows='NOT_RUN', perBatchGamePackageCreated=False,
    m24Complete=False, separatePending=['CIVP original ownership decision', 'Historical Batch59 acceptance',
        'Unselected rejected Desert roads', 'Remaining authored source groups and final independent delivery'],
    failedAttempts=['Comparison helper path typo after successful export/loading; corrected boards-only resume',
        'Object-only native plan flag corrected during preflight before any case launch; old plan retained'])
with (root / 'closure.json').open('x') as stream:
    stream.write(json.dumps(closure, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], cases=len(cases), coverage=coverage, handoff=handoff['counts'])))
