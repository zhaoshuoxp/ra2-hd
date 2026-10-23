"""Prepare source-pinned fixed paving and radar-phase mother guides without changing selections."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
ART = Path('.artifacts/m2-4/desert-final-buildings-authoring-batch86-v1')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
source = next(row for row in read(ROOT / 'source.json')['sources'] if row['member'] == 'cdairp_a.shp')
assert source['sha256'] == 'ddba2d36ceec1d077112f385796649bad57d1802672f65abefff569d4622f29a'
palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3)
palette = (palette.astype(np.uint16) * 4).astype(np.uint8)
canvases = []
for frame in source['frames'][:10]:
    file = ROOT / 'native' / frame['indexFile']
    assert sha(file) == frame['indexSha256']
    canvas = np.zeros(source['canvas'][::-1], np.uint8)
    x, y = frame['origin']
    width, height = frame['size']
    canvas[y:y + height, x:x + width] = np.fromfile(file, np.uint8).reshape(height, width)
    canvases.append(canvas)

jobs = []
for part, frames, size, rect in [
    ('paving', [0], (1536, 1024), [59, 110, 119, 69]),
    ('radar-0-4', list(range(5)), (1024, 1536), [16, 42, 30, 26]),
    ('radar-5-9', list(range(5, 10)), (1024, 1536), [16, 42, 30, 26]),
]:
    board = Image.new('RGBA', size)
    rows = []
    for row, number in enumerate(frames):
        x, y, width, height = rect
        indices = canvases[number][y:y + height, x:x + width]
        rgba = np.zeros((*indices.shape, 4), np.uint8)
        rgba[..., :3] = palette[indices]
        rgba[..., 3] = ((indices != 0) & (indices != 12)) * 255
        bounds = Image.fromarray(rgba[..., 3]).getbbox()
        image = Image.fromarray(rgba).crop(bounds)
        top, bottom = round(row * size[1] / len(frames)), round((row + 1) * size[1] / len(frames))
        scale = min((size[0] - 96) / image.width, (bottom - top - 48) / image.height)
        assert scale >= 8
        dimensions = tuple(round(value * scale) for value in image.size)
        left, offset = (size[0] - dimensions[0]) // 2, top + (bottom - top - dimensions[1]) // 2
        board.alpha_composite(image.resize(dimensions, Image.Resampling.NEAREST), (left, offset))
        rows.append(dict(nativeFrame=number, nativeCanvasRect=rect, nativeBounds=list(bounds),
            slotRect=[0, top, size[0], bottom - top], referenceRect=[left, offset, *dimensions],
            referenceCapacity=scale))
    name = 'cdairp-' + part + '-continuous-v1'
    reference = ART / (name + '-reference.png')
    board.save(reference)
    prompt = ('Use case: precise-object-edit. Red Alert 2 HD airport animation component sprite production. '
        'Image 1 is ONLY the exact original geometry, pose and color reference. '
        f'There are {len(frames)} separate subjects, top to bottom original phase numbers {frames}. '
        'Redraw with genuinely new continuous high-resolution material. Preserve the exact original '
        'isometric camera, upper-left lighting, silhouette, component positions and colors. '
        'Use broad coherent material planes, smooth clean curved metal and precise continuous edges. '
        'Source pixel squares, stair-step aliasing and speckled grain are low-resolution artifacts to remove. '
        'Do not enlarge, sharpen, trace the pixel lattice or add random dots as new detail. '
        'Keep each subject large at its exact reference position and scale, with transparent margins and '
        'transparent separation. Do not add grounds, platforms outside the reference footprint, shadows, '
        'glow, scenery, text, labels, borders, grids or extra machinery. True transparent RGBA. '
        f'Output {size[0]}x{size[1]}, preserving the reference aspect ratio and row positions. ')
    if part == 'paving':
        prompt += ('This is ONLY the fixed airport landing-pad paving and its pictured low fixtures. '
            'Keep both exact yellow circular landing guides, the white aircraft-shaped landing markings, '
            'gray-olive concrete, curb shape and small original lamps. No tower, hangar, flag or dish. '
            'No flashing light aura baked into the paving. The paving must remain a stable fixed surface. ')
    else:
        prompt += ('These are five phases of ONE rotating small gray metallic radar dish on the same '
            'short fixed pedestal. Match every pictured dish orientation exactly. Keep the pedestal, '
            'mounting axis, base diameter, material and illumination identical between rows. Only the '
            'dish rotates; nothing grows, shrinks, shifts or changes construction. No landing pads. ')
    jobs.append(dict(id=name, part=part, sourceSha256=source['sha256'], reference=str(reference.resolve()),
        referenceSha256=sha(reference), referenceRole='ORIGINAL_COMPONENT_GEOMETRY_AND_PHASE_ONLY',
        destination=str((ART / (name + '-master.png')).resolve()), boardSize=list(size), rows=rows,
        mode='BUILT_IN_IMAGEGEN', prompt=prompt))
result = dict(schema='m2-4-desert-airport-motion-jobs-v1', jobs=jobs,
    policy='One new fixed paving material; original phase-specific radar geometry; smooth source lighting changes are separate from material. Original markers, empty slots, owners, timing and shadows remain native.',
    sourceSha256=source['sha256'], selected=False, coverageAdded=0)
with (ART / 'airport-imagegen-jobs-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(jobs=len(jobs), radarPhases=10, fixedPaving=1,
    minimumReferenceCapacity=min(row['referenceCapacity'] for job in jobs for row in job['rows']))))
