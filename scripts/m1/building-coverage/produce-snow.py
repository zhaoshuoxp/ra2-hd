"""Transfer reviewed snow material onto retained, fixed-geometry HD animation.

Retail pixels control coverage only. All visible color/detail comes from the
accepted HD frames and an authored snow donor; retail RGB is never enlarged.
"""
import json
import os
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from production_common import ROOT, ACCEPTED, row_for, raw_for, indices, sha, area
from accepted_frames import frame, member_info

identity = sys.argv[1]
version = sys.argv[2] if len(sys.argv) > 2 else 'snow-exports-v1'
out = Path(os.environ['RA2_EXPORT_OUTPUT']) / identity if os.environ.get('RA2_EXPORT_OUTPUT') else ROOT / version / identity
out.mkdir(parents=True, exist_ok=False)
dry, snow = row_for(identity), row_for(identity, 'SNOW')
donor_path = ROOT / 'authoring-v1/NAPOWR-SNOW/normal-raw-v1.png'
donor = np.asarray(Image.open(donor_path).convert('RGB').crop((303, 223, 327, 237)))
# Mirrored repetitions retain authored grain without abrupt tile boundaries.
donor = np.concatenate([donor, donor[:, ::-1]], axis=1)
donor = np.concatenate([donor, donor[::-1]], axis=0)
records, previews = [], []


def dry_frame(index, n, role):
    if identity in ACCEPTED['families']:
        return frame(identity, index, n, role)
    member = dry['members'][index]
    native = raw_for(member)['frames'][n]
    root = Path(os.environ['RA2_COVERAGE_NEW_EXPORTS']) / identity if os.environ.get('RA2_COVERAGE_NEW_EXPORTS') else ROOT / 'full-exports-v3' / identity
    density = json.loads((root / 'candidate-review.json').read_text())['density']
    suffix = '-data' if role == 'data' else ''
    image = Image.open(root / f'{member["source"]["member"][:-4]}-{n:02}-{density}x{suffix}.png').convert('RGBA')
    canvas = Image.new('RGBA', tuple(v * density for v in member['canvas']))
    canvas.paste(image, (native['x'] * density, native['y'] * density))
    return canvas, density


for index, member in enumerate(snow['members']):
    other = dry['members'][index]
    count = (len(member_info(identity, index)[1]['logical']['frames'])
             if identity in ACCEPTED['families'] else other['visibleFrames'])
    count = min(count, member['visibleFrames'])
    for n in range(count):
        base, density = dry_frame(index, n, 'base')
        data, _ = dry_frame(index, n, 'data')
        si, di = indices(member, n), indices(other, n)
        if member['canvas'] != other['canvas']:
            # Native sprites are center anchored. NATECH snow adds 38x10
            # canvas pixels while retaining exactly the same world geometry.
            delta = [(a - b) // 2 for a, b in zip(member['canvas'], other['canvas'])]
            assert all(a - b == v * 2 for a, b, v in zip(member['canvas'], other['canvas'], delta))
            aligned = []
            for im in [base, data]:
                target = Image.new('RGBA', tuple(v * density for v in member['canvas']))
                target.paste(im, tuple(v * density for v in delta))
                aligned.append(target)
            base, data = aligned
            target = Image.new('L', tuple(member['canvas']))
            target.paste(Image.fromarray(di), tuple(delta))
            di = np.asarray(target)
        p, d = np.array(base), np.array(data)
        palette = np.array(snow['palette']['colors'], np.float32)
        sc, dc = palette[si], palette[di]
        sl, dl = sc.mean(axis=2), dc.mean(axis=2)
        is_snow = ((si != di) & (si != 0) & ~((si >= 16) & (si <= 31))
                   & (sl > 115) & (sc.max(axis=2) - sc.min(axis=2) < 48)
                   & ((sl > dl + 10) | (di == 0)))
        native_mask = Image.fromarray(np.uint8(is_snow) * 255)
        mask = native_mask.resize(base.size, Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(.25 * density))
        coverage = np.asarray(mask, np.float32) / 255
        # Preserve the accepted silhouette; cap overhang at one logical pixel.
        near = np.asarray(base.getchannel('A').filter(ImageFilter.MaxFilter(2 * density + 1)), np.float32) / 255
        coverage *= near
        texture = np.tile(donor, (int(np.ceil(base.height / donor.shape[0])), int(np.ceil(base.width / donor.shape[1])), 1))[:base.height, :base.width].astype(np.float32)
        texture = np.clip(texture - texture.mean(axis=(0, 1)) + np.array([225, 232, 238]), 0, 255)
        # Preserve broad local lighting without painting retail pixel shading.
        lighting = np.asarray(base.convert('L').filter(ImageFilter.GaussianBlur(2 * density)), np.float32)
        texture = np.clip(texture * (.86 + .14 * lighting[..., None] / 255), 0, 255)
        p[..., :3] = np.rint(p[..., :3] * (1 - coverage[..., None]) + texture * coverage[..., None])
        p[..., 3] = np.maximum(p[..., 3], np.rint(255 * coverage)).astype(np.uint8)
        d[..., 0] = np.rint(d[..., 0] * (1 - coverage)).astype(np.uint8)
        d[..., 3] = 255
        full = Image.fromarray(p)
        native = raw_for(member)['frames'][n]
        x, y, w, h = (native[k] for k in ['x', 'y', 'width', 'height'])
        size = (max(1, (w + w % 2) * density), max(1, (h + h % 2) * density))
        stem = f'{member["source"]["member"][:-4]}-{n:02}-{density}x'
        for role, im in [('base', full), ('data', Image.fromarray(d))]:
            cropped = Image.new('RGBA', size, (0, 0, 0, 255 if role == 'data' else 0))
            if not native['empty']:
                cropped.paste(im.crop((x * density, y * density, (x + w) * density, (y + h) * density)))
            cropped.save(out / (stem + ('-data' if role == 'data' else '') + '.png'))
        records.append({'member': member['source']['member'], 'nativeFrame': n, 'snowControlPixels': int(is_snow.sum()),
                        'exports': [{'density': density, 'base': stem + '.png', 'data': stem + '-data.png'}]})
        if n == 0 or (index == 0 and n == 1):
            full.save(out / f'{member["source"]["member"]}-{n}-canvas.png')
    print(f'{identity} {member["source"]["member"]}: {count} slots', flush=True)

report = {'identity': identity, 'theater': 'SNOW', 'density': density, 'frames': records,
          'status': 'COMPLETE_SLOT_CANDIDATE_REQUIRES_VISUAL_AND_RUNTIME_VALIDATION',
          'method': 'Authored snow material under native coverage controls over retained HD motion',
          'donor': {'path': str(donor_path), 'sha256': sha(donor_path), 'crop': [303, 223, 327, 237]},
          'approvalSha256': sha(ROOT / 'representative-acceptance-v1.json')}
(out / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
