"""Native identities and fixed-coordinate composition for the approved Allied batch."""
import hashlib
import os
import json
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'unified-density'))
from master_regeneration import resolve_master, master_provenance

ROOT = Path('.artifacts/allied-buildings')
SOURCE = ROOT / 'source-v2'
INVENTORY = json.loads((SOURCE / 'inventory.json').read_text())
DENSITY = int(os.environ.get('RA2_EXPORT_DENSITY', '2'))
assert DENSITY in (2, 4)

def export_output(path):
    target = os.environ.get('RA2_EXPORT_OUTPUT')
    return Path(target) / Path(path).name if target else path

def normal_for(path):
    if DENSITY == 2:
        return Image.open(path).convert('RGBA')
    records = json.loads((ROOT / 'review-v1/review.json').read_text())['records']
    entry = next(r for r in records if r['candidate'] == Path(path).name)
    source = Path(entry['raw'])
    assert sha(source) == entry['rawSha256']
    assert entry['scale'] * DENSITY <= 1, ('Insufficient normal master sampling', entry['key'])
    image = Image.open(source).convert('RGBA').crop(entry['rawCrop'])
    size = tuple(round(v * entry['scale'] * DENSITY) for v in image.size)
    out = Image.new('RGBA', tuple(v * DENSITY for v in entry['size']))
    out.alpha_composite(image.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA'),
                        tuple(round(v * DENSITY / 2) for v in entry['offset2x']))
    return out



def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def row_for(identity, theater='TEMPERATE', edition='yr'):
    return next(row for row in INVENTORY['matrix']
                if (row['id'], row['theater'], row['edition']) == (identity, theater, edition))


@lru_cache(maxsize=48)
def raw_for(digest):
    return json.loads((SOURCE / INVENTORY['uniqueMembers'][digest]['path']).read_text())


def indices(member, frame):
    raw = raw_for(member['source']['sha256'])
    source = raw['frames'][frame]
    out = np.zeros(raw['canvas'][::-1], np.uint8)
    x, y, width, height = (source[k] for k in ('x', 'y', 'width', 'height'))
    out[y:y + height, x:x + width] = np.array(source['pixels'], np.uint8).reshape(height, width)
    return out


def decode(row, member, frame):
    pixels = indices(member, frame)
    colors = np.array(row['palette']['colors'], np.uint8)[pixels]
    return Image.fromarray(np.dstack([colors, np.uint8(pixels != 0) * 255]))


def resting(row, damaged=False):
    body = next(m for m in row['members'] if 'body' in m['roles'])
    out = Image.new('RGBA', body['canvas'])
    for role in ('bib', 'body'):
        for member in row['members']:
            if role in member['roles']:
                frame = (21 if damaged else 5) if row['id'] == 'GAWALL' else int(damaged)
                out.alpha_composite(decode(row, member, frame))
    animations = [a for a in row['animations'] if a['type'] in ('ACTIVE', 'IDLE')]
    if not animations:
        animations = [a for a in row['animations'] if a['type'] == 'SUPER'][:1]
    for anim in animations:
        member = next(m for m in row['members'] if m['source']['member'] == anim['member'])
        props = (anim.get('damaged') or anim['normal']) if damaged else anim['normal']
        out.alpha_composite(decode(row, member, props['start']), (anim['offset']['x'], anim['offset']['y']))
    return out


def coverage_box(image, threshold=64):
    return image.getchannel('A').point(lambda value: 255 if value > threshold else 0).getbbox()


def sheet_cells(image, columns=2, rows=2):
    """Recover separated sprites without cutting a pose at nominal cell edges."""
    from scipy.ndimage import label, find_objects
    pixels = np.array(image.convert('RGBA'))
    components, count = label(pixels[..., 3] > 64)
    boxes = find_objects(components)
    sizes = np.bincount(components.ravel())
    selected = sorted(range(1, count + 1), key=lambda i: sizes[i], reverse=True)[:columns * rows]
    assert len(selected) == columns * rows
    ordered = sorted(selected, key=lambda i: (boxes[i - 1][0].start + boxes[i - 1][0].stop) / 2)
    result = []
    for r in range(rows):
        group = sorted(ordered[r * columns:(r + 1) * columns], key=lambda i: boxes[i - 1][1].start)
        for i in group:
            ys, xs = boxes[i - 1]
            # Include the antialiased edge, without any neighboring sprite.
            x0, y0 = max(0, xs.start - 3), max(0, ys.start - 3)
            x1, y1 = min(image.width, xs.stop + 3), min(image.height, ys.stop + 3)
            result.append(image.crop((x0, y0, x1, y1)))
    return result


