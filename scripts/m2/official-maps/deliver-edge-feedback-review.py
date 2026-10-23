"""Pin the complete R5 copied application, portable review and source handoff."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path


def read(file):
    return json.loads(file.read_text())


def digest(file):
    result=hashlib.sha256()
    with file.open('rb') as stream:
        while chunk:=stream.read(4*1024*1024):
            result.update(chunk)
    return result.hexdigest()


def pin(file,root=None):
    return dict(file=str(file.relative_to(root) if root else file.resolve()),sha256=digest(file),bytes=file.stat().st_size)


def save(file,value):
    assert not file.exists(),'Preserve earlier handoff artifacts'
    file.write_text(json.dumps(value,indent=2)+'\n')


def copy(source,target):
    assert not target.exists(),'Preserve previous output bytes'
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(source,target)
    assert digest(source)==digest(target)


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt',type=Path)
args=parser.parse_args()
root=Path.cwd();art=root/'.artifacts/m2-3/feedback-r5-v1'
receipt=read(args.receipt);folder=Path(receipt['folder'])
ledger=read(root/'docs/m2-3-feedback-r5.json')
assert ledger['status']=='PASS_TECHNICAL_REVIEW_READY_USER_VISUAL_PENDING'
native=read(art/'native-summary-v1.json')
assert native['status']=='PASS_ALL_30_COPIED_R5_NATIVE_CASES'
review_root=folder/'M2.3-R5-Feedback-Review';review=read(review_root/'review-manifest.json')
assert review['status']=='PASS_ALL_EMBEDDED_PNG_BYTES_DIMENSIONS_AND_FULL_DECODING'
rendering=read(art/'review-rendering-v1/report.json')
assert rendering['status']=='PASS_OFFLINE_NATIVE_HTML_RENDERING_EMBEDDED_IMAGES_ACTUAL_DIMENSIONS'
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
dirty=subprocess.check_output(['git','status','--porcelain'],text=True)
assert not dirty,'Commit the final scoped source and handoff before delivery'
for source,name in [(args.receipt,'M2.3-R5-PACKAGE-RECEIPT.json'),
        (root/'docs/m2-3-feedback-r5.json','M2.3-R5-ACCEPTANCE.json'),
        (root/'docs/m2-3-feedback-r5.md','M2.3-R5-TECHNICAL-HANDOFF.md')]:
    copy(source,folder/name)
evidence=[]
for relative in ['baseline.json','scope.json','source-checks-v2.json','preservation-v1.json',
        'r4-preservation-before-v1.json','candidate-disposition-v2.json','candidate-disposition-v3.json','selection-v1.json',
        'building-export-v5.json','airport-contact-export-v6.json','environment-assembly-v1.json',
        'airport-contact-assembly-v1.json','environment-registration-v3.json','static-review-v4/audit.json',
        'static-visual-disposition-v1.json','static-visual-disposition-v2.json','static-visual-disposition-v3.json',
        'owner-state-overview-v2/index.json','preservation-final-v1.json',
        'native-plan-v1.json','native-summary-failed-v1.json','native-summary-v1.json',
        'native-visual-disposition-v1.json','mac-signature-v1.json',
        'review-rendering-v1/report.json']:
    source=art/relative;target=folder/'M2.3-R5-Evidence'/relative
    copy(source,target);evidence.append(pin(target,folder))
for source in sorted((art/'owner-state-overview-v2').glob('*.png')):
    target=folder/'M2.3-R5-Evidence/owner-state-overview-v2'/source.name
    copy(source,target);evidence.append(pin(target,folder))
for case in native['cases']:
    source=Path(case['file']);target=folder/'M2.3-R5-Evidence/native'/source.parent.name/source.name
    copy(source,target);evidence.append(pin(target,folder))
failed=art/'native-r5-v1/owners-2x/report.json'
if failed.exists():
    target=folder/'M2.3-R5-Evidence/historical-failed-native-owners-v1.json'
    copy(failed,target);evidence.append(pin(target,folder))
authoring=[]
for job in ['ctairp-shp-00','ctairp-shp-01']:
    source=art/'airport-lettering-authoring-v1/jobs'/job
    for name in ['master.png','prompt.txt','job.json','generation.json']:
        target=folder/'M2.3-R5-Authoring'/job/name
        copy(source/name,target);authoring.append(pin(target,folder))
for source in sorted((root/'.artifacts/m2-3/inventory-v9').iterdir()):
    if source.is_file():
        copy(source,folder/'M2.3-Inventory'/source.name)
copy(root/'.artifacts/m2-3/final-coverage-v1.json',folder/'M2.3-BASELINE-COVERAGE.json')
local=root/'.local';copied=Path(receipt['resources'])
environment=read(local/'environment-selection.json');terrain=read(local/'terrain-selection.json')
assert environment==ledger['environment'] and terrain==ledger['terrain']
resources=[]
for kind,pointer in [('environment',environment),('terrain',terrain)]:
    pack=local/f'{kind}-packs'/pointer['revision']
    assert digest(pack/'manifest.json')==pointer['sha256']
    for source in sorted(pack.rglob('*')):
        if source.is_file():
            relative=source.relative_to(local)
            assert digest(copied/relative)==digest(source)
            resources.append(pin(source,local))
for relative in ['environment-selection.json','terrain-selection.json']:
    assert digest(local/relative)==digest(copied/relative)
    resources.append(pin(local/relative,local))
selectors=[pin(root/relative,root) for relative in ['desktop/environment-hd-contract.json',
    'desktop/terrain-hd-contract.json','desktop/yuri-building-coverage.json','desktop/prepared-hd-contract.json']]
save(folder/'M2.3-R5-RESOURCE-HANDOFF.json',dict(schema='m2-3-r5-resource-handoff-v1',
    status='PASS_HASH_PINNED_COMPLETE_COPIED_RESOURCES',taskResourceRoot=str(local),copiedWorldRoot=str(copied),
    copiedUiRoot=receipt['uiRoot'],copiedProfile=receipt['profile'],runtimeSourceCommit=receipt['sourceHead'],taskCommit=head,
    environment=environment,terrain=terrain,uiManifestSha256=receipt['uiManifestSha256'],
    preparedRegistration=receipt['preparedRegistration'],files=resources,selectors=selectors,authoring=authoring,
    transferPolicy='ADD_IF_ABSENT_OR_IDENTICAL for unique versioned resources. Coordinate selector changes after user '
                   'acceptance, retaining peer worktrees and all protected renderer paths. Merge shared files semantically.',
    mainIntegration=False,remotePush=False,publication=False))
save(folder/'M2.3-R5-EVIDENCE-INDEX.json',dict(evidence=evidence,authoring=authoring))
entry='M2.3-R5-Feedback-Review/'+review['entry']
start=folder/'M2.3-R5-START-HERE.md'
assert not start.exists()
start.write_text(f'''# M2.3 Temperate Review R5

Open [{entry}]({entry}) for the repaired airport numerals, structural antialiasing, every changed building state and copied native evidence. Every picture is embedded directly in its page. Keep the complete review directory together; large images scroll at their actual dimensions. The native offline Electron review shell also verifies embedded image decoding and displayed dimensions on representative pages. All pages pass independent PNG-byte and navigation checks.

Launch `{Path(receipt['app']).name}` or `Launch-Isolated-Review.command`. Keep the application, world resources and UI resources together. The package uses its own `M2.3-Review-Profile` and includes both editions and all selected resources.

R5 checks 116 complete map-building families, 135 members and 1,556 density frames, including 336 owner frames. It cleans the displaced airport base glyphs in normal and damaged states and retains the original occupied fixed-red lettering. Structural pixel stairs become subpixel contours; native contacts, shadows, all sixteen owner shades, logical geometry and timing remain pinned. The remaining 122 environment families, terrain, faction packs, UI and prepared payloads are preserved. R4 remains available and unchanged.

All 30 copied Mac sessions pass: 12 official map/state cases per density collectively exercise 105 changed families, tech-building and occupied-building red/blue comparisons at both densities, complete outpost fallback and map release. Eleven map-building families retain their native availability exceptions. Static coverage is complete for them; unsupported native maps are not relabeled as runtime passes. Budgets remain world 512/1,280 MiB, prepared CPU 128 MiB and UI 16 MiB.

The application is frozen from `{receipt['sourceHead']}`. Final validation and handoff source is `{head}`; shipping `src` and `desktop` remain unchanged after the frozen source checkpoint. The original package receipt is an immutable packaging snapshot. Current closure is `M2.3-R5-ACCEPTANCE.json`; resource transfer pins are in `M2.3-R5-RESOURCE-HANDOFF.json` and all delivery bytes in `M2.3-R5-DELIVERY-MANIFEST.json`.

Your visual acceptance is pending. Windows and physical input remain NOT_RUN. Main integration, push and publication have not occurred. Continue this conversation for R5 review and bounded corrections; start another only after acceptance and a materially changed objective.
''')
files=[]
for file in sorted(folder.rglob('*')):
    if file.is_symlink():
        files.append(dict(file=str(file.relative_to(folder)),type='symlink',target=os.readlink(file)))
    elif file.is_file():
        files.append(dict(type='file',**pin(file,folder)))
manifest=folder/'M2.3-R5-DELIVERY-MANIFEST.json'
save(manifest,dict(schema='m2-3-r5-delivery-manifest-v1',status=ledger['status'],folder=str(folder),
    runtimeSourceCommit=receipt['sourceHead'],taskCommit=head,sourceDirtyAtDelivery=False,
    immutablePackageReceipt=pin(args.receipt,args.receipt.parent),entry=entry,
    embeddedImageInstances=review['imageInstances'],reviewPages=len(review['pages']),files=files,
    ordinaryFiles=sum(row['type']=='file' for row in files),symlinks=sum(row['type']=='symlink' for row in files),
    bytes=sum(row.get('bytes',0) for row in files),nativeSessions=30,userAcceptance=False,
    windows='NOT_RUN',physicalInput='NOT_RUN',offlineElectronRendering=True,
    mainPromotion=False,remotePush=False,publication=False))
print(json.dumps(dict(folder=str(folder),taskCommit=head,files=len(files),manifestSha256=digest(manifest),
    reviewPages=len(review['pages']),embeddedImageInstances=review['imageInstances'])))
