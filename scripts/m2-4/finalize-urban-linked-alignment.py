"""Finalize registered atlas gutters without changing geometry or categorical data."""
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-linked-alignment-r1-v1')
before = Path('.local/environment-packs/urban-environment-m2-4-linked-alignment-r1-v1')
after = before.with_name('urban-environment-m2-4-linked-alignment-r1-v2')
after.mkdir()
for p in before.rglob('*'):
    if p.is_file():
        q = after / p.relative_to(before)
        q.parent.mkdir(parents=True, exist_ok=True)
        os.link(p, q)
catalog = read(before / 'manifest.json')
catalog['revision'] = after.name
changed_members = {'nupsya_a.shp', 'ngpsyb_a.shp', 'cgla10_a.shp'}
records = []


def replace(file, data):
    temporary = file.with_name(file.name + '.new')
    with temporary.open('xb') as stream:
        stream.write(data)
    os.replace(temporary, file)


for family in catalog['families'].values():
    for member in family['members']:
        if member['member'] not in changed_members:
            continue
        metadata = read(before / member['path'])
        for variant in metadata['variants']:
            density = variant['density']
            for page in variant['pages']:
                file = after / Path(member['path']).parent / str(density) / page['id'] / 'base.png'
                original = np.asarray(Image.open(file).convert('RGBA')).copy()
                pixels = original.copy()
                for frame in variant['frames']:
                    if frame['page'] != page['id']:
                        continue
                    x, y, w, h = frame['sampleRect']
                    tile = pixels[y:y + h, x:x + w].copy()
                    tile[tile[..., 3] == 0, :3] = 0
                    padded = np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode='edge')
                    padded[..., 3] = 0
                    padded[2:h + 2, 2:w + 2] = tile
                    pixels[y - 2:y + h + 2, x - 2:x + w + 2] = padded
                assert np.array_equal(original[..., 3], pixels[..., 3])
                temporary = file.with_name(file.name + '.new')
                Image.fromarray(pixels).save(temporary, format='PNG')
                os.replace(temporary, file)
                page['baseSha256'], page['baseBytes'] = sha(file), file.stat().st_size
                records.append(dict(member=member['member'], density=density, page=page['id'],
                    alphaUnchanged=True, dataSha256=page['dataSha256'], baseSha256=page['baseSha256']))
        metadata['packRevision'] = after.name
        replace(after / member['path'], (json.dumps(metadata, separators=(',', ':')) + '\n').encode())
        member['sha256'] = sha(after / member['path'])
replace(after / 'manifest.json', (json.dumps(catalog, separators=(',', ':')) + '\n').encode())
subset = dict(catalog, families={k: v for k, v in catalog['families'].items()
    if k in ['urban-napsya', 'urban-napsyb', 'urban-cala10']})
patch = root / 'complete-family-patch'
patch.mkdir()
os.symlink((after / 'members').resolve(), patch / 'members')
(patch / 'manifest.json').write_text(json.dumps(subset, separators=(',', ':')) + '\n')
receipt = dict(status='REGISTERED_ATLAS_GUTTERS_FINALIZED_PENDING_VERIFICATION',
    base=str(before), output=str(after), selectedPack=dict(schemaVersion=1, revision=after.name, sha256=sha(after / 'manifest.json')),
    pages=records, completeFamilyPatch=str(patch), densityAndLayoutUnchanged=True, sourceArchivesChanged=False)
(root / 'finalize.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], pages=len(records), selectedPack=receipt['selectedPack'])))
