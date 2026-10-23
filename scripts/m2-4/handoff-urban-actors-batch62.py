"""Pin ignored artwork, native inputs, delivered HTML and the exact validation runtime."""
import hashlib
import json
import subprocess
from pathlib import Path

read = lambda p: json.loads(p.read_text())


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b''):
            digest.update(block)
    return digest.hexdigest()


def record(file):
    return dict(file=str(file), sha256=sha(file), bytes=file.stat().st_size)


base = Path('.artifacts/m2-4')
root = base / 'urban-actors-native-batch62-v1'
art = base / 'urban-actors-authoring-batch62-v1'
voxel = base / 'urban-actors-voxel-authoring-batch62-v2'
review = base / 'urban-actors-review-batch62-v2'
closure = read(root / 'native-closure.json')
delta = read(root / 'coverage-delta.json')
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
selected = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(selected / 'manifest.json') == contract['selectedPack']['sha256']
assert read(Path('.local/environment-urban-selection.json')) == contract['selectedPack']
selection = read(root / 'selection-v1.json')
before = Path('.local/environment-packs') / selection['priorContract']['selectedPack']['revision']
preserved = []
for file in before.rglob('*'):
    if file.is_file() and file != before / 'manifest.json':
        assert sha(file) == sha(selected / file.relative_to(before))
        preserved.append(str(file.relative_to(before)))
resources = [record(file) for file in sorted(selected.rglob('*')) if file.is_file()]
for identity in contract['vxl']:
    for variant in contract['vxl'][identity]['variants']:
        file = Path('.local') / variant['path']
        assert sha(file) == variant['hash']
        resources.extend(record(payload) for payload in sorted(file.parent.rglob('*')) if payload.is_file())
source = read(root / 'source.json')
native_inputs = set()
for entry in source['sources']:
    native_inputs.add(root / 'native' / entry['nativeFile'])
    native_inputs.add(root / 'native' / (entry['palette']['sha256'] + '.pal'))
    if entry.get('hva'):
        native_inputs.add(root / 'native' / entry['hva']['nativeFile'])
    for frame in entry.get('frames', []):
        native_inputs.update(root / 'native' / frame[key] for key in ['file', 'indexFile'])
native_records = [record(file) for file in sorted(native_inputs)]
authors = [record(file) for folder in [art, voxel, base / 'urban-actors-voxel-references-batch62-v1']
    for file in sorted(folder.rglob('*')) if file.is_file()]
for archive in delta['archives']:
    file = Path(archive['file'])
    assert file.stat().st_size == archive['bytes'] and sha(file) == archive['sha256']
material = read(art / 'material-profile-v2.json')['nativeAcceptedSubpixelMaterials']['ssrv.shp']
material_files = {Path(material['acceptedPackManifest'])}
for declaration in material['materials'].values():
    material_files.add(Path(declaration['acceptedMemberManifest']))
    material_files.update(Path(variant['file']) for variant in declaration['variants'].values())
index_file = root / 'resource-handoff-v2.json'
resource_index = dict(status='PASS_COMPLETE_IGNORED_RESOURCE_AND_AUTHORING_CLOSURE',
    selectedEnvironment=contract['selectedPack'], selectedRasterFiles=resources,
    protectedPriorPayloadFiles=preserved, nativeInputs=native_records, authoringInputsAndReceipts=authors,
    inheritedAcceptedMaterialDependencies=[record(file) for file in sorted(material_files)],
    sourceGuide=record(root / 'source.json'), nativeDirectory=dict(path=str(root / 'native'),
        resolvesTo=str((root / 'native').resolve())), originalArchives=delta['archives'],
    generation=dict(tool='built-in image_gen', promptSets=[record(file) for folder in [art, voxel]
        for file in sorted(folder.glob('imagegen-jobs*.json'))],
        policy='All raw mother outputs were copied into this workspace with exact generation receipts. Rejected candidates remain unselected and retained.'),
    storagePolicy='Existing isolated task resources; no per-batch Mac game or resource copy.')
with index_file.open('x') as stream:
    stream.write(json.dumps(resource_index, indent=2) + '\n')
transfer = read(review / 'desktop-transfer-v1.json')
for entry in transfer['files']:
    assert sha(Path(entry['file'])) == entry['sha256']
main = Path('/Users/Aone/RA2remaster/ra2-hd')
git = lambda *args: subprocess.check_output(['git', *args], text=True).strip()
main_head = subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip()
main_clean = not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
assert main_clean
stage = read(root / 'active-stage.json')
assert not git('diff', stage['runtimeSourceHead'], 'HEAD', '--', 'src', 'desktop', 'public', 'package.json')
handoff = dict(schema='m2-4-urban-actors-batch62-handoff-v1',
    status='MAC_TECHNICAL_COMPLETE_COMBINED_VISUAL_REVIEW_READY',
    mainHead=main_head, mainClean=main_clean, mainWasMutatedByThisBatch=False,
    sourceCheckpoint=git('rev-parse', 'HEAD'), runtimeSourceHead=stage['runtimeSourceHead'],
    counts=dict(newShpFamilies=3, newVxlFamilies=6, shpMembers=3, originalBodyFrames=602,
        densityFrames=1204, voxelNativeHeadings=48, densityBearings=96, priorShpFamilies=284,
        protectedPriorPayloadFiles=len(preserved), selectedShpFamilies=287, priorVoxelDescriptors=2,
        nativeCases=12, officialMapEntries=32, uniqueMapHashes=26, remainingUrbanAuthoredSourceGaps=0),
    selectedEnvironment=contract['selectedPack'], sourceContract=record(contract_file),
    resourceHandoff=record(index_file), nativeClosure=record(root / 'native-closure.json'),
    sourceCoverageDelta=record(root / 'coverage-delta.json'),
    runtimeStage=record(root / 'active-stage.json'), build=str(stage['build']),
    desktopReview=transfer['files'], reviewManifest=record(review / 'review-manifest.json'),
    staticReviewQa=record(review / 'static-qa-v1.json'),
    browserInteraction='NOT_RUN_BROWSER_TOOL_DENIED_LOCAL_FILE_PROTOCOL; NO_POLICY_WORKAROUND_ATTEMPTED',
    tests=dict(passed=7, assertions=131, entryTypecheck='PASS', isolatedBuild='PASS'),
    budgets=dict(world2x=512*1024**2, world4x=1280*1024**2, preparedCpu=128*1024**2, ui=16*1024**2),
    observedWorldBytes=closure['worldAllocationBytes'], observedPreparedPeakBytes=closure['preparedPeakBytes'],
    visual='PENDING_BATCH62_ONLY', priorBatchAcceptance='UNCHANGED', windows='NOT_RUN',
    localMainIntegration='NOT_PERFORMED', remotePush='NOT_PERFORMED', m24Complete=False,
    remaining='Batch62 visual acceptance, other explicit pending decisions, NewUrban and Desert production/coverage, final scope closure and independent Mac delivery.')
Path('docs/m2-4-urban-actors-batch62-20261016.json').write_text(json.dumps(handoff, indent=2) + '\n')
print(json.dumps(dict(status=handoff['status'], protectedPriorPayloads=len(preserved),
    resourceFiles=len(resources), authoringFiles=len(authors), nativeInputs=len(native_records),
    mainHead=main_head, sourceCheckpoint=handoff['sourceCheckpoint'], resourceHandoff=record(index_file))))
