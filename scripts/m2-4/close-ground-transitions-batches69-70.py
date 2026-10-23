"""Close changed terrain paths and pin selected artwork, originals and review evidence."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
root = base / 'ground-transitions-closure-batches69-70-v1'
root.mkdir(exist_ok=False)
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
cases, coverage, modes, preservation = [], [], [], []
for theater, batch, stem, prior_groups in [('newurban', 69, 'rush', 4), ('desert', 70, 'dune', 3)]:
    native = base / f'{theater}-ground-transitions-native-batch{batch}-v1'
    author = base / f'{theater}-ground-transitions-authoring-batch{batch}-v1'
    revision = f'{theater}-m2-4-ground-transitions-batch{batch}-v1'
    selection = read(native / 'selection-v1.json')
    pointer = read(Path(f'.local/terrain-{theater}-selection.json'))
    assert pointer == selection['selectedTerrain']
    for kind in ['terrain', 'environment']:
        file = Path(f'.local/{kind}-{theater}-selection.json')
        pointer = read(file)
        if kind == 'environment':
            assert pointer == selection['environmentSelection']
        pin(file, selected)
        folder = Path(f'.local/{kind}-packs') / pointer['revision']
        assert sha(folder / 'manifest.json') == pointer['sha256']
        for file in folder.rglob('*'):
            if file.is_file():
                pin(file, selected)
    pack = Path('.local/terrain-packs') / revision
    prior_pack = Path('.local/terrain-packs') / selection['priorTerrain']['revision']
    before, after = read(prior_pack / 'manifest.json'), read(pack / 'manifest.json')
    assert len(before['groups']) == prior_groups and len(after['groups']) == prior_groups + 8
    assert after['groups'][:prior_groups] == before['groups']
    for group in before['groups']:
        for variant in group['variants']:
            assert sha(prior_pack / variant['file']) == sha(pack / variant['file']) == variant['sha256']
    preservation.append(dict(theater=theater.upper(), exactPriorGroups=prior_groups,
        environmentSelectionUnchanged=selection['environmentSelection']))
    guide_file = native / 'source.json'
    guide = read(guide_file)
    pin(guide_file, originals)
    for source in guide['sources']:
        pin(native / 'native' / source['nativeFile'], originals, source['sha256'])
        pin(native / 'native' / (source['palette']['sha256'] + '.pal'), originals, source['palette']['sha256'])
        for image in source['images']:
            pin(native / 'native' / image['file'], originals, image['rgbaSha256'])
    for file in author.rglob('*'):
        if file.is_file():
            pin(file, authoring)
    verification = read(author / revision / 'validation.json')
    quality = read(author / 'form-quality-v1.json')
    assert verification['newMembers'] == 152 and verification['independentDensityPairs'] == 304
    assert quality['status'] == 'PASS_SOURCE_FORMS_AND_AUTHORED_VARIATION'
    for job in read(author / 'imagegen-jobs.json')['jobs']:
        capacity = read(author / (job['id'] + '-capacity-v1.json'))
        assert capacity['status'] == 'PASS' and sha(Path(job['destination'])) == capacity['masterSha256']
        assert min(member['capacity'] for member in capacity['members']) > 5.9
    for file in [native / 'selection-v1.json', author / revision / 'validation.json', author / 'form-quality-v1.json']:
        pin(file, evidence)
    for mode in ['2x', '4x', 'original']:
        file = native / f'native-{stem}-{mode}-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        case = dict(theater=theater.upper(), mode=mode, report=pin(file, evidence))
        if mode != 'original':
            density = int(mode[0])
            assert len(report['requestedTerrainGroups']) == 8
            names = set(report['requestedTerrainGroups'])
            assert all(any(binding['group'] == name for binding in report['terrain']['placedBindings']) for name in names)
            assert all(group['status'] == 'PUBLISHED' for group in report['terrain']['groups'] if group['id'] in names)
            assert report['graphics']['glError'] == 0
            world, peak = report['combinedWorldAllocation']['total'], report['graphics']['prepared']['peakBytes']
            assert world <= (512 if density == 2 else 1280) * 1024**2 and peak <= 128 * 1024**2
            case.update(worldBytes=world, preparedPeakBytes=peak,
                newPlacedBindings=sum(binding['group'] in names for binding in report['terrain']['placedBindings']))
            if density == 4:
                for event in ['release', 'crossTheater']:
                    for kind in ['environment', 'terrain']:
                        assert report[event][kind]['disposed'] and report[event][kind]['worldChargeBytes'] == 0
                case['originalResetReentryAndCrossTheaterDisposal'] = 'PASS'
        cases.append(case)
    inventory_file = base / f'inventory-{theater}-after-batch{batch}-v1/inventory.json'
    inventory = read(inventory_file)
    pin(inventory_file, evidence)
    assert not inventory['issues'] and len(inventory['maps']) == (8 if theater == 'newurban' else 13)
    assert all(row['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
        and row['unifiedSkirmish']['sourceVerified'] for row in inventory['maps'])
    summary = next(row for row in inventory['theaters'] if row['theater'] == theater.upper())
    coverage.append(dict(theater=theater.upper(), directoryEntries=len(inventory['maps']),
        uniqueMapSourceHashes=len({row['source']['sha256'] for row in inventory['maps']}),
        originalModeLabelBindings=sum(len(row['unifiedSkirmish']['originalModes']) for row in inventory['maps']),
        selectableEntries=len(inventory['maps']), newGroups=8, newMembers=152,
        remainingSourceGroups=summary['gapResources'], remainingByKind=summary['gapsByKind'], parserIssues=0))
    modes.extend(dict(mapId=row['mapId'], source=row['source'], starts=row['starts'],
        originalModes=row['unifiedSkirmish']['originalModes'], unified=row['unifiedSkirmish'],
        geometryHash=row['geometryHash'], placementHash=row['placementHash'],
        native='UNCHANGED_MODE_SOURCE_SIMULATION_REUSED; ALL_NEW_GROUPS_NATIVE_VERIFIED_ON_ONE_SOURCE_MAP_PER_THEATER')
        for row in inventory['maps'])
    for item in inventory['archivePins']:
        pin(Path('.local/assets') / ('yr' if 'md' in item['name'] else 'ra2') / item['name'], originals, item['sha256'])
    pin(Path(f'desktop/environment-{theater}-hd-contract.json'), selected)

for file in ['desktop/terrain-theater-hd-contracts.json', 'desktop/environment-urban-hd-contract.json',
        'desktop/prepared-hd-contract.json']:
    pin(Path(file), selected)
review = base / 'ground-transitions-review-batches69-70-v1'
qa = read(review / 'static-qa-v1.json')
assert qa['decodedPngs'] == 688
delivery = read(review / 'desktop-delivery-v1.json')
for item in delivery['files']:
    assert sha(Path(item['file'])) == item['sha256']
for file in [review / 'static-qa-v1.json', review / 'desktop-delivery-v1.json',
        base / 'checkpoint-2-v3/mode-adaptation.json', base / 'native-evidence-v3.json',
        base / 'ground-effects-closure-batches66-68-v1/user-acceptance-20261017.json',
        base / 'ground-transitions-batches69-70-loading-v1.log',
        base / 'ground-transitions-batches69-70-typecheck-v2.log']:
    pin(file, evidence)
stage_file = base / 'newurban-ground-transitions-native-batch69-v1/active-stage.json'
stage = read(stage_file)
pin(stage_file, evidence)
pin(Path(stage['build']) / 'identity.json', evidence)
subprocess.run(['git', 'diff', '--quiet', stage['runtimeSourceHead'], '--', 'src', 'desktop', 'public'], check=True)
main = '/Users/Aone/RA2remaster/ra2-hd'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
handoff = dict(status='PASS_HASHED_SELECTED_RESOURCES_AUTHORING_ORIGINALS_AND_ACCEPTED_PRESERVATION',
    selectedFiles=list(selected.values()), authoringFiles=list(authoring.values()), nativeInputs=list(originals.values()),
    evidence=list(evidence.values()), preservation=preservation,
    acceptedUrbanDependencies=dict(file=str(prior_file), sha256=sha(prior_file), verifiedFiles=len(prior['selectedRasterFiles'])))
(root / 'resource-handoff.json').write_text(json.dumps(handoff, indent=2) + '\n')
closure = dict(status='MAC_TECHNICAL_PASS_NEW_ART_VISUAL_PENDING', batches=[69, 70],
    runtimeSourceHead=stage['runtimeSourceHead'], app=stage['app'], resources=stage['resources'],
    profilePolicy='Separate native case profiles; internal reusable signed Mac arm64 host',
    cases=cases, coverage=coverage, mapModeLedger=modes, resourceHandoffSha256=sha(root / 'resource-handoff.json'),
    review=delivery, tests=dict(loaderCases=42, assertions=832, entryTypecheck='PASS', isolatedBuild='PASS',
        nativeDensityCases=6, independentDensityPairs=608, wrongSourceHashPublicationRefusal='PASS'),
    visual='PENDING_16_NEW_GROUND_FAMILIES_ONLY', windows='NOT_RUN',
    ownerMapping='CIVP_SEPARATE_USER_JUDGMENT_PENDING_UNCHANGED',
    mainHead=subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip(),
    mainIntegration='NOT_PERFORMED', push='NOT_PERFORMED', m24Complete=False)
(root / 'closure.json').write_text(json.dumps(closure, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], nativeCases=len(cases), selectedFiles=len(selected),
    authoringFiles=len(authoring), nativeInputs=len(originals), coverage=coverage)))
