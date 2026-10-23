"""Register a matched Snow fixed wall behind the retained complete R16 foreground."""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import independently_sample

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('receipt', type=Path)
parser.add_argument('--authoring', type=Path, required=True)
parser.add_argument('--jobs', default='imagegen-jobs-v1.json')
args = parser.parse_args()
assert not args.output.exists() and not args.receipt.exists()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.local/environment-packs/snow-environment-m2-4-oil-r16-reference-v7')
assert sha(base / 'manifest.json') == '190e027e98018fce069052db4736c1db1e92ab4a70decd322a15943ee6fcaef6'
catalog = load(base / 'manifest.json')
entry = next(m for m in catalog['families']['snow-caoild']['members'] if m['member'] == 'caoild_a.shp')
body_entry = next(m for m in catalog['families']['snow-caoild']['members'] if m['member'] == 'caoild.shp')
file, body_file = base / entry['path'], base / body_entry['path']
assert sha(file) == entry['sha256'] and sha(body_file) == body_entry['sha256']
metadata, body_metadata = load(file), load(body_file)
jobs = load(args.authoring / args.jobs)['jobs']
assert len(jobs) == 2 and [j['members'][0]['frame'] for j in jobs] == [0, 32]
masters = []
for job in jobs:
    p = Path(job['destination'])
    provenance = load(p.with_name(job['id'] + '-imagegen.json'))
    assert sha(p) == provenance['masterSha256']
    assert provenance['tool'] == 'Builtin imagegen'
    assert sha(Path(job['reference'])) == job['referenceSha256']
    assert sha(Path(job['style'])) == job['styleSha256']
    image = Image.open(p).convert('RGBA')
    x, y, w, h = job['referenceRect']
    sx, sy = image.width / 1254, image.height / 1254
    crop = image.crop((round(x * sx), round(y * sy), round((x + w) * sx), round((y + h) * sy)))
    native_width, native_height = job['nativeCrop'][2] - job['nativeCrop'][0], job['nativeCrop'][3] - job['nativeCrop'][1]
    capacity = min(crop.width / native_width, crop.height / native_height)
    assert capacity >= 4.2
    masters.append((crop, capacity))
shutil.copytree(base, args.output)
records, mask_arrays = [], {}


def frames(folder, variant, layer):
    pages = {p['id']: np.array(Image.open(folder / str(variant['density']) / p['id'] / (layer + '.png')))
             for p in variant['pages']}
    result = {}
    for frame in variant['frames']:
        x, y, w, h = frame['contentRect']
        result[frame['nativeFrame']] = pages[frame['page']][y:y + h, x:x + w].copy()
    return pages, result