def register(image, canvas, target_box):
    """One proportional transform, never a per-frame whole-building stretch."""
    box = coverage_box(image)
    image = image.crop(box)
    width, height = target_box[2] - target_box[0], target_box[3] - target_box[1]
    scale = min(width / image.width, height / image.height)
    size = tuple(round(n * scale * DENSITY) for n in image.size)
    image = resolve_master(image, size)
    offset = (round((target_box[0] + width / 2) * DENSITY - size[0] / 2),
              target_box[3] * DENSITY - size[1])
    out = Image.new('RGBA', tuple(n * DENSITY for n in canvas))
    out.alpha_composite(image.resize(size, Image.Resampling.LANCZOS), offset)
    return out, {'crop': box, 'scale': scale, 'offset2x': offset, 'targetBox': target_box}


@lru_cache(maxsize=256)
def member_has_remap(digest, count):
    return any(any(16 <= pixel <= 31 for pixel in frame['pixels'])
               for frame in raw_for(digest)['frames'][:count])


def owner_data(row, member, image):
    """Authored red paint only; native neutral members never gain owner paint."""
    rgba = np.array(image)
    rgb = rgba[..., :3].astype(float)
    native_has_remap = member_has_remap(member['source']['sha256'], member['visibleFrames'])
    red = (native_has_remap and row['art'].get('Remapable', 'yes').lower() != 'no') & (
        (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (rgba[..., 3] > 0))
    # Orange lamps, yellow hazard paint, hot metal and brown rust are not team
    # markings. The mask follows composed material, not native coordinates.
    warm = (rgb[..., 1] > rgb[..., 0] * .25) & (rgb[..., 1] > rgb[..., 2] * 1.3)
    red &= ~warm
    ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
    shades = np.abs(rgb[..., 0, None] - ramp).argmin(axis=2)
    data = np.zeros_like(rgba)
    data[..., 3] = 255
    data[..., 0][red] = 255
    data[..., 1][red] = shades[red]
    return Image.fromarray(data), int(red.sum())


def export_frames(row, frames, out, provenance):
    """Write complete native-frame contracts and compact native-size evidence."""
    from PIL import ImageDraw
    out = export_output(out)
    out.mkdir(parents=True, exist_ok=False)
    records = []
    for member in row['members']:
        name = member['source']['member']
        raw = raw_for(member['source']['sha256'])
        previews = []
        for n, f in enumerate(raw['frames'][:member['visibleFrames']]):
            image = frames[name, n]
            expected = tuple(v * DENSITY for v in raw['canvas'])
            assert image.size == expected, (name, n, image.size, expected)
            exported = Image.new('RGBA', tuple(max(1, v * DENSITY) for v in f['legacyRenderSize']))
            if not f['empty']:
                exported.paste(image.crop((f['x'] * DENSITY, f['y'] * DENSITY,
                    (f['x'] + f['width']) * DENSITY, (f['y'] + f['height']) * DENSITY)))
            data, remap_pixels = owner_data(row, member, exported)
            stem = f'{name[:-4]}-{n:03}-{DENSITY}x'
            exported.save(out / f'{stem}.png')
            data.save(out / f'{stem}-data.png')
            records.append({'member': name, 'nativeFrame': n, 'exports': [{'density': DENSITY,
                'base': f'{stem}.png', 'data': f'{stem}-data.png'}], 'remapPixels': remap_pixels})
            canvas = Image.new('RGBA', expected)
            canvas.alpha_composite(exported, (f['x'] * DENSITY, f['y'] * DENSITY))
            previews.append(canvas.resize(tuple(raw['canvas']), Image.Resampling.LANCZOS))
        w, h = raw['canvas']
        columns = min(8, len(previews))
        board = Image.new('RGB', (w * columns, (h + 26) * ((len(previews) + columns - 1) // columns)), '#34483d')
        for n, im in enumerate(previews):
            x, y = n % columns * w, n // columns * (h + 26)
            board.paste(im, (x, y + 26), im)
            ImageDraw.Draw(board).text((x + 4, y + 2), str(n), fill='white', font_size=20)
        board.save(out / f'{name}-contact.png')
        if 'BUILDUP' in member['roles']:
            gif = []
            for im in previews:
                bg = Image.new('RGB', (w, h), '#34483d')
                bg.paste(im, (0, 0), im)
                gif.append(bg)
            gif[0].save(out / 'construction.gif', save_all=True, append_images=gif[1:], duration=150, loop=0)
    (out / 'candidate-review.json').write_text(json.dumps({'identity': row['id'], 'theater': row['theater'],
        'density': DENSITY, 'frames': records, 'status': 'COMPLETE_MEMBER_EXPORT_VISUAL_QA_PENDING',
        'approvalSha256': sha(ROOT / 'representative-acceptance-v1.json'),
        'nativeShadows': 'RETAINED_ORIGINAL', 'runtime': 'NOT_ACTIVATED', **provenance, **master_provenance()}, indent=2) + '\n')
