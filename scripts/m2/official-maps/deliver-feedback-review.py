"""Add the verified R4 review handoff to its complete copied Mac package."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/m2-3/feedback-r4-v1'


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def read(file):
    return json.loads(file.read_text())


def save(file, value):
    assert not file.exists(), str(file)
    file.write_text(json.dumps(value, indent=2) + '\n')


def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        assert digest(source) == digest(target), str(target)
    else:
        shutil.copyfile(source, target)
    assert digest(source) == digest(target)


def pin(file, base):
    return dict(file=str(file.relative_to(base)), bytes=file.stat().st_size, sha256=digest(file))


receipt_path = Path(sys.argv[1])
receipt = read(receipt_path)
folder = Path(receipt['folder'])
ledger = read(ROOT / 'docs/m2-3-feedback-r4.json')
assert ledger['status'] == 'PASS_TECHNICAL_REVIEW_READY_USER_VISUAL_PENDING'
native = read(ART / 'native-summary-v1.json')
assert native['status'] == 'PASS_ALL_28_COPIED_R4_NATIVE_CASES'
review = read(folder / 'M2.3-R4-Feedback-Review/review-manifest.json')
assert review['status'] == 'PASS_ALL_EMBEDDED_PNG_BYTES_DIMENSIONS_AND_FULL_DECODING'
assert not review['browserRendered'] and not review['userAcceptance']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True)
assert not dirty, 'Commit the final review tools and documentation before delivery.'
assert subprocess.check_output(['git', 'diff', receipt['sourceHead'], '--', 'src', 'desktop'],
                               cwd=ROOT, text=True) == ''

copy(receipt_path, folder / 'M2.3-R4-PACKAGE-RECEIPT.json')
copy(ROOT / 'docs/m2-3-feedback-r4.json', folder / 'M2.3-R4-ACCEPTANCE.json')
copy(ROOT / 'docs/m2-3-feedback-r4.md', folder / 'M2.3-R4-TECHNICAL-HANDOFF.md')
evidence = []
for item in ledger['evidence']:
    source = Path(item['file'])
    assert digest(source) == item['sha256']
    if source.is_relative_to(folder):
        target = source
    else:
        target = folder / 'M2.3-R4-Evidence' / source.relative_to(ROOT / '.artifacts/m2-3')
        copy(source, target)
    evidence.append(dict(source=str(source), **pin(target, folder)))
for case in native['cases']:
    source = Path(case['file'])
    assert digest(source) == case['sha256']
    target = folder / 'M2.3-R4-Evidence/native' / source.parent.name / source.name
    copy(source, target)
    evidence.append(dict(source=str(source), **pin(target, folder)))
save(folder / 'M2.3-R4-EVIDENCE-INDEX.json', dict(schema='m2-3-r4-delivery-evidence-v1', records=evidence))

local = ROOT / '.local'
environment = read(local / 'environment-selection.json')
terrain = read(local / 'terrain-selection.json')
coverage = read(ROOT / 'desktop/yuri-building-coverage.json')
changed_faction = {name: coverage[name] for name in ['yuri-yagntc-temperate', 'yuri-yagntc-snow']}
pack_roots = [local / 'environment-packs' / environment['revision'],
              local / 'terrain-packs' / terrain['revision']]
pack_roots.extend(local / row['familyPath'].rsplit('/', 1)[0] for row in changed_faction.values())
for row in changed_faction.values():
    family_file = local / row['familyPath']
    assert digest(family_file) == row['familyHash']
    for member in read(family_file)['members']:
        member_root = local / 'hd-packs' / member['packId'] / member['revision']
        assert digest(member_root / 'manifest.json') == member['sha256']
        pack_roots.append(member_root)
resources = [pin(file, local) for pack in sorted(set(pack_roots))
             for file in sorted(pack.rglob('*')) if file.is_file()]
prepared_contract = read(ROOT / 'desktop/prepared-hd-contract.json')
prepared_index = local / prepared_contract['indexPath']
assert digest(prepared_index) == prepared_contract['sha256']
prepared = read(prepared_index)
resources.append(pin(prepared_index, local))
prepared_pages = 0
for member, densities in prepared['members'].items():
    for density, pages in densities.items():
        for name, descriptor in pages.items():
            file = local / 'prepared-hd' / member / density / f'{name}.bin'
            row = pin(file, local)
            assert row['sha256'] == descriptor['sha256'] and row['bytes'] == descriptor['bytes']
            resources.append(row)
            prepared_pages += 1
assert len(prepared['members']) == 440 and prepared_pages == 1205
for row in resources:
    copied = Path(receipt['resources']) / row['file']
    assert copied.stat().st_size == row['bytes'] and digest(copied) == row['sha256']
resources.extend(pin(local / name, local) for name in ['environment-selection.json', 'terrain-selection.json'])
selectors = [pin(ROOT / name, ROOT) for name in ['desktop/environment-hd-contract.json',
    'desktop/terrain-hd-contract.json', 'desktop/yuri-building-coverage.json', 'desktop/prepared-hd-contract.json']]
save(folder / 'M2.3-R4-RESOURCE-HANDOFF.json', dict(schema='m2-3-feedback-resource-handoff-v1',
    taskResourceRoot=str(local), copiedWorldRoot=receipt['resources'], copiedUiRoot=receipt['uiRoot'],
    copiedProfile=receipt['profile'], runtimeSourceCommit=receipt['sourceHead'], taskCommit=head,
    packageReceiptSha256=digest(receipt_path), environment=environment, terrain=terrain,
    changedFactionFamilies=changed_faction, preparedRegistration=receipt['preparedRegistration'],
    preparedIndex=prepared_contract, preparedMembers=len(prepared['members']), preparedPages=prepared_pages,
    uiManifestSha256=receipt['uiManifestSha256'], files=resources, selectors=selectors,
    transferPolicy='ADD_IF_ABSENT_OR_IDENTICAL for these unique versioned resources. Verify every SHA before '
                   'coordinating selector changes after user acceptance. Reconcile shared files semantically; '
                   'preserve peer worktrees and the nine protected paths.',
    mainIntegration='NOT_PERFORMED', remotePush='NOT_PERFORMED', publication='NOT_PERFORMED'))

entry = 'M2.3-R4-Feedback-Review/M2.3-R4-REVIEW-EMBEDDED.html'
old_review = '/Users/Aone/RA2remaster/M2.3-Embedded-Review-20261009-v1/M2.3-REVIEW-EMBEDDED.html'
start = folder / 'M2.3-R4-START-HERE.md'
assert not start.exists()
start.write_text(f'''# M2.3 Temperate Review R4

Open [{entry}]({entry}) to review all repaired materials, red/blue owner comparisons and copied native evidence. Every image is embedded directly in its page, with actual display dimensions retained. Keep the complete review directory together for offline navigation. The entry page includes embedded examples; detailed pages open one building or state at a time.

Launch `{Path(receipt['app']).name}` or `Launch-Isolated-Review.command`. Keep the application, world resources and UI resources together. This is a complete independent Mac package with its own `M2.3-Review-Profile`.

R4 revises 29 material families (40 SHP members), all 12 OVRPSB terrain members, the review owner-layer composition, and the confirmed YAGNTC owner controls across ten TEMPERATE/SNOW members. It preserves 209 environment families, 621 terrain members and the accepted base art of other faction buildings. The broader owner audit covers 445 selected manifests and 441 distinct native SHP identities; it does not claim that every old building was independently runtime-tested.

All 28 focused copied-Mac sessions pass: nine reopened map/state cases at each density, YAGNTC red/blue comparisons in both theaters at each density, airport/oil-well red/blue comparisons at each density, wooden bridge passage/damage/demolition/repair, complete outpost fallback and map release. World limits remain 512 MiB at 2X and 1,280 MiB at 4X; prepared CPU and UI remain 128 and 16 MiB.

The native CTMSC12 availability exception and the earlier M2.3 native map limitations remain explicit. Static exports and review pictures are complete for that family. The remaining artwork passed the user's earlier review and remains preserved. Its retained embedded review is [{old_review}]({old_review}); the R3 app and resources remain byte-identical.

The app is frozen from `{receipt['sourceHead']}`. Final validation/review tools and documentation are committed at `{head}` with shipping `src` and `desktop` unchanged. The original package receipt remains an immutable packaging snapshot, including its observed validation-tool dirty state. The current technical closure is `M2.3-R4-ACCEPTANCE.json`, with resource transfer pins in `M2.3-R4-RESOURCE-HANDOFF.json` and all delivery bytes in `M2.3-R4-DELIVERY-MANIFEST.json`.

Your visual acceptance of the repairs is pending. Windows execution and physical input remain `NOT_RUN`; browser layout rendering was not exercised, while every embedded PNG passed byte, dimension and full-decoding validation. Main integration, push and publication have not occurred. Continue this execution conversation for R4 review and bounded fixes. Start a new one only after acceptance and a materially changed objective.
''')

files = []
manifest_file = folder / 'M2.3-R4-DELIVERY-MANIFEST.json'
assert not manifest_file.exists()
for file in sorted(folder.rglob('*')):
    if file.is_symlink():
        files.append(dict(file=str(file.relative_to(folder)), type='symlink', target=os.readlink(file)))
    elif file.is_file():
        files.append(dict(type='file', **pin(file, folder)))
save(manifest_file, dict(schema='m2-3-feedback-delivery-manifest-v1',
    status='PASS_TECHNICAL_REVIEW_READY_USER_VISUAL_PENDING', folder=str(folder),
    runtimeSourceCommit=receipt['sourceHead'], taskCommit=head, sourceDirtyAtDelivery=dirty,
    immutablePackageReceipt=pin(receipt_path, receipt_path.parent),
    entry=entry, embeddedImageInstances=review['imageInstances'], reviewPages=len(review['pages']),
    files=files, ordinaryFiles=sum(row['type'] == 'file' for row in files),
    symlinks=sum(row['type'] == 'symlink' for row in files),
    bytes=sum(row.get('bytes', 0) for row in files), nativeSessions=28,
    userAcceptance=False, windows='NOT_RUN', physicalInput='NOT_RUN', browserRendered=False,
    mainPromotion=False, remotePush=False, publication=False))
print(json.dumps(dict(folder=str(folder), taskCommit=head, files=len(files),
                      manifestSha256=digest(manifest_file), reviewPages=len(review['pages']),
                      embeddedImageInstances=review['imageInstances'])))
