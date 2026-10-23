"""Accepted sensor operating states and new complete hinged YR construction parts."""
import json
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, Family, raw_for, cells, indices, decode, clip
from mechanical_common import ground_plane, articulate_raw_part
from construction_motion import telescope

output = sys.argv[1]
source = ROOT / 'production-art-v1/NAPSIS/construction-parts-raw.png'
room_key, floor_key, panel_key = cells(source, 3)
poses = [(1, 106, 134, 54, 79), (4, 100, 132, 95, 82), (7, 115, 130, 139, 92),
         (10, 138, 134, 165, 118), (13, 149, 143, 163, 155)]
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('NAPSIS', theater, density, output)
        old_dir = ROOT / 'reuse-exports-v2' / f'NAPSIS-{theater}-{density}x'
        old = json.loads((old_dir / 'candidate-review.json').read_text())
        f.registrations.extend(old['registrations'][:2])
        build = next(m for m in f.row['members'] if 'BUILDUP' in m['roles'])
        for record in old['frames']:
            member = next(m for m in f.row['members'] if m['source']['member'] == record['member'])
            if member is build:
                continue
            image, data = f.blank(), Image.new('RGBA', f.size, (0, 0, 0, 255))
            if record['base']:
                offset = tuple(record['native'][k] * density for k in ('x', 'y'))
                image.paste(Image.open(old_dir / record['base']), offset)
                data.paste(Image.open(old_dir / record['data']), offset)
            f.put(member, record['nativeFrame'], image, record['operation'], data)
        active = next(m for m in f.row['members'] if 'ACTIVE' in m['roles'])
        steady = f.frames[active['source']['member'], 0]
        steady_data = f.data_overrides[active['source']['member'], 0]
        floor = f.register(floor_key[0], (92, 114, 169, 154), source, source_region=floor_key[1])
        room = f.register(room_key[0], (89, 90, 170, 154), source, source_region=room_key[1])
        ground = ground_plane(floor)
        mast = f.rectangle(steady, (89, 5, 170, 95))
        panel, region = panel_key
        root = (region[0] + panel.width * .5, region[1] + panel.height - 8)
        top = (region[0] + panel.width * .5, region[1] + 8)
        for n in range(build['visibleFrames']):
            image = floor.copy()
            if n <= 13 and n:
                values = [np.interp(n, [p[0] for p in poses], [p[c] for p in poses]) for c in range(1, 5)]
                image.alpha_composite(articulate_raw_part(f, source, panel, region, [root, top],
                    [values[:2], values[2:]], panel.width, 22))
            if n >= 4:
                image.alpha_composite(clip(telescope(f,room,build,n,(120,90,143,154),12),ground))
            if n >= 15:
                image.alpha_composite(clip(telescope(f,mast,build,n,(115,0,144,154),10),ground))
            data = None
            if n == build['visibleFrames'] - 1:
                image, data = steady.copy(), steady_data.copy()
            f.put(build, n, f.snow(build, n, image),
                ('Accepted same-density final native construction state; ' if data is not None else '') + 'Complete authored foundation, native-joint folding panel and complete lower sensor assembly; accepted mast rises locally through fixed socket; final accepted same-density state and mask retained; native reverse selling', data)
        f.export()
