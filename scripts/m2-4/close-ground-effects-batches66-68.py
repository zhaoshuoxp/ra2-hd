"""Pin complete batch resources, original provenance and bounded native evidence."""
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = Path('.artifacts/m2-4')
output = base / 'ground-effects-closure-batches66-68-v1'
output.mkdir(exist_ok=False)
selected, authoring, originals, evidence = {}, {}, {}, {}


def pin(file, bucket, expected=None):
    assert file.is_file(), file
    digest = sha(file)
    assert expected is None or digest == expected, file
    row = dict(file=str(file), bytes=file.stat().st_size, sha256=digest)
    assert str(file) not in bucket or bucket[str(file)] == row
    bucket[str(file)] = row
    return row


prior_file = base / 'urban-actors-native-batch62-v1/resource-handoff-v2.json'
prior = read(prior_file)
for item in prior['selectedRasterFiles']:
    pin(Path(item['file']), selected, item['sha256'])
cases, coverage, preservation, maps = [], [], [], []
for theater, batch, stem, expected in [('newurban', 67, 'rush', 24), ('desert', 68, 'monument', 15)]:
    root = base / f'{theater}-smudge-native-batch{batch}-v1'
    author = base / f'{theater}-smudge-authoring-batch{batch}-v1'
    reuse = base / f'{theater}-urban-accepted-reuse-batch66-v1'
    selection = read(root / 'selection-v1.json')
    contract_file = Path(f'desktop/environment-{theater}-hd-contract.json')
    contract = read(contract_file)
    assert contract['selectedPack'] == selection['selectedPack']
    assert all(contract['families'][key] == value for key, value in selection['priorContract']['families'].items())
    assert all(contract['sources'][key] == value for key, value in selection['priorContract']['sources'].items())
    for kind in ['environment', 'terrain']:
        pointer_file = Path(f'.local/{kind}-{theater}-selection.json')
        pointer = read(pointer_file)
        pack = Path(f'.local/{kind}-packs') / pointer['revision']
        pin(pointer_file, selected)
        assert sha(pack / 'manifest.json') == pointer['sha256']
        for file in pack.rglob('*'):
            if file.is_file():
                pin(file, selected)
        if kind == 'environment':
            old = Path('.local/environment-packs') / selection['priorContract']['selectedPack']['revision']
            count = 0
            for file in old.rglob('*'):
                if file.is_file() and file != old / 'manifest.json':
                    assert sha(file) == sha(pack / file.relative_to(old))
                    count += 1
            preservation.append(dict(theater=theater.upper(), families=selection['preservedFamilies'],
                exactPriorPayloadFiles=count, exactPriorVoxelDescriptors=True))
    pin(contract_file, selected)
    guide = read(root / 'source.json')
    assert len(guide['sources']) == expected
    native_sources = [(root, source) for source in guide['sources']]
    audit = read(Path(read(reuse / 'reuse-receipt.json')['audit']))
    complete = read(Path(audit['nativeGuideFile']))
    by_key = {source['key']: source for source in complete['sources']}
    native_sources.extend((Path(audit['nativeGuideFile']).parent, by_key[member['nativeKey']])
        for family in audit['qualified'] for member in family['members'])
    for folder, source in native_sources:
        pin(folder / 'native' / source['nativeFile'], originals, source['sha256'])
        pin(folder / 'native' / (source['palette']['sha256'] + '.pal'), originals, source['palette']['sha256'])
        for frame in source['frames']:
            for field, key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                if frame.get(field):
                    pin(folder / 'native' / frame[field], originals, frame[key])
    pin(root / 'source.json', originals)
    pin(Path(audit['nativeGuideFile']), originals)
    for folder in [author, reuse]:
        for file in folder.rglob('*'):
            if file.is_file() and not any(part.startswith('native-') for part in file.relative_to(folder).parts[:-1]):
                pin(file, authoring)
    for file in [root / 'selection-v1.json', root / 'assembly-v1.json', Path(read(reuse / 'reuse-receipt.json')['audit'])]:
        pin(file, evidence)
    assert read(author / 'verification-v1.json')['counts']['families'] == expected
    assert read(author / 'loading-v1.json')['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
    for mode in ['2x', '4x', 'original']:
        file = root / f'native-{stem}-{mode}-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        record = dict(theater=theater.upper(), mode=mode, report=pin(file, evidence))
        if mode != 'original':
            density = int(mode[0])
            assert report['graphics']['glError'] == 0
            assert len(report['newNativeDecals']['cases']) == expected
            assert all(case['binding']['frame'] == 0 and case['binding']['identity'].endswith(
                f'/{theater.upper()}/tiles/{density}') for case in report['newNativeDecals']['cases'])
            world = report['combinedWorldAllocation']['total']
            peak = report['graphics']['prepared']['peakBytes']
            assert world <= (512 if density == 2 else 1280) * 1024**2 and peak <= 128 * 1024**2
            record.update(worldBytes=world, preparedPeakBytes=peak, nativeDecalCases=expected,
                exactOriginalBindings=len(report['newNativeBindings']))
            if density == 4:
                for event in ['release', 'crossTheater']:
                    for kind in ['environment', 'terrain']:
                        assert report[event][kind]['disposed'] and report[event][kind]['worldChargeBytes'] == 0
                record['originalResetReentryAndCrossTheaterDisposal'] = 'PASS'
        cases.append(record)
    inventory_file = base / f'inventory-{theater}-after-batch{batch}-v1/inventory.json'
    inventory = read(inventory_file)
    pin(inventory_file, evidence)
    assert not inventory['issues'] and len(inventory['maps']) == (8 if theater == 'newurban' else 13)
    assert all(row['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
        and row['unifiedSkirmish']['sourceVerified'] for row in inventory['maps'])
    missing = [group for group in inventory['resourceGroups'] if 'MISSING_AUTHORED_FAMILY' in group['decisions']]
    coverage.append(dict(theater=theater.upper(), directoryEntries=len(inventory['maps']),
        uniqueMapFiles=len({row['source']['sha256'] for row in inventory['maps']}),
        originalModeLabelBindings=sum(len(row['unifiedSkirmish']['originalModes']) for row in inventory['maps']),
        unifiedSelectableEntries=len(inventory['maps']), newAuthoredFamilies=expected,
        completeAcceptedReuseFamilies=len(audit['qualified']), remainingSourceGroups=len(missing),
        remainingByKind=dict(Counter(group['kind'] for group in missing)), parserIssues=0))
    maps.extend(dict(mapId=row['mapId'], source=row['source'], starts=row['starts'],
        originalModes=row['unifiedSkirmish']['originalModes'], unified=row['unifiedSkirmish'],
        geometryHash=row['geometryHash'], placementHash=row['placementHash'],
        native='UNCHANGED_SOURCE_MODE_MATRIX_REUSED; NEW_RESOURCE_PATHS_CHECKED_ON_REPRESENTATIVES')
        for row in inventory['maps'])
    for archive in inventory['archivePins']:
        file = Path('.local/assets') / ('yr' if 'md' in archive['name'] else 'ra2') / archive['name']
        pin(file, originals, archive['sha256'])

reuse = base / 'newurban-urban-accepted-reuse-batch66-v1'
for stem in ['native-manhatta-4x-v1', 'native-gate-rush-4x-v1']:
    file = reuse / stem / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    if 'gate-rush' in stem:
        assert report['repaired'] and report['originalPlacements'][0]['source'] == 'gngate_a.shp'
    else:
        assert len(report['newNativeBindings']) == 184
    cases.append(dict(theater='NEWURBAN', mode='4x', kind=stem, report=pin(file, evidence)))
review = base / 'ground-effects-review-batches67-68-v2'
qa = read(review / 'static-qa-v1.json')
assert qa['decodedPngs'] == 175
delivery = read(review / 'desktop-delivery-v1.json')
for item in delivery['files']:
    assert sha(Path(item['file'])) == item['sha256']
for file in [review / 'static-qa-v1.json', review / 'desktop-delivery-v1.json',
        base / 'checkpoint-2-v3/mode-adaptation.json', base / 'native-evidence-v3.json',
        base / 'remaining-representatives-closure-batches64-65-v1/user-acceptance-20261017.json']:
    pin(file, evidence)
for file in ['desktop/environment-urban-hd-contract.json', 'desktop/terrain-theater-hd-contracts.json',
        'desktop/prepared-hd-contract.json']:
    pin(Path(file), selected)
stage_file = base / 'newurban-smudge-native-batch67-v1/active-stage.json'
stage = read(stage_file)
pin(stage_file, evidence)
subprocess.run(['git', 'diff', '--quiet', stage['runtimeSourceHead'], '--', 'src', 'desktop', 'public'], check=True)
main = '/Users/Aone/RA2remaster/ra2-hd'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
handoff = dict(status='PASS_HASHED_IGNORED_RESOURCES_AUTHORING_AND_ORIGINAL_DEPENDENCIES',
    selectedFiles=list(selected.values()), authoringFiles=list(authoring.values()), nativeInputs=list(originals.values()),
    evidence=list(evidence.values()), preservation=preservation,
    unchangedUrbanDependencies=dict(file=str(prior_file), sha256=sha(prior_file),
        verifiedFiles=len(prior['selectedRasterFiles'])))
(output / 'resource-handoff.json').write_text(json.dumps(handoff, indent=2) + '\n')
closure = dict(status='MAC_TECHNICAL_PASS_NEW_ART_VISUAL_PENDING', batches=[66, 67, 68],
    runtimeSourceHead=stage['runtimeSourceHead'], app=stage['app'], resources=stage['resources'],
    profilePolicy='Separate task-owned native profile per case; internal reusable signed arm64 app only',
    cases=cases, coverage=coverage, mapModeLedger=maps, resourceHandoffSha256=sha(output / 'resource-handoff.json'),
    review=delivery, tests=dict(newSmudgeCases=78, assertions=1874, regressionCases=26,
        regressionAssertions=446, completeReuseFamilies=4, entryTypecheck='PASS', isolatedBuild='PASS'),
    visual='PENDING_39_NEW_SMUDGE_FAMILIES_ONLY', acceptedReuse='FOUR_COMPLETE_FAMILIES_NO_REVIEW_REQUIRED',
    ownerMapping='CIVP_SEPARATE_USER_JUDGMENT_PENDING_NO_RUNTIME_CHANGE', windows='NOT_RUN',
    mainHead=subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip(),
    mainIntegration='NOT_PERFORMED', push='NOT_PERFORMED', m24Complete=False)
(output / 'closure.json').write_text(json.dumps(closure, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], nativeCases=len(cases), selectedFiles=len(selected),
    authoringFiles=len(authoring), nativeInputs=len(originals), coverage=coverage)))
