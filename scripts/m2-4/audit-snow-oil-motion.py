"""Compare immutable Snow oil cycles with Original and the accepted temperate R16."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2' / 'official-maps'))
from owner_review import compose_owner

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--snow-pack', type=Path,
                    default=Path('.local/environment-packs/snow-environment-m2-4-technology-v1'))
parser.add_argument('--snow-label', default='Snow Batch26')
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
root = Path('.artifacts/m2-4')
snow_root = root / 'snow-native-technology-batch26-v1'
temp_root = root / 'snow-batch26-original-component-guides-v1'
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
snow = {s['member']: s for s in load(snow_root / 'source.json')['sources']}
temp = {s['member']: s for s in load(temp_root / 'source.json')['sources']}
packs = {
    args.snow_label: args.snow_pack,
    'Accepted temperate R16': Path('.local/environment-packs/environment-m2-3-oil-paired-drive-complete-v31'),
}
records = []


def native(source, folder, number, canvas=False):
    frame = source['frames'][number]
    path = (folder / 'native' / frame['indexFile'] if 'indexFile' in frame else folder / frame['file'])
    assert sha(path) == frame['indexSha256']
    indices = np.frombuffer(path.read_bytes(), np.uint8).reshape(frame['size'][1], frame['size'][0])
    if not canvas:
        return indices
    result = np.zeros((source['canvas'][1], source['canvas'][0]), np.uint8)
    x, y = frame['origin']
    result[y:y + indices.shape[0], x:x + indices.shape[1]] = indices
    return result


def original(source, folder, number, palette):
    indices = native(source, folder, number)
    rgba = np.zeros((*indices.shape, 4), np.uint8)
    rgba[..., :3], rgba[..., 3] = palette[indices], (indices != 0) * 255
    return Image.fromarray(rgba)


def exported(pack, member, density, palette):
    catalog = load(pack / 'manifest.json')
    entries = [entry for family in catalog['families'].values()
               for entry in family['members'] if entry['member'] == member]
    assert len({entry['path'] for entry in entries}) == 1
    path = pack / entries[0]['path']
    assert sha(path) == entries[0]['sha256']
    metadata = load(path)
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    pages, images = {}, {}
    for frame in variant['frames']:
        if frame['page'] not in pages:
            pages[frame['page']] = tuple(Image.open(path.parent / str(density) / frame['page'] / file)
                                        for file in ['base.png', 'data.png'])
        base, data = pages[frame['page']]
        x, y, w, h = frame['contentRect']
        box = (x, y, x + w, y + h)
        images[frame['nativeFrame']] = compose_owner(base.crop(box), data.crop(box), palette)
    return images, metadata, path


palette_file = snow_root / 'native' / (snow['caoild_a.shp']['palette']['sha256'] + '.pal')
assert sha(palette_file) == snow['caoild_a.shp']['palette']['sha256']
palette = (np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4).astype(np.uint8)
report = dict(schema='m2-4-snow-oil-reference-audit-v1', status='DIAGNOSTIC_VISUAL_AND_COMPONENT_AUDIT',
    sourcePins={str(p.resolve()): sha(p) for p in [snow_root / 'source.json', temp_root / 'source.json']},
    policy='Read-only original decode, exact atlas crops and diagnostic composition. No new art, resource selection or gameplay mutation.',
    cases=[], files=[])
for state in (0, 1):
    numbers = range(state * 32, (state + 1) * 32)
    a = np.stack([native(snow['caoild_a.shp'], snow_root, n, True) for n in numbers])
    t = np.stack([native(temp['ctoild_a.shp'], temp_root, n, True) for n in numbers])
    assert a.shape == t.shape
    moving_a = np.any(a != a[0], axis=0)
    moving_t = np.any(t != t[0], axis=0)
    moving = moving_a | moving_t
    report['cases'].append(dict(state='damaged' if state else 'normal', phases=32,
        originalMovingMaskDifferingPixels=int((moving_a != moving_t).sum()),
        originalMovingIndexDifferenceSamples=int(((a != t) & moving).sum()),
        originalDifferentIndexSamples=int((a != t).sum()),
        sourceGeometryIsNotAutomaticallyInterchangeable=True))
for density in (2, 4):
    frames = {}
    for label, pack in packs.items():
        prefix = 'ca' if label == args.snow_label else 'ct'
        for suffix in ['oild.shp', 'oild_a.shp']:
            values, metadata, path = exported(pack, prefix + suffix, density, palette)
            frames[(label, suffix)] = values
            report.setdefault('metadataPins', {})[str(path.resolve())] = sha(path)
    for state in (0, 1):
        board = Image.new('RGBA', (166 * density * 4, (122 * density + 48) * 8), (25, 29, 35, 255))
        draw = ImageDraw.Draw(board)
        for row, phase in enumerate(range(0, 32, 4)):
            number = state * 32 + phase
            labels = ['Original Snow', args.snow_label, 'Original temperate', 'Accepted temperate R16']
            for column, label in enumerate(labels):
                is_snow = label in ['Original Snow', args.snow_label]
                sources, folder, prefix = (snow, snow_root, 'ca') if is_snow else (temp, temp_root, 'ct')
                image = Image.new('RGBA', (166 * density, 122 * density))
                for suffix, n in [('oild.shp', state), ('oild_a.shp', number)]:
                    source = sources[prefix + suffix]
                    part = (original(source, folder, n, palette).resize(
                        tuple(v * density for v in source['frames'][n]['size']), Image.Resampling.NEAREST)
                        if label.startswith('Original') else frames[(label, suffix)][n])
                    image.alpha_composite(part, tuple(v * density for v in source['frames'][n]['origin']))
                x, y = column * 166 * density, row * (122 * density + 48)
                board.alpha_composite(image, (x, y + 48))
                draw.text((x + 8, y + 6), f'{label} | {density}X | {phase}', fill='white', font_size=20)
        file = args.output / f'oil-{density}x-{state}-same-phase-reference.png'
        board.save(file)
        report['files'].append(dict(path=str(file.resolve()), sha256=sha(file), rescaledHd=False,
                                   density=density, state=state))
with (args.output / 'report.json').open('x') as stream:
    json.dump(report, stream, indent=2)
    stream.write('\n')
print(json.dumps(dict(status=report['status'], cases=report['cases'], boards=len(report['files']))))
