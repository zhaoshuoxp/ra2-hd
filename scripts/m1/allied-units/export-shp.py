"""Export authored native slots at a validated density; incomplete or unreviewed boards fail closed."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from authored_cells import isolated_cells

parser = argparse.ArgumentParser()
parser.add_argument('identity')
parser.add_argument('worklist', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--member')
parser.add_argument('--density', type=int, choices=[2, 4], default=2)
parser.add_argument('--audit-only', action='store_true')
parser.add_argument('--allow-partial', action='store_true')
args = parser.parse_args()
work = json.loads(args.worklist.read_text())['families'][args.identity]
member = next(m for m in work['members'] if not args.member or m['sourceMember'] == args.member)
batches = [b for b in member['batches'] if b.get('selectedArt') and b.get('visualQa') == 'PASS']
assert batches and (args.allow_partial or len(batches) == len(member['batches']))
source = json.loads(Path(member['sourceFile']).read_text())
args.output.mkdir(parents=True, exist_ok=False)
density = args.density
sampling = []
canvas = tuple(v * density for v in source['canvas'])
frames = {}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def decode_matte(board, matte):
    if matte == 'authored-flat-magenta':
        rgba = np.array(board).astype(float)
        key = np.minimum(rgba[..., 0], rgba[..., 2]) - rgba[..., 1]
        coverage = np.clip(1 - key / 255, 0, 1)
        coverage[key > 180] = 0
        rgba[..., :3] = np.divide(rgba[..., :3] - (1 - coverage[..., None]) * [255, 0, 255],
                                 np.maximum(coverage[..., None], .01))
        rgba[..., 3] *= coverage
        board = Image.fromarray(np.uint8(np.clip(rgba, 0, 255)))
    else:
        assert board.getchannel('A').getextrema()[0] == 0, 'Generated alpha required'
    return board


for batch in batches:
    path = Path(batch['selectedArt'])
    assert sha(path) == batch['selectedArtSha256']
    board = Image.open(path).convert('RGBA')
    board = decode_matte(board, batch.get('matte'))
    if batch.get('gridLineCleanupPx'):
        # Remove explicitly reviewed board separators, never native body pixels.
        rgba = np.array(board)
        radius = batch['gridLineCleanupPx']
        for axis, cells in [(1, batch['grid'][0]), (0, batch['grid'][1])]:
            for edge in range(cells + 1):
                center = round(rgba.shape[axis] * edge / cells)
                strip = [slice(None), slice(None)]
                strip[axis] = slice(max(0, center - radius), center + radius + 1)
                rgba[tuple(strip) + (3,)] = 0
        board = Image.fromarray(rgba)
    bw, bh = batch.get("boardSize", [2048, 1536])
    rx, ry = board.width / bw, board.height / bh
    replaced = [i for i, sample in enumerate(batch['samples']) if sample.get('selectedArt')]
    subjects = isolated_cells(board, *batch['grid'], occupied=len(batch['samples']), replaced=replaced) if batch.get('isolatedSubjects') else None
    for sample_index, sample in enumerate(batch['samples']):
        n = sample['frame']
        native = source['frames'][n]
        x, y, width, height = sample.get('authoredCell', sample['cell'])
        cell = board.crop((round(x * rx), round(y * ry), round((x + width) * rx), round((y + height) * ry)))
        bounds = cell.getchannel('A').point(lambda v: 255 if v > 64 else 0).getbbox()
        assert subjects or bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < cell.width and bounds[3] < cell.height, (batch['id'], n)
        detail = subjects[sample_index][0] if subjects and sample_index not in replaced else cell.crop(bounds)
        if sample.get('selectedArt'):
            replacement = Path(sample['selectedArt'])
            assert sha(replacement) == sample['selectedArtSha256']
            replacement_image = decode_matte(Image.open(replacement).convert('RGBA'), sample.get('matte', batch.get('matte')))
            replacement_grid = sample.get('selectedArtGrid', [1, 1])
            replacement_cells = isolated_cells(replacement_image, *replacement_grid,
                                               occupied=sample.get('selectedArtOccupied'))
            detail = replacement_cells[sample.get('selectedArtIndex', 0)][0]
        indices = np.array(native['pixels'], dtype=np.uint8).reshape(native['height'], native['width'])
        body_mask = (indices != 0) & (indices != 12)
        # Detached shell casings must not stretch an infantry body during firing.
        # Keep full bounds for death, water and thrown-equipment sequences.
        registration = 'native-body-extents'
        if batch['action'].lower() in ('fireup', 'fireprone', 'deployedfire'):
            labels, _ = ndimage.label(body_mask, np.ones((3, 3)))
            areas = np.bincount(labels.ravel())
            areas[0] = 0
            body_mask = labels == areas.argmax()
            registration = 'native-connected-firing-body'
        body = Image.fromarray(body_mask.astype(np.uint8) * 255).getbbox()
        assert body, n
        left, top, right, bottom = body
        scale = min((right - left) / detail.width, (bottom - top) / detail.height)
        available = min(detail.width / (right - left), detail.height / (bottom - top))
        sampling.append({'frame': n, 'availableDensity': available, 'masterSize': list(detail.size),
                         'nativeSize': [right - left, bottom - top], 'source': str(path)})
        if args.audit_only:
            continue
        assert 1 / scale >= density, 'Insufficient authored sampling'
        size = ((right - left) * density, (bottom - top) * density)
        assert detail.width >= size[0] and detail.height >= size[1], 'Insufficient authored sampling'
        # Register both native body extents; contain-fit would shrink broad poses.
        sprite = detail.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
        candidate = Image.new('RGBA', canvas)
        # Preserve indexed ground patches beneath the authored body; never fill body RGB.
        ground = np.zeros((*indices.shape, 4), dtype=np.uint8)
        ground[..., 3] = (indices == 12).astype(np.uint8) * 255
        native_ground = Image.fromarray(ground).resize((native['width'] * density, native['height'] * density), Image.Resampling.NEAREST)
        candidate.alpha_composite(native_ground, (native['x'] * density, native['y'] * density))
        anchor = (round((native['x'] + (left + right) / 2) * density - sprite.width / 2),
                  round((native['y'] + bottom) * density - sprite.height))
        assert anchor[0] >= native['x'] * density and anchor[1] >= native['y'] * density
        assert anchor[0] + size[0] <= (native['x'] + native['width']) * density
        assert anchor[1] + size[1] <= (native['y'] + native['height']) * density
        candidate.alpha_composite(sprite, anchor)
        output = args.output / f'{n:04d}.png'
        candidate.save(output)
        frames[n] = {'frame': n, 'path': str(output), 'sha256': sha(output), 'batch': batch['id'],
                     'sourceFrameSha256': native['sha256'], 'scale': scale, 'anchor': anchor,
                     'nativeBodyBounds': body, 'registration': registration, 'retainedGroundPixels': int((indices == 12).sum())}
if args.audit_only:
    report = {'identity': args.identity, 'member': member['sourceMember'], 'density': density,
              'eligible': all(s['availableDensity'] >= density for s in sampling),
              'insufficient': [s for s in sampling if s['availableDensity'] < density], 'frames': sampling}
    (args.output / 'sampling-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(args.identity, member['sourceMember'], report['eligible'], len(report['insufficient']))
    raise SystemExit(0)
for slot in member['slots']:
    n = slot['frame']
    if slot['empty']:
        output = args.output / f'{n:04d}.png'
        Image.new('RGBA', canvas).save(output)
        frames[n] = {'frame': n, 'path': str(output), 'sha256': sha(output), 'empty': True}
assert args.allow_partial or sorted(frames) == list(range(member['requiredSlots']))
manifest = {'status': 'PARTIAL_AUTHORED_SLOT_EXPORT' if args.allow_partial else 'COMPLETE_AUTHORED_SLOT_EXPORT_RUNTIME_PENDING', 'identity': args.identity,
            'sourceFile': member['sourceFile'], 'sourceSha256': source['sha256'], 'density': density,
            'frames': [frames[n] for n in sorted(frames)], 'worklistSha256': sha(args.worklist),
            'sourceUse': 'Native registration, remap support and shadow only; no source body RGB'}
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(args.identity, len(frames), manifest['status'])
