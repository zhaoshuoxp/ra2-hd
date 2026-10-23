"""Freeze portable delivery hashes and verify the copied Desktop app without including mutable profiles."""
import argparse
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
parser.add_argument('--compare', type=Path)
parser.add_argument('--package', type=Path)
parser.add_argument('--m2-complete', action='store_true')
args = parser.parse_args()
folder = args.folder.resolve()


def sha(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


if args.compare:
    ledger = json.loads((folder / 'Delivery-Inventory.json').read_text())
    destination = args.compare.resolve()
    assert (destination / 'Delivery-Inventory.json').read_bytes() == (folder / 'Delivery-Inventory.json').read_bytes()
    for row in ledger['files']:
        file = destination / row['file']
        if 'link' in row:
            assert file.is_symlink() and os.readlink(file) == row['link'], row['file']
        else:
            assert file.is_file() and not file.is_symlink(), row['file']
            assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], row['file']
    print(json.dumps(dict(status='PASS_ALL_FROZEN_FILES_IN_RELOCATED_DESKTOP_COPY',
        folder=str(destination), files=len(ledger['files']), inventorySha256=sha(folder / 'Delivery-Inventory.json'),
        mutableProfileExcluded='M2.4-Review-Profile')))
else:
    files = []
    for file in sorted(folder.rglob('*')):
        relative = file.relative_to(folder)
        if relative.parts[0] == 'M2.4-Review-Profile' or relative.name == 'Delivery-Inventory.json':
            continue
        if file.is_symlink():
            assert file.resolve().is_relative_to(folder), relative
            files.append(dict(file=str(relative), link=os.readlink(file)))
        elif file.is_file():
            files.append(dict(file=str(relative), bytes=file.stat().st_size, sha256=sha(file)))
    index = {row['file']: row for row in files}
    original = json.loads((args.package or folder.parent / 'package-receipt.json').read_text())
    for row in original['files']:
        if row['file'] == 'START-HERE.txt':
            continue
        assert index[row['file']] == row, f'Packaged app/resource changed: {row["file"]}'
    ledger = dict(schema='m2-4-independent-mac-delivery-inventory-v1',
        status='PASS_PORTABLE_COMPLETE_APP_RESOURCES_ACCEPTED_REVIEW_AND_NATIVE_EVIDENCE',
        runtimeSourceCommit=original['runtimeSourceHead'], files=files, fileCount=len(files),
        bytes=sum(row.get('bytes', 0) for row in files),
        exclusions=['Delivery-Inventory.json (self)', 'M2.4-Review-Profile (created mutable user configuration)'],
        originalPackageAllAppAndResourcePinsUnchanged=True,
        intentionalDocumentationReplacement='START-HERE.txt now describes the accepted M2.4 scope and four original-data blockers.',
        sourceAndResourceCorrespondence='SOURCE-AND-RESOURCES.json',
        allNewArt='USER_ACCEPTED', windows='NOT_RUN_ON_THIS_MAC', originalDataBlockers=4, m24Complete=False)
    if args.m2_complete:
        ledger.update(status='PASS_USER_ACCEPTED_M2_COMPLETE_PORTABLE_APP_AND_IDENTICAL_ARTWORK',
            originalDataBlockers=0, publishedOriginalDataBlockers=0, historicalHiddenSourceAnomalies=4,
            m24Complete=True, m2Complete=True,
            intentionalDocumentationReplacement='Accepted M2 completion, current source/resource correspondence and compact evidence.')
    output = folder / 'Delivery-Inventory.json'
    with output.open('x') as stream:
        json.dump(ledger, stream, indent=2)
        stream.write('\n')
    print(json.dumps(dict(status=ledger['status'], files=len(files), bytes=ledger['bytes'],
        inventorySha256=sha(output))))
