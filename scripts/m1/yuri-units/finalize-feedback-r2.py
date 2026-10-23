"""Pin verified R2 evidence while preserving the prior batch acceptance boundary."""
import hashlib
import json
from pathlib import Path

ROOT = Path.cwd().resolve()
ART = ROOT / '.artifacts/yuri-units'
FEEDBACK = ART / 'feedback-r2'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()


def write(file, value):
    file.write_text(json.dumps(value, indent=2) + '\n')


package_file = FEEDBACK / 'package-v4/package-receipt.json'
package = read(package_file)
review_directory = Path(package['folder']) / 'Review'
review = read(review_directory / 'feedback-review-v2.json')
art = read(FEEDBACK / 'art-samples/receipt-v2.json')
ui = read(FEEDBACK / 'effects-review-ui-v2/result.json')
art_ui = read(FEEDBACK / 'art-review-ui-v2/result.json')
assert ui['status'] == art_ui['status'] == 'PASS_OFFLINE_RELOCATED_HTML'
assert len(ui['clips']) == 6 and art_ui['images'] == 54
assert sha(Path(review['html'])) == review['sha256']
assert sha(review_directory / 'Yuri-Clean-Art-Review-v2.html') == art['reviewSha256']
runtime = []
for directory, density in [('runtime-v4', 4), ('runtime-2x-v2', 2)]:
    file = FEEDBACK / directory / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors'] and not report['handledErrors']
    assert report['worldAllocation']['total'] <= report['worldAllocation']['limit']
    assert len(report['corrections']) == 5
    for result in report['corrections'].values():
        assert result['status'] == 'PASS_SELECTED_NATIVE_CASE'
        assert result['actualDensity'] == density
    assert all(frame['hd'] for frame in report['corrections']['DISK']['liveFrames'])
    runtime.append({'density': density, 'path': str(file), 'sha256': sha(file),
                    'status': report['status'], 'worldAllocation': report['worldAllocation'],
                    'nativeCases': list(report['corrections'])})
flight_file = FEEDBACK / 'runtime-disc-flight-v1/report.json'
flight = read(flight_file)
assert flight['status'] == 'PASS_SELECTED_NATIVE_CASES' and len(flight['flightFrames']) == 8
assert flight['allocations']['families']['DISK']['density'] == 4
assert all(row['hd'] for row in flight['motion'])

acceptance_file = ROOT / 'docs/yuri-units-final-acceptance.json'
acceptance = read(acceptance_file)
selected = {
    'schemaVersion': 1, 'taskId': 'D', 'revision': 'R2',
    'status': 'NATIVE_CORRECTIONS_VERIFIED_STYLE_REVIEW_PENDING',
    'runtimeSourceHead': package['runtimeSourceHead'], 'packageReceipt': str(package_file),
    'packageReceiptSha256': sha(package_file), 'app': package['app'], 'resources': package['resources'],
    'review': review['html'], 'reviewSha256': review['sha256'], 'runtimeReports': runtime,
    'reviewUi': str(FEEDBACK / 'effects-review-ui-v2/result.json'),
    'discFlight': {'path': str(flight_file), 'sha256': sha(flight_file), 'status': flight['status'], 'nativeBodyBearings': 8},
    'artStyle': {**art, 'portableReview': str(review_directory / 'Yuri-Clean-Art-Review-v2.html'),
                 'ui': str(FEEDBACK / 'art-review-ui-v2/result.json'),
                 'generationProvenance': str(FEEDBACK / 'art-samples/generation-provenance-v1.json')},
    'tests': {'feedbackEffects': '7 PASS / 60 expectations', 'relatedRulesAndMindControl': '11 PASS / 41 expectations',
              'rhinoGeometry': '3 PASS', 'helicopterGeometry': '2 PASS / 627 expectations', 'entryTypecheck': 'PASS',
              'historicalFixtureException': {'status': 'MISSING_HISTORICAL_RESOURCE',
                  'test': 'Soviet correction retains all body, deployment, tail rotor and atlas records',
                  'missing': '.local/hd-packs/yr-soviet-schp-vxl/owner-r3/manifest.json',
                  'disclosure': 'The broader attempt recorded this failure; the two relevant geometry tests passed separately.'}},
    'acceptedBatchArt': 'PRESERVED_FULL_BATCH_VISUAL_ACCEPTED', 'correctionVisualAcceptance': 'USER_REVIEW_PENDING',
    'simulationScope': 'Restore ignored native TurretSpins and caster-centered AreaFire; preserve retail rule files, damage, cooldowns, camera and logical geometry.',
    'runtimeExceptions': acceptance['runtimeExceptions'], 'integration_status': 'NOT_MERGED',
    'platformStatus': {'macOSArm64': 'COPIED_APP_SELECTED_NATIVE_2X_AND_4X_VERIFIED', 'signing': 'LOCAL_AD_HOC', 'windows': 'NOT_RUN'},
    'integrationManifest': str(ART / 'integration-resource-manifest-v4.json'),
    'finalDeliveryReceipt': str(FEEDBACK / 'package-v4/final-delivery-receipt-v2.json'),
}
write(ROOT / 'docs/yuri-units-feedback-r2.json', selected)
acceptance.setdefault('preservedR1Delivery', {key: acceptance[key] for key in
    ['runtimeSourceHead', 'packageReceipt', 'review', 'app', 'resources', 'reviewMedia']})
