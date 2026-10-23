"""Pin R5 native evidence and retain prior accepted art and immutable deliveries."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path.cwd().resolve()
ART = ROOT / '.artifacts/yuri-units'
R5 = ART / 'feedback-r5'
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


package_file = R5 / 'package-v2/package-receipt.json'
package = read(package_file)
review = read(R5 / 'review-receipt-v3.json')
validation = read(R5 / 'review-media-validation-v3/report.json')
preservation = read(R5 / 'preservation-v1.json')
transparency = read(R5 / 'transparency-validation-v3.json')
assert sha(Path(review['html'])) == review['sha256']
assert validation['status'] == 'PASS_EMBEDDED_MEDIA_DECODE_AND_STATIC_STRUCTURE'
assert len(validation['embeddedVideosDecoded']) == 2 and validation['externalResources'] == 0
assert preservation['unchangedResourceFiles'] == 2718 and preservation['unchangedMasterFiles'] == 176
assert transparency['changedPixelsOutside25pxFieldEnvelope'] == 0
runtime = []
for density in [2, 4]:
    path = R5 / f'runtime-tele-{density}x-v3/report.json'
    report = read(path)
    case = report['corrections']['TELE']
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
    assert not report['errors'] and not report['handledErrors'] and not report['consoleErrors']
    assert report['app'] == package['app'] and report['resources'] == package['resources']
    assert case['actualDensity'] == density and case['binding']['vxlHd']
    assert report['worldAllocation']['total'] <= report['worldAllocation']['limit']
    runtime.append({'density': density, 'path': str(path), 'sha256': sha(path),
                    'status': report['status'], 'worldAllocation': report['worldAllocation'],
                    'case': {key: value for key, value in case.items() if key != 'effects'}})

status = 'R5_TELE_TRANSLUCENT_ATTACHMENTS_NATIVE_PASS_VISUAL_PENDING'
selected = {
    'schemaVersion': 1, 'taskId': 'D', 'revision': 'R5', 'status': status,
    'runtimeSourceHead': package['runtimeSourceHead'], 'packageReceipt': str(package_file),
    'packageReceiptSha256': sha(package_file), 'app': package['app'], 'resources': package['resources'],
    'review': review['html'], 'reviewSha256': review['sha256'], 'nativeEvidenceRevision': 3,
    'reference': {'path': str(R5 / 'TELE-user-retail-reference.png'),
                  'sha256': sha(R5 / 'TELE-user-retail-reference.png'), 'unchangedUserImage': True},
    'runtimeReports': runtime, 'drawingBuffer': [3840, 2160],
    'changeScope': {'logicalWidth': 10, 'opacityRange': [.38, .64], 'violet': '#8744df', 'lavender': '#b479f5',
                    'source': 'Selected live HD paired-barrel midpoint; full native FLH and mount fallback.',
                    'contact': 'Visible lower HD silhouette or projected front bottom native hull outline.',
                    'latestFeedback': 'Deeper, more visible purple while remaining translucent.'},
    'nativeFixtureDisclosure': 'Native TELE attack, lift, horizontal pull and active stop against an Original HTNK. The supplied retail reference uses a ship. HD victim attachments have focused geometry/alpha tests, not a new native HD-victim run.',
    'preservedNativeBehavior': 'Targeting, lift/pull motion, timings, rules, logical geometry and camera unchanged.',
    'tests': {'focusedEffectsAndMindControl': '20 PASS / 128 expectations', 'entryTypecheck': 'PASS'},
    'transparencyValidation': {'path': str(R5 / 'transparency-validation-v3.json'), **transparency},
    'media': {'embeddedVideoCount': 2, 'manifest': str(R5 / 'embedded-media-v3/manifest.json'),
              'validation': str(R5 / 'review-media-validation-v3/report.json'), 'status': validation['status'],
              'clips': validation['embeddedVideosDecoded'], 'interactiveBrowserUi': 'NOT_RUN'},
    'preservation': {'path': str(R5 / 'preservation-v1.json'), **preservation},
    'humanOtherR3VisualAcceptance': 'USER_ACCEPTED', 'humanCleanArtAcceptance': 'USER_ACCEPTED',
    'humanTeleR4VisualAcceptance': 'USER_REJECTED', 'humanTeleR5VisualAcceptance': 'PENDING',
    'supersededEvidence': str(R5 / 'superseded-v1.json'), 'integration_status': 'NOT_MERGED',
    'signing': 'LOCAL_AD_HOC_VERIFIED', 'windows': 'NOT_RUN',
    'integrationManifest': str(ART / 'integration-resource-manifest-v8.json'),
    'finalDeliveryReceipt': str(R5 / 'package-v2/final-delivery-receipt-v1.json'),
    'archiveReceipt': str(R5 / 'delivery-v3/archive-receipt.json'),
    'runtimeExceptions': ['DISK refinery money payment', 'YURIPR PsiWave caster destruction'],
}
write(ROOT / 'docs/yuri-units-feedback-r5.json', selected)
file = ROOT / 'docs/yuri-units-final-acceptance.json'
acceptance = read(file)
acceptance.setdefault('preservedR4Delivery', {key: acceptance[key] for key in
    ['runtimeSourceHead', 'packageReceipt', 'review', 'app', 'resources']})
acceptance['preservedR4Delivery'].update({'machineReport': 'docs/yuri-units-feedback-r4.json',
    'machineReportSha256': sha(ROOT / 'docs/yuri-units-feedback-r4.json'), 'teleVisual': 'USER_REJECTED'})
acceptance['feedbackR5'] = selected
for key in ['status', 'runtimeSourceHead', 'packageReceipt', 'review', 'app', 'resources']:
    acceptance[key] = selected[key]
acceptance['technicalStatus'] = 'R5_SELECTED_NATIVE_TELE_2X_AND_4X_PASS_RETAINED_R3_EVIDENCE'
acceptance['visualStatus'] = acceptance['userAcceptance'] = 'ALL_OTHER_R3_VISUALS_USER_ACCEPTED_TELE_R5_PENDING'
acceptance['artDirection'] = 'All other R3 visuals and clean MIND/LTNK/YTNK mothers are user accepted. Only the corrected R5 TELE field awaits visual acceptance.'
acceptance['reviewMedia'].update({'status': 'SELF_CONTAINED_HTML_EMBEDDED_REPLAYS', 'embeddedVideoCount': 2,
                                'previewManifest': selected['media']['manifest'], 'interactiveBrowserUi': 'NOT_RUN'})
write(file, acceptance)
ledger_file = ART / 'ledger.json'
ledger = read(ledger_file)
ledger.update({'status': status, 'review': selected['review'], 'feedbackR5': selected})
for key in ['technicalStatus', 'visualStatus', 'userAcceptance']:
    ledger[key] = acceptance[key]
for row in ledger['rows']:
    if row['id'] == 'TELE':
        row['feedbackR5'] = {'runtime': 'PASS_SELECTED_NATIVE_2X_AND_4X', 'visual': 'USER_REVIEW_PENDING',
                             'priorR4Visual': 'USER_REJECTED', 'receipt': str(ROOT / 'docs/yuri-units-feedback-r5.json')}
write(ledger_file, ledger)
page = ROOT / 'docs/yuri-units-final-handoff.md'
page.write_text('# R5 TELE translucency and visible attachment correction\n\n'
    'The selected R5 app deepens the purple while keeping 38 to 64 percent coverage, emits between the paired barrel tips and contacts the enemy visible bottom outline. Both copied-app native 2x/4x cases pass lift, horizontal pulling and active-stop cleanup. The same-frame hidden-field diagnostic confirms only field pixels change. Read `docs/yuri-units-feedback-r5.json` for exact runtime, package and evidence identities.\n\n'
    'The standalone review embeds two fully decoded videos, the unchanged retail reference, both-density gameplay, source/contact crops and a same-frame transparency comparison. Static media checks pass; interactive browser UI validation is NOT_RUN. All 2,718 resources, 178 Yuri transfer files, 176 masters and the prior signed app payload remain unchanged. Other R3 visuals and clean mothers retain user acceptance. R4 TELE is superseded after rejection; R5 TELE visual acceptance remains pending. Continue correction and acceptance in this execution conversation. Main integration and Windows validation remain separate. Older delivery sections below are preserved history.\n\n' + page.read_text())
notes = ROOT / 'docs/yuri-units-feedback-r5.md'
notes.write_text(notes.read_text() + '\nSelected evidence: runtime source `' + package['runtimeSourceHead'] + '`, package-v2 and native evidence-v3. Twenty focused tests pass 128 expectations, entry type checking passes, and both native 2x/4x cases pass with no recorded game errors. The review contains 11 figures and two embedded videos, fully decoded before delivery. The same-frame diagnostic changes 8,622 pixels and none outside the field envelope. Main integration is NOT_MERGED; TELE human visual acceptance is PENDING.\n')
directory = Path(package['folder']) / 'Review'
for density in [2, 4]:
    native = directory / f'Native-{density}x'
    native.mkdir()
    report = read(R5 / f'runtime-tele-{density}x-v3/report.json')
    for clip in report['clips']:
        shutil.copy2(clip, native / Path(clip).name)
    shutil.copy2(R5 / f'runtime-tele-{density}x-v3/report.json', native / 'report.json')
for source, name in [(ROOT / 'docs/yuri-units-feedback-r5.json', 'feedback-r5.json'),
                     (ROOT / 'docs/yuri-units-final-acceptance.json', 'final-acceptance.json'),
                     (ROOT / 'docs/yuri-units-feedback-r5.md', 'feedback-r5.md'),
                     (R5 / 'preservation-v1.json', 'preservation.json'),
                     (R5 / 'transparency-validation-v3.json', 'transparency-validation.json'),
                     (R5 / 'review-media-validation-v3/report.json', 'media-validation.json'),
                     (R5 / 'embedded-media-v3/manifest.json', 'media-manifest.json'),
                     (R5 / 'TELE-user-retail-reference.png', 'TELE-retail-reference.png'),
                     (R5 / 'superseded-v1.json', 'superseded-probes.json'),
                     (ART / 'feedback-r4/r3-user-acceptance-v1.json', 'r3-scoped-acceptance.json')]:
    assert not (directory / name).exists()
    shutil.copy2(source, directory / name)
print(json.dumps({'status': status, 'runtimeSourceHead': package['runtimeSourceHead'], 'review': selected['review']}))
