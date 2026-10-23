"""Complete wall states and structural/build members for the static families."""
import sys
import os
from PIL import Image
from production import Family, ROOT, D
from authored_motion import authored_wall

name = sys.argv[1]
f = Family(name, sys.argv[2] if len(sys.argv) > 2 else 'full-exports-v1')
if name == 'NAWALL':
    for n in range(48):
        if n < 16:
            image = authored_wall(f, n) if D == 4 else f.load(ROOT / 'review-exports-v4/NAWALL' / f'connections-{n:03}-hd.png')
            if D == 2:
                f.registrations[str(ROOT / 'review-exports-v4/NAWALL' / f'connections-{n:03}-hd.png')]['acceptedExport'] = True
        else:
            label = 'damaged' if n < 32 else 'ruins'
            image = f.register(f.crop_path(f'{label}-{n % 16:02}'), f.native_bounds(f.body_member, n))
        f.put(f.body_member, n, image, 'Accepted connection or authored native damage/ruin counterpart', connection=n % 16)
else:
    assert name in ['NATECH', 'NALASR', 'NAFLAK']
    normal = f.accepted() if name == 'NATECH' else f.register(f.crop_path('normal-base'), f.native_bounds(f.body_member, 0))
    damaged = f.register(f.crop_path('damaged'), f.native_bounds(f.body_member, 1))
    for n in range(3):
        f.put(f.body_member, n, normal if n == 0 else damaged, 'Accepted fixed structure or authored damaged base')
    if name == 'NATECH':
        keys = {4: f.crop_path('build-4'), 8: f.crop_path('build-8'), 13: f.crop_path('build-13'), 18: f.crop_path('build-18')}
        normal_master = ROOT / 'art-v1/NATECH/normal-raw.png'
        keys[24] = normal_master
    elif name == 'NALASR':
        keys = {0: f.crop_path('early'), 8: f.crop_path('late'), 11: ROOT / 'art-v1/NALASR/normal-raw.png'}
    else:
        keys = {0: f.crop_path('early'), 4: f.crop_path('middle'), 8: ROOT / 'art-v1/NAFLAK/normal-raw.png'}
    for n in range(f.build_count):
        key = min(keys, key=lambda k: abs(k - n))
        image = f.blank() if os.environ.get('SOVIET_RIGID_BUILD_PENDING') else f.register(keys[key], f.native_bounds(f.build_member, n))
        if name == 'NATECH' and n == f.build_count - 1:
            image = normal.copy()
        f.put(f.build_member, n, image, 'Authored mechanical key pose registered to native frame envelope', authoredKey=key)
f.export()
