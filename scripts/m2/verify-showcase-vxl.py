"""Independently validate neutral VXL sources, bearings, densities and fixed colors."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--worklist', type=Path, default=Path('.artifacts/m2-2/selected-vxl-worklist-v1.json'))
parser.add_argument('--inventory', type=Path, default=Path('.artifacts/m2-2/authoring-vxl-v2/inventory.json'))
parser.add_argument('--contract', type=Path, default=Path('desktop/environment-hd-contract.json'))
parser.add_argument('--theater', choices=['TEMPERATE', 'SNOW', 'URBAN'], default='TEMPERATE')
args = parser.parse_args()
work = json.loads(args.worklist.read_text())
native = json.loads((Path(work['references']) / 'report.json').read_text())
inventory = json.loads(args.inventory.read_text())
contract = json.loads(args.contract.read_text())['vxl']
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
assert set(contract) == {board['identity'] for board in work['boards']}
assert len(work['boards']) == len(contract), 'This verifier requires one native body part per actor'
records = []
for board in work['boards']:
    identity = board['identity']
    unit = next(unit for unit in native['units'] if unit['name'] == identity)
    variants = []
    for selected in contract[identity]['variants']:
        file = Path('.local') / selected['path']
        assert sha(file) == selected['hash']
        pack = json.loads(file.read_text())
        density = selected['density']
        assert pack['identity'] == identity and pack['density'] == density
        assert pack['theater'] == args.theater
        assert all(inventory['assets'][name]['sha256'] == digest for name, digest in pack['sources'].items())
        assert len(pack['parts']) == 1
        part = pack['parts'][0]
        assert part['member'] == board['sourceMember']
        assert part['provenance']['sha256'] == sha(Path(board['selectedArt']))
        assert part['provenance'].get('authoredCellOrder', list(range(8))) == board.get('authoredCellOrder', list(range(8)))
        assert part['provenance'].get('authoredFrameOverrides', {}) == board.get('authoredFrameOverrides', {})
        images = {}
        for role, declared in part['files'].items():
            png = file.parent / declared['file']
            assert sha(png) == declared['sha256'] and png.stat().st_size == declared['bytes']
            image = Image.open(png).convert('RGBA')
            assert list(image.size) == part['pageSize'] and max(image.size) <= 2048
            images[role] = np.asarray(image)
        assert not images['data'][..., :3].any(), 'Neutral fixed colors must never acquire owner paint'
        assert (images['data'][..., 3] == 255).all()
        assert [frame['heading'] for frame in part['frames']] == list(range(0, 360, 45))
        frame_images = []
        for frame, original in zip(part['frames'], board['frames'], strict=True):
            heading = frame['heading']
            assert frame['availableAuthoredDensity'] >= 4
            assert frame['sourceBounds'] == original['sourceBounds']
            assert frame['offset'] == [(original['sourceBounds'][i] - original['part']['pivot'][i]) / original['ratio'] for i in [0, 1]]
            linear = original['part']['matrixWorld'].copy()
            linear[12:15] = [0, 0, 0]
            assert frame['referenceLinear'] == linear and frame['ownerPixels'] == 0
            original_file = Path(work['references']) / f'{identity}-{heading}-{board["part"]}.png'
            blue_file = original_file.with_name(original_file.stem + '-owner-blue.png')
            assert frame['ownerControlHashes'] == [sha(original_file), sha(blue_file)]
            assert np.array_equal(np.asarray(Image.open(original_file)), np.asarray(Image.open(blue_file)))
            x, y, width, height = frame['rect']
            assert [width, height] == [round(value * density) for value in frame['logicalSize']]
            assert x >= 0 and y >= 0 and x + width <= part['pageSize'][0] and y + height <= part['pageSize'][1]
            crop = images['base'][y:y + height, x:x + width]
            assert crop[..., 3].any()
            frame_images.append((frame, crop))
        variants.append((density, frame_images))
        records.append(dict(identity=identity, density=density, manifest=str(file), sha256=sha(file),
                            bearings=8, ownerPixels=0, decodedRgbaBytes=sum(image.nbytes for image in images.values())))
    variants.sort(key=lambda variant: variant[0])
    for (small_frame, small), (large_frame, large) in zip(variants[0][1], variants[1][1], strict=True):
        assert small_frame['logicalSize'] == large_frame['logicalSize']
        for key in ['offset', 'referenceLinear', 'referenceOrigin', 'sourceBounds', 'authoredDetailSize']:
            assert small_frame[key] == large_frame[key]
        enlarged = np.asarray(Image.fromarray(small).resize((large.shape[1], large.shape[0]), Image.Resampling.LANCZOS))
        assert not np.array_equal(enlarged, large), '4X must contain its independently sampled master detail'
for reused in work['reused']:
    file = Path(reused['manifest'])
    assert reused['identity'] == 'TRUCKA' and reused['canonical'] == 'DTRUCK' and sha(file) == reused['sha256']
    assert json.loads(file.read_text())['sources'] == reused['sourcePair']
result = dict(schema='m2-2-neutral-vxl-verification-v1', status='PASS_SOURCES_BEARINGS_DENSITIES_FIXED_COLORS',
    authoredIdentities=len(contract), reused=work['reused'], densityBearings=sum(r['bearings'] for r in records), records=records,
    boundary='Source registration and export validation; native movement, turning, destruction and combined user visual acceptance are separate.')
args.output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['status', 'authoredIdentities', 'densityBearings']}))
