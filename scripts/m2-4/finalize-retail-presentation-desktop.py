"""Append the verified relocated startup without changing any app or resource byte."""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.artifacts/m2-4/retail-presentation-v1'
stage = ROOT / '.artifacts/m2-4/retail-presentation-delivery-20261021-v1/RA2-HD-M2.4-Map-Language-Fixes-20261021'
desktop = Path('/Users/Aone/Desktop/RA2-HD-M2.4-Map-Language-Fixes-20261022')
control = ROOT / '.artifacts/m2-4/retail-presentation-default-desktop-v2'
report = json.loads((control / 'report.json').read_text())
assert report['status'].startswith('PASS_RELOCATED_APP_DEFAULT_PRIVATE_PROFILE')
assert report['result2x']['pixels'] == [872, 224]
assert len(report['selectorLanguages']) == 3
assert report['native']['prepared']['peakBytes'] <= 128 * 1024 * 1024
previous = json.loads((ROOT / 'docs/m2-4-final-delivery-20261021.json').read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

inventory_backup = WORK / 'initial-candidate-inventory.json'
assert not inventory_backup.exists()
shutil.copyfile(stage / 'Delivery-Inventory.json', inventory_backup)
initial_sha = sha(inventory_backup)
for folder in [stage, desktop]:
    assert sha(folder / 'Delivery-Inventory.json') == initial_sha
    evidence = folder / 'Evidence/Desktop-Standalone'
    evidence.mkdir()
    shutil.copyfile(control / 'report.json', evidence / 'report.json')
    for image in control.glob('*.png'):
        shutil.copyfile(image, evidence / image.name)
    record = folder / 'SOURCE-AND-RESOURCES.json'
    data = json.loads(record.read_text())
    data['technicalMac']['defaultRelocatedStartup'] = report['status']
    data['technicalMac']['defaultProfileReceipt'] = 'Evidence/Desktop-Standalone/report.json'
    data['technicalMac']['defaultProfileReceiptSha256'] = sha(evidence / 'report.json')
    data['technicalMac']['nativeAdditionalControls'] = ['Three-language edition selector', 'Native 2X result background', '4X world through default sibling resources']
    data['technicalMac']['relocatedPreparedCpuPeakBytes'] = report['native']['prepared']['peakBytes']
    data['reusedEvidence']['expectedOriginalPolicies'] = previous['expectedOriginalPolicies']
    data['initialCandidateInventorySha256'] = initial_sha
    data['desktopFolder'] = str(desktop)
    record.write_text(json.dumps(data, indent=2) + '\n')
    start = folder / 'START-HERE.txt'
    start.write_text(start.read_text() + '\nThe actual Desktop app also passed direct default-profile startup, all three\nselector languages, a native 4X world, 16+ ticks and the native 2X result image.\n')
    # Only this task's own earlier metadata inventory is superseded; its hash/bytes are retained above.
    (folder / 'Delivery-Inventory.json').unlink()
subprocess.run([sys.executable, str(ROOT / 'scripts/m2-4/freeze-retail-presentation-delivery.py'), str(stage)], check=True)
shutil.copyfile(stage / 'Delivery-Inventory.json', desktop / 'Delivery-Inventory.json')
shortcut = Path('/Users/Aone/Desktop/M2.4-Review-Map-Language-Fixes-20261022.html')
assert not shortcut.exists()
target = 'RA2-HD-M2.4-Map-Language-Fixes-20261022/Review/M2.4-Map-Language-Fixes-Embedded.html'
shortcut.write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={target}"><title>M2.4 Review</title><a href="{target}">Open the embedded M2.4 correction review</a></html>\n')
subprocess.run([sys.executable, str(ROOT / 'scripts/m2-4/final-delivery-inventory.py'), str(stage), '--compare', str(desktop)], check=True)
print(json.dumps({'status': 'PASS_FINAL_DESKTOP_INVENTORY_AND_DEFAULT_PROFILE', 'desktop': str(desktop),
                  'reviewShortcut': str(shortcut), 'inventorySha256': sha(desktop / 'Delivery-Inventory.json')}))
