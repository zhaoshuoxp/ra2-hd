"""Prepare source-pinned native boards and jobs without creating HD artwork."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--contract', type=Path, required=True)
parser.add_argument('--layout', type=Path, required=True)
parser.add_argument('--members', nargs='+', help='Explicit production subset; complete export remains mandatory')
parser.add_argument('--prefix', default='snow-building', help='Unique native-reference job prefix')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, data):
    with path.open('x') as stream:
        stream.write(json.dumps(data, indent=2) + '\n')


work = read(args.root / 'worklist.json')
native = read(args.prepared / 'source.json')
contract, layout = read(args.contract), read(args.layout)
acceptance_path = Path(layout['acceptedStyleReceipt'])
assert sha(acceptance_path) == layout['acceptedStyleReceiptSha256']
acceptance_status = read(acceptance_path)['status']
assert acceptance_status == 'USER_ACCEPTED' or acceptance_status.startswith('USER_ACCEPTED_')
assert work['preparedSourceSha256'] == sha(args.prepared / 'source.json')
assert native['theater'] == contract['theater'] == 'SNOW'
sources = {s['member']: s for s in native['sources']}
assigned = [key for board in layout['boards'] for key in board['slots']]
expected = {key for key, slot in work['slots'].items()
            if not args.members or slot['member'] in args.members}
assert not args.members or set(args.members).issubset(sources)
assert len(set(assigned)) == len(assigned) and set(assigned) == expected
profile = read(Path(layout['acceptedMaterialProfile']))
coverage_source = profile['acceptedCoveragePolicySource']
assert sha(Path(coverage_source['path'])) == coverage_source['sha256']
profile['nativeFrameTone'] = {}
jobs, overrides = [], {}
for number, board in enumerate(layout['boards'], 1):
    columns, rows = board['cellLayout']
    assert 0 < len(board['slots']) <= columns * rows
    width, height = board.get('boardSize', [1254, 1254])
    assert width % columns == height % rows == 0
    cw, ch = width // columns, height // rows
    identity = f'{args.prefix}-{width}-{columns}x{rows}-{number:03d}'
    reference = args.root / (identity + '-reference.png')
    assert not reference.exists()
    image = Image.new('RGBA', (width, height))
    members = []
    for index, key in enumerate(board['slots']):
        slot = work['slots'][key]
        source = sources[slot['member']]
        frame = source['frames'][slot['nativeSlot']]
        original = args.prepared / 'native' / frame['file']
        assert sha(original) == frame['rgbaSha256']
        sprite = Image.frombytes('RGBA', tuple(frame['size']), original.read_bytes())
        if slot['state'] == 'rubble':
            palette = contract['sources'][slot['member']]['framePalettes'][str(slot['nativeSlot'])]
            palette_path = args.prepared / 'native' / (palette['sha256'] + '.pal')
            index_path = args.prepared / 'native' / frame['indexFile']
            assert sha(palette_path) == palette['sha256'] and sha(index_path) == frame['indexSha256']
            indices = np.frombuffer(index_path.read_bytes(), np.uint8).reshape(frame['size'][1], frame['size'][0])
            colors = np.frombuffer(palette_path.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
            rgba = np.array(sprite)
            rgba[..., :3] = colors[indices].astype(np.uint8)
            sprite = Image.fromarray(rgba)
            profile['nativeFrameTone'].setdefault(slot['member'], {})[str(slot['nativeSlot'])] = dict(
                sourceSha256=source['sha256'], indexSha256=frame['indexSha256'], paletteSha256=palette['sha256'])
        capacity = min((cw - 80) / sprite.width, (ch - 80) / sprite.height)
        assert capacity >= 4.2, (key, capacity)
        size = tuple(round(value * capacity) for value in sprite.size)
        left, top = index % columns * cw, index // columns * ch
        x, y = left + (cw - size[0]) // 2, top + (ch - size[1]) // 2
        image.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
        overrides[key] = dict(board=identity + '-master.png', boardSize=[width, height],
            occupied=len(board['slots']), slotRect=[left, top, cw, ch], referenceRect=[x, y, *size])
        members.append(dict(member=slot['member'], frame=slot['nativeSlot'], state=slot['state']))
    image.save(reference)
    style = Path(board['style']).resolve()
    assert sha(style) == board['styleSha256']
    prompt = (f'Use case: style-transfer. RA2 HD reusable Snow civilian building production sheet. '
        f'Image 1 is the exact original geometry and state guide, {columns} columns by {rows} rows, '
        f'{len(members)} occupied cells in row-major order. Image 2 is user-accepted Snow material direction '
        f'only, never an architecture or layout donor. Newly author every occupied cell at the same scale '
        f'and position with substantial resolved material detail, not pixel enlargement or sharpening. '
        f'Keep the original isometric projection, precise silhouette, architecture, windows, roof devices, '
        f'damage gaps and occupancy fortifications of each original. Preserve original snow extent and '
        f'light direction. Snow is smooth and quiet, with minimal broad shading and no etched or repeated '
        f'patterns. Retain native brick, plaster, metal and glass colors. Rubble uses its exact original '
        f'Snow ISO palette, flat footprint and broken debris silhouette; no standing replacement building. '
        f'Keep generous transparent gutters inside every cell. Leave unused cells completely empty. '
        f'No invented snow, regular decorative patterns, extra objects, game-world terrain, cast shadows, '
        f'text, borders or grid lines. True transparent background. Output {width}x{height} or larger '
        f'with the exact cell layout. States: {json.dumps(members)}.')
    jobs.append(dict(id=identity, format='shp', group='building', cellLayout=[columns, rows],
        slots=board['slots'], members=members, reference=str(reference.resolve()), referenceSha256=sha(reference),
        style=str(style), styleSha256=sha(style), prompt=prompt,
        destination=str((args.root / (identity + '-master.png')).resolve()), status='NATIVE_GUIDES_ONLY_GENERATION_PENDING'))
write(args.root / 'slot-overrides.json', overrides)
write(args.root / 'material-profile.json', profile)
write(args.root / 'imagegen-jobs-v1.json', dict(schema='m2-4-native-snow-building-jobs-v1', jobs=jobs,
    layoutSha256=sha(args.layout), preparedSourceSha256=sha(args.prepared / 'source.json'),
    policy='Native reference composition only. No HD artwork, export, runtime or visual acceptance is claimed.'))
print(json.dumps(dict(jobs=len(jobs), subjects=len(assigned), nativeIsoRubbleMembers=len(profile['nativeFrameTone']))))
