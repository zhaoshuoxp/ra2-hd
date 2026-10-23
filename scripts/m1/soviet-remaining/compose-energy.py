"""Author native energy-building states from accepted masters and state donors."""
import sys
import os
import numpy as np
from PIL import Image, ImageFilter
from production import Family, ROOT, D, cut, bounds

f = Family(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'full-exports-v1')
assert f.name in ['NANRCT', 'NACLON', 'TESLA', 'NAIRON']
normal = f.accepted()
damaged = f.register(f.crop_path('damaged'), f.ref_bounds('damaged'))
if f.name == 'TESLA':
    # The no-power body must not retain the active electrical arcs.
    normal = f.register(f.crop_path('clean'), f.native_bounds(f.body_member, 0))


def pixels(member, n):
    raw = f.sources[member]; frame = raw['frames'][n]
    indices = np.zeros(f.size[::-1], np.uint8)
    indices[frame['y']:frame['y'] + frame['height'], frame['x']:frame['x'] + frame['width']] = np.array(
        frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
    return indices, np.array(raw['palette'], float)[indices]


def activity(master, member, n, first, count):
    colors = [pixels(member, k)[1] for k in range(first, first + count)]
    changing = np.max(np.max(colors, axis=0) - np.min(colors, axis=0), axis=2) > 25
    levels = [float(c[changing].mean()) if changing.any() else 0 for c in colors]
    low, high = min(levels), max(levels)
    gain = .72 + .28 * (levels[n - first] - low) / (high - low) if high > low else 1
    a = np.array(master); r, g, b = [a[..., i].astype(float) for i in range(3)]
    hot = (g > r * 1.04) & (g > b * 1.12) if f.name == 'NANRCT' else (r > b * 1.35) & (g > b * 1.2) & (g > 65)
    if f.name == 'NACLON':
        yy, xx = np.mgrid[:a.shape[0], :a.shape[1]]
        hot &= (xx > 95 * D) & (xx < 138 * D) & (yy > 40 * D) & (yy < 105 * D)
    a[..., :3] = np.rint(a[..., :3] * np.where(hot[..., None], gain, 1)).astype(np.uint8)
    return Image.fromarray(a), gain


for n in range(3):
    f.put(f.body_member, n, normal if n == 0 else damaged, 'Fixed authored powered-off structure')

if f.name in ['NANRCT', 'NACLON']:
    member = 'ngnrct_a.shp' if f.name == 'NANRCT' else 'ngclon_a.shp'
    accepted = f.rep['sequences'][0]['frames']
    for n in range(22):
        image, gain = activity(damaged if n >= 11 else normal, member, n, 11 if n >= 11 else 0, 11)
        if D == 2 and n < len(accepted):
            image = f.load(ROOT / 'review-exports-v4' / f.name / accepted[n]['hd'])
            f.registrations[str(ROOT / 'review-exports-v4' / f.name / accepted[n]['hd'])]['acceptedExport'] = True
        f.put(member, n, image, 'Fixed architecture with native-phase local emissive activity', gain=gain)

elif f.name == 'NAIRON':
    donors = [f.register(f.crop_path(label), f.ref_bounds(state)) for label, state in
              [('ready', 'normal'), ('damaged-ready', 'damaged')]]
    for member, half in [('ngiron_a.shp', 11), ('ngiron_f.shp', 21), ('ngiron_h.shp', 12)]:
        for n in range(half * 2):
            state = int(n >= half); phase = n % half
            master = damaged if state else normal
            image, gain = activity(master, member, n, half * state, half)
            if member != 'ngiron_a.shp':
                # Native upper-sphere red intensity controls the authored ready
                # donor; the donor never replaces the fixed base or frame alpha.
                ind, rgb = pixels(member, n)
                yy, xx = np.mgrid[:f.size[1], :f.size[0]]
                sphere = ((xx - 82) / 16) ** 2 + ((yy - 74) / 12) ** 2 < 1
                resting = pixels('ngiron_a.shp', state * 11)[1]
                ready = pixels('ngiron_f.shp', state * 21 + 10)[1]
                low = resting[..., 0][sphere].mean()
                high = ready[..., 0][sphere].mean()
                strength = float(np.clip((rgb[..., 0][sphere].mean() - low) / max(1, high - low), 0, 1))
                region = Image.fromarray(np.uint8(((xx - 82) / 21) ** 2 + ((yy - 77) / 18) ** 2 < 1) * 255)
                region = region.resize(f.hdsize, Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(2))
                region = Image.fromarray(np.uint8(np.array(region, float) * strength))
                emission = Image.composite(donors[state], image, region)
                emission.putalpha(image.getchannel('A'))
                image = emission
            f.put(member, n, image, 'Native standby, charging, ready or firing phase; local authored sphere emission', gain=gain)

else:
    donor = f.accepted()
    for member in ['ngtsla_a.shp', 'ngtsla_b.shp']:
        for n in range(20):
            ind, rgb = pixels(member, n)
            # Native coverage and phase select the authored electric material.
            # Native RGB is never copied into exported artwork.
            electric = (ind > 0) & (rgb[..., 2] > rgb[..., 0] * 1.05) & (rgb[..., 2] > rgb[..., 1] * 1.02)
            mask = Image.fromarray(np.uint8(electric) * 255).resize(f.hdsize, Image.Resampling.NEAREST)
            mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.5))
            image = cut(donor, mask)
            f.put(member, n, image, 'Native powered/supercharged electrical coverage sampling authored electric material')

# State masters follow each native construction envelope. Each phase is explicit;
# sell/unbuild uses the native reverse sequence without adding gameplay timing.
labels = ['early', 'middle', 'late'] if f.crop_path('late').exists() else ['early', 'middle']
keys = {round(f.build_count * p): f.crop_path(label) for p, label in zip([.2, .5, .75], labels)}
if f.name == 'NACLON':
    keys = {0: f.crop_path('early'), 8: f.crop_path('middle'), 18: f.crop_path('late')}
keys[f.build_count - 1] = f.check['acceptedMaster']
for n in range(f.build_count):
    key = min(keys, key=lambda k: abs(k - n))
    image = f.blank() if os.environ.get('SOVIET_RIGID_BUILD_PENDING') else f.register(keys[key], f.native_bounds(f.build_member, n))
    if n == f.build_count - 1:
        image = normal.copy()
    f.put(f.build_member, n, image, 'Authored construction stage registered to native phase envelope', authoredKey=key)
f.export()
