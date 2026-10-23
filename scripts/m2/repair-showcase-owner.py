"""Repair complete occupiable map families from immutable accepted independent-density pages."""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_owner import register_owner_material, OWNER_SPILL_RADIUS, RED_FRACTION
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
assert sha(args.base / 'manifest.json') == 'bd6673dddfab66bfd08af62ae3b9d7baf6f5176a797d3256de87dbac65e02c81'
pack = json.loads((args.base / 'manifest.json').read_text())
ledger = json.loads(Path('docs/m2-2-map-coverage.json').read_text())
contract = json.loads(Path('desktop/environment-hd-contract.json').read_text())
prepared = Path('.artifacts/m2-2/prepared-native-v2')
native = {s['member']: s for s in json.loads((prepared / 'source.json').read_text())['sources']}
rows = [r for r in ledger['rows'] if r['kind'] == 'building' and r['edition'] == 'yr'
        and ('occupied' in r['states'] or r['id'] in ['CAHOSP', 'CATHOSP'])]
members = {r['source']['member'] for r in rows}
families = {f for f, c in contract['families'].items() if members.intersection(c['members'])}
assert len(families) == 29
args.destination.mkdir(parents=True, exist_ok=False)
result = {**pack, 'revision': args.destination.name,
          'families': {f: pack['families'][f] for f in sorted(families)}}
records, frame_records = {}, []
for family in result['families'].values():
    for member in family['members']:
        name = member['member']
        if name in records:
            continue
        source_file = args.base / member['path']
        assert sha(source_file) == member['sha256']
        target = args.destination / member['path']
        shutil.copytree(source_file.parent, target.parent)
        hd = json.loads(target.read_text())
        hd['packRevision'] = args.destination.name
        for variant in hd['variants']:
            density = variant['density']
            pages = {p['id']: np.array(Image.open(target.parent / str(density) / p['id'] / 'base.png'))
                     for p in variant['pages']}
            visited, changed_pages = set(), set()
            for entry in variant['frames']:
                key = (entry['page'], tuple(entry['sampleRect']))
                if key in visited:
                    continue
                visited.add(key)
                slot = entry['nativeFrame']
                frame = native[name]['frames'][slot]
                palette = contract['sources'][name].get('framePalettes', {}).get(str(slot), contract['sources'][name])
                if not palette['remapable'] or frame['empty']:
                    continue
                w, h = frame['size']
                file = prepared / 'native' / f'{name}-{slot}.index'
                assert sha(file) == frame['indexSha256']
                indices = np.frombuffer(file.read_bytes(), np.uint8).reshape(h, w)
                original_file = prepared / 'native' / frame['file']
                assert sha(original_file) == frame['rgbaSha256']
                original = np.asarray(Image.frombytes('RGBA', (w, h), original_file.read_bytes()))
                x, y, rw, rh = entry['sampleRect']
                base = pages[entry['page']]
                rgb = base[y:y + h * density, x:x + w * density, :3]
                repaired, mask = register_owner_material(rgb, original, indices, density)
                if mask.any():
                    rgb[:] = repaired
                    # Re-extrude transparent gutter RGB only, with unchanged alpha/data.
                    patch = base[y:y + rh, x:x + rw].copy()
                    padded = np.pad(patch, ((2, 2), (2, 2), (0, 0)), mode='edge')
                    padded[..., 3] = 0
                    padded[2:rh + 2, 2:rw + 2] = patch
                    base[y - 2:y + rh + 2, x - 2:x + rw + 2] = padded
                    changed_pages.add(entry['page'])
                frame_records.append(dict(member=name, slot=slot, density=density,
                    correctedPixels=int(mask.sum()), nativeOwnerPixels=int(((indices >= 16) & (indices <= 31)).sum())))
            for page in variant['pages']:
                if page['id'] not in changed_pages:
                    continue
                file = target.parent / str(density) / page['id'] / 'base.png'
                Image.fromarray(pages[page['id']]).save(file)
                page.update(baseSha256=sha(file), baseBytes=file.stat().st_size)
        target.write_text(json.dumps(hd, separators=(',', ':')) + '\n')
        records[name] = dict(member, sha256=sha(target))
for family in result['families'].values():
    family['members'] = [records[m['member']] for m in family['members']]
(args.destination / 'manifest.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
receipt = dict(schema='m2-2-native-owner-material-repair-v1', base=str(args.base),
    baseSha256=sha(args.base / 'manifest.json'), patch=str(args.destination),
    patchSha256=sha(args.destination / 'manifest.json'), families=sorted(families),
    parameters=dict(nativeRadius=OWNER_SPILL_RADIUS, redFraction=RED_FRACTION),
    algorithmSha256=sha(Path('scripts/m2/showcase_owner.py')), frames=frame_records,
    policy='Authored red spill in native non-red cells near owner regions only. Exact native alpha, indices 16-31, all 16 shades, frame geometry/timing and legitimate fixed-red material retained. Independent accepted 2X/4X bases reused directly.')
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(families=len(families), members=len(records),
    changedFrames=sum(r['correctedPixels'] > 0 for r in frame_records),
    correctedPixels=sum(r['correctedPixels'] for r in frame_records), patchSha256=receipt['patchSha256'])))
