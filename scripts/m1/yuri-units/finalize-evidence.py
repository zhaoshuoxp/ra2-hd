"""Group verified native cases, preserve failed runs, and finalize a portable review bundle."""
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

root = Path.cwd().resolve()
art = root / '.artifacts/yuri-units'
read = lambda name: json.loads((art / name / 'report.json').read_text())
write = lambda path, data: path.write_text(json.dumps(data, indent=2) + '\n')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
names = ['runtime-bindings-yr-4x-v8', 'runtime-bindings-yr-2x-v1', 'runtime-bindings-yr-snow-2x-v1',
         'runtime-ra2-negative-v1', 'runtime-actions-infantry-v1', 'runtime-actions-special-v1',
         'runtime-actions-disk-miner-v4', 'runtime-states-v1', 'runtime-suppression-v1']
reports = {name: read(name) for name in names}
for name in names[:4] + names[-2:]:
    assert reports[name]['status'] == 'PASS_SELECTED_NATIVE_CASES', name
for report in reports.values():
    assert not report['errors']
    assert not report.get('consoleErrors'), 'Handled engine errors must remain visible and fail validation'
assert reports['runtime-actions-disk-miner-v4']['families']['SMIN']['status'] == 'PASS_SELECTED_NATIVE_ACTIONS'
assert reports['runtime-actions-disk-miner-v4']['families']['SMIN']['nativeUndeployMobileHd']['vxlHd']
assert reports['runtime-actions-disk-miner-v4']['families']['DISK']['nativePowerDrain']
assert reports['runtime-actions-disk-miner-v4']['families']['DISK']['status'] == 'FAIL'
for name in ['LTNK', 'YTNK', 'TELE', 'MIND', 'CAOS', 'BSUB', 'YHVR', 'PCV', 'VIRUS', 'YURIPR']:
    assert reports['runtime-actions-special-v1']['families'][name]['status'] == 'PASS_SELECTED_NATIVE_ACTIONS', name
for name in ['INIT', 'BRUTE']:
    assert reports['runtime-actions-infantry-v1']['families'][name]['status'] == 'PASS_SELECTED_NATIVE_ACTIONS'

package = json.loads((art / 'package-v3/package-receipt.json').read_text())
review = Path(package['folder']) / 'Review'
review.mkdir(exist_ok=False)
runtime_paths = []
for name, report in reports.items():
    source = art / name; destination = review / name; destination.mkdir()
    families = report.get('families', {})
    selected = {identity: value for identity, value in families.items() if value['status'] == 'PASS_SELECTED_NATIVE_ACTIONS'}
    if name == 'runtime-actions-infantry-v1':
        selected = {identity: value for identity, value in selected.items() if identity in ['INIT', 'BRUTE']}
    if name == 'runtime-actions-special-v1':
        selected.pop('SMIN', None)
    selected_clips = [Path(value['clip']) for value in selected.values() if value.get('clip')]
    if not families:
        selected_clips = [Path(clip) for clip in report.get('clips', [])]
    if name == 'runtime-actions-disk-miner-v4':
        selected_clips.append(source / 'DISK-partial.webm')
    prefix = tuple(selected) if families else ()
    pictures = list(source.glob('*-detail.png'))
    if prefix:
        pictures = [picture for picture in pictures if picture.name.startswith(prefix)]
    pictures += list(source.glob('mixed-native-bindings.png'))
    for file in [*selected_clips, *pictures]:
        assert file.exists(), file
        shutil.copy2(file, destination / file.name)
    failures = {identity: value.get('failure') for identity, value in families.items() if value['status'] != 'PASS_SELECTED_NATIVE_ACTIONS'}
    compact = {key: value for key, value in report.items() if key not in ['traces', 'stages', 'families', 'clips', 'projectiles']}
    compact.update({'sourceRunStatus': report['status'], 'sourceReport': str(source / 'report.json'),
        'sourceReportSha256': sha(source / 'report.json'), 'families': selected, 'excludedSourceCases': failures,
        'clips': [str((destination / file.name).resolve()) for file in selected_clips]})
    if failures:
        compact['status'] = 'PASS_SELECTED_RECORDED_CASES_WITH_EXPLICIT_SOURCE_FAILURES'
    write(destination / 'report.json', compact)
    runtime_paths.append(str(destination))

