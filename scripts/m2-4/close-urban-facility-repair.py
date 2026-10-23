"""Close only the two authorized facility gaps after actual Mac source/state and release evidence."""
import collections
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
root = Path('.artifacts/m2-4/urban-placeholder-hd-repair-v1')
contract = read(Path('desktop/environment-urban-hd-contract.json'))
patch = read(root / 'prepared/contract.json')
plan = read(root / 'native-plan-v1.json')
pack_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(pack_root / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 262
cases, reports, allocations, peaks = [], [], {}, []
for entry in plan['cases']:
    for density in [2, 4]:
        file = Path(f"{entry['output']}-{density}x-v1/report.json")
        r = read(file)
        assert r['status'] == 'PASS_SELECTED_NATIVE_CASES' and not r['errors']
        assert r['selectedMap'] == entry['runtimeName'] and r['edition'] == entry['edition']
        assert r['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
        states = r['newNativeStates']
        assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert {s['normal']['name'] for s in states['buildings']} == {'CALIT01E', 'CAPOL01S'}
        for row in states['buildings']:
            name = row['normal']['name']
            family = patch['identities'][entry['edition']][name]
            member, = pack['families'][family]['members']
            source = patch['sources'][member['member']]
            identity = f"environment-aggregate/{member['sha256']}/{source['sha256']}/URBAN/tiles/{density}"
            assert row['normal']['initial']['hd'] == identity
            assert r['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
            assert not r['environment']['families'][family]['attempts']
            for state in ['normal', 'damaged']:
                assert row[state]['hd'] == identity and row[state]['frame'] == 0
                assert row[state + 'Capture']['rescaled'] is False
            assert not row['normal']['canOccupy'] and not row['normal']['leaveRubble']
            assert row['destroyed']['destroyed'] and 'occupied' not in row
            cases.append(dict(edition=entry['edition'], map=entry['runtimeName'], family=family, density=density,
                member=member['member'], sourceSha256=source['sha256'], identity=identity, nativeFrame=0,
                originalOneFrameDamageSupport=True, originalNoGarrisonOrRubble=True))
        assert not states['evacuation'] and not states['criticalDamageEvacuation']
        if density == 4:
            for key in ['environment', 'terrain']:
                assert r['release'][key]['disposed'] and r['release'][key]['worldChargeBytes'] == 0
                assert r['release']['current' + key.title()]['worldChargeBytes'] == 0
        a = r['combinedWorldAllocation']
        assert a['total'] <= a['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert r['graphics']['glError'] == 0
        allocations[f"{entry['edition']}-{density}X"] = a['total']
        peaks.append(r['graphics']['prepared']['peakBytes'])
        reports.append(pin(file))
    original_file = Path(entry['output'] + '-original-v1/report.json')
    original = read(original_file)
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
    assert original['selectedMap'] == entry['runtimeName'] and original['captureRoute'] == r['captureRoute']
    reports.append(pin(original_file))
assert len(cases) == 8 and max(peaks) <= 128 * 1024 ** 2
prior_file = Path('.artifacts/m2-4/urban-buildings-batch59-v1/coverage-delta.json')
prior = read(prior_file)
covered = [r for r in prior['remainingGaps'] if r['member'] in patch['sources'] and r['sha256'] == patch['sources'][r['member']]['sha256']]
assert len(covered) == 2
keys = {r['key'] for r in covered}
remaining = [r for r in prior['remainingGaps'] if r['key'] not in keys]
assert len(remaining) == 31
for archive in prior['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
assembly_file = root / 'assembly-v1.json'
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 260 and len(assembly['appendedFamilies']) == 2
for name, digest in assembly['payloadHashes'].items():
    assert sha(pack_root / name) == digest
main = Path('/Users/Aone/RA2remaster/ra2-hd')
assert subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip() == '748d0998aaf663acda8807c158155bf0a5bb157b'
assert not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
assert not subprocess.check_output(['git', 'diff', '8ab17291', '--', 'src', 'desktop', 'public'], text=True).strip()
closure = dict(status='PASS_TWO_AUTHORIZED_FACILITY_REPAIRS_MAC_NATIVE_STATES_ORIGINAL_AND_RELEASE',
    runtimeSourceHead=read(root / 'active-stage.json')['runtimeSourceHead'], selectedEnvironment=contract['selectedPack'],
    authorization=pin(root / 'user-authorization.json'), verification=pin(root / 'verification-v1.json'),
    negativeControl=pin(root / 'negative-unexpected-board-alpha-v1.json'), nativeReports=reports, cases=cases,
    worldAllocationBytes=allocations, preparedPeakBytes=max(peaks), priorFamiliesPreserved=260,
    selectedFamilies=262, selectedFiles=len(assembly['payloadHashes']) + 1, newBodyStates=2, newDensityFrames=4,
    originalSourceFilesChanged=False, originalShadowFilesChanged=False, originalMapsChanged=False,
    runtimeApplicationCodeChanged=False, originalFallbackChanged=False, gameplayGeometryChanged=False,
    visual='PENDING_WITH_NEXT_GROUPED_REVIEW', windows='NOT_RUN', m24Complete=False)
delta = dict(status='PASS_INCREMENTAL_AUTHORIZED_FACILITY_REPAIRS_VISUAL_PENDING', priorDelta=pin(prior_file),
    baseline=prior['baseline'], selectedEnvironment=contract['selectedPack'], selectedTerrain=prior['selectedTerrain'],
    totalUrbanMapEntries=32, uniqueUrbanMapHashes=26, newCompleteSourceGroups=2, covered=covered,
    remainingGapFamilies=31, remainingByKind=dict(collections.Counter(r['kind'] for r in remaining)),
    remainingGaps=remaining, archives=prior['archives'], unchangedMapBytes=True, unchangedDependencyKeys=True,
    formerPlaceholderBlocker='Technically repaired after explicit user authorization; HD visual acceptance remains open.',
    visual=closure['visual'], windows='NOT_RUN', m24Complete=False)
for name, value in [('native-closure.json', closure), ('coverage-delta.json', delta)]:
    with (root / name).open('x') as f:
        f.write(json.dumps(value, indent=2) + '\n')
doc = Path('docs/m2-4-urban-facility-placeholder-repair-20261016.json')
with (root / 'production-checkpoint-before-native-closure.json').open('xb') as f:
    f.write(doc.read_bytes())
d = read(doc)
d.update(status='MAC_TECHNICAL_PASS_VISUAL_PENDING_GROUPED_REVIEW', nativeClosure=pin(root / 'native-closure.json'),
    coverageDelta=pin(root / 'coverage-delta.json'), technicalCoverageAdded=2, remainingUrbanGroups=31,
    resourceHandoff=dict(selectedRoot=str(pack_root.resolve()), selectedManifest=pin(pack_root / 'manifest.json'),
        payloadHashes=assembly['payloadHashes'], sourceContract=pin(root / 'prepared/contract.json'),
        originalSources=pin(root / 'prepared/source.json'), assembly=pin(assembly_file)),
    stage=pin(root / 'active-stage.json'), mainClean=True, mainWasMutated=False)
doc.write_text(json.dumps(d, indent=2) + '\n')
print(json.dumps(dict(status=closure['status'], remaining=delta['remainingByKind'], allocations=allocations)))
