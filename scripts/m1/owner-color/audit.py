"""Audit every selected HD world frame for saturated red outside owner masks."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def red_paint(rgba):
    red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
    return ((rgba[..., 3] > 0) & (red > 35) & (red > green * 1.5)
            & (red > blue * 1.5) & (green - blue < (red - blue) * .25))


def world_manifests(registered):
    return sorted({Path(file) for route, file in registered['routes'].items()
                   if route.endswith('/manifest.json') and route.startswith(
                       ('/local-hd/', '/local-vxl/', '/local-rhino/'))})


def frames(manifest, directory):
    if 'variants' in manifest:
        for variant in manifest['variants']:
            pages = {p['id']: p for p in variant['pages']}
            for frame in variant['frames']:
                page = pages[frame['page']]
                yield {'member': manifest['source']['member'], 'frame': frame['nativeFrame'],
                       'density': variant['density'], 'base': directory / page['base'],
                       'data': directory / page['data'], 'rect': frame['sampleRect']}
    elif manifest.get('schema') == 'unit-vxl-family-v1':
        for part in manifest['parts']:
            for frame in part['frames']:
                yield {'member': part['member'], 'part': part['key'], 'actor': part['actor'],
                       'heading': frame['heading'], 'density': manifest['density'],
                       'base': directory / part['files']['base']['file'],
                       'data': directory / part['files']['data']['file'], 'rect': frame['rect']}
    elif 'headings' in manifest:
        for frame in manifest['headings']:
            size = Image.open(directory / frame['base']).size
            yield {'member': manifest.get('family', 'turret') + '-turret', 'heading': frame['heading'],
                   'density': manifest['density'], 'base': directory / frame['base'],
                   'data': directory / frame['mask'], 'rect': [0, 0, *size]}
    elif isinstance(manifest.get('parts'), dict):
        for key in manifest['parts']:
            size = Image.open(directory / (key + '.png')).size
            part, heading = key.rsplit('-', 1)
            yield {'member': 'htnk-' + part + '.vxl', 'heading': int(heading),
                   'density': manifest.get('density', 2), 'base': directory / (key + '.png'),
                   'data': directory / (key + '.mask'), 'rect': [0, 0, *size]}


def load_pair(base, data):
    rgba = np.array(Image.open(base).convert('RGBA'))
    if data.suffix == '.mask':
        mask = np.frombuffer(data.read_bytes(), np.uint8).reshape(rgba.shape[:2])
        values = np.zeros_like(rgba)
        values[..., 0] = mask
        values[..., 3] = 255
    else:
        values = np.array(Image.open(data).convert('RGBA'))
    return rgba, values


def crop(pair, row):
    x, y, w, h = row['rect']
    return tuple(image[y:y + h, x:x + w] for image in pair)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('registered', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--sheets', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    registered = json.loads(args.registered.read_text())
    reports = []
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
    for file in world_manifests(registered):
        manifest = json.loads(file.read_text())
        cache, entries = {}, []
        for row in frames(manifest, file.parent):
            key = (row['base'], row['data'])
            if key not in cache:
                cache[key] = load_pair(*key)
            base, data = crop(cache[key], row)
            paint = red_paint(base)
            residual = paint & (data[..., 0] < 128)
            entries.append({**{k: str(v) if isinstance(v, Path) else v for k, v in row.items()},
                            'ownerPixels': int(((data[..., 0] >= 128) & (base[..., 3] > 0)).sum()),
                            'redPixels': int(paint.sum()), 'residualPixels': int(residual.sum()),
                            'opaqueResidualPixels': int((residual & (base[..., 3] >= 128)).sum())})
        if not entries:
            continue
        identity = manifest.get('identity') or manifest.get('family') or manifest.get('rulesIdentities', [manifest.get('packId', 'HTNK')])[0]
        record = {'identity': identity, 'manifest': str(file),
                  'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                  'frames': entries, 'residualPixels': sum(r['residualPixels'] for r in entries),
                  'opaqueResidualPixels': sum(r['opaqueResidualPixels'] for r in entries)}
        reports.append(record)
        if args.sheets and record['opaqueResidualPixels']:
            ordered = sorted(entries, key=lambda e: -e['opaqueResidualPixels'])
            selected, seen = [], set()
            for row in ordered:
                key = (row['base'], tuple(row['rect']))
                if key in seen:
                    continue
                seen.add(key)
                selected.append(row)
                if len(selected) == 6:
                    break
            sheet = Image.new('RGB', (1200, len(selected) * 250 + 50), '#26303c')
            draw = ImageDraw.Draw(sheet)
            draw.text((12, 12), f'{identity} / {file.parent.name} / unmasked red diagnostic', font=font, fill='white')
            for i, row in enumerate(selected):
                base, data = crop(cache[(Path(row['base']), Path(row['data']))], row)
                sample = Image.fromarray(base)
                sample.thumbnail((470, 200), Image.Resampling.NEAREST)
                y = 65 + i * 250
                sheet.paste(sample, (12, y), sample)
                blue = base.copy()
                shade = data[..., 1].astype(float) / 15
                blue[..., :3] = np.where((data[..., 0] >= 128)[..., None],
                    np.stack((24 + 12 * shade, 80 + 35 * shade, 245 - 100 * shade), axis=2), base[..., :3])
                sample = Image.fromarray(blue)
                sample.thumbnail((470, 200), Image.Resampling.NEAREST)
                sheet.paste(sample, (510, y), sample)
                draw.text((12, y + 205), f'{row["member"]} {row.get("frame", row.get("heading"))} / {row["density"]}x / residual {row["opaqueResidualPixels"]}', font=font, fill='white')
            name = file.parent.parent.name + '-' + file.parent.name + '.png'
            sheet.save(args.output / name)
            record['sheet'] = str(args.output / name)
        if len(reports) % 25 == 0:
            print('Audited manifests', len(reports), flush=True)
    result = {'status': 'FULL_SELECTED_WORLD_MASK_AUDIT_REQUIRES_SEMANTIC_CLASSIFICATION',
              'disclosure': 'Saturated red outside a mask is a candidate; blood, lamps, fire and fixed insignia need explicit classification. Every frame and both available densities are scanned.',
              'manifestCount': len(reports), 'frameCount': sum(len(r['frames']) for r in reports),
              'reports': reports}
    (args.output / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'manifests': len(reports), 'frames': result['frameCount'],
        'candidates': [(r['identity'], r['opaqueResidualPixels']) for r in reports if r['opaqueResidualPixels']]}, indent=2))


if __name__ == '__main__':
    main()
