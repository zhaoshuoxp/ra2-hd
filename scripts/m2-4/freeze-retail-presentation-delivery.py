"""Freeze the corrected portable app, dependencies, embedded review and authoring provenance."""
import argparse
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
args = parser.parse_args()
folder = args.folder.resolve()

def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

rows = []
for file in sorted(folder.rglob('*')):
    relative = file.relative_to(folder)
    if relative.parts[0] == 'M2.4-Review-Profile' or relative.name == 'Delivery-Inventory.json':
        continue
    if file.is_symlink():
        assert file.resolve().is_relative_to(folder), relative
        rows.append({'file': str(relative), 'link': os.readlink(file)})
    elif file.is_file():
        rows.append({'file': str(relative), 'bytes': file.stat().st_size, 'sha256': sha(file)})
index = {row['file']: row for row in rows}
package = json.loads((folder.parent / 'package-receipt.json').read_text())
for original in package['files']:
    if original['file'] != 'START-HERE.txt':
        assert index[original['file']] == original, f'Packaged app/resource changed: {original["file"]}'
correspondence = json.loads((folder / 'SOURCE-AND-RESOURCES.json').read_text())
receipt = {'schema': 'm2-4-independent-mac-delivery-inventory-v2',
    'status': 'PASS_PORTABLE_CORRECTED_APP_RESOURCES_REVIEW_AND_PROVENANCE',
    'runtimeSourceCommit': package['runtimeSourceHead'], 'files': rows, 'fileCount': len(rows),
    'bytes': sum(row.get('bytes', 0) for row in rows),
    'exclusions': ['Delivery-Inventory.json (self)', 'M2.4-Review-Profile (mutable user configuration)'],
    'originalPackageAllAppAndResourcePinsUnchanged': True,
    'intentionalDocumentationReplacement': 'START-HERE.txt describes original catalogs and three-language corrections.',
    'sourceAndResourceCorrespondence': 'SOURCE-AND-RESOURCES.json',
    'technicalMac': correspondence['technicalMac'], 'publishedMaps': {'ra2': 62, 'yr': 151},
    'archiveOnlyHidden': 92, 'publishedOriginalDataBlockers': 0, 'historicalHiddenSourceAnomalies': 4,
    'priorTheaterArt': 'USER_ACCEPTED_THROUGH_BATCH98', 'newResultBannerArt': 'VISUAL_REVIEW_PENDING',
    'newHoverTypography': 'VISUAL_REVIEW_PENDING', 'windows': 'NOT_RUN_ON_THIS_MAC', 'm24Complete': False}
output = folder / 'Delivery-Inventory.json'
with output.open('x') as stream:
    json.dump(receipt, stream, indent=2)
    stream.write('\n')
print(json.dumps({'status': receipt['status'], 'files': len(rows), 'bytes': receipt['bytes'], 'sha256': sha(output)}))
