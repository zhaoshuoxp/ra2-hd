"""Close technical evidence and pin ignored resources without claiming visual acceptance."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2) + '\n'
base = Path('.artifacts/m2-4')
output = base / 'remaining-representatives-closure-batches64-65-v1'
output.mkdir(exist_ok=False)
selected, authoring, native_inputs, evidence = {}, {}, {}, {}


def pin(file, bucket, expected=None):
    assert file.is_file(), file
    digest = sha(file)
    assert expected is None or digest == expected, file
    row = dict(file=str(file), sha256=digest, bytes=file.stat().st_size)
    assert str(file) not in bucket or bucket[str(file)] == row
    bucket[str(file)] = row
    return row


prior_file = base / 'urban-actors-native-batch62-v1/resource-handoff-v2.json'
prior = read(prior_file)
for item in prior['selectedRasterFiles']:
    pin(Path(item['file']), selected, item['sha256'])
coverage, native_cases, modes, stages, preservation = [], [], [], [], []
for theater, batch, stem, expected_members, prior_families in [
    ('newurban', 64, 'rush', 114, 39), ('desert', 65, 'dune', 110, 43)]:
    root = base / f'{theater}-representative-native-batch{batch}-v1'
    tree = base / f'{theater}-tree-native-batch{batch}-v1'
    stage = pin(root / 'active-stage.json', evidence)
    stages.append(dict(theater=theater.upper(), **read(root / 'active-stage.json'), receipt=stage))
    selection = read(root / 'selection-v1.json')
    pin(root / 'selection-v1.json', evidence)
    assert selection['acceptedEnvironmentFamiliesPreserved'] == prior_families
    for kind in ['terrain', 'environment']:
        pointer_file = Path(f'.local/{kind}-{theater}-selection.json')
        pointer = read(pointer_file)
        assert pointer == selection['selected' + kind.capitalize()]
        pin(pointer_file, selected)
        pack = Path(f'.local/{kind}-packs') / pointer['revision']
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
            preservation.append(dict(theater=theater.upper(), families=prior_families, exactPriorPayloadFiles=count))
    for folder in [root, tree]:
        guide_file = folder / 'source.json'
        guide = read(guide_file)
        pin(guide_file, native_inputs)
        for source in guide['sources']:
            pin(folder / 'native' / source['nativeFile'], native_inputs, source['sha256'])
            palette = folder / 'native' / (source['palette']['sha256'] + '.pal')
            pin(palette, native_inputs, source['palette']['sha256'])
            for frame in source.get('images', source.get('frames', [])):
                for name, key in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
                    if frame.get(name):
                        pin(folder / 'native' / frame[name], native_inputs, frame[key])
    for kind in ['tmp', 'shp']:
        folder = base / f'{theater}-representative-{kind}-batch{batch}-v1'
        for file in folder.rglob('*'):
            if file.is_file():
                pin(file, authoring)
        for job in read(folder / 'imagegen-jobs.json')['jobs']:
            assert sha(Path(job['reference'])) == job['referenceSha256']
            assert read(folder / (job['id'] + '-capacity-v1.json'))['status'] == 'PASS'
    for mode in ['2x', '4x', 'original']:
        file = root / f'native-{stem}-{mode}-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        record = dict(theater=theater.upper(), mode=mode, report=pin(file, evidence))
        if mode != 'original':
            density = int(mode[0])
            groups = report['terrain']['groups']
            assert len(groups) == (4 if batch == 64 else 3)
            assert all(group['status'] == 'PUBLISHED' for group in groups)
            assert report['combinedWorldAllocation']['total'] <= (512 if density == 2 else 1280) * 1024**2
            assert report['graphics']['prepared']['peakBytes'] <= 128 * 1024**2
            assert len(report['urbanNativeTrees']['actions']) == 3
            assert all(action['removed']['destroyed'] and not action['removed']['spawned']
                for action in report['urbanNativeTrees']['actions'])
            record.update(worldBytes=report['combinedWorldAllocation']['total'],
                preparedPeakBytes=report['graphics']['prepared']['peakBytes'],
                terrainBindings=len(report['terrain']['placedBindings']),
                newPlantBindings=sum(object['name'].startswith('TREE') for object in report['newNativeBindings']))
            if density == 4:
                for key in ['environment', 'terrain']:
                    assert report['release'][key]['disposed'] and report['release'][key]['worldChargeBytes'] == 0
                    assert report['crossTheater'][key]['disposed'] and report['crossTheater'][key]['worldChargeBytes'] == 0
                record['originalResetAndCrossTheaterRelease'] = 'PASS'
        native_cases.append(record)
    inventory_file = base / f'inventory-{theater}-after-batch{batch}-v1/inventory.json'
    inventory = read(inventory_file)
    pin(inventory_file, evidence)
    assert not inventory['issues']
    maps = inventory['maps']
    assert len(maps) == (8 if batch == 64 else 13)
    assert all(row['runtimeEligibility'] == 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
        and row['unifiedSkirmish']['sourceVerified'] for row in maps)
    summary = next(row for row in inventory['theaters'] if row['theater'] == theater.upper())
    coverage.append(dict(theater=theater.upper(), directoryEntries=len(maps),
        uniqueMapSourceHashes=len({row['source']['sha256'] for row in maps}),
        originalModeLabelBindings=sum(len(row['unifiedSkirmish']['originalModes']) for row in maps),
        unifiedSelectableEntries=len(maps), newTerrainMembers=expected_members, newPlantMembers=3,
        remainingAuthoredGroups=summary['gapResources'], remainingByKind=summary['gapsByKind'],
        originalParserIssues=0,
        runtimeCaveat='Rush Hour CIVP original owner mapping remains a separate unresolved issue'
            if batch == 64 else 'Rejected road mothers remain unselected; all four source roads stay Original'))
    for row in maps:
        modes.append(dict(mapId=row['mapId'], source=row['source'], theater=theater.upper(),
            originalGameModes=row['unifiedSkirmish']['originalModes'], actualStarts=row['starts'],
            unified=row['unifiedSkirmish'], geometryHash=row['geometryHash'], placementHash=row['placementHash'],
            native='REUSE_UNCHANGED_SOURCE_MODE_MATRIX; NEW_RESOURCE_PATHS_VERIFIED_ON_REPRESENTATIVES'))
    for item in inventory['archivePins']:
        file = Path('.local/assets') / ('yr' if 'md' in item['name'] else 'ra2') / item['name']
        pin(file, native_inputs, item['sha256'])
    pin(Path(f'desktop/environment-{theater}-hd-contract.json'), selected)

for file in ['desktop/environment-urban-hd-contract.json', 'desktop/terrain-theater-hd-contracts.json',
             'desktop/prepared-hd-contract.json']:
    pin(Path(file), selected)
qa = read(base / 'remaining-representatives-review-batches64-65-v1/static-qa-v1.json')
assert qa['decodedPngs'] == 541
pin(base / 'remaining-representatives-review-batches64-65-v1/static-qa-v1.json', evidence)
for file in [base / 'checkpoint-2-v3/mode-adaptation.json', base / 'native-evidence-v3.json',
             base / 'remaining-theaters-accepted-reuse-native-matrix-v1.json']:
    pin(file, evidence)
owner_file = base / 'newurban-accepted-reuse-batch63-v1/native-plane-4x-v2/report.json'
owner = read(owner_file)
assert owner['status'] == 'PASS_SELECTED_NATIVE_CASES'
assert owner['sourcePlacementDiagnostic']['placementStatus'].startswith('UNRESOLVED_')
pin(owner_file, evidence)
for file in (base / 'newurban-accepted-reuse-batch63-v1').glob('*/report.json'):
    pin(file, evidence)  # Preserve the two actual failed original-placement checks as well.
handoff = dict(status='PASS_HASHED_IGNORED_SELECTED_RESOURCES_AUTHORING_AND_ORIGINAL_DEPENDENCIES',
    selectedFiles=list(selected.values()), authoringFiles=list(authoring.values()),
    nativeInputs=list(native_inputs.values()), evidence=list(evidence.values()),
    priorUrbanHandoff=dict(file=str(prior_file), sha256=sha(prior_file),
        verifiedSelectedFiles=len(prior['selectedRasterFiles'])), preservation=preservation,
    generation=dict(tool='Builtin imagegen', generatedMothers=30, selectedMothers=28,
        rejectedRoadMothers=2, ordinaryUpscalesClaimedAsNewArt=0),
    symlinkPolicy='Native guide aliases are recorded file by file with exact target bytes; final independent milestone transfer remains required.',
    packaging='Single reusable internal arm64 host with isolated task resources. Desktop receives HTML and JSON only. No per-batch app or resource copy.')
(output / 'resource-handoff.json').write_text(encode(handoff))
closure = dict(status='MAC_TECHNICAL_PASS_NEW_ART_VISUAL_PENDING', batches=[64, 65],
    runtimeStages=stages, nativeCases=native_cases, coverage=coverage, modeAdaptations=modes,
    newFamilies=13, newTerrainMembers=224, newPlantMembers=6, newDensityFrames=460,
    tests=dict(passed=28, assertions=471, entryTypecheck='PASS', isolatedBuild='PASS'),
    preservedPayloads=preservation, resourceHandoff=dict(file=str(output / 'resource-handoff.json'),
        sha256=sha(output / 'resource-handoff.json')),
    ownerMappingIssue=owner['sourcePlacementDiagnostic'],
    budgets=dict(world2x=512 * 1024**2, world4x=1280 * 1024**2, preparedCpu=128 * 1024**2, ui=16 * 1024**2),
    review=dict(file=str(base / 'remaining-representatives-review-batches64-65-v1'),
        htmlSha256=qa['htmlSha256'], embeddedPngs=541, staticQa='PASS', browser=qa['browserInteraction']),
    mainHead=subprocess.check_output(['git', '-C', '/Users/Aone/RA2remaster/ra2-hd', 'rev-parse', 'HEAD'], text=True).strip(),
    mainClean=not subprocess.check_output(['git', '-C', '/Users/Aone/RA2remaster/ra2-hd', 'status', '--porcelain'], text=True).strip(),
    visual='PENDING_BATCHES64_65_NEW_ART_ONLY', windows='NOT_RUN', localMainIntegration='NOT_PERFORMED',
    push='NOT_PERFORMED', m24Complete=False,
    remaining='NewUrban 730 and Desert 499 authored source groups, rejected Desert roads, CIVP owner mapping decision, other explicitly pending acceptance, final scope closure and independent Mac delivery.')
assert closure['mainClean']
(output / 'closure.json').write_text(encode(closure))
print(json.dumps(dict(status=closure['status'], selectedFiles=len(selected), authoringFiles=len(authoring),
    nativeInputs=len(native_inputs), cases=len(native_cases), coverage=coverage)))