review_html = review / 'Yuri-Units-Full-Review-v2.html'
subprocess.run(['python3', 'scripts/m1/yuri-units/full-review.py', str(review_html), '--runtime', *runtime_paths], check=True)
ledger = json.loads((art / 'ledger.json').read_text())
bindings = {row['name']: row for row in reports[names[0]]['bindings']}
exceptions = [
    {'identity': 'YURIPR', 'state': 'PsiWave deployment', 'status': 'UPSTREAM_GAMEPLAY_EXCEPTION',
     'detail': 'The baseline PsiWave path can destroy the caster. Native movement and mind control are verified; no PsiWave gameplay repair or PASS claim.'},
    {'identity': 'DISK', 'state': 'Refinery money payment', 'status': 'NATIVE_RUNTIME_FAILURE_RECORDED',
     'detail': 'Native refinery drain is acquired briefly, but no payment is observed. The continuous drain range check ends it before DrainMoneyFrameDelay. Flight, HD body/turret and power blackout are verified. No gameplay/rules change.',
     'evidence': str(art / 'runtime-actions-disk-miner-v4/report.json'),
     'diagnosis': 'Observed drain at ticks 838 and 842, actor tile 59/85, refinery tile 55/84, unchanged credits 10000. Flight/attack versus continuous drain range mismatch is an inference; final money collection remains failed.'}]
status = 'COMPLETE_RESOURCES_SELECTED_NATIVE_RUNTIME_WITH_EXPLICIT_EXCEPTIONS'
ledger.update({'status': status, 'technicalStatus': 'PASS_COMPLETE_RESOURCES_AND_SELECTED_RUNTIME_WITH_EXCEPTIONS',
    'visualStatus': 'FULL_BATCH_REVIEW_READY', 'userAcceptance': 'REPRESENTATIVE_AND_INIT_ARM_ACCEPTED_FULL_BATCH_PENDING',
    'runtimeStatus': 'SELECTED_SUPPORTED_STATES_VERIFIED_EXCEPTIONS_RECORDED', 'integration_status': 'NOT_MERGED',
    'disclosure': 'Roster audit uses native rules and controlled prerequisite/stolen-tech fixtures. INIT/LTNK additionally pass actual native production queues. Native action fixtures are disclosed; final human and integrated C+D acceptance remain pending.',
    'runtimeExceptions': exceptions, 'review': str(review_html)})
for row in ledger['rows']:
    if row.get('included'):
        row['activation'] = {'status': 'COMPLETE_FAMILY_BOUND_IN_COPIED_APP', 'edition': 'yr', 'densities': [2, 4],
            'complete': True, 'nativeBinding': bindings[row['id']]}
        row['coverage'] = 'ACCEPTED_REUSE_SOURCE_MATCH' if row.get('reuse') else 'COMPLETE_AUTHORED_FAMILY_REVIEW_PENDING'
        row['tests'].update({'runtime': 'PASS_ACTUAL_2X_4X_AND_SNOW_BINDINGS', 'nativeGameplay': 'SELECTED_CASES_OR_ACCEPTED_REUSE'})
        row['acceptance'] = 'ACCEPTED_REUSE' if row.get('reuse') else 'FULL_BATCH_HUMAN_REVIEW_PENDING'
        if row.get('reuse'):
            row['reuse'].update({'status': 'VERIFIED_SOURCE_MATCHED_RUNTIME_REUSE', 'missingBinding': False})
    else:
        row['activation'] = 'NOT_ADDED_TO_YURI_ROSTER_BASELINE_UNCHANGED'
write(art / 'ledger.json', ledger)
world = {}
for name in names[:3]:
    report = reports[name]; allocation = report['worldAllocation']
    peak = allocation['baseline'] + allocation['eager'] + report['allocations']['peakBytes']
    assert peak <= allocation['limit']
    world[name] = {**allocation, 'peakTotalBytes': peak, 'beforeReleaseDemand': report['beforeRelease'],
        'afterReleaseDemand': report['afterRelease']}
