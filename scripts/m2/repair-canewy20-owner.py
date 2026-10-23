"""Repair only CANEWY20 occupied material from the immutable R8b density pages."""
import argparse
import copy
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image
from showcase_owner import register_fixed_owner_trim
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
for name in ['base', 'destination', 'receipt']:
    parser.add_argument(name, type=Path)
args = parser.parse_args()
assert sha(args.base / 'manifest.json') == '85e99a6b135002e51a9cd55e4c82008c151f46eee3e02a7b5d3cfbe113e3cd95'
pack = json.loads((args.base / 'manifest.json').read_text())
family = copy.deepcopy(pack['families']['environment-ctnewy20'])
assert [m['member'] for m in family['members']] == ['ctnewy20.shp']
prepared = Path('.artifacts/m2-2/prepared-native-v2')
native = next(s for s in json.loads((prepared / 'source.json').read_text())['sources']
              if s['member'] == 'ctnewy20.shp')
args.destination.mkdir(parents=True, exist_ok=False)
rows = []
for member in family['members']:
    source = args.base / member['path']
    assert sha(source) == member['sha256']
    target = args.destination / member['path']
    shutil.copytree(source.parent, target.parent)
    manifest = json.loads(target.read_text())
    manifest['packRevision'] = args.destination.name
    for variant in manifest['variants']:
        density = variant['density']
        pages = {p['id']: np.array(Image.open(target.parent / str(density) / p['id'] / 'base.png'))
                 for p in variant['pages']}
        changed_pages = set()
        seen = set()
        for entry in variant['frames']:
            key = (entry['page'], tuple(entry['sampleRect']))
            if key in seen:
                continue
            seen.add(key)
            slot = entry['nativeFrame']
            frame = native['frames'][slot]
            if frame['empty'] or slot != 2:
                continue
            w, h = frame['size']
            index_file = prepared / 'native' / f'ctnewy20.shp-{slot}.index'
            rgba_file = prepared / 'native' / frame['file']
            assert sha(index_file) == frame['indexSha256'] and sha(rgba_file) == frame['rgbaSha256']
            indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(h, w)
            original = np.asarray(Image.frombytes('RGBA', (w, h), rgba_file.read_bytes()))
            x, y, rw, rh = entry['sampleRect']
            base = pages[entry['page']]
            rgb = base[y:y + h * density, x:x + w * density, :3]
            fixed, mask = register_fixed_owner_trim(rgb, original, indices, density)
            assert mask.any(), 'Expected the reported occupied red spill'
            rgb[:] = fixed
            patch = base[y:y + rh, x:x + rw].copy()
            padded = np.pad(patch, ((2, 2), (2, 2), (0, 0)), mode='edge')
            padded[..., 3] = 0
            padded[2:rh + 2, 2:rw + 2] = patch
            base[y - 2:y + rh + 2, x - 2:x + rw + 2] = padded
            changed_pages.add(entry['page'])
            rows.append(dict(member=member['member'], slot=slot, density=density,
                             correctedPixels=int(mask.sum())))
        for page in variant['pages']:
            if page['id'] in changed_pages:
                file = target.parent / str(density) / page['id'] / 'base.png'
                Image.fromarray(pages[page['id']]).save(file)
                page.update(baseSha256=sha(file), baseBytes=file.stat().st_size)
    target.write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
    member['sha256'] = sha(target)
result = {**pack, 'revision': args.destination.name, 'families': {'environment-ctnewy20': family}}
(args.destination / 'manifest.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
receipt = dict(schema='m2-2-canewy20-fixed-trim-repair-v1', status='PASS',
    baseSha256=sha(args.base / 'manifest.json'), patchSha256=sha(args.destination / 'manifest.json'),
    algorithmSha256=sha(Path('scripts/m2/showcase_owner.py')), frames=rows,
    policy='Only occupied CANEWY20 overbright fixed-red window spill within six native pixels of retail owner regions. Original dim brick hue and coarse brightness with authored fine detail. Exact owner indices/shades, alpha, contacts, geometry, other states and all other families preserved.')
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
