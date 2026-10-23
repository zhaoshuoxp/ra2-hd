"""Preserve delivered static states; correct buildup registration and moving layers."""
import json
import os
import sys
import shutil
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path
from production import Family, ROOT, D, cut

name = sys.argv[1]
f = Family(name, sys.argv[2] if len(sys.argv) > 2 else 'full-exports-r6')
selection = json.loads((ROOT / 'production-selection-v1.json').read_text())
previous = Path(os.environ['SOVIET_PREVIOUS_EXPORTS']) / name if os.environ.get('SOVIET_PREVIOUS_EXPORTS') else ROOT.parent.parent / selection[name]['exports']
old = json.loads((previous / 'candidate-review.json').read_text())
f.registrations['previous-candidate'] = {'path': str(previous), 'scope': 'All unchanged state pixels retained'}
for item in old['frames']:
    member, n = item['member'], item['nativeFrame']
    native = f.sources[member]['frames'][n]
    image = f.blank()
    image.alpha_composite(Image.open(previous / item['exports'][0]['base']).convert('RGBA'), (native['x'] * D, native['y'] * D))
    f.put(member, n, image, 'Byte-preserved delivered state')

normal = f.frames[f.build_member, f.build_count - 1].copy() if name in ['NALASR', 'NAFLAK'] else f.accepted()
if name == 'NAPSIS':
    # The representative sheet centered each antenna by its silhouette, which
    # moves as the arms rotate. Register the shaft itself to one fixed socket.
    member, seam = 'ngpsis_a.shp', 90 * D
    def shaft(image):
        row = np.asarray(image)[80 * D, :, 3] > 128
        changes = np.diff(np.r_[False, row, False].astype(int))
        runs = list(zip(np.where(changes == 1)[0], np.where(changes == -1)[0]))
        runs = [(a, b) for a, b in runs if b - a >= 5]
        a, b = min(runs, key=lambda r: abs((r[0] + r[1] - 1) / 2 - 132 * D))
        return (a + b - 1) / 2
    pivot = shaft(normal)
    poses = {}
    for item in f.rep['sequences'][0]['frames']:
        image = f.frames[member, item['sourceFrame']].copy() if D == 4 else f.load(ROOT / 'review-exports-v4' / name / item['hd'])
        dx = round(pivot - shaft(image))
        image.paste((0, 0, 0, 0), (0, seam, image.width, image.height))
        registered = normal.copy()
        registered.paste((0, 0, 0, 0), (0, 0, registered.width, seam))
        registered.alpha_composite(image, (dx, 0))
        poses[item['sourceFrame']] = registered
    for n in range(40):
        key = min(poses, key=lambda k: min(abs(k - n), 40 - abs(k - n)))
        f.put(member, n, poses[key], 'Eight authored rotation poses, fixed shaft socket and stationary base; native frame timing',
              authoredKey=key, socketX=pivot / D, seamY=seam / D, frameScale=[1, 1])
    # Retain the damaged native phases, anchored at the same bent-shaft socket.
    damaged = f.frames[member, 40].copy()
    damaged_pivot = shaft(damaged)
    for n in range(40, 80):
        upper = f.frames[member, n].copy()
        dx = round(damaged_pivot - shaft(upper))
        upper.paste((0, 0, 0, 0), (0, seam, upper.width, upper.height))
        image = damaged.copy()
        image.paste((0, 0, 0, 0), (0, 0, image.width, seam))
        image.alpha_composite(upper, (dx, 0))
        f.put(member, n, image, 'Native damaged scan phases locked to a fixed bent-shaft socket and base', socketX=damaged_pivot / D)
    for n in range(3):
        body = f.frames[f.body_member, n].copy()
        body.paste((0, 0, 0, 0), (0, 0, body.width, seam))
        f.put(f.body_member, n, body, 'Fixed base only; moving mast owned exclusively by active layer')

