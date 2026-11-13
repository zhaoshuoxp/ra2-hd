"""Build coherent HD masonry from original pyramid projection and authored damage."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from pyramid_art import paint_crop, render

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-buildings'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.open('x').write(json.dumps(value, indent=2) + '\n')
jobs = read(BASE / 'worklist-r1.json')['jobs']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--revision', type=int, default=2)
args = parser.parse_args()
assert args.revision >= 2
geometry = {
    'desert-caegyp01': dict(apex=[235.5, .5], left=[.5, 182.5], front=[118.5, 242.5], right=[237.5, 181.5]),
    'desert-caegyp04': dict(apex=[117.5, .5], left=[.5, 242.5], front=[118, 301.5], right=[236.5, 242.5]),
    'desert-caegyp05': dict(apex=[.5, .5], left=[.5, 181.5], front=[119.5, 242.5], right=[238.5, 181.5]),
}
colors = dict(left=dict(tread='#dfc39e', riser='#aa9270', lip='#f0d4af', shadow='#736041'),
    right=dict(tread='#ac9368', riser='#786441', lip='#d1b68b', shadow='#493e28'))
damage_envelopes = {
    'desert-caegyp01': [
        [[147, 60], [166, 61], [170, 67], [184, 72], [183, 77], [170, 78], [166, 83], [145, 80], [143, 73]],
        [[120, 94], [140, 98], [141, 115], [146, 122], [141, 148], [128, 151], [127, 157],
            [109, 153], [108, 148], [93, 148], [93, 141], [82, 137], [82, 125], [80, 121],
            [93, 120], [98, 112], [98, 109], [115, 104]],
        [[41, 156], [57, 155], [60, 164], [78, 168], [80, 183], [73, 186], [63, 179],
            [61, 182], [49, 179], [39, 173], [35, 168]],
    ],
    'desert-caegyp04': [
        [[79, 120], [103, 126], [119, 136], [131, 130], [138, 130], [139, 150], [135, 158],
            [120, 160], [114, 172], [103, 172], [102, 162], [87, 160], [77, 147], [79, 141],
            [93, 140], [85, 132], [78, 128]],
        [[133, 132], [151, 136], [157, 128], [180, 120], [182, 124], [172, 136], [174, 148],
            [162, 163], [150, 169], [141, 165], [141, 156], [132, 151]],
        [[70, 158], [92, 160], [104, 169], [108, 177], [124, 164], [136, 170], [135, 187],
            [123, 190], [119, 203], [133, 205], [132, 221], [121, 231], [106, 233], [105, 217],
            [91, 211], [87, 205], [76, 203], [67, 193], [58, 190], [51, 177], [61, 175]],
        [[27, 196], [43, 194], [46, 203], [55, 211], [67, 211], [79, 210], [94, 216],
            [100, 230], [115, 242], [112, 255], [103, 260], [90, 260], [80, 253], [83, 242],
            [74, 235], [66, 236], [59, 228], [60, 218], [44, 214], [40, 220], [25, 214], [24, 207]],
    ],
    'desert-caegyp05': [
        [[103, 94], [117, 95], [121, 102], [136, 106], [141, 115], [146, 123], [160, 131],
            [164, 143], [159, 155], [143, 161], [132, 157], [132, 151], [119, 151], [110, 144],
            [100, 142], [96, 130], [98, 119], [93, 114], [95, 102]],
    ],
}
for name, vertices in geometry.items():
    job, = [job for job in jobs if job['name'] == name]
    folder = Path(job['directory'])
    source_file = Path(job['originalSource']['file'])
    assert sha(source_file) == job['originalSource']['sha256']
    original = read(source_file)
    source, = [source for source in original['sources'] if source['identity'] == job['identity']]
    width, height = source['frames'][0]['size']
    assert all(frame['size'] == [width, height] for frame in source['frames'][:3])
    directory = folder / f'courses-r{args.revision}'
    directory.mkdir(exist_ok=False)
    base_file, paint_file = folder / 'masters-r3/frame-0.png', folder / 'masters-r4/frame-1.png'
    before, paint = paint_crop(base_file), paint_crop(paint_file)
    capacity = min(paint.width / width, paint.height / height, before.width / width, before.height / height)
    assert capacity >= 4
    size = (width * 4, height * 4)
    assert before.width >= size[0] and before.height >= size[1]
    a = np.array(before.resize(size, Image.Resampling.LANCZOS)).astype(float)
    b = np.array(paint.resize(size, Image.Resampling.LANCZOS)).astype(float)
    changed = np.abs(a[..., :3] - b[..., :3]).mean(2) > 22
    changed |= (a[..., 3] > 180) & (b[..., 3] < 80)
    changed = ndimage.binary_opening(changed, iterations=6)
    changed = ndimage.binary_closing(changed, iterations=8)
    labels, count = ndimage.label(changed)
    sizes = np.bincount(labels.ravel())
    keep = np.zeros_like(changed)
    for label in range(1, count + 1):
        if sizes[label] >= 32 * 16:
            keep |= labels == label
    assert keep.any(), 'The original damaged state requires substantial authored cavities'
    keep = ndimage.binary_dilation(keep, iterations=8)
    # Subpixel coverage belongs to the newly authored material boundary.
    coverage = np.rint(ndimage.gaussian_filter(keep.astype(float), .65) * 255).astype(np.uint8)
    if args.revision >= 4:
        envelope = Image.new('L', (width * 32, height * 32))
        drawing = ImageDraw.Draw(envelope)
        for polygon in damage_envelopes[name]:
            drawing.polygon([(round(x * 32), round(y * 32)) for x, y in polygon], fill=255)
        coverage = np.array(envelope.resize(size, Image.Resampling.LANCZOS))
    mask_file = directory / 'damage-mask-4x.png'
    Image.fromarray(coverage).save(mask_file)
    spec = dict(schema='yr-pyramid-authored-courses-v1', sourceSha256=source['sha256'],
        originalSource=dict(file=str(source_file), sha256=sha(source_file)),
        originalIndices=[frame['indexSha256'] for frame in source['frames'][:3]],
        logicalSize=[width, height], vertices=vertices, projectedRise=182, courseCount=72, colors=colors,
        construction='Continuous vector stone courses share original apex and joining rays across all three pieces.',
        courseReference='The original front ridge has about 4.2 logical pixels per course across 302 pixels, giving 72 courses.',
        basePaint=dict(file=str(base_file), sha256=sha(base_file)),
        damagePaint=dict(file=str(paint_file), sha256=sha(paint_file)),
        damageMask=dict(file=str(mask_file), sha256=sha(mask_file), source='Independent 4X authored damage relative to its HD intact reference.'),
        independentPaintCapacity=capacity, originalSeparateShadowsUnchanged=True,
        userVisualAcceptance='PENDING')
    if args.revision >= 4:
        spec['authoredDamageEnvelopes'] = damage_envelopes[name]
        spec['damageMask']['source'] = 'Continuous authoring envelopes traced against the inspected original state and HD damaged master.'
    if name.endswith('04'):
        spec['authoredPostRect'] = [222, 231, 20, 48]
        spec['post'] = [
            dict(points=[[223, 238], [232, 243], [232, 272], [223, 267]], color='#b89d77'),
            dict(points=[[232, 243], [241, 238], [241, 267], [232, 272]], color='#705b3f'),
            dict(points=[[232, 233], [241, 238], [232, 243], [223, 238]], color='#ead0a8'),
        ]
    spec_file = directory / 'architecture.json'
    write(spec_file, spec)
    masters = {}
    for slot in [0, 1, 2]:
        file = directory / f'frame-{slot}-4x.png'
        render(spec, slot, 4).save(file)
        masters[str(slot)] = dict(file=str(file.relative_to(ROOT)), sha256=sha(file))
    rubble = folder / 'masters-r1/frame-3.png'
    masters['3'] = dict(file=str(rubble.relative_to(ROOT)), sha256=sha(rubble))
    selected = dict(sourceSha256=source['sha256'], masters=masters,
        sourcePinnedPyramid={source['member']: dict(file=str(spec_file), sha256=sha(spec_file))},
        userVisualAcceptance='PENDING')
    write(folder / f'selected-states-r{args.revision}.json', selected)
    print(json.dumps(dict(job=name, originalCourses=72, authoredDamageNativeArea=float(keep.sum()) / 16,
        independentPaintCapacity=capacity)), flush=True)
