"""Pin the unselected stadium candidate without claiming native or user acceptance."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from PIL import Image
from showcase_registration import capacity, register

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
native = Path('.artifacts/m2-4/urban-buildings-native-batch56-v1')
art = Path('.artifacts/m2-4/urban-buildings-authoring-batch56-v1')
verification_file = art / 'verification-v1.json'
verified = read(verification_file)
assert verified['status'] == 'PASS'
assert verified['counts']['families'] == verified['counts']['members'] == 8
assert verified['counts']['densityFrames'] == 64
assert all(size <= 128 * 1024**2 for size in verified['decodedInputBytes'].values())
patch = Path(verified['pack'])
assert sha(patch / 'manifest.json') == verified['sha256']
contract_file = native / 'contract.json'
contract = read(contract_file)
sources = read(native / 'source.json')['sources']
assert sha(native / 'source.json') == contract['preparedSourceSha256']
jobs_file = art / 'imagegen-jobs-v4.json'
jobs = read(jobs_file)['jobs']
work = read(art / 'worklist.json')
overrides = read(art / 'slot-overrides.json')
recipe_file = art / 'urban-buildings-m2-4-batch56-r1/recipe.json'
recipe = read(recipe_file)
sampling = {s['key']: s for s in recipe['actualSampling']}
assert len(jobs) == 16 and len(sampling) == len(overrides) == 32
mothers = []
for number, job in enumerate(jobs, 1):
    receipt_file = art / f'imagegen-receipt-{number:02d}.json'
    receipt = read(receipt_file)
    master, raw = Path(receipt['workspaceFile']), Path(receipt['rawFile'])
    reference = Path(job['reference'])
    assert receipt['status'] == 'PASS' and receipt['tool'] == 'built-in image_gen'
    assert receipt['prompt'] == job['prompt']
    assert sha(master) == sha(raw) == receipt['rawSha256'] == receipt['workspaceSha256']
    assert sha(reference) == job['referenceSha256'] == receipt['referenceSha256']
    assert receipt['opaqueOuterEdgePixels'] == receipt['opaqueCellBoundaryPixels'] == 0
    image = Image.open(master).convert('RGBA')
    for key in job['slots']:
        info = {**work['slots'][key], **overrides[key]}
        rect, _ = register(image, info, job['boardSize'])
        sample = sampling[key]
        assert sample['sha256'] == sha(master) and sample['sourceRect'] == rect
        assert sample['availableDensity'] == capacity(rect, info['nativeBounds']) >= 4
    mothers.append(dict(receipt=pin(receipt_file), raw=pin(raw), workspace=pin(master),
                        reference=pin(reference), slots=job['slots']))
dependencies, maps = {}, set()
for source in sources:
    assert source['hasShadow'] and source['totalFrames'] == 8
    assert len(source['frames']) == 8
    assert not source['nativeRules'].get('CanBeOccupied')
    assert str(source['nativeRules']['LeaveRubble']).lower() == 'yes'
    for binding in source['bindings']:
        assert binding['role'] == 'body' and 'yr:xarena.map' in binding['mapIds']
        maps.update(binding['mapIds'])
    paths = [(source['nativeFile'], source['sha256'])]
    for frame in source['frames']:
        paths.extend([(frame['file'], frame['rgbaSha256']), (frame['indexFile'], frame['indexSha256'])])
    for name, digest in paths:
        file = native / 'native' / name
        assert sha(file) == digest
        dependencies[str(file)] = pin(file)
for source in contract['sources'].values():
    for palette in [source['palette'], *source.get('framePalettes', {}).values()]:
        file = native / 'native' / (palette['sha256'] + '.pal')
        assert sha(file) == palette['sha256']
        dependencies[str(file)] = pin(file)
selector = Path('.local/environment-urban-selection.json')
assert read(selector)['revision'] == 'urban-environment-m2-4-buildings-batch55-v1'
assert read(Path('desktop/environment-urban-hd-contract.json'))['selectedPack'] == read(selector)
main = Path('/Users/Aone/RA2remaster/ra2-hd')
assert not subprocess.check_output(['git', '-C', str(main), 'status', '--porcelain'], text=True).strip()
out = dict(schema='m2-4-urban-stadium-unselected-checkpoint-v1',
    status='STATIC_COMPLETE_UNSELECTED_MAC_AND_WHOLE_ASSEMBLY_VISUAL_PENDING',
    families=sorted(contract['families']), originalMapIds=sorted(maps),
    sourceStates=32, densityFrames=64, nativeApplicableStateImagesPlanned=24,
    unusedBodySlots=8, unusedPolicy='The original stadium disallows garrison. Preserve slot 2; do not change rules to activate it.',
    source=pin(native / 'source.json'), sourceContract=pin(contract_file), preflight=pin(native / 'preflight-v1.json'),
    independentVerification=pin(verification_file), exportRecipe=pin(recipe_file), exactPrompts=pin(jobs_file),
    worklist=pin(art / 'worklist.json'), slotRegistration=pin(art / 'slot-overrides.json'),
    materialProfile=pin(art / 'material-profile-v1.json'),
    minimumActualMotherDensity=min(s['availableDensity'] for s in sampling.values()),
    motherCount=len(mothers), generationMode='Built-in image_gen; no external API or raster-detail substitute',
    mothers=mothers, originalDependencies=list(dependencies.values()),
    ignoredCandidatePack=dict(path=str(patch), manifest=pin(patch / 'manifest.json'),
        completeFiles=[pin(p) for p in sorted(patch.rglob('*')) if p.is_file()]),
    comparisonIndexes=[pin(art / f'comparison-{d}x-v1/index.json') for d in [2, 4]],
    decodedInputBytes=verified['decodedInputBytes'], selected=False, preservedSelectedPack=read(selector),
    priorReviewHandoff=pin(Path('docs/m2-4-urban-buildings-batch55-20261016.json')),
    sourceHead=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    sourceTreeState='Base commit plus pinned production tools; no runtime source change',
    productionTools=[pin(Path(name)) for name in ['scripts/m2-4/prepare-urban-buildings-batch54.py',
        'scripts/m2-4/layout-urban-buildings-batch55.py', 'scripts/m2-4/record-urban-building-mother.py',
        'scripts/m2-4/checkpoint-urban-stadium-batch56.py', 'scripts/m2/export-showcase-shp.py',
        'scripts/m2/verify-showcase-shp.py']],
    mainHead=subprocess.check_output(['git', '-C', str(main), 'rev-parse', 'HEAD'], text=True).strip(),
    mainClean=True, mainMutated=False, native='NOT_RUN_BATCH56', visual='PENDING', windows='NOT_RUN', m24Complete=False,
    remaining='Whole original stadium assembly and all 24 applicable native states at 2X/4X, matched Original, lifecycle, grouped embedded HTML and user acceptance. No coverage-delta credit before native closure.')
target = Path('docs/m2-4-urban-stadium-batch56-20261016.json')
with target.open('x') as stream:
    stream.write(json.dumps(out, indent=2) + '\n')
print(json.dumps(dict(status=out['status'], patchFiles=len(out['ignoredCandidatePack']['completeFiles']),
    minimumDensity=out['minimumActualMotherDensity'], maps=out['originalMapIds'])))