if name == 'TESLA':
    # Keep the accepted clean structural body. An effect layer must contain
    # only electrical material, never a second independently registered mast.
    rgba = np.asarray(normal).astype(float)
    electric = (rgba[..., 2] - rgba[..., 0] > 32) & (rgba[..., 2] - rgba[..., 1] > 22)
    electric[:26 * D] = False
    mask = Image.fromarray(np.uint8(electric) * 255).filter(ImageFilter.GaussianBlur(.35))
    donor = cut(normal, mask)
    for member in ['ngtsla_a.shp', 'ngtsla_b.shp']:
        raw = f.sources[member]
        palette = np.array(raw['palette'], float)
        energy = []
        for native in raw['frames'][:20]:
            rgb = palette[np.array(native['pixels'], np.uint8)]
            energy.append(float(np.maximum(0, rgb[:, 2] - rgb[:, 0]).sum()))
        for n in range(20):
            group = energy[(n // 10) * 10:(n // 10 + 1) * 10]
            gain = .45 + .55 * (energy[n] - min(group)) / max(1, max(group) - min(group))
            image = donor.copy()
            image.putalpha(Image.fromarray(np.uint8(np.array(donor.getchannel('A'), float) * gain)))
            f.put(member, n, image, 'Local authored electric arcs with native phase intensity; no structural pixels or moving registration', gain=gain)

# Two rigid authored components rise behind fixed ground/socket planes. Using
# the final registered geometry avoids stage masters changing wall proportions.
seams = {'NARADR': 66, 'NAPSIS': 90, 'TESLA': 55, 'NAIRON': 99,
         'NANRCT': 111, 'NATECH': 100, 'NADEPT': 95, 'NAYARD': 99,
         'NACLON': 85, 'NAMISL': 105, 'NALASR': 65, 'NAFLAK': 70}
seam = seams[name] * D
master = f.frames[f.body_member, 0] if name == 'TESLA' else normal
upper, lower = master.copy(), master.copy()
upper.paste((0, 0, 0, 0), (0, seam, upper.width, upper.height))
lower.paste((0, 0, 0, 0), (0, 0, lower.width, seam))
alpha = np.asarray(master.getchannel('A')) > 8
occupied = alpha.any(axis=0)
floors = np.where(occupied, alpha.shape[0] - 1 - alpha[::-1].argmax(axis=0), -1)
yy = np.arange(alpha.shape[0])[:, None]
ground = Image.fromarray(np.uint8((yy <= floors[None, :]) & occupied[None, :]) * 255)
foot = Image.fromarray(np.uint8((yy >= floors[None, :] - 5 * D) & occupied[None, :]) * 255)
foundation = cut(master, foot)
top = master.getchannel('A').getbbox()[1]
for n in range(f.build_count):
    native_top = f.native_bounds(f.build_member, n)[1] * D
    # NAPSIS first unfolds a pallet, then extends the mast. Its early swinging
    # panel's bounding box is not a measure of the finished building's height.
    if name == 'NAPSIS' and n < 15:
        native_top = round((113 - 23 * n / 14) * D)
    lower_dy = max(0, native_top - seam)
    upper_dy = max(0, native_top - top)
    base = f.blank(); base.alpha_composite(lower, (0, lower_dy))
    image = cut(base, ground)
    image.alpha_composite(foundation)
    mast = f.blank(); mast.alpha_composite(upper, (0, upper_dy))
    mast.paste((0, 0, 0, 0), (0, seam, mast.width, mast.height))
    image.alpha_composite(mast)
    if n < round(f.build_count * .3):
        image = cut(image, f.guide(f.build_member, n, 1))
    if n == f.build_count - 1:
        image = master.copy()
    f.put(f.build_member, n, image, 'Rigid lower structure rises behind ground; upper mechanism rises behind fixed socket; no frame rescaling',
          baseTranslation=[0, lower_dy / D], upperTranslation=[0, upper_dy / D], seamY=seam / D, frameScale=[1, 1])
f.export()
# Some delivered follow-up states have independently corrected owner masks.
# Re-exporting them from RGB would re-infer those masks. Preserve their exact
# existing PNGs and review metadata instead of touching unrelated states.
candidate = json.loads((f.out / 'candidate-review.json').read_text())
preserved = 0
for index, item in enumerate(candidate['frames']):
    member = item['member']
    changed = member == f.build_member or name == 'NAPSIS' or (name == 'TESLA' and member in ['ngtsla_a.shp', 'ngtsla_b.shp'])
    if changed:
        continue
    original = next(r for r in old['frames'] if r['member'] == member and r['nativeFrame'] == item['nativeFrame'])
    for export in original['exports']:
        for role in ['base', 'data']:
            shutil.copyfile(previous / export[role], f.out / export[role]); preserved += 1
    candidate['frames'][index] = original
candidate['preservedOriginalPngs'] = preserved
(f.out / 'candidate-review.json').write_text(json.dumps(candidate, indent=2) + '\n')
