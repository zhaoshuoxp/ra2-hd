"""Native source, fixed geometry and immutable production helpers."""
import hashlib
import os
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(os.environ.get('RA2_COVERAGE_SOURCE', '.artifacts/m1-6c'))
SOURCE = ROOT / 'source-v2'
INVENTORY = json.loads((SOURCE / 'inventory.json').read_text())
ACCEPTED = json.loads((ROOT / 'accepted-catalog.json').read_text())
MAIN = Path('/Users/Aone/RA2remaster/ra2-hd')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def row_for(identity, theater='TEMPERATE', edition=None):
    edition = edition or ('ra2' if identity in ['NACLON', 'NAPSIS'] else 'yr')
    return next(r for r in INVENTORY['matrix'] if (r['id'], r['theater'], r['edition']) == (identity, theater, edition))


@lru_cache(maxsize=64)
def raw_hash(digest):
    return json.loads((SOURCE / 'members' / (digest + '.json')).read_text())


def raw_for(member):
    return raw_hash(member['source']['sha256'])


def indices(member, n):
    raw = raw_for(member)
    f = raw['frames'][n]
    out = np.zeros(raw['canvas'][::-1], np.uint8)
    out[f['y']:f['y'] + f['height'], f['x']:f['x'] + f['width']] = np.array(f['pixels'], np.uint8).reshape(f['height'], f['width'])
    return out


def decode(row, member, n):
    ind = indices(member, n)
    colors = np.array(row['palette']['colors'], np.uint8)[ind]
    return Image.fromarray(np.dstack([colors, np.uint8(ind != 0) * 255]))


def resting(row, damaged=False, occupied=False):
    body = next(m for m in row['members'] if 'body' in m['roles'])
    out = Image.new('RGBA', body['canvas'])
    for role in ['bib', 'body']:
        for m in row['members']:
            if role in m['roles']:
                n = (2 if occupied else int(damaged)) if role == 'body' else int(damaged)
                if row['id'] == 'NAWALL':
                    n = 21 if damaged else 5
                out.alpha_composite(decode(row, m, n))
    if row['id'] != 'NAREFN':
        for anim in row['animations']:
            if anim['type'] in ['IDLE', 'ACTIVE'] or (anim['type'] == 'SUPER' and anim is next(a for a in row['animations'] if a['type'] == 'SUPER')):
                m = next(m for m in row['members'] if m['source']['member'] == anim['member'])
                props = anim.get('damaged') or anim['normal'] if damaged else anim['normal']
                out.alpha_composite(decode(row, m, props['start']), tuple(anim['offset'].values()))
    return out


def area(image, size):
    p = np.asarray(image).astype(np.float32) / 255
    rgb = p[..., :3]
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    premul = np.dstack([linear * p[..., 3:4], p[..., 3]])
    q = np.stack([np.asarray(Image.fromarray(premul[..., k]).resize(size, Image.Resampling.BOX)) for k in range(4)], axis=2)
    linear = np.divide(q[..., :3], q[..., 3:4], out=np.zeros_like(q[..., :3]), where=q[..., 3:4] > 0)
    q[..., :3] = np.where(linear <= .0031308, linear * 12.92, 1.055 * np.maximum(linear, 0) ** (1 / 2.4) - .055)
    return Image.fromarray(np.uint8(np.clip(np.rint(q * 255), 0, 255)))


def register(path, size, box, density=2):
    image = Image.open(path).convert('RGBA')
    crop = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    source = image.crop(crop)
    scale = min((box[2] - box[0]) / source.width, (box[3] - box[1]) / source.height)
    assert scale * density <= 1, ('Undersized source', path)
    content = tuple(round(v * scale * density) for v in source.size)
    xy = (round((box[0] + box[2]) * density / 2 - content[0] / 2), box[3] * density - content[1])
    canvas = Image.new('RGBA', tuple(n * density for n in size))
    canvas.alpha_composite(area(source, content), xy)
    return canvas, {'source': str(path), 'sha256': sha(path), 'alphaCrop': crop, 'nativeBox': box,
                    'scale': scale, 'density': density, 'offset': xy, 'content': content}


def mask_poly(size, points, density=2, blur=0):
    mask = Image.new('L', size)
    ImageDraw.Draw(mask).polygon([(round(x * density), round(y * density)) for x, y in points], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur * density)) if blur else mask


def cut(image, mask):
    out = image.copy()
    out.putalpha(Image.fromarray(np.uint8(np.array(image.getchannel('A'), np.float32) * np.array(mask) / 255)))
    return out
