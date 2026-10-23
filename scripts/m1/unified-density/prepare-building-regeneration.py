"""Group deficient master cutouts into bounded reference-only editing sheets."""
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

root = Path('.artifacts/4x-regeneration')
out = root / 'building-group-references-v1'
out.mkdir(exist_ok=False)
jobs = []
for source in ['building-audit-v1', 'soviet-building-audit-v1']:
    for path in sorted((root / source / 'references').glob('*.json')):
        job = json.loads(path.read_text())
        if job['family'] == 'GAPILE' or job['key'].startswith('dc39c83417'):
            continue
        job['auditSource'] = source
        jobs.append(job)
groups = [[j] for j in jobs if max(j['targetSize']) > 730]
small = [j for j in jobs if j['auditSource'] == 'building-audit-v1' and max(j['targetSize']) <= 730]
groups += [small[i:i + 2] for i in range(0, len(small), 2)]
wall = [j for j in jobs if j['family'] == 'NAWALL']
groups.append(wall)
silo = [j for j in jobs if j['family'] == 'NAMISL' and max(j['targetSize']) <= 730]
groups += [silo[i:i + 2] for i in range(0, len(silo), 2)]
groups += [[j] for j in jobs if j['auditSource'] == 'soviet-building-audit-v1' and j['family'] not in ['NAWALL', 'NAMISL']]
records = []
for n, group in enumerate(groups):
    cols = 1 if len(group) == 1 else 4 if group[0]['family'] == 'NAWALL' else 2
    rows = math.ceil(len(group) / cols)
    board = Image.new('RGBA', (768 * cols, 768 * rows))
    for i, job in enumerate(group):
        image = Image.open(job['reference']).convert('RGBA')
        scale = 690 / max(job['targetSize'])
        size = tuple(round(v * scale) for v in job['targetSize'])
        # Reference-only registration reproduces accepted on-screen proportions.
        image = image.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
        board.alpha_composite(image, (i % cols * 768 + (768 - size[0]) // 2, i // cols * 768 + (768 - size[1]) // 2))
    name = f'building-group-{n:02}'
    path = out / (name + '.png')
    board.save(path)
    records.append(dict(job=name, reference=str(path), referenceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        grid=[cols, rows], occupied=len(group), bindings=group, referenceOnlyInterpolation=True,
                        status='AWAITING_GENERATION'))
(root / 'building-generation-jobs-v1.json').write_text(json.dumps({'jobs': records}, indent=2) + '\n')
for r in records:
    print(r['job'], [(j['family'], j['key'][:10], j['targetSize']) for j in r['bindings']])
