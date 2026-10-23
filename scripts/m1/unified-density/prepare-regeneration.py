"""Prepare bounded reference sheets for deficient accepted SHP master poses."""
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_cells import isolated_cells

root = Path('.artifacts/4x-regeneration')
out = root / 'references-v1'
out.mkdir(exist_ok=False)
work = json.loads(Path('.artifacts/allied-units/production-shp-work-v22.json').read_text())
jobs = json.loads((root / 'source-jobs-v1.json').read_text())['units']
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
records = []
for job in jobs:
    member = next(m for m in work['families'][job['identity']]['members'] if m['sourceMember'] == job['member'])
    batch = next(b for b in member['batches'] if b['id'] == job['batch'])
    source = json.loads(Path(member['sourceFile']).read_text())
    assert sha(batch['selectedArt']) == batch['selectedArtSha256']
    image = Image.open(batch['selectedArt']).convert('RGBA')
    if batch.get('matte') == 'authored-flat-magenta':
        rgba = np.array(image).astype(float)
        key = np.minimum(rgba[..., 0], rgba[..., 2]) - rgba[..., 1]
        coverage = np.clip(1 - key / 255, 0, 1)
        coverage[key > 180] = 0
        rgba[..., :3] = np.divide(rgba[..., :3] - (1 - coverage[..., None]) * [255, 0, 255],
                                 np.maximum(coverage[..., None], .01))
        rgba[..., 3] *= coverage
        image = Image.fromarray(np.uint8(np.clip(rgba, 0, 255)))
    subjects = isolated_cells(image, *batch['grid'], occupied=len(batch['samples']))
    for chunk in range(math.ceil(len(job['frames']) / 12)):
        frames = job['frames'][chunk * 12:(chunk + 1) * 12]
        cols = min(4, math.ceil(math.sqrt(len(frames))))
        rows = math.ceil(len(frames) / cols)
        board = Image.new('RGBA', (cols * 384, rows * 384))
        poses = []
        for i, n in enumerate(frames):
            si = next(i for i, sample in enumerate(batch['samples']) if sample['frame'] == n)
            detail = subjects[si][0]
            if batch['samples'][si].get('selectedArt'):
                sample = batch['samples'][si]
                assert sha(sample['selectedArt']) == sample['selectedArtSha256']
                detail = isolated_cells(Image.open(sample['selectedArt']).convert('RGBA'),
                    *sample.get('selectedArtGrid', [1, 1]), occupied=sample.get('selectedArtOccupied'))[sample.get('selectedArtIndex', 0)][0]
            native = source['frames'][n]
            # This enlarged input is reference-only, never authored output or a 4x claim.
            pixels = np.array(native['pixels'], dtype=np.uint8).reshape(native['height'], native['width'])
            bounds = Image.fromarray(np.uint8((pixels != 0) & (pixels != 12)) * 255).getbbox()
            width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
            size = (width * 6, height * 6)
            assert max(size) < 370, (job['identity'], n, size)
            reference = detail.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
            xy = (i % cols * 384 + (384 - size[0]) // 2, i // cols * 384 + (384 - size[1]) // 2)
            board.alpha_composite(reference, xy)
            poses.append({'frame': n, 'index': i, 'sourceCrop': list(detail.size), 'nativeBodySize': [width, height]})
        name = f'{job["identity"]}-{job["batch"]}-{chunk:02}'
        file = out / (name + '.png'); board.save(file)
        records.append({**job, 'job': name, 'frames': frames, 'grid': [cols, rows], 'reference': str(file),
                        'referenceSha256': sha(file), 'poses': poses, 'referenceOnlyInterpolation': True,
                        'output': None, 'status': 'AWAITING_GENERATION'})
(root / 'unit-generation-jobs-v1.json').write_text(json.dumps({'baseline': 'f24c58c', 'jobs': records}, indent=2) + '\n')
print(len(records), 'reference boards; no runtime/resource changes')
