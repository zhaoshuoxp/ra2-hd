"""Attach verified three-item feedback evidence to the complete Task C package."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/yuri-buildings')
FEEDBACK = ROOT / 'feedback-v1'
BASELINE = '0370e9b41d4736a0b80bbe35d2552b3f3a39a4a4'
MAP_FIX = 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1'


def read(file):
    return json.loads(file.read_text())


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


package = read(FEEDBACK / 'package-v5/package-receipt.json')
review = read(FEEDBACK / 'review-v2/review-receipt.json')
native = read(FEEDBACK / 'feedback-native-summary-v1.json')
browser = read(FEEDBACK / 'review-v2/browser-check.json')
launcher = read(FEEDBACK / 'launcher-check-v3/report.json')
preservation = read(FEEDBACK / 'final-preservation-v2.json')
audit = read(FEEDBACK / 'dominator-all-slot-audit-v3.json')
previous = read(ROOT / 'final-delivery-v1.json')
layout = read(Path('.artifacts/map-selection-layout/final-c-app-v1/report.json'))
assert native['status'] == 'PASS_INCREMENTAL_NATIVE_CORRECTIONS'
assert browser['status'] == 'PASS_OFFLINE_FULL_STATE_REVIEW'
assert browser['theaterSelections'] == 7 and not browser['errors'] and not browser['externalRequests']
assert launcher['status'] == 'PASS_TASK_C_DELIVERED_LAUNCHER_STARTUP' and not launcher['errors']
assert launcher['result']['enabled'] and launcher['result']['density'] == 4
assert preservation['status'] == 'PASS_FEEDBACK_SELECTION_AND_PACKAGE_PRESERVATION'
assert preservation['oldFamilyDocuments'] == 33 and preservation['unchangedSelections'] == 31
assert sum(len(family['slots']) for family in audit['families']) == 524
assert all(family['status'] == 'PASS_NATIVE_GEOMETRY_AND_DATA_CONTRACT' for family in audit['families'])
assert layout['status'] == 'PASS_AUTOMATED_DESKTOP_LAYOUT'
assert not subprocess.check_output(['git', 'status', '--porcelain']).strip(), 'Commit verified source/docs first'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
for ancestor in [BASELINE, MAP_FIX]:
    subprocess.run(['git', 'merge-base', '--is-ancestor', ancestor, head], check=True)
for pin in preservation['acceptedCatalogs']:
    assert sha(Path(pin['path'])) == pin['sha256'], pin['path']
catalog = read(Path('desktop/yuri-building-coverage.json'))
assert len(catalog) == 33
folder = Path(package['folder'])
for selection in catalog.values():
    assert sha(Path(package['resources']) / selection['familyPath']) == selection['familyHash']
map_source = preservation['mapSourceUnchanged']
assert Path(map_source).read_bytes() == subprocess.check_output(['git', 'show', f'{BASELINE}:{map_source}'])
assert native['app'] == package['app'] == launcher['app']
assert native['resources'] == package['resources'] == launcher['resources']
assert sha(Path('scripts/m1/yuri-buildings/review-launcher.command')) == sha(folder / 'Launch-Isolated-Review.command')
review_source = Path(review['file'])
assert sha(review_source) == review['sha256']

sources = [
    (review_source, 'Yuri-Buildings-Final-Review.html'),
    (Path('docs/yuri-buildings-feedback.md'), 'TASK-C-FEEDBACK-VALIDATION.md'),
    (Path('docs/yuri-buildings-hd-batch.md'), 'TASK-C-VALIDATION.md'),
    (Path('docs/map-selection-layout-fix.md'), 'MAP-LAYOUT-VALIDATION.md'),
    (FEEDBACK / 'feedback-native-summary-v1.json', 'TASK-C-FEEDBACK-NATIVE-EVIDENCE.json'),
    (ROOT / 'production-ledger.json', 'TASK-C-PRODUCTION-LEDGER.json'),
    (FEEDBACK / 'review-v2/browser-check.json', 'TASK-C-FEEDBACK-OFFLINE-CHECK.json'),
    (FEEDBACK / 'launcher-check-v3/report.json', 'TASK-C-FEEDBACK-LAUNCHER-CHECK.json'),
    (FEEDBACK / 'final-preservation-v2.json', 'TASK-C-FEEDBACK-PRESERVATION.json'),
    (FEEDBACK / 'dominator-all-slot-audit-v3.json', 'TASK-C-HINGE-SLOT-AUDIT.json'),
    (FEEDBACK / 'incremental-frame-diff-v3.json', 'TASK-C-HINGE-INCREMENTAL-DIFF.json'),
    (FEEDBACK / 'hinge-generation-request-v1.json', 'TASK-C-HINGE-GENERATION-REQUEST.json'),
    (FEEDBACK / 'hinge-parts-raw.png', 'TASK-C-HINGE-MASTER.png'),
]
for run in native['runs']:
    suffix = Path(run['report']).parent.name.removeprefix('native-').upper()
    sources.append((Path(run['report']), f'TASK-C-{suffix}-NATIVE.json'))
receipt_files = [folder / 'TASK-C-FEEDBACK-STATUS.json', ROOT / 'final-delivery-v2.json']
for destination in [folder / name for _, name in sources] + receipt_files:
    assert not destination.exists(), destination
files = []
for source, name in sources:
    destination = folder / name
    with source.open('rb') as incoming, destination.open('xb') as outgoing:
        shutil.copyfileobj(incoming, outgoing)
    digest = sha(destination)
    assert digest == sha(source), name
    files.append({'file': name, 'source': str(source.resolve()), 'sha256': digest,
                  'bytes': destination.stat().st_size})

receipt = {
    'status': 'TECHNICAL_REVIEW_READY_FINAL_VISUAL_ACCEPTANCE_PENDING', 'finalVisualAcceptance': 'PENDING',
    'localSourceCommit': head, 'remotePush': 'NOT_REQUESTED', 'rulesDenominator': 17,
    'applicableFamilies': 16, 'theaterSelections': 33, 'independentDensities': [2, 4],
    'feedbackFamilies': ['YAGNTC', 'YAPPET', 'NATBNK'], 'feedbackReviewSelections': 7,
    'app': package['app'], 'resources': package['resources'], 'resourceStorage': package['resourceStorage'],
    'launcher': str(folder / 'Launch-Isolated-Review.command'), 'profile': str(folder / 'Review-Profile'),
    'review': str(folder / 'Yuri-Buildings-Final-Review.html'), 'files': files,
    'compiledRuntime': {
        'build': package['build'], 'headAtBuild': package['runtimeSourceHead'],
        'dirtySourceAtBuild': package['sourceDirty'],
        'boundary': 'Build-v5 compiled the final bunker controller and c3 catalog on baseline main. '
                    'Later changes only affect evidence helpers, viewer, launcher and documents. '
                    'This task-specific receipt supersedes generic predecessor art/runtime labels.'},
    'nativeStatus': native['status'], 'offlineReviewStatus': browser['status'], 'launcherStatus': launcher['status'],
    'preservation': str((FEEDBACK / 'final-preservation-v2.json').resolve()),
    'nativeEvidence': str((FEEDBACK / 'feedback-native-summary-v1.json').resolve()),
    'previousFullBatchDelivery': str((ROOT / 'final-delivery-v1.json').resolve()),
    'previousFullReview': previous['review'],
    'reusedEvidenceBoundary': 'Unchanged C families and lifecycle/RA2 evidence retain package-v3 build boundaries.',
    'mapFixCommit': MAP_FIX, 'mapLayoutStatus': layout['status'], 'mapSourceUnchanged': map_source,
    'generation': {'mode': 'built-in image_gen', 'master': str(folder / 'TASK-C-HINGE-MASTER.png'),
                   'finalPrompt': str(folder / 'TASK-C-HINGE-GENERATION-REQUEST.json')},
    'limits': ['Final user visual acceptance pending', 'Windows and exhaustive physical-panel/input coverage not claimed',
               'Controlled legal fixtures and one-time charge presets disclosed', 'No Desktop ZIP, installer, D/E, push or cleanup'],
    'continuation': 'Continue acceptance and named C corrections in this execution chat.',
}
for file in receipt_files:
    with file.open('x') as stream:
        stream.write(json.dumps(receipt, indent=2) + '\n')
print(receipt['status'], head, receipt['review'])
