"""Freeze the bounded R1 correction delivery and its native evidence."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

base, folder = map(Path, sys.argv[1:3])
package = json.loads((base / 'package-stage/package-receipt.json').read_text())
records = folder / 'Records'
records.mkdir(exist_ok=False)
shutil.copytree(base / 'review', folder / 'Review')
for name, file in {
    'Package-Receipt.json': base / 'package-stage/package-receipt.json',
    'Build-Identity.json': base / 'build-final/identity.json',
    'Native-RA2-2X.json': base / 'native-v3/report.json',
    'Native-Desktop-4X.json': base / 'desktop-input-ui/report.json',
    'Native-Desktop-Along-Path.json': base / 'desktop-along-path/report.json',
    'Native-Desktop-Default-Profile.json': base / 'desktop-default/report.json',
    'Review-QA.json': base / 'review-qa/report.json',
    'Signature.json': base / 'signature.json',
    'Accepted-Resource-Comparison.json': base / 'accepted-resource-comparison.json',
}.items():
    shutil.copyfile(file, records / name)
(records / 'Focused-Checks.json').write_text(json.dumps(dict(
    status='PASS', cases=21, assertions=1480, typecheck='PASS',
    commands=['bun test scripts/m2-4/post-acceptance-input.test.ts scripts/ui/production-frame.test.ts scripts/ui/ui-art.test.ts scripts/m2-4/retail-presentation.test.ts',
              'bun run typecheck:entry'],
    rawExecution='Executed in this correction session; no full historical suite claim.'), indent=2) + '\n')
correspondence = dict(
    schema='m2-4-post-acceptance-r1-portable-v1', status='MAC_TECHNICAL_PASS_VISUAL_AND_PHYSICAL_REVIEW_PENDING',
    app='Red Alert 2 HD v0.2 R1.app', runtimeSourceHead=package['runtimeSourceHead'],
    baseline='87cd2617', publicVersion='v0.2', resources='RA2-HD-Editions-Resources',
    uiResources='RA2-HD-UI-Resources', profile='M2.4-Review-Profile',
    independentResources=True, priorDeliveryPreserved=True, archiveCreated=False,
    resourceFiles=package['resourceFiles'], uiResourceFiles=package['uiResourceFiles'],
    preparedContract=package['preparedContract'], preparedRegistration=package['preparedRegistration'],
    artworkChanges=0, resultLettering='R5_ACCEPTED_UNCHANGED',
    noticeWording='ACCEPTED_UNCHANGED_THREE_LANGUAGES', noticePlacement='EDITION_SELECTOR_AND_EXISTING_LOADING_SCREEN',
    controls={'A': 'Attack move to ground / attack chosen enemy', 'Ctrl+click': 'Existing force attack',
              'Escape or right click': 'Cancel armed A command', 'Alliance': 'Still configurable'},
    maps={'ra2': 62, 'yr': 151, 'archiveOnlyHidden': 92},
    nativeEvidence={'ra2_2x': 'The passing RA2 case in Records/Native-RA2-2X.json is reused. Its YR screenshot-timeout case remains failed in the immutable raw receipt.',
                    'yr_4x': 'Complete final Desktop application controls pass in Records/Native-Desktop-4X.json.',
                    'movingEnemyAcquisition': 'Records/Native-Desktop-Along-Path.json asserts moving=true and attackMoveTask=true before enemy appearance, followed by damage without a targeted order.',
                    'defaultProfile': 'Records/Native-Desktop-Default-Profile.json verifies direct Desktop startup, complete three-language notice, scrollable short window, native 4X map and 2X result.'},
    signature='Exact 516-entry clean app copy passes deep/strict validation. Desktop reattaches root FinderInfo; retain that diagnostic separately from passed native launches.',
    packageDirtyPaths='Only a validation harness outside the compiled payload changed during packaging; compiled runtime inputs are committed at runtimeSourceHead.',
    windows='NOT_RUN_ON_THIS_MAC', remotePush=False, publication=False)
(folder / 'SOURCE-AND-RESOURCES.json').write_text(json.dumps(correspondence, indent=2) + '\n')
(folder / 'START-HERE.txt').write_text('''Red Alert 2 HD v0.2 R1 - Mac arm64 correction review

Open Red Alert 2 HD v0.2 R1.app. Keep both resource folders beside it.
Open Review/M2.4-Post-Acceptance-R1-Embedded.html for the embedded correction review.
This folder has its own M2.4-Review-Profile; the prior v0.2 application/profile is preserved.

A then click ground: move and attack enemies along the path.
A then click an enemy unit/building: attack that target.
Right click or Escape cancels the pending A command. Ctrl force attack remains available.
The inherited A=Alliance default migrates; custom A assignments remain unchanged.

This correction fixes result-background visibility, neutral translucent recharge masks,
status-label contrast and persistent three-language notice placement. Accepted artwork,
result lettering, notice wording, map rules and the 62/151 original catalogs are retained.
Mac technical checks pass. Presentation and physical-input acceptance remain open.
Windows has not been tested on this Mac. No additional large ZIP is created.
See SOURCE-AND-RESOURCES.json and Records for scope, hashes and the Desktop Finder metadata diagnostic.
''')


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


rows = []
for file in sorted(folder.rglob('*')):
    relative = file.relative_to(folder)
    if relative.parts[0] == 'M2.4-Review-Profile' or relative.name == 'Delivery-Inventory.json':
        continue
    if file.is_symlink():
        assert file.resolve().is_relative_to(folder)
        rows.append(dict(file=str(relative), link=str(file.readlink())))
    elif file.is_file():
        rows.append(dict(file=str(relative), bytes=file.stat().st_size, sha256=sha(file)))
index = {row['file']: row for row in rows}
for row in package['files']:
    if row['file'] != 'START-HERE.txt':
        assert index[row['file']] == row, row['file']
inventory = dict(schema='m2-4-post-acceptance-r1-inventory-v1', status='PASS_ALL_APP_AND_RESOURCE_HASHES',
                 runtimeSourceHead=package['runtimeSourceHead'], files=rows, fileCount=len(rows),
                 bytes=sum(row.get('bytes', 0) for row in rows), mutableProfileExcluded=True,
                 originalPackagedPinsUnchanged=True, documentationReplacement='START-HERE.txt',
                 visualAcceptance='PENDING_CURRENT_CORRECTION_REVIEW', windows='NOT_RUN_ON_THIS_MAC')
(folder / 'Delivery-Inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
receipt = dict(status=inventory['status'], folder=str(folder), app=correspondence['app'],
               runtimeSourceHead=package['runtimeSourceHead'], files=len(rows), bytes=inventory['bytes'],
               inventorySha256=sha(folder / 'Delivery-Inventory.json'),
               review=str(folder / 'Review/M2.4-Post-Acceptance-R1-Embedded.html'),
               reviewSha256=sha(folder / 'Review/M2.4-Post-Acceptance-R1-Embedded.html'))
(base / 'delivery.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
