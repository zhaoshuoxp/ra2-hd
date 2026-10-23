"""Attach verified final review/docs to the task-owned package without changing its app."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path('.artifacts/yuri-buildings')
package = json.loads((ROOT / 'package-v3/package-receipt.json').read_text())
folder = Path(package['folder'])
review = json.loads((ROOT / 'final-review-v1/review-receipt.json').read_text())
native = json.loads((ROOT / 'consolidated-native-v1.json').read_text())
browser = json.loads((ROOT / 'final-review-v1/browser-check.json').read_text())
launcher = json.loads((ROOT / 'delivery-launch-v1/report.json').read_text())
layout = json.loads(Path('.artifacts/map-selection-layout/final-c-app-v1/report.json').read_text())
assert native['status'] == 'PASS_INCREMENTAL_NATIVE_BATCH'
assert browser['status'] == 'PASS_OFFLINE_FULL_STATE_REVIEW'
assert launcher['status'] == 'PASS_TASK_C_DELIVERED_LAUNCHER_STARTUP'
assert layout['status'] == 'PASS_AUTOMATED_DESKTOP_LAYOUT'
assert not subprocess.check_output(['git', 'status', '--porcelain']).strip(), 'Commit verified source/docs first'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
review_source = Path(review['file'])
assert sha(review_source) == review['sha256']
files = []
for source, name in [(review_source, 'Yuri-Buildings-Final-Review.html'),
                     (Path('docs/yuri-buildings-hd-batch.md'), 'TASK-C-VALIDATION.md'),
                     (Path('docs/map-selection-layout-fix.md'), 'MAP-LAYOUT-VALIDATION.md'),
                     (ROOT / 'consolidated-native-v1.json', 'TASK-C-NATIVE-EVIDENCE.json'),
                     (ROOT / 'production-ledger.json', 'TASK-C-PRODUCTION-LEDGER.json'),
                     (ROOT / 'final-review-v1/browser-check.json', 'TASK-C-OFFLINE-CHECK.json')]:
    destination = folder / name
    assert not destination.exists(), destination
    shutil.copyfile(source, destination)
    digest = sha(destination)
    assert digest == sha(source)
    files.append({'file': name, 'sha256': digest, 'bytes': destination.stat().st_size})
receipt = {'status': 'TECHNICAL_REVIEW_READY_FINAL_VISUAL_ACCEPTANCE_PENDING', 'finalVisualAcceptance': 'PENDING',
           'localSourceCommit': head, 'remotePush': 'NOT_REQUESTED', 'rulesDenominator': 17,
           'applicableFamilies': 16, 'theaterSelections': 33, 'independentDensities': [2, 4],
           'app': package['app'], 'resources': package['resources'], 'resourceStorage': package['resourceStorage'],
           'launcher': str(folder / 'Launch-Isolated-Review.command'), 'profile': str(folder / 'Review-Profile'),
           'review': str(folder / 'Yuri-Buildings-Final-Review.html'), 'files': files,
           'compiledRuntime': {'build': package['build'], 'headAtBuild': package['runtimeSourceHead'],
                               'dirtySourceAtBuild': package['sourceDirty'],
                               'boundary': 'Compiled final C code before its local source/docs commit. Later changes are evidence scripts and documentation only. Generic predecessor artStatus is superseded by this task-specific receipt.'},
           'nativeStatus': native['status'], 'offlineReviewStatus': browser['status'],
           'launcherStatus': launcher['status'], 'mapLayoutStatus': layout['status'],
           'mapFixCommit': 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1',
           'preservation': 'final-preservation-v1.json', 'nativeEvidence': 'consolidated-native-v1.json',
           'limits': ['Final user visual acceptance pending', 'Windows and exhaustive physical-panel/input coverage not claimed',
                      'Controlled legal fixtures and one-time charge presets disclosed', 'No Desktop ZIP, installer, D/E, push or cleanup'],
           'continuation': 'Continue acceptance and named C corrections in this execution chat.'}
(folder / 'TASK-C-REVIEW-STATUS.json').write_text(json.dumps(receipt, indent=2) + '\n')
(ROOT / 'final-delivery-v1.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(receipt['status'], head, receipt['review'])
