"""Collect and verify every authored frame, then build a self-contained review."""
import argparse
import base64
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
out = args.output
out.mkdir(parents=True, exist_ok=False)
root = Path('.artifacts/m1-2/full-art-v1')
worklist = json.loads((root / 'worklist.json').read_text())
inputs = [Path('.artifacts/m1-2/art-samples-v1/export')]
inputs += [Path(b['directory']) / 'export' for b in worklist['batches']]
required = {(member, frame) for member, count in [('ggpowr.shp', 3), ('ggpowr_a.shp', 16), ('gtpowrmk.shp', 25)]
            for frame in range(count)}
frames = {}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for directory in inputs:
    report = json.loads((directory / 'review-export.json').read_text())
    for frame in report['frames']:
        key = (frame['member'], frame['nativeFrame'])
        assert key in required and key not in frames
        for export in frame['exports']:
            for role, file in export['files'].items():
                source = directory / file['file']
                assert sha(source) == file['sha256']
                shutil.copyfile(source, out / file['file'])
        frames[key] = {**frame, 'sourceReport': str(directory / 'review-export.json'),
                       'sourceReportSha256': sha(directory / 'review-export.json')}
assert set(frames) == required
raws = {member: json.loads(Path('.artifacts/m1-2/source', member + '.json').read_text()) for member, _ in required}
for (member, index), frame in frames.items():
    native = raws[member]['frames'][index]
    assert all(frame['frame'][key] == native[key] for key in ['x', 'y', 'width', 'height', 'nativeFrame', 'empty'])
    indices = np.array(native['pixels']).reshape(native['height'], native['width'])
    for export in frame['exports']:
        density = export['density']
        base = np.array(Image.open(out / export['files']['base']['file']))
        data = np.array(Image.open(out / export['files']['data']['file']))
        width, height = (native['width'] + native['width'] % 2) * density, (native['height'] + native['height'] % 2) * density
        assert base.shape == data.shape == (height, width, 4)
        allowed = np.zeros((height, width), dtype=bool)
        allowed[:native['height'] * density, :native['width'] * density] = np.repeat(np.repeat(indices != 0, density, 0), density, 1)
        assert not base[:, :, 3][~allowed].any()
        assert not data[:, :, 0][base[:, :, 3] == 0].any()
        assert data[:, :, 1].max() <= 15 and data[:, :, 2].max() == 0 and data[:, :, 3].min() == 255

font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8])


def raster(member, index, density=4, original=False, blue=False):
    native = raws[member]['frames'][index]
    canvas = Image.new('RGBA', (142 * density, 110 * density))
    if original:
        indices = np.array(native['pixels']).reshape(native['height'], native['width'])
        palette = np.array(raws[member]['palette'], dtype=np.uint8)
        rgba = np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255))
        image = Image.fromarray(rgba).resize((native['width'] * density, native['height'] * density), Image.Resampling.NEAREST)
    else:
        export = next(e for e in frames[(member, index)]['exports'] if e['density'] == density)
        image = Image.open(out / export['files']['base']['file']).convert('RGBA')
        if blue:
            pixels = np.array(image)
            data = np.array(Image.open(out / export['files']['data']['file']))
            colors = np.floor(np.array([34, 105, 212])[None, None, :] / 255 * ramp[data[:, :, 1], None] * 4).astype(np.uint8)
            pixels[:, :, :3][data[:, :, 0] > 0] = colors[data[:, :, 0] > 0]
            image = Image.fromarray(pixels)
    canvas.paste(image, (native['x'] * density, native['y'] * density))
    return canvas


def state(kind, index, original=False, blue=False):
    if kind == 'construction':
        return raster('gtpowrmk.shp', index, original=original, blue=blue)
    damaged = kind == 'damaged'
    body = raster('ggpowr.shp', 1 if damaged else 0, original=original, blue=blue)
    overlay = raster('ggpowr_a.shp', index + (8 if damaged else 0), original=original, blue=blue)
    return Image.alpha_composite(body, overlay)


def panel(kind, index, title):
    image = Image.new('RGB', (1740, 490), (30, 36, 41))
    draw = ImageDraw.Draw(image)
    for column, (label, original, blue) in enumerate([('Original', True, False), ('Authored red', False, False), ('Authored blue', False, True)]):
        draw.text((column * 580 + 12, 10), f'{title} / {label}', fill='white', font=font)
        sprite = state(kind, index, original, blue)
        image.paste(sprite, (column * 580 + 6, 44), sprite)
    return image


