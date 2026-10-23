"""Freeze the accepted portable app, selected dependencies and final documentation."""
import argparse
import hashlib
import json
import os
import plistlib
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
parser.add_argument('package', type=Path)
args = parser.parse_args()
folder = args.folder.resolve()
package = json.loads(args.package.read_text())


def sha(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


assert not (folder / 'Delivery-Inventory.json').exists()
correspondence = json.loads((folder / 'SOURCE-AND-RESOURCES.json').read_text())
assert correspondence['status'] == 'USER_ACCEPTED_MAC_PORTABLE_V02_VERIFIED'
assert correspondence['runtimeSourceHead'] == package['runtimeSourceHead']
app = folder / correspondence['app']
plist = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
assert plist['CFBundleShortVersionString'] == '0.2' and plist['CFBundleVersion'] == '24'
rows = []
for file in sorted(folder.rglob('*')):
    relative = file.relative_to(folder)
    if relative.parts[0] == 'M2.4-Review-Profile' or relative.name == 'Delivery-Inventory.json':
        continue
    if file.is_symlink():
        assert file.resolve().is_relative_to(folder), relative
        rows.append(dict(file=str(relative), link=os.readlink(file)))
    elif file.is_file():
        rows.append(dict(file=str(relative), bytes=file.stat().st_size, sha256=sha(file)))
index = {row['file']: row for row in rows}
for row in package['files']:
    if row['file'] != 'START-HERE.txt':
        assert index[row['file']] == row, f'Packaged app/resource changed: {row["file"]}'
receipt = dict(schema='m2-4-final-accepted-independent-mac-inventory-v1', status='PASS_ACCEPTED_COMPLETE_PORTABLE_MAC_V02',
    runtimeSourceCommit=package['runtimeSourceHead'], publicVersion='v0.2', files=rows, fileCount=len(rows),
    bytes=sum(row.get('bytes', 0) for row in rows),
    exclusions=['Delivery-Inventory.json (self)', 'M2.4-Review-Profile (mutable user configuration)'],
    originalPackageAllAppAndResourcePinsUnchanged=True, intentionalDocumentationReplacement='START-HERE.txt now describes final acceptance.',
    sourceAndResourceCorrespondence='SOURCE-AND-RESOURCES.json', publishedMaps={'ra2': 62, 'yr': 151},
    archiveOnlyHidden=92, publishedOriginalDataBlockers=0, historicalHiddenSourceAnomalies=4,
    priorTheaterArt='USER_ACCEPTED_THROUGH_BATCH98', newResultBannerArt='R5_USER_ACCEPTED',
    newHoverTypography='USER_ACCEPTED', startupNotice='USER_ACCEPTED_AND_INTEGRATED',
    windows='NOT_RUN_ON_THIS_MAC', remotePush=False, published=False, m24Complete=True)
(folder / 'Delivery-Inventory.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], files=len(rows), bytes=receipt['bytes'], inventorySha256=sha(folder / 'Delivery-Inventory.json'))))
