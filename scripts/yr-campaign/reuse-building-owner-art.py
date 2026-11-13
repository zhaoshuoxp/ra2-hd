"""Preserve accepted building paint while adapting its original YR owner region."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('prepared_stage', type=Path)
parser.add_argument('accepted_receipt', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('revision')
parser.add_argument('recipe', type=Path)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
stage = args.output.resolve()
stage.mkdir(exist_ok=False)
original = read(args.prepared_stage / 'prepared/source.json')
source, = original['sources']
assert original['edition'] == 'yr' and source['remapable'] and not source['framePalettes']
assert all(binding['kind'] == 'building' for binding in source['bindings'])
accepted = read(args.accepted_receipt)
accepted_member, = accepted['bundle']['members']
assert accepted['acceptedPayloadsReplaced'] == 0
assert accepted['theater'] == original['theater'] and accepted_member['member'] == source['member']
donor_file = ROOT / '.local/campaign' / accepted['mission'].get('edition', 'ra2') \
    / accepted['mission']['mission'][:-4] / accepted_member['manifest']
assert sha(donor_file) == accepted_member['sha256']
donor = read(donor_file)
assert donor['source']['sha256'] == source['sha256']
accepted_recipe = Path(accepted['preparation']['recipe'])
assert sha(accepted_recipe) == accepted['preparation']['recipeSha256']
previous_source_file = ROOT / read(accepted_recipe)['source']
assert sha(previous_source_file) == accepted['preparation']['originalSourceJsonSha256']
previous_source, = read(previous_source_file)['sources']
assert previous_source['sha256'] == source['sha256'] and previous_source['remapable'] is False
for key in ['canvas', 'bodyFrames', 'totalFrames', 'hasShadow', 'palette', 'framePalettes']:
    assert previous_source[key] == source[key], key
for current, previous in zip(source['frames'], previous_source['frames'], strict=True):
    assert all(current[key] == previous[key] for key in ['slot', 'origin', 'size', 'empty', 'indexSha256'])
assert donor['logical'] == dict(canvas=source['canvas'], frames=[dict(nativeFrame=frame['slot'],
    trimOrigin=frame['origin'], trimSize=frame['size'],
    legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
    for frame in source['frames'][:source['bodyFrames']]])
shutil.copytree(args.prepared_stage / 'prepared', stage / 'prepared')
contract = read(args.prepared_stage / 'contract.json')
write(stage / 'contract.json', contract)
family, declared = next(iter(contract['families'].items()))
assert declared['editions'] == ['yr'] and declared['members'] == [source['member']]
authorization = Path('docs/campaign-art/yr-v1/authorization.json')
preparation = read(args.prepared_stage / 'preparation.json')
recipe = dict(edition='yr', authorization=dict(file=str(authorization), sha256=sha(authorization)),
    source=str(Path(read(Path(preparation['recipe']))['source'])),
    sourceJsonSha256=preparation['originalSourceJsonSha256'], mission=original['mission'],
    missionSha256=original['missionSha256'], identity=source['identity'], kind='building',
    sourceSha256=source['sha256'], family=family, acceptedBase=dict(manifestFile=str(donor_file),
        manifestSha256=sha(donor_file), receipt=str(args.accepted_receipt), receiptSha256=sha(args.accepted_receipt)))
assert not args.recipe.exists()
write(args.recipe, recipe)
preparation.update(recipe=str(args.recipe.resolve()), recipeSha256=sha(args.recipe), masters=[],
    acceptedBase=recipe['acceptedBase'],
    qualification='All accepted base RGBA bytes remain identical. Only original YR owner-material data is adapted.')
write(stage / 'preparation.json', preparation)
write(stage / 'material-profile.json', {})
metadata = copy.deepcopy(donor)
metadata.update(packId='environment-' + source['member'].replace('.', '-').replace('_', '-'), packRevision=args.revision)
metadata['color'] = dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data', authoredBody=dict(
    schema='yr-source-pinned-accepted-base-owner-adaptation-v1', sourceSha256=source['sha256'],
    acceptedBase=recipe['acceptedBase'], originalIndices=[frame['indexSha256']
        for frame in source['frames'][:source['bodyFrames']]], unusedMarkers=None))
palette = np.frombuffer((stage / 'prepared/native' / source['palette']['member']).read_bytes(), np.uint8).reshape(256, 3).astype(float) * 4
folder = stage / 'pack/members' / source['member'].replace('.', '-')
folder.mkdir(parents=True)
audit, allocations = [], {2: 0, 4: 0}
for variant in metadata['variants']:
    density = variant['density']
    assert density in [2, 4]
    for page in variant['pages']:
        previous = {role: donor_file.parent / page[role] for role in ['base', 'data']}
        assert all(sha(previous[role]) == page[role + 'Sha256'] for role in previous)
        base = Image.open(previous['base']).convert('RGBA')
        data = np.array(Image.open(previous['data']).convert('RGBA'))
        original_data = data.copy()
        for frame in [frame for frame in variant['frames'] if frame['page'] == page['id']]:
            slot = frame['nativeFrame']
            native = source['frames'][slot]
            indices = np.frombuffer((stage / 'prepared/native' / native['indexFile']).read_bytes(), np.uint8)
            assert hashlib.sha256(indices.tobytes()).hexdigest() == native['indexSha256']
            colors = palette[indices]
            original_red = (colors[:, 0] > 35) & (colors[:, 0] > colors[:, 1] * 1.5) & (colors[:, 0] > colors[:, 2] * 1.5)
            owner = (indices >= 16) & (indices <= 31)
            assert owner.any() and not (original_red & ~owner).any(), 'Mixed fixed red requires spatial material qualification'
            x, y, width, height = frame['sampleRect']
            crop = base.crop((x, y, x + width, y + height))
            rgba = np.array(crop)
            red, green, blue = [rgba[..., channel].astype(float) for channel in range(3)]
            paint = (rgba[..., 3] > 0) & (red > 35) & (red > green * 1.5) & (red > blue * 1.5)
            paint &= green - blue < (red - blue) * .25
            assert paint.any()
            material = data[y:y + height, x:x + width]
            before = original_data[y:y + height, x:x + width]
            assert not before[..., :3].any() and np.all(before[..., 3] == 255)
            material[..., 0] = paint * 255
            material[..., 1] = np.where(paint,
                np.abs(red[..., None] - palette[16:32, 0]).argmin(2).astype(np.uint8), 0)
            full = Image.new('RGBA', tuple(value * density for value in source['canvas']))
            full.paste(crop, tuple(value * density for value in native['origin']))
            target = stage / f'frames-{density}x' / source['member']
            target.mkdir(parents=True, exist_ok=True)
            full.save(target / f'{slot:03d}.png')
            audit.append(dict(density=density, frame=slot, unchangedAcceptedBaseRgbaSha256=hashlib.sha256(rgba.tobytes()).hexdigest(),
                originalOwnerPixels=int(owner.sum()), authoredOwnerPixels=int(paint.sum())))
        target = folder / str(density) / page['id']
        target.mkdir(parents=True)
        os.link(previous['base'], target / 'base.png')
        Image.fromarray(data).save(target / 'data.png')
        for role in ['base', 'data']:
            file = target / (role + '.png')
            page.update({role: f'{density}-{page["id"]}-{role}.png', role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
        assert sha(target / 'base.png') == sha(previous['base'])
        allocations[density] += base.width * base.height * 8
write(folder / 'manifest.json', metadata)
write(stage / 'pack/manifest.json', dict(schema='environment-shp-pack-v1', theater=original['theater'], editions=['yr'],
    revision=args.revision, families={family: dict(familyHash=declared['familyHash'], members=[dict(member=source['member'],
        sha256=sha(folder / 'manifest.json'), path=str((folder / 'manifest.json').relative_to(stage / 'pack')))])}))
write(stage / 'accepted-base-comparison.json', dict(status='PASS_EXACT_ACCEPTED_BASE_RGBA_ONLY_NATIVE_OWNER_DATA_ADAPTED',
    accepted=recipe['acceptedBase'], states=audit, acceptedBasePagesHardlinked=True,
    originalGeometryPalettesAndShadowsUnchanged=True, userVisualAcceptance='PENDING'))
write(stage / 'sampling-audit.json', dict(status='PASS_ACCEPTED_INDEPENDENT_DENSITIES_RETAINED', frames=[],
    acceptedBase=recipe['acceptedBase'], unpooledRgbaBytes=allocations))
subprocess.run(['python3', 'scripts/yr-campaign/verify-authored-family.py', str(stage)], check=True)
verification = read(stage / 'verification.json')
verification['counts']['preservedAcceptedBaseDensityFrames'] = len(audit)
verification['acceptedBaseComparison'] = dict(file=str(stage / 'accepted-base-comparison.json'),
    sha256=sha(stage / 'accepted-base-comparison.json'))
write(stage / 'verification.json', verification)
print(json.dumps(dict(stage=str(stage), family=family, preservedAcceptedBaseDensityFrames=len(audit))))
