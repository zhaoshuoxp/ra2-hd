"""Complete closed, opening, ready, closing and damaged nuclear silo states."""
import sys
import os
import numpy as np
from scipy import ndimage
from PIL import Image
from production import Family, ROOT, D, cut

f = Family('NAMISL', sys.argv[1] if len(sys.argv) > 1 else 'full-exports-v1')
normal = f.accepted()
damaged = f.register(f.crop_path('damaged'), f.ref_bounds('damaged'))
for n in range(3):
    f.put(f.body_member, n, f.blank(), 'Native empty body retained; superweapon member owns the complete visible silo')

normal_path = ROOT / 'art-v1/NAMISL/motion-raw.png'
damage_path = ROOT / 'full-art-v1/NAMISL/damaged-opening-raw.png'
normal_sheet = f.load(normal_path); damage_sheet = f.load(damage_path)


def sprite_boxes(image, rows, columns):
    alpha = np.array(image.getchannel('A')) > 32
    labels, count = ndimage.label(alpha.any(axis=1))
    bands = [s[0] for s in ndimage.find_objects(labels) if s[0].stop - s[0].start > 20]
    assert len(bands) == rows
    boxes = []
    for band in bands:
        labels, count = ndimage.label(alpha[band].any(axis=0))
        spans = [s[0] for s in ndimage.find_objects(labels) if s[0].stop - s[0].start > 20]
        assert len(spans) == columns
        boxes.extend([(s.start, band.start, s.stop, band.stop) for s in spans])
    return boxes


# Normal sheet's row sprites touch along the feet; its accepted cell boundaries
# are retained. The new damaged sheet uses connected components per row instead.
normal_boxes = [(round(x * normal_sheet.width / 4), round(y * normal_sheet.height / 2),
                 round((x + 1) * normal_sheet.width / 4), round((y + 1) * normal_sheet.height / 2)) for y in range(2) for x in range(4)]
damage_boxes = [(0, 0, damage_sheet.width // 2, 650), (damage_sheet.width // 2, 0, damage_sheet.width, 650),
                (0, 650, damage_sheet.width // 2, damage_sheet.height), (damage_sheet.width // 2, 650, damage_sheet.width, damage_sheet.height)]
keys = [0, 2, 4, 6, 9, 11, 13, 15]
damage_keys = [0, 4, 9, 15]
opened = f.register(ROOT / 'art-v1/NAMISL/open-raw.png', f.native_bounds('ngmisl_g.shp', 0))
damaged_open = f.register(f.crop_path('damaged-open'), f.native_bounds('ngmisl_g.shp', 1))
for member in ['ngmisl_e.shp', 'ngmisl_g.shp']:
    for n in range(2):
        image = (damaged if n else normal) if member.endswith('_e.shp') else (damaged_open if n else opened)
        f.put(member, n, image, 'Authored closed or fully open stationary superweapon state')
for member in ['ngmisl_f.shp', 'ngmisl_h.shp']:
    for n in range(32):
        damage = n >= 16; phase = n % 16
        if member.endswith('_h.shp'):
            phase = 15 - phase
        chosen_keys, boxes, source = (damage_keys, damage_boxes, damage_path) if damage else (keys, normal_boxes, normal_path)
        key = min(chosen_keys, key=lambda k: abs(k - phase))
        image = f.register(source, f.native_bounds(member, n), boxes[chosen_keys.index(key)])
        f.put(member, n, image, 'Authored mechanical opening key poses in native forward/reverse order', authoredKey=key, damaged=damage)
build_keys = {5: f.crop_path('early'), 13: f.crop_path('middle'), 25: f.check['acceptedMaster']}
for n in range(f.build_count):
    key = min(build_keys, key=lambda k: abs(k - n))
    image = f.blank() if os.environ.get('SOVIET_RIGID_BUILD_PENDING') else f.register(build_keys[key], f.native_bounds(f.build_member, max(n, min(build_keys))))
    if n < min(build_keys):
        image = cut(image, f.guide(f.build_member, n, 1))
    if n == f.build_count - 1:
        image = normal.copy()
    f.put(f.build_member, n, image, 'Authored silo construction stage with native foundation coverage', authoredKey=key)
f.export()
