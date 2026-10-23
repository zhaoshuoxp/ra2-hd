"""Read accepted atlas pixels without touching any prior pack or export."""
import json
import os
from functools import lru_cache
from pathlib import Path
from PIL import Image
from production_common import ACCEPTED, ROOT, row_for


@lru_cache(maxsize=20)
def family(identity):
    slug = identity.lower()
    path = (Path('.local/hd-packs/soviet-power-plant-authored/2/family.json') if identity == 'NAPOWR'
            else Path(f'.local/hd-packs/soviet-{slug}-authored/{ACCEPTED["revisions"][slug]}/family.json'))
    if os.environ.get('RA2_DENSITY_SELECTION'):
        overrides = json.loads(Path(os.environ['RA2_DENSITY_SELECTION']).read_text())
        path = Path(overrides.get(identity, path))
    return json.loads(path.read_text())


@lru_cache(maxsize=80)
def member_info(identity, index):
    binding = family(identity)['members'][index]
    root = Path('.local/hd-packs') / binding['packId'] / binding['revision']
    manifest = json.loads((root / 'manifest.json').read_text())
    density = 4 if identity == 'NAPOWR' or os.environ.get('RA2_EXPORT_DENSITY') == '4' else 2
    variant = next((v for v in manifest['variants'] if v['density'] == density), None)
    assert variant is not None, (identity, index, density)
    return root, manifest, variant


@lru_cache(maxsize=20)
def atlas(filename):
    return Image.open(filename).convert('RGBA')


def frame(identity, index, n, role='base'):
    root, manifest, variant = member_info(identity, index)
    logical = manifest['logical']['frames'][n]
    placement = variant['frames'][n]
    page = next(p for p in variant['pages'] if p['id'] == placement['page'])
    x, y, w, h = placement['sampleRect']
    cropped = atlas(str(root / page[role])).crop((x, y, x + w, y + h))
    density = variant['density']
    canvas = Image.new('RGBA', tuple(v * density for v in manifest['logical']['canvas']))
    canvas.paste(cropped, tuple(v * density for v in logical['trimOrigin']))
    return canvas, density


def resting(identity, damaged=False):
    row = row_for(identity)
    definition = ACCEPTED['families'][identity]
    out = Image.new('RGBA', tuple(v * (4 if identity == 'NAPOWR' or os.environ.get('RA2_EXPORT_DENSITY') == '4' else 2) for v in row['members'][0]['canvas']))
    for role in ['bib', 'body']:
        for index, member in enumerate(row['members']):
            if role in member['roles']:
                n = (21 if damaged else 5) if identity == 'NAWALL' else int(damaged)
                im, density = frame(identity, index, n)
                out.alpha_composite(im)
    if identity != 'NAREFN':
        for anim in row['animations']:
            if anim['type'] in ['IDLE', 'ACTIVE']:
                index = next(i for i, m in enumerate(row['members']) if m['source']['member'] == anim['member'])
                props = (anim.get('damaged') or anim['normal']) if damaged else anim['normal']
                im, density = frame(identity, index, props['start'])
                out.alpha_composite(im, tuple(v * density for v in anim['offset'].values()))
    return out


if __name__ == '__main__':
    out = ROOT / 'accepted-guides-v1'
    out.mkdir(exist_ok=False)
    for identity in ACCEPTED['families']:
        resting(identity).save(out / (identity + '-normal.png'))
        resting(identity, True).save(out / (identity + '-damaged.png'))
    print('Decoded accepted guides without mutating pack bytes')
