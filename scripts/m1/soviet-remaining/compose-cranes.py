"""Complete native crane, repair, dock, damage and construction members."""
import sys
import os
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw
from production import Family, ROOT, D, area, cut

f = Family(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'full-exports-v1')
assert f.name in ['NADEPT', 'NAYARD']
ship = f.name == 'NAYARD'
normal = f.accepted()
damaged = f.register(f.crop_path('damaged'), f.ref_bounds('damaged'))
master = f.load(ROOT / 'art-v1' / f.name / 'normal-raw.png')
reg = f.rep['registration']; b = reg['crop']; sc = reg['scale']; tx, ty = reg['translation']
clean = f.load(ROOT / 'art-v1' / f.name / 'clean-raw.png').resize(master.size, Image.Resampling.LANCZOS)
base = f.blank()
base.alpha_composite(area(clean.crop(b), (round((b[2] - b[0]) * sc * D), round((b[3] - b[1]) * sc * D))), (round(tx * D), round(ty * D)))


def polygon(points):
    mask = Image.new('L', f.hdsize)
    ImageDraw.Draw(mask).polygon([((x - b[0]) * sc * D + tx * D, (y - b[1]) * sc * D + ty * D) for x, y in points], fill=255)
    return mask


def transform(image, matrix):
    inverse = np.linalg.inv(np.vstack([matrix, [0, 0, 1]]))
    return image.transform(image.size, Image.Transform.AFFINE, tuple(inverse[:2].ravel()), Image.Resampling.BICUBIC)


boom_points = ([(240, 10), (540, 10), (1158, 315), (1158, 386), (542, 229), (484, 275), (238, 340)] if ship else
               [(173, 79), (414, 79), (880, 299), (880, 351), (423, 275), (316, 291), (173, 279)])
hook_box = (1097, 548, 1198, 710) if ship else (819, 451, 887, 594)
rope_box = (1143, 390, 1156, 555) if ship else (850, 355, 860, 458)
boom = cut(normal, polygon(boom_points))
hook = cut(normal, polygon([(hook_box[0], hook_box[1]), (hook_box[2], hook_box[1]), (hook_box[2], hook_box[3]), (hook_box[0], hook_box[3])]))
pn = np.array((170, 47) if ship else (67, 54))
pivot_art = (477, 210) if ship else (373, 224)
pa = np.array([(pivot_art[0] - b[0]) * sc + tx, (pivot_art[1] - b[1]) * sc + ty])
hook_art = np.array([((hook_box[0] + hook_box[2]) / 2 - b[0]) * sc + tx, (hook_box[1] - b[1]) * sc + ty])
raw_tip = (1150, 374) if ship else (854, 347)
art_tip = np.array([(raw_tip[0] - b[0]) * sc + tx, (raw_tip[1] - b[1]) * sc + ty])
rope_texture = master.crop(rope_box)


def landmarks(member, n):
    raw = f.sources[member]['frames'][n]
    p = np.zeros(f.size[::-1], np.uint8)
    p[raw['y']:raw['y'] + raw['height'], raw['x']:raw['x'] + raw['width']] = np.array(raw['pixels'], np.uint8).reshape(raw['height'], raw['width'])
    labels, count = ndimage.label((p >= 16) & (p <= 31)); candidates = []
    for i in range(1, count + 1):
        yy, xx = np.where(labels == i); area = len(xx); x, y = float(xx.mean()), float(yy.mean())
        allowed = 60 <= area <= 103 and x > 215 and not (abs(x - 257.4) < 3 and abs(y - 92.2) < 3) if ship else 12 <= area <= 30 and x > 103
        if allowed:
            candidates.append((abs(area - (88 if ship else 22)), x, y))
    assert candidates, (f.name, member, n, 'native hook unresolved')
    _, x, y = min(candidates)
    column = round(x); ys = np.where(np.any(p[:, max(0, column - 1):column + 2] > 0, axis=1))[0]
    return np.array([x, float(ys[0]) + 2]), np.array([x, y])


primary = 'ngyard_d.shp' if ship else 'ngdept_c.shp'
tip0, hook0 = landmarks(primary, 0)
damage_base = base.copy()
# The upper crane is intact in the native damaged state. Replace only the fixed
# masonry/apron below it, so the damaged master cannot leave a second jib/hook.
damage_mask = f.guide(f.body_member, 1, 2)
damage_base = Image.composite(damaged, damage_base, damage_mask)


def crane(member, n, damaged_state):
    tip, hp = landmarks(member, n)
    sx = (tip[0] - pn[0]) / (tip0[0] - pn[0]); shear = (tip[1] - tip0[1]) / (tip0[0] - pn[0])
    matrix = np.array([[sx, 0, pa[0] * D * (1 - sx)], [shear, 1, -shear * pa[0] * D]])
    image = (damage_base if damaged_state else base).copy()
    image.alpha_composite(transform(boom, matrix))
    dx, dy = (hp - hook0) * D
    image.alpha_composite(transform(hook, np.array([[1, 0, dx], [0, 1, dy]])))
    tip_pos = matrix[:, :2] @ (art_tip * D) + matrix[:, 2]; bottom = (hook_art + hp - hook0) * D
    height = max(1, round(bottom[1] - tip_pos[1]))
    rope = area(rope_texture, (max(1, round(rope_texture.width * sc * D)), height))
    image.alpha_composite(rope, (round(bottom[0] - rope.width / 2), round(tip_pos[1])))
    return image, dict(hook=hp.tolist(), tip=tip.tolist(), jibMatrix=matrix.tolist())


for member_info in f.check['members']:
    member = member_info['member']
    if member == f.build_member:
        continue
    count = len(member_info['authorFrames']); half = max(1, count // 2)
    for n in member_info['authorFrames']:
        is_damage = n > 0 if member == f.body_member else n >= half
        details = {}
        if member in (['ngyard_a.shp', 'ngyard_d.shp', 'ngyard_s.shp'] if ship else ['ngdept_b.shp', 'ngdept_c.shp']):
            image, details = crane(member, n, is_damage)
            # Preserve the independent native layer plane and holes.
            image = cut(image, f.guide(member, n, 2))
            operation = 'Articulated authored jib, cable and hook driven by this exact native frame'
        elif member == f.body_member or 'bib' in member_info['roles']:
            image = cut(damaged if is_damage else normal, f.guide(member, n, 2))
            operation = 'Authored fixed structure or apron on its original independent plane'
        else:
            image = cut(damaged if is_damage else normal, f.guide(member, n, 2))
            operation = 'Authored dock light or water material selected by exact native phase coverage'
        f.put(member, n, image, operation, **details)

keys = {12: f.crop_path('middle'), 24: ROOT / 'art-v1' / f.name / 'normal-raw.png'} if ship else {
    5: f.crop_path('early'), 12: f.crop_path('middle'), 18: f.crop_path('late'), 24: ROOT / 'art-v1' / f.name / 'normal-raw.png'}
for n in range(f.build_count):
    key = min(keys, key=lambda k: abs(k - n))
    image = f.blank() if os.environ.get('SOVIET_RIGID_BUILD_PENDING') else f.register(keys[key], f.native_bounds(f.build_member, n))
    if n == f.build_count - 1:
        image = normal.copy()
    f.put(f.build_member, n, image, 'Authored staged construction on native envelope and timing', authoredKey=key)
f.export()