catalog = json.loads((root / 'desktop/yuri-unit-contracts.json').read_text())
acceptance = {'schemaVersion': 1, 'taskId': 'D', 'status': status, 'edition': 'yr',
    'baseMainSha': ledger['baseMainSha'], 'branch': 'task/d-yuri-units-hd', 'worktree': str(root),
    'runtimeSourceHead': package['runtimeSourceHead'], 'packageReceipt': str(art / 'package-v3/package-receipt.json'),
    'review': str(review_html), 'app': package['app'], 'resources': package['resources'],
    'technicalStatus': ledger['technicalStatus'], 'visualStatus': ledger['visualStatus'], 'userAcceptance': ledger['userAcceptance'],
    'platformStatus': {'macOSArm64': 'ACTUAL_COPIED_APP_NATIVE_CASES_VERIFIED', 'signing': 'LOCAL_AD_HOC', 'windows': 'NOT_RUN'},
    'integration_status': 'NOT_MERGED', 'counts': {'candidates': 22, 'roots': 19, 'newRoots': 14, 'acceptedReuse': 5,
        'requiredChildren': 2, 'newShpMembers': 5, 'newShpBodyFrames': 1464, 'vxlParts': 19, 'authoredVxlHeadings': 152,
        'newRuntimeResourceFiles': 140, 'newRuntimeResourceBytes': 46164338},
    'roots': list(bindings), 'acceptedReuse': ['YURI', 'CCOMAND', 'PTROOP', 'CIVAN', 'YENGINEER -> SENGINEER'],
    'children': ['SMIN -> SLAV', 'BSUB -> CMISL (bsubmisl.vxl/HVA)'],
    'candidateExclusions': [{'id': row['id'], 'gates': row['gates']} for row in ledger['rows'] if not row.get('included')],
    'rosterLedger': str(art / 'ledger.json'), 'catalog': 'desktop/yuri-unit-contracts.json',
    'structuralValidation': str(art / 'installed-resource-validation-v2.json'),
    'structuralCases': {'sourceDensityCases': 30, 'uploads': 171, 'disposals': 171, 'fallbackCases': 2},
    'tests': {'sharedFamilyAndReuse': '13 PASS / 351 expectations', 'registration': 'PASS / 15 expectations',
        'animationAndAcceptedControl': '4 PASS / 94 expectations', 'entryTypecheck': 'PASS',
        'offlineReviewUi': str(art / 'full-review-ui-v1/result.json')},
    'runtimeReports': [{'name': name, 'status': report['status'], 'path': str(art / name / 'report.json'),
        'sha256': sha(art / name / 'report.json')} for name, report in reports.items()],
    'runtimeExceptions': exceptions, 'worldAllocation': world, 'combinedCPlusDMemoryAcceptance': 'PENDING_INTEGRATION',
    'deploymentInterfaces': [{key: value for key, value in interface.items() if key not in ['buildingRules', 'buildingArtContract']}
        for interface in ledger['interfaces']],
    'peerDependencies': {'C': 'Stationary YAREFN/YACNST art and shared turret/transform/allocation validation; isolated D uses Original buildings.',
        'E': 'Use stable rules identities and D accepted master provenance for cameos; no E art imported.',
        'alliedBugfix': 'No peer cherry-pick; preserve rooftop/Prism/sidebar/deployed-GI repairs when merging shared loader/profile changes.',
        'mainAdvancement': 'Merge additive semantics into current main; never replace its entire catalog/profile with this older baseline.'},
    'sourceAuthenticity': ledger['sourceAuthenticity'], 'sourceInputs': ledger['sourceInputs'],
    'nativeGameplayScope': 'Controlled native fixtures. Actual INIT/LTNK factory production is evidenced; no blanket natural-match/stolen-tech production claim.',
    'artDirection': 'Native silhouette, pose, anatomy and components govern each independently authored heading/frame. Representative review and focused arm correction were accepted; full batch remains for human review.',
    'ignoredResourceTransferRequired': True}
write(root / 'docs/yuri-units-final-acceptance.json', acceptance)
write(review / 'final-acceptance.json', acceptance)
print(json.dumps({'status': status, 'review': str(review_html), 'exceptions': len(exceptions)}))