for density in (2, 4):
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    body_variant = next(v for v in body_metadata['variants'] if v['density'] == density)
    pages, current = frames(file.parent, variant, 'base')
    data_pages, current_data = frames(file.parent, variant, 'data')
    _, bodies = frames(body_file.parent, body_variant, 'base')
    _, body_data = frames(body_file.parent, body_variant, 'data')
    fixed = []
    for state, job in enumerate(jobs):
        crop, capacity = masters[state]
        x0, y0, x1, y1 = job['nativeCrop']
        sampled = independently_sample(np.array(crop), ((x1 - x0) * density, (y1 - y0) * density))
        canvas = np.zeros((122 * density, 166 * density, 4), np.uint8)
        canvas[y0 * density:y1 * density, x0 * density:x1 * density] = sampled
        bx, by = body_metadata['logical']['frames'][state]['trimOrigin']
        body = bodies[state]
        body_canvas = np.zeros_like(canvas)
        body_canvas[by * density:by * density + body.shape[0], bx * density:bx * density + body.shape[1]] = body
        data_canvas = np.zeros_like(canvas)
        data_canvas[by * density:by * density + body.shape[0], bx * density:bx * density + body.shape[1]] = body_data[state]
        # Compose the exact accepted body over the newly authored missing wall.
        # Fully opaque body pixels and their owner material remain byte exact.
        a, b = body_canvas[..., 3:4] / 255., canvas[..., 3:4] / 255.
        alpha = a + b * (1 - a)
        rgb = (body_canvas[..., :3] * a + canvas[..., :3] * b * (1 - a)) / np.maximum(alpha, 1e-8)
        composed = np.concatenate([np.rint(rgb), np.rint(alpha * 255)], axis=2).clip(0, 255).astype(np.uint8)
        opaque = body_canvas[..., 3] == 255
        assert np.array_equal(composed[opaque], body_canvas[opaque])
        fixed.append((composed[37 * density:107 * density, 75 * density:136 * density],
                      data_canvas[37 * density:107 * density, 75 * density:136 * density], capacity))
    for n in range(64):
        original = current[n]
        original_data = current_data[n]
        h, w = original.shape[:2]
        yy, xx = np.indices((h, w))
        rgb = original[..., :3].astype(np.int16)
        gold = ((rgb[..., 0] > rgb[..., 1] * 1.08) & (rgb[..., 1] > rgb[..., 2] * 1.18)
                & (rgb[..., 0] > 65) & (rgb[..., 1] > 42) & (original[..., 3] > 128)
                & (xx < 46 * density) & (yy < 54 * density))
        labels, count = ndimage.label(ndimage.binary_closing(gold, iterations=max(1, density // 2)), np.ones((3, 3)))
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        assert count and sizes.max() > 50 * density * density
        beam = ndimage.binary_fill_holes(labels == sizes.argmax())
        foreground = ndimage.binary_dilation(beam, iterations=density)
        rows = np.where(foreground[:, 8 * density:9 * density].any(axis=1))[0]
        assert len(rows), (density, n, 'front rod must attach to the retained head')
        top = int(rows.max())
        foreground |= ((xx >= 7 * density) & (xx < 10 * density) & (yy >= top) & (yy < 67 * density))
        state = n // 32
        plate, owner_material, capacity = fixed[state]
        plate, owner_material = plate[:h, :w], owner_material[:h, :w]
        # The new plate resolves the cap/ladder join only. Its lower outline is
        # not a replacement for the original lower cylinder and motor support.
        # Blend independently sampled steel inside the upper fixed surface;
        # never erase existing material with an empty authoring pixel.
        region = (xx < 26 * density) & (yy < 30 * density)
        allowed = region & ~foreground & (plate[..., 3] > 0)
        weight = np.clip((30 * density - yy - .5) / (8 * density), 0, 1)
        weight *= np.clip((26 * density - xx - .5) / (5 * density), 0, 1)
        weight *= plate[..., 3] / 255.
        weight[~allowed] = 0
        original_alpha = original[..., 3] / 255.
        alpha = weight + original_alpha * (1 - weight)
        rgb = (plate[..., :3] * weight[..., None]
               + original[..., :3] * (original_alpha * (1 - weight))[..., None])
        rgb /= np.maximum(alpha[..., None], 1e-8)
        resolved = np.concatenate([np.rint(rgb), np.rint(alpha[..., None] * 255)], axis=2)
        changed = original.copy()
        changed_data = original_data.copy()
        changed[allowed] = resolved.clip(0, 255).astype(np.uint8)[allowed]
        # Only exact accepted-body overlays supply owner material. Retain the
        # original owner mask on the steel transition and native fixed fittings.
        owner_overlay = allowed & (owner_material[..., 3] > 0) & (weight >= .999)
        changed_data[owner_overlay] = owner_material[owner_overlay]
        assert not np.any((original[..., 3] > 0) & (changed[..., 3] == 0))
        assert np.array_equal(changed[~allowed], original[~allowed])
        assert np.array_equal(changed[foreground], original[foreground])
        assert np.array_equal(changed_data[~allowed], original_data[~allowed])
        frame = next(f for f in variant['frames'] if f['nativeFrame'] == n)
        x, y, fw, fh = frame['contentRect']
        pages[frame['page']][y:y + fh, x:x + fw] = changed
        data_pages[frame['page']][y:y + fh, x:x + fw] = changed_data
        mask_arrays[f'allowed_{density}_{n}'] = allowed
        mask_arrays[f'foreground_{density}_{n}'] = foreground
        records.append(dict(density=density, frame=n, fixedSurfacePixels=int(allowed.sum()),
                            exactRetainedForegroundPixels=int(foreground.sum()), actualMotherDensity=capacity))
    target_folder = args.output / entry['path']
    for page in variant['pages']:
        for layer, pixels in [('base', pages[page['id']]), ('data', data_pages[page['id']])]:
            p = target_folder.parent / str(density) / page['id'] / (layer + '.png')
            Image.fromarray(pixels).save(p)
            page[layer + 'Sha256'], page[layer + 'Bytes'] = sha(p), p.stat().st_size

metadata['packRevision'] = args.output.name
metadata.setdefault('authored', {})['snowFixedTankAlignment'] = dict(
    baselineMetadataSha256=sha(file), acceptedBodyMetadataSha256=sha(body_file),
    motherHashes=[sha(Path(j['destination'])) for j in jobs],
    method='Matched upper fixed wall per health state in original world coordinates; exact accepted body registration, bounded steel transition and no empty-pixel erasure. Complete R16 foreground, lower cylinder and rear mechanisms remain unchanged.',
    movingForegroundExtraction='Largest connected accepted gold surface, complete edge/eye coverage and the original fixed-x front-rod strip; explicit retained foreground masks for all 128 density/state frames.',
    visual='PENDING_FIXED_TANK_SEAM_REVIEW')
target = args.output / entry['path']
target.write_text(json.dumps(metadata, separators=(',', ':')) + '\n')
entry['sha256'] = sha(target)
catalog['revision'] = args.output.name
(args.output / 'manifest.json').write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
preserved = 0
for p in base.rglob('*'):
    if not p.is_file() or p == base / 'manifest.json' or p == file:
        continue
    if p.is_relative_to(file.parent) and p.name in ['base.png', 'data.png']:
        continue
    assert sha(p) == sha(args.output / p.relative_to(base)), p
    preserved += 1
mask_file = args.receipt.with_suffix('.npz')
assert not mask_file.exists()
np.savez_compressed(mask_file, **mask_arrays)
receipt = dict(schema='m2-4-snow-fixed-tank-alignment-export-v1',
    status='EXPORTED_FIXED_SURFACE_CANDIDATE_STATIC_NATIVE_VISUAL_PENDING',
    before=str(base.resolve()), beforeSha256=sha(base / 'manifest.json'),
    output=str(args.output.resolve()), outputSha256=sha(args.output / 'manifest.json'),
    cases=records, masks=str(mask_file.resolve()), masksSha256=sha(mask_file),
    preservedFiles=preserved, modifiedMembers=['caoild_a.shp'],
    acceptedBodyFlagOthersExact=True, sourceGeometryShadowTimingUnchanged=True, Windows='NOT_RUN')
with args.receipt.open('x') as stream:
    json.dump(receipt, stream, indent=2)
    stream.write('\n')
print(json.dumps(dict(status=receipt['status'], cases=len(records), sha256=receipt['outputSha256'])))
