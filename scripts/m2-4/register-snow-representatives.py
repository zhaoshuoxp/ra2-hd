"""Bind generated sample masters to complete native files without changing native geometry."""
import json
import shutil
from pathlib import Path

root = Path('.artifacts/m2-4/snow-representatives-v2')
tmp_root = Path('.artifacts/m2-4/snow-tmp-representatives-v2')
shp_root = Path('.artifacts/m2-4/snow-shp-representatives-v2')
layout = json.loads((root / 'layout.json').read_text())


def copy_master(target_root, name):
    target = target_root / name
    assert not target.exists(), target
    shutil.copyfile(root / name, target)


for name in ['snow-terrain-master-v1.png', 'snow-ramp-master-v1.png',
             'snow-road-master-v1.png', 'snow-cliff-master-v1.png']:
    copy_master(tmp_root, name)
tmp = json.loads((tmp_root / 'source.json').read_text())
overrides = {}
for source in tmp['members']:
    name = source['member']
    if name.startswith('clear01'):
        overrides[name] = dict(board='snow-terrain-master-v1.png', boardSize=[1536, 1536],
                               occupied=4, slotRect=layout['snow-terrain-reference']['slots'][0]['slotRect'])
    else:
        kind = {'slope05.sno': 'ramp', 'droads25.sno': 'road', 'cliff01.sno': 'cliff'}[name]
        overrides[name] = dict(board=f'snow-{kind}-master-v1.png', boardSize=[1254, 1254],
                               occupied=1, slotRect=[0, 0, 1254, 1254])
(tmp_root / 'slot-overrides.json').write_text(json.dumps(overrides, indent=2) + '\n')

for name in ['snow-tree-master-v1.png', 'snow-neutral-master-v1.png', 'snow-rubble-master-v1.png']:
    copy_master(shp_root, name)
overrides = {}
for info in layout['snow-trees-reference']['slots']:
    overrides[f'{info["member"]}-000'] = dict(board='snow-tree-master-v1.png', boardSize=[1536, 1536],
                                             occupied=4, slotRect=info['slotRect'])
for info in layout['snow-neutral-reference']['slots']:
    overrides[f'caeur1.shp-{info["slot"]:03d}'] = dict(board='snow-neutral-master-v1.png',
        boardSize=[1536, 1536], occupied=3, slotRect=info['slotRect'])
overrides['caeur1.shp-003'] = dict(board='snow-rubble-master-v1.png', boardSize=[1254, 1254],
                                 occupied=1, slotRect=[0, 0, 1254, 1254])
(shp_root / 'slot-overrides.json').write_text(json.dumps(overrides, indent=2) + '\n')
(root / 'registration-policy.json').write_text(json.dumps(dict(
    schema='m2-4-snow-representative-registration-v1',
    terrainFiles=[source['member'] for source in tmp['members']],
    clearVariantMaterial='One newly authored snow material shared by eight native clear variants; exact individual native metadata and masks retained',
    shpBodyStates=sorted(overrides),
    densities='2X and 4X independently sampled from generated masters, never enlarged from a lower-density export',
    state='REPRESENTATIVE_SUBSET_ONLY; NATIVE_SCALE_REVIEW_PENDING'), indent=2) + '\n')
