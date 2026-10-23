"""Close the scoped repair with source, atlas, Mac, Desktop and ignored-resource pins."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
base = Path('.artifacts/m2-4')
root = base / 'urban-linked-alignment-r1-v1'
guide = base / 'urban-linked-native-batch61-v1'
review = base / 'urban-linked-alignment-review-r1-v1'
desktop = Path('/Users/Aone/Desktop/M2.4-Review-Urban-Linked-Alignment-R1-20261016')
html = review / 'M2.4-Urban-Linked-Alignment-R1-Embedded.html'
assert sha(html) == sha(desktop / html.name)
assert sha(html.with_suffix('.json')) == sha(desktop / html.with_suffix('.json').name)
qa_file = base / 'urban-linked-alignment-r1-embedded-desktop-qa-v2/report.json'
qa = read(qa_file)
assert qa['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_CONTROLS_AND_NATIVE_VIDEO_PLAYBACK'
assert not qa['errors'] and len(qa['videos']) == 25
verified = read(root / 'registration-verification-v4.json')
assert verified['status'] == 'PASS_FIXED_SURFACE_DRIFT_BODY_JOINS_AND_UNCHANGED_NATIVE_MOTION'
assert len(verified['densityFrameCases']) == 176
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
assert contract['selectedPack'] == verified['selectedPack'] == read(Path('.local/environment-urban-selection.json'))
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
pack = read(selected / 'manifest.json')
sources = {s['member']: s for s in read(guide / 'source.json')['sources']}
plan = read(root / 'native-plan.json')
old_closure = read(base / 'urban-linked-batch61-v1/native-closure.json')
old_reports = {r['file']: r['sha256'] for r in old_closure['nativeReports']}
reports, original, allocations, cpu, cycles, family_cases = [], [], {}, [], [], []
release_count = 0
for entry in plan['cases']:
    file = Path(entry['reusedOriginalReport'])
    assert sha(file) == old_reports[str(file)]
    original.append(pin(file))
    for density in [2, 4]:
        file = Path(f'{entry["output"]}-{density}x-v1/report.json')
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['edition'] == entry['edition'] and report['selectedMap'] == entry['runtimeName']
        assert report['selectedEnvironmentRevision'] == contract['selectedPack']['revision']
        assert report['linkedBuildingCycleSource']['sha256'] == sha(guide / 'source.json')
        for state in report['newNativeStates']['buildings']:
            name = state['normal']['name']
            family = contract['identities'][entry['edition']][name]
            members = pack['families'][family]['members']
            parts = [f'{m["sha256"]}/{sources[m["member"]]["sha256"]}/URBAN/tiles/{density}' for m in members]
            identity = 'environment-aggregate/' + '|'.join(parts)
            assert state['normal']['initial']['hd'] == state['normal']['hd'] == state['damaged']['hd'] == identity
            assert state['normal']['frame'] == 0 and state['damaged']['frame'] == 1
            assert state['destroyed']['destroyed'] and 'occupied' not in state
            published = report['environment']['families'][family]
            assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
            family_cases.append(dict(family=family, density=density, identity=identity))
        for cycle in report['linkedBuildingCycles']:
            assert cycle['status'] in ['PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN', 'PASS_ORIGINAL_NEUTRAL_UNPOWERED_IDLE']
            assert cycle['expectedPhases'] == sorted(c['phase'] for c in cycle['captures'])
            assert cycle['endTick'] > cycle['startTick'] and cycle['videoCapture']['timing'] == 'UNCHANGED_NATIVE_CLOCK'
            if not cycle['nativeIdle']:
                assert cycle['firstPhase'] == cycle['lastPhase']
            cycles.append(dict(member=cycle['member'], state=cycle['state'], density=density,
                status=cycle['status'], phases=cycle['expectedPhases'], fixture=cycle['fixture'],
                video=pin(file.parent / cycle['videoFile'])))
        allocation = report['combinedWorldAllocation']
        assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
        assert not report['prepared']['fallbacks']
        allocations[f'{entry["id"]}-{density}X'] = allocation['total']
        cpu.append(report['graphics']['prepared']['peakBytes'])
        if density == 4:
            for key in ['environment', 'terrain']:
                assert report['release'][key]['disposed']
                assert report['release'][key]['worldChargeBytes'] == report['release'][key]['gpuBytes'] == report['release'][key]['retainedCpuBytes'] == 0
            assert report['release']['currentEnvironment']['worldChargeBytes'] == report['release']['currentTerrain']['worldChargeBytes'] == 0
            release_count += 1
        reports.append(pin(file))
assert len(family_cases) == 6 and len(cycles) == 16 and release_count == 2
assert sum(c['status'].endswith('UNPOWERED_IDLE') for c in cycles) == 4
assert max(cpu) <= 128 * 1024 ** 2
stage = read(root / 'active-stage.json')
assert not subprocess.check_output(['git', 'diff', stage['runtimeSourceHead'], '--', 'src', 'desktop', 'public'], text=True).strip()
main = '/Users/Aone/RA2remaster/ra2-hd'
main_head = subprocess.check_output(['git', '-C', main, 'rev-parse', 'HEAD'], text=True).strip()
assert main_head == '748d0998aaf663acda8807c158155bf0a5bb157b'
assert not subprocess.check_output(['git', '-C', main, 'status', '--porcelain'], text=True).strip()
assert subprocess.check_output(['git', 'diff', '--name-only', '325a4ca4', '--', 'src', 'desktop', 'public'], text=True).splitlines() == [str(contract_file)]
prior_delta = base / 'urban-linked-batch61-v1/coverage-delta.json'
delta = read(prior_delta)
assert delta['remainingGapFamilies'] == 9
for archive in delta['archives']:
    assert sha(Path(archive['file'])) == archive['sha256']
delta = dict(delta, status='NO_NEW_COVERAGE_SCOPED_LINKED_ALIGNMENT_REPAIR',
    priorDelta=pin(prior_delta), selectedEnvironment=contract['selectedPack'], newCompleteSourceGroups=0, covered=[],
    visual='PENDING_THREE_REPORTED_FAMILIES', m24Complete=False)
with (root / 'coverage-delta.json').open('x') as stream:
    stream.write(json.dumps(delta, indent=2) + '\n')
assert len([p for p in selected.rglob('*') if p.is_file()]) == 2258
# Member manifests are payloads too; exclude only the root pack manifest.
payloads = {str(p.relative_to(selected)): sha(p) for p in sorted(selected.rglob('*')) if p.is_file() and p != selected / 'manifest.json'}
assert len(payloads) == 2257
manifest = read(review / 'review-manifest.json')
assert len(manifest['files']) == 66 and len(manifest['videoFiles']) == 25
for row in manifest['files'] + manifest['videoFiles']:
    assert sha(review / row['file']) == row['sha256']
tools = ['scripts/m2-4/register-urban-linked-fixed-surfaces.py', 'scripts/m2-4/verify-urban-linked-fixed-surfaces.py',
    'scripts/m2-4/review-urban-linked-alignment.py', 'scripts/m2-4/handoff-urban-linked-alignment.py',
    'scripts/m2-4/native-urban-rubble-batch.mjs', 'scripts/m2-4/embed-review.py', 'scripts/m2-4/verify-embedded-review.cjs']
result = dict(schema='m2-4-urban-linked-alignment-r1-handoff-v1', status='MAC_TECHNICAL_PASS_THREE_ALIGNMENT_CORRECTIONS_VISUAL_PENDING',
    userFeedback=pin(root / 'user-feedback.json'), reportedFamilies=['NAPSYA', 'NAPSYB damaged', 'CALA10'],
    runtimeSourceHead=stage['runtimeSourceHead'], mainHead=main_head, mainClean=True, mainChanged=False,
    toolsBaseHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), toolFiles=[pin(Path(p)) for p in tools],
    counts=dict(correctedMembers=3, correctedDensityFrames=176, completeFamilies=3, completeMembers=7,
        independentDensityFrames=276, preservedFamilies=281, preservedPayloadFiles=2220, selectedFiles=2258,
        nativeFamilyDensityCases=6, nativeFullLoopObservations=12, nativeOriginalIdleObservations=4,
        reusedOriginalMapReports=2, embeddedPngs=66, embeddedNativeRecordings=25, remainingUrbanSourceGroups=9),
    export=pin(root / 'export-fixed-v4.json'), registration=pin(root / 'registration-verification-v4.json'),
    independentVerification=pin(root / 'independent-verification-v4.json'),
    source=pin(guide / 'source.json'), sourceContract=pin(guide / 'contract.json'), selectedContract=pin(contract_file),
    inheritedArtAndSourceAuthority=pin(Path('docs/m2-4-urban-linked-batch61-20261016.json')),
    resourceHandoff=dict(policy='Complete ignored payload transfer with additive hash checks; source-only merge is not delivery.',
        root=str(selected.resolve()), manifest=pin(selected / 'manifest.json'), payloadHashes=payloads,
        masks=pin(root / 'fixed-surface-masks-v4.npz'), originalSourcesUnchanged=True, newArtworkGenerated=False),
    nativePlan=pin(root / 'native-plan.json'), nativeReports=reports, nativeCases=family_cases, nativeCycles=cycles,
    reusedOriginalReports=original, reusedOriginalPolicy='Source/range/state/fixture identities checked against exact previously passed report hashes. Original rendering was not changed or rerun; whole-scene deterministic pixel parity is not claimed.',
    worldAllocationBytes=allocations, preparedPeakBytes=max(cpu), releaseAndOriginalReentryCases=2,
    budgets=dict(world2XMiB=512, world4XMiB=1280, preparedCpuMiB=128, uiMiB=16),
    stage=pin(root / 'active-stage.json'), preparedRegistration=stage['preparedRegistration'],
    loadingTests=dict(passed=9, assertions=125, log=pin(root / 'loading-tests.log')),
    typecheck=pin(root / 'typecheck.log'), isolatedBuild=pin(root / 'build.log'),
    desktopReview=pin(desktop / html.name), embeddedMetadata=pin(desktop / html.with_suffix('.json').name),
    desktopQa=pin(qa_file), reviewManifest=pin(review / 'review-manifest.json'),
    noPerBatchMacGameCopy=True, retainedDiagnostics=pin(root / 'rejected-candidates.json'),
    retainedFirstDesktopQa=pin(base / 'urban-linked-alignment-r1-embedded-desktop-qa-v1/report.json'),
    desktopQaRepair='A 720-pixel native crop already fit in the wide test window; the old fit assertion incorrectly required shrinkage. Narrow the test viewport to verify fitting, then restore the native review window. Delivered HTML and artwork are unchanged.',
    retainedFirstReviewAssemblyFailure=pin(root / 'review-build.log'),
    reviewAssemblyRepair='The first board-count assertion omitted two boards caused by normal/damaged boundary separation. All generated media remained intact and were reused only after exact hash/pixel comparison.',
    sourceCoverageDelta=pin(root / 'coverage-delta.json'), originalArchives=delta['archives'],
    visual='PENDING_THREE_REPORTED_FAMILIES', otherBatchAcceptance='UNCHANGED', windows='NOT_RUN',
    localMainIntegration='NOT_PERFORMED', remotePush='NOT_PERFORMED', m24Complete=False)
with Path('docs/m2-4-urban-linked-alignment-r1-20261016.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], allocations=allocations, preparedPeak=max(cpu), reviewBytes=html.stat().st_size)))
