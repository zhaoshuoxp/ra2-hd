"""Export independently sampled turret paint at verified original world pivots."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('selection', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/building-turrets'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.open('x').write(json.dumps(value, indent=2) + '\n')
selection = read(args.selection)
assert selection['runtimeRegistration'] == 'NOT_REGISTERED' and selection['userVisualAcceptance'] == 'PENDING'
assert set(selection['masters']) == {str(angle) for angle in range(0, 360, 45)}
reference_file = ROOT / selection['sourceReference']
assert sha(reference_file) == selection['sourceReferenceSha256']
reference = read(reference_file)
assert reference['status'] == 'PASS_ORIGINAL_NATIVE_TURRET_EIGHT_REFERENCE_BEARINGS_NO_HD_QUALIFICATION'
assert reference['before'] == reference['after'] and reference['identity'] == selection['identity']
job, = [row for row in read(BASE / 'worklist-r1.json')['candidates'] if row['id'] == selection['identity']]
source_pins = read(BASE / 'original-sources-r1.json')['rows']
sources = {row['source']['member']: row['source']['sha256'] for row in job['dependencies'] if row.get('nativeVoxelAttachment')}
for member, expected in sources.items():
    assert sha(BASE / member) == expected == next(row['sha256'] for row in source_pins if row['member'] == member)
material, = [row for row in read(BASE / 'material-semantics-r1.json')['rows'] if row['member'] == selection['vxl']]
palette, = [row['palette'] for row in job['dependencies'] if row['role'] == 'TURRET_VXL']
canvas, offset = selection['canvas'], selection['offset']
assert all(isinstance(value, int) for value in [*canvas, *offset])
output = args.output.resolve(); output.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
counts = []


def owner_paint(rgba):
    red, green, blue = [rgba[..., channel].astype(float) for channel in range(3)]
    return ((rgba[..., 3] > 0) & (red > green + 2) & (red > blue + 2)
        & (abs(green - blue) <= np.maximum(2, (red - np.maximum(green, blue)) * .4)))


for density in [2, 4]:
    target = output / str(density); target.mkdir()
    width, height = [value * density for value in canvas]
    overview = Image.new('RGBA', (width * 4, (height + 40) * 2), '#34483d')
    frames = []
    for index, bearing in enumerate(range(0, 360, 45)):
        native, = [frame for frame in reference['frames'] if frame['bearing'] == bearing]
        declaration = selection['masters'][str(bearing)]
        master_file = ROOT / declaration['file']; assert sha(master_file) == declaration['sha256']
        master = Image.open(master_file).convert('RGBA')
        assert master.getchannel('A').getextrema()[0] == 0
        bounds = master.getchannel('A').point(lambda value: 255 if value >= 4 else 0).getbbox()
        assert bounds
        master = master.crop(bounds)
        box = [value - offset[i % 2] for i, value in enumerate(native['logicalPivotBounds'])]
        rect = [round(value * density) for value in box]
        size = rect[2] - rect[0], rect[3] - rect[1]
        assert min(master.width / size[0], master.height / size[1]) >= 1, 'Insufficient independent master capacity'
        assert 0 <= rect[0] < rect[2] <= width and 0 <= rect[1] < rect[3] <= height
        image = Image.new('RGBA', (width, height))
        image.alpha_composite(master.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA'), rect[:2])
        rgba = np.array(image)
        mask = np.zeros((height, width), np.uint8)
        if material['ownerVoxelCount']:
            assert native['ownerRedReference'], 'Owner material needs a registered native red-palette reference'
            original = np.array(Image.open(reference_file.parent / native['file']).convert('RGBA'))
            native_owner = owner_paint(original)
            paint = owner_paint(rgba)
            assert bool(native_owner.any()) == bool(paint.any()), 'Original visible owner-region presence differs'
            mask[paint] = 255
        else:
            assert not mask.any()
        image.save(target / f'{bearing}.png')
        (target / f'{bearing}.mask').write_bytes(mask.tobytes())
        frames.append(dict(heading=bearing, base=f'{bearing}.png', baseSha256=sha(target / f'{bearing}.png'),
            baseBytes=(target / f'{bearing}.png').stat().st_size, mask=f'{bearing}.mask',
            maskSha256=sha(target / f'{bearing}.mask'), maskBytes=width * height,
            master=declaration, sourceNativeLogicalBounds=native['logicalPivotBounds'],
            registeredRect=rect, independentMasterCapacity=min(master.width / size[0], master.height / size[1]),
            ownerPixels=int((mask != 0).sum()), upsampledArtwork=False))
        x, y = index % 4 * width, index // 4 * (height + 40)
        ImageDraw.Draw(overview).text((x + 8, y + 6), str(bearing), fill='white', font=font)
        overview.alpha_composite(image, (x, y + 40))
    manifest = dict(schemaVersion=1, family=selection['identity'], theater=job['theater'], density=density,
        revision=args.revision, canvas=canvas, offset=offset, headings=frames, sources=sources,
        palette=palette, gpuBytes=8 * width * height * 5 + 4,
        sourceRegistration=dict(file=str(reference_file.relative_to(ROOT)), sha256=sha(reference_file),
            sourceMap=reference['actor']['launch']['sourceSha256'],
            projection='Original VXL geometry and world pivot; source imagery is used only for registration and material identity.'),
        authoringPolicy='New HD masters independently sampled at both densities. Original VXL/HVA, world pivots, ownership, directions, weapon logic and simulation timing remain unchanged.',
        userVisualAcceptance='PENDING', status='EXPORTED_SOURCE_BOUND_TURRET_RUNTIME_AND_ATOMIC_ADMISSION_PENDING')
    write(target / 'manifest.json', manifest)
    overview.save(target / 'headings.png')
    counts.append(dict(density=density, frames=len(frames), gpuBytes=manifest['gpuBytes'],
        manifestSha256=sha(target / 'manifest.json'), originalOwnerVoxels=material['ownerVoxelCount']))
write(output / 'export.json', dict(schema='yr-source-bound-building-turret-export-v1', selection=str(args.selection),
    selectionSha256=sha(args.selection), independentDensities=[2, 4], variants=counts,
    sourceGeometryAndGameplayUnchanged=True, registered=False, userVisualAcceptance='PENDING'))
print(json.dumps(dict(status='PASS_INDEPENDENT_DENSITY_EXPORT_RUNTIME_PENDING', variants=counts)))
