"""Complete radar and sensor scans, damaged scans and native construction slots."""
import sys
import os
import numpy as np
from PIL import Image
from production import Family, ROOT, D
from authored_motion import authored_scans

f = Family(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'full-exports-v1')
assert f.name in ['NARADR', 'NAPSIS']
normal = f.accepted()
damaged = f.register(f.crop_path('damaged'), f.ref_bounds('damaged'))
member, half, boundary = ('ngradr_a.shp', 46, 66) if f.name == 'NARADR' else ('ngpsis_a.shp', 40, 79)
sequence = f.rep['sequences'][0]['frames']
accepted = authored_scans(f, normal) if D == 4 else {p['sourceFrame']: f.load(ROOT / 'review-exports-v4' / f.name / p['hd']) for p in sequence}
if D == 2:
    for p in sequence:
        f.registrations[str(ROOT / 'review-exports-v4' / f.name / p['hd'])]['acceptedExport'] = True


def extent(n):
    a = np.array(f.source_image(member, n))
    yy, xx = np.where(a[:boundary] > 0)
    return float(xx.mean()), int(xx.max() - xx.min() + 1)


def scan(master, n, reference):
    cx, width = extent(n); first, initial_width = extent(reference)
    upper, lower = master.copy(), master.copy()
    upper.paste((0, 0, 0, 0), (0, boundary * D, upper.width, upper.height))
    lower.paste((0, 0, 0, 0), (0, 0, lower.width, boundary * D))
    scale = width / initial_width
    matrix = np.array([[scale, 0, (cx - first * scale) * D], [0, 1, 0], [0, 0, 1]])
    inverse = np.linalg.inv(matrix)
    lower.alpha_composite(upper.transform(upper.size, Image.Transform.AFFINE, tuple(inverse[:2].ravel()), Image.Resampling.BICUBIC))
    return lower


for n in range(3):
    f.put(f.body_member, n, normal if n == 0 else damaged, 'Fixed authored hut and native base plane')
for n in range(half * 2):
    if n < half:
        if n in accepted:
            image = accepted[n].copy()
        else:
            key = min(accepted, key=lambda k: min(abs(k - n), half - abs(k - n)))
            image = scan(accepted[key], n, key)
    else:
        image = scan(damaged, n, half)
    f.put(member, n, image, 'Accepted scan poses with native upper-part extent; fixed base and separate damaged master', phase=n % half)

keys = {round(f.build_count * p): f.crop_path(label) for p, label in zip([.2, .5, .75], ['early', 'middle', 'late'])}
keys[f.build_count - 1] = f.check['acceptedMaster']
for n in range(f.build_count):
    key = min(keys, key=lambda k: abs(k - n))
    image = f.blank() if os.environ.get('SOVIET_RIGID_BUILD_PENDING') else f.register(keys[key], f.native_bounds(f.build_member, n))
    if n == f.build_count - 1:
        image = normal.copy()
    f.put(f.build_member, n, image, 'Authored construction stage registered to native phase envelope', authoredKey=key)
f.export()