representatives = [('normal', 0, 'Normal / active 00'), ('damaged', 0, 'Damaged / active 08'),
                   ('construction', 5, 'Construction 05'), ('construction', 18, 'Construction 18'),
                   ('construction', 24, 'Construction 24')]
overview = Image.new('RGB', (1740, 490 * len(representatives)))
for i, spec in enumerate(representatives):
    overview.paste(panel(*spec), (0, i * 490))
overview.save(out / 'overview.png')

animation_names = []
for kind, count, delay in [('normal', 8, 140), ('damaged', 8, 140), ('construction', 25, 120), ('selling', 25, 120)]:
    sequence = list(range(count))
    if kind == 'selling':
        sequence.reverse()
    images = [panel('construction' if kind == 'selling' else kind, index, f'{kind.title()} {index:02d}') for index in sequence]
    filename = f'{kind}.gif'
    images[0].save(out / filename, save_all=True, append_images=images[1:], duration=delay, loop=0, disposal=2)
    animation_names.append(filename)

sheet = Image.new('RGB', (1740, 260 * 8), (30, 36, 41))
draw = ImageDraw.Draw(sheet)
for i, (member, index) in enumerate(sorted(required)):
    x, y = i % 6 * 290, i // 6 * 260
    draw.text((x + 4, y + 4), f'{member[:-4]} {index:02d}', font=font, fill='white')
    sprite = raster(member, index, density=2)
    sheet.paste(sprite, (x + 3, y + 35), sprite)
sheet.save(out / 'all-44-frames.png')
report = {'status': 'PASS_STRUCTURAL_ONLY', 'artApproval': 'PENDING_COMPLETE_CANDIDATE_REVIEW',
          'runtimeActivation': False, 'requiredAuthoredFrames': 44, 'validatedExports': 88,
          'retainedOriginalFrames': worklist['retainedOriginalFrames'],
          'reviewNotes': ['Static source-over composites expose constituent seams; actual depth rendering is a separate gate.',
                          'Fine pipes, tower widths and panel seams vary between independently generated phases.',
                          'Original alpha constraints clip detail outside the native silhouette; native geometry is unchanged.',
                          'Animation previews use a review cadence, not simulation timing.',
                          'Shared fire, debris and explosion effects including gtpowexp remain original.'],
          'frames': list(frames.values())}
(out / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
candidate_hash = sha(out / 'candidate-review.json')


def embed(filename):
    mime = 'image/gif' if filename.endswith('.gif') else 'image/png'
    return f'<img alt="{filename}" src="data:{mime};base64,{base64.b64encode((out / filename).read_bytes()).decode()}">'


html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>M1.2 complete GAPOWR candidate review</title><style>
body{font:20px/1.5 system-ui;background:#1e2429;color:#eee;max-width:1740px;margin:24px auto;padding:20px}
h1{font-size:34px}h2{font-size:28px}img{max-width:100%;height:auto;display:block}code{overflow-wrap:anywhere}
</style><h1>M1.2 GAPOWR — complete artwork candidate</h1>
<p>All 44 authored frames at 2x and 4x. Representative direction approved; complete candidate approval pending.
No runtime activation and no actual gameplay claim. This page is self-contained and works without JavaScript.</p>
<p>Three columns: original, authored red, authored blue. Identical native canvas and anchors; 4x inspection display.
These compare artwork, not 1080p versus 4K drawing-buffer density. Shared effects and native shadows remain original.</p>
<p>Inspect the tower/central-machine seams and phase-to-phase panel changes. Review animation speed is illustrative;
native game timing remains unchanged. Static alpha compositing is not a depth/occlusion acceptance result.</p>'''
html += f'<p>Candidate identity: <code>{candidate_hash}</code></p><h2>Representative states</h2>' + embed('overview.png')
for name in animation_names:
    html += f'<h2>{name[:-4].title()} preview</h2>' + embed(name)
html += '<h2>All 44 constituent frames at 2x display</h2>' + embed('all-44-frames.png') + '</html>'
(out / 'review.html').write_text(html)
print(json.dumps({'status': report['status'], 'frames': 44, 'exports': 88, 'candidateSha256': candidate_hash, 'review': str(out / 'review.html')}))