acceptance['feedbackR2'] = selected
for key in ['runtimeSourceHead', 'packageReceipt', 'review', 'app', 'resources', 'platformStatus']:
    acceptance[key] = selected[key]
acceptance['clarityStatus'] = 'CLEAN_MOTHER_ART_SAMPLES_REVIEW_PENDING'
acceptance['clarityReport'] = str(FEEDBACK / 'art-samples/receipt-v2.json')
acceptance['artDirection'] = 'Prior full-batch art acceptance is preserved. Clean MIND/LTNK/YTNK mother-art samples are pending style review and are not installed.'
acceptance['reviewMedia'] = {'status': 'SELF_CONTAINED_HTML_EMBEDDED_REPLAYS', 'embeddedVideoCount': 6,
    'previewManifest': review['mediaManifest'], 'originalRecordings': 'PRESERVED_UNCHANGED',
    'fullBatchReview': acceptance['preservedR1Delivery']['review'], 'fullBatchEmbeddedVideos': 22,
    'previewDisclosure': 'H.264 previews up to 1920 pixels wide; original 4K native recordings and direct crops preserved.'}
acceptance['tests']['feedbackR2'] = selected['tests']
write(acceptance_file, acceptance)

ledger_file = ART / 'ledger.json'
ledger = read(ledger_file)
ledger.setdefault('acceptedFullBatchReview', ledger['review'])
ledger['review'] = selected['review']
ledger['feedbackR2'] = {'status': selected['status'], 'receipt': str(ROOT / 'docs/yuri-units-feedback-r2.json'),
    'runtimeSourceHead': selected['runtimeSourceHead'], 'nativeCases': ['DISK', 'TELE', 'MIND', 'YURIPR', 'CAOS'],
    'styleSamples': ['MIND', 'LTNK', 'YTNK'], 'styleActivation': 'NOT_INSTALLED'}
ledger['clarityStatus'], ledger['clarityReport'] = acceptance['clarityStatus'], acceptance['clarityReport']
for row in ledger['rows']:
    if row['id'] in ['DISK', 'TELE', 'MIND', 'YURIPR', 'CAOS']:
        row['feedbackR2'] = {'runtime': 'PASS_SELECTED_NATIVE_2X_AND_4X', 'visual': 'USER_REVIEW_PENDING'}
write(ledger_file, ledger)
feedback = read(FEEDBACK / 'feedback.json')
feedback.update({'status': selected['status'], 'runtimeSourceHead': selected['runtimeSourceHead'],
                 'receipt': str(ROOT / 'docs/yuri-units-feedback-r2.json'), 'review': selected['review']})
write(FEEDBACK / 'feedback.json', feedback)
print(json.dumps({'status': selected['status'], 'runtimeSourceHead': selected['runtimeSourceHead'], 'review': selected['review']}))
