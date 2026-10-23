"""Prepare native references and deterministic review-only 2x/4x exports.

Uses the explicitly requested M1.1 local extraction workflow. No runtime manifest
is created, and no missing artwork is filled with original pixels.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--art', type=Path)
parser.add_argument('--spec', type=Path, help='Review worklist of member, native frame, label triples')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
spec = [('ggpowr.shp', 0, 'Normal body'), ('ggpowr.shp', 1, 'Damaged body'),
        ('gtpowrmk.shp', 5, 'Construction 05'), ('ggpowr_a.shp', 0, 'Active overlay 00'),
        ('ggpowr_a.shp', 8, 'Damaged overlay 08'), ('gtpowrmk.shp', 18, 'Construction 18')]
if args.spec:
    spec = json.loads(args.spec.read_text())
assert 1 <= len(spec) <= 6
board = Image.new('RGB', (1728, 960), (32, 85, 61))
draw = ImageDraw.Draw(board)
cells = []
originals = []
for i, (member, native_frame, label) in enumerate(spec):
    raw = json.loads(Path('.artifacts/m1-2/source', member + '.json').read_text())
    frame = raw['frames'][native_frame]
    indices = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
    palette = np.array(raw['palette'], dtype=np.uint8)
    rgba = np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255))
    original = Image.new('RGBA', (142, 110))
    original.paste(Image.fromarray(rgba), (frame['x'], frame['y']))
    originals.append(original)
    x, y = i % 3 * 576 + 4, i // 3 * 480 + 36
    large = original.resize((568, 440), Image.Resampling.NEAREST)
    board.paste(large, (x, y), large)
    draw.text((x + 8, y - 30), label, font=font, fill='white')
    cells.append({'member': member, 'nativeFrame': native_frame, 'label': label,
                  'origin': [x, y], 'scale': 4, 'frame': {k: v for k, v in frame.items() if k != 'pixels'}})
board.save(args.output / 'reference.png')
(args.output / 'cells.json').write_text(json.dumps(cells, indent=2) + '\n')
if not args.art:
    raise SystemExit(0)

art = Image.open(args.art).convert('RGBA')
report = {'status': 'REVIEW_ONLY', 'artApproval': 'PENDING', 'runtimeActivation': False,
          'inputSha256': hashlib.sha256(args.art.read_bytes()).hexdigest(),
          'sourceSize': list(art.size), 'frames': []}
comparison = Image.new('RGB', (1200, len(spec) * 470 + 60), (30, 36, 41))
cdraw = ImageDraw.Draw(comparison)
cdraw.text((30, 12), 'Original (4x display)', font=font, fill='white')
cdraw.text((630, 12), 'Authored 4x export (4x display)', font=font, fill='white')
for i, cell in enumerate(cells):
    f = cell['frame']
    x, y = cell['origin']
    # Scale the documented board coordinates to the measured service output.
    sx, sy = art.width / 1728, art.height / 960
    crop = art.crop((round((x + f['x'] * 4) * sx), round((y + f['y'] * 4) * sy),
                     round((x + (f['x'] + f['width']) * 4) * sx),
                     round((y + (f['y'] + f['height']) * 4) * sy)))
    source = np.asarray(crop).astype(np.float32)
    green = (source[:, :, 1] > source[:, :, 0] * 1.22) & (source[:, :, 1] > source[:, :, 2] * 1.10)
    source[:, :, 3][green] = 0
    premultiplied = source.copy()
    premultiplied[:, :, :3] *= source[:, :, 3:4] / 255
    native_alpha = originals[i].getchannel('A').crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
    raw = json.loads(Path('.artifacts/m1-2/source', cell['member'] + '.json').read_text())
    indices = np.array(raw['frames'][cell['nativeFrame']]['pixels']).reshape(f['height'], f['width'])
    native_remap = Image.fromarray(((indices >= 16) & (indices <= 31)).astype(np.uint8) * 255)
    native_remap = native_remap.filter(ImageFilter.MaxFilter(3))
    row = {**cell, 'exports': []}
    for density in [2, 4]:
        size = (f['width'] * density, f['height'] * density)
        channels = [np.asarray(Image.fromarray(premultiplied[:, :, k]).resize(size, Image.Resampling.BOX))
                    for k in range(4)]
        pixels = np.stack(channels, axis=2)
        alpha = pixels[:, :, 3:4]
        pixels[:, :, :3] = np.divide(pixels[:, :, :3] * 255, alpha,
                                    out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0)
        pixels[:, :, 3] = np.minimum(pixels[:, :, 3], np.asarray(native_alpha.resize(size, Image.Resampling.NEAREST)))
        pixels = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
        allowed = np.asarray(native_remap.resize(size, Image.Resampling.NEAREST)) > 0
        rgb = pixels[:, :, :3].astype(float)
        red = allowed & (rgb[:, :, 0] > rgb[:, :, 1] * 1.35) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.25) & (pixels[:, :, 3] > 0)
        ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
        shade = np.abs(rgb[:, :, 0:1] - ramp).argmin(axis=2).astype(np.uint8)
        data = np.zeros_like(pixels)
        data[:, :, 3] = 255
        data[:, :, 0][red] = 255
        data[:, :, 1][red] = shade[red]
        padded_size = ((f['width'] + f['width'] % 2) * density, (f['height'] + f['height'] % 2) * density)
        base_image = Image.new('RGBA', padded_size)
        base_image.paste(Image.fromarray(pixels), (0, 0))
        data_image = Image.new('RGBA', padded_size, (0, 0, 0, 255))
        data_image.paste(Image.fromarray(data), (0, 0))
        prefix = f"{cell['member'][:-4]}-{cell['nativeFrame']:03d}-{density}x"
        files = {}
        for role, image in [('base', base_image), ('data', data_image)]:
            path = args.output / f'{prefix}-{role}.png'
            image.save(path)
            files[role] = {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        assert not np.any(pixels[:, :, 3][np.asarray(native_alpha.resize(size, Image.Resampling.NEAREST)) == 0])
        assert not np.any(data[:, :, 0][pixels[:, :, 3] == 0])
        coverage = float(pixels[:, :, 3].sum() / (np.asarray(native_alpha).sum() * density ** 2))
        row['exports'].append({'density': density, 'size': padded_size, 'coverageRatio': coverage, 'files': files})
        if density == 4:
            full = Image.new('RGBA', (568, 440))
            full.paste(base_image, (f['x'] * 4, f['y'] * 4))
            top = 60 + i * 470
            cdraw.text((30, top), cell['label'], font=font, fill='white')
            original = originals[i].resize((568, 440), Image.Resampling.NEAREST)
            comparison.paste(original, (16, top + 28), original)
            comparison.paste(full, (616, top + 28), full)
    report['frames'].append(row)
comparison.save(args.output / 'comparison.png')
(args.output / 'review-export.json').write_text(json.dumps(report, indent=2) + '\n')
encoded = base64.b64encode((args.output / 'comparison.png').read_bytes()).decode()
(args.output / 'review.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>GAPOWR sample review</title>
<style>body{{background:#1e2429;color:#eee;font:20px/1.5 system-ui;max-width:1200px;margin:24px auto;padding:16px}}img{{max-width:100%;height:auto}}h1{{font-size:32px}}</style>
<h1>M1.2 GAPOWR — representative artwork review</h1>
<p>Review only. Six samples, pending user direction approval. Complete candidate and actual gameplay are not accepted.</p>
<p>Left: original pixels at 4x display. Right: authored detail exported at 4x with native alpha constraints.
This is an artwork comparison, not a 1080p/4K output comparison. Native geometry and remap data are retained;
layer seams and animation continuity still require the complete candidate. Generated and constrained images are retained separately.</p>
<img alt="Six original and authored sample comparisons" src="data:image/png;base64,{encoded}">
</html>''')
print(json.dumps({'status': 'PASS_STRUCTURAL_ONLY', 'exports': len(spec) * 2, 'review': str(args.output / 'review.html'),
                  'coverageRange': [min(e['coverageRatio'] for f in report['frames'] for e in f['exports']),
                                    max(e['coverageRatio'] for f in report['frames'] for e in f['exports'])]}))
