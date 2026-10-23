"""Fixed pedestal and telescoping emitter with continuous open-state electricity."""
import sys
import json
import shutil
import numpy as np
from PIL import Image
from production_common import ROOT, Family, row_for, resting, cells, indices, decode, clip
from mechanical_common import ground_plane, project_registered_master
from construction_motion import telescope
from native_effects import electrical

output = sys.argv[1]
reuse = next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith('--reuse-exports=')), None)


def fixed_electricity_data(folder):
    receipt_file = folder / 'candidate-review.json'
    receipt = json.loads(receipt_file.read_text())
    for record in receipt['frames']:
        if not record['member'].endswith(('_f.shp', '_h.shp')):
            continue
        rgba = np.array(Image.open(folder / record['base']))
        data = np.array(Image.open(folder / record['data']))
        red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
        fixed = (rgba[..., 3] >= 8) & (red > green * 1.4) & (blue > green * 1.4) & (blue > 100)
        # Faint overlap still contains legitimate underlying red owner paint.
        fixed &= red <= 2.5 * np.maximum(green, blue)
        fixed |= (rgba[..., :3].min(axis=2) >= 220) & (rgba[..., 3] >= 8)
        data[..., :2][fixed] = 0
        Image.fromarray(data).save(folder / record['data'])
        record['ownerPixels'] = int((data[..., 0] >= 128).sum())
    receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')


if reuse:
    for theater in ('TEMPERATE', 'SNOW'):
        for density in (2, 4):
            name = f'YAGNTC-{theater}-{density}x'
            target = ROOT / output / name
            shutil.copytree(ROOT / reuse / name, target)
            fixed_electricity_data(target)
            print(name, 'Retained same-density base exports; corrected electricity data only', flush=True)
    sys.exit(0)

dry = row_for('YAGNTC')
part_sources = [ROOT / 'production-art-v1/YAGNTC/telescoping-part-raw.png',
                ROOT / 'production-art-v1/YAGNTC/damaged-telescoping-part-raw.png']
floor_source = ROOT / 'production-art-v1/YAGNTC/bare-foundation-raw.png'
assembly = ROOT / 'production-art-v1/YAGNTC/assembly-keys-raw.png'
low_keys = cells(assembly, 2)
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        f = Family('YAGNTC', theater, density, output)
        body, rest, charge, close, build = f.row['members']
        masters = [f.register(Image.open(p), resting(dry, bool(i)).getbbox(), p) for i, p in enumerate([
            ROOT / 'art-v1/YAGNTC-TEMPERATE/normal-raw.png', ROOT / 'production-art-v1/YAGNTC/damaged-raw.png'])]
        bases = [f.rectangle(master, (0, 94, 270, 244)) for master in masters]
        floor = f.register(Image.open(floor_source), (58, 125, 212, 203), floor_source)
        low = f.register(low_keys[1][0], (58, 94, 212, 203), assembly, source_region=low_keys[1][1])
        ground = ground_plane(floor)
        crowns, stems, registrations = [], [], []
        for damage, source in enumerate(part_sources):
            raw = Image.open(source)
            # Separate the physical telescoping joint, preserving the entire
            # upper crown and an adequate original shaft segment.
            region = (0, 0, raw.width, 1000)
            bounds = (117, 49, 151, 107) if not damage else (111, 67, 144, 111)
            crowns.append(f.register(raw.crop(region), bounds, source, source_region=region))
            registrations.append(f.registrations[-1])
            shaft_region = (365, 1000, 525, 1390)
            stems.append(f.register(raw.crop(shaft_region), (128, 105, 138, 132), source, source_region=shaft_region))

        def open_electricity(member, n, damage, rise):
            native = electrical(f, member, n)
            if member not in (charge, close) or np.array(native.getchannel('A')).any():
                return native
            phase = n % 31
            if (member is charge and phase == 0) or (member is close and phase == 30) or rise <= 0:
                return native
            # The original ready loop supplies the purple arc and its white
            # core. Carry it through the raised opening/release frames, fitted
            # between the fixed pedestal socket and the native emitter height.
            source_frame = (46 if damage else 15) + phase % 16
            arc = electrical(f, charge, source_frame)
            start = 67 if damage else 49
            full_rise = 35
            stretch = (132 - start + rise) / (132 - start + full_rise)
            anchor = 132 * density
            arc = arc.convert('RGBa').transform(f.size, Image.Transform.AFFINE,
                (1, 0, 0, 0, 1 / stretch, anchor * (1 - 1 / stretch)),
                Image.Resampling.BICUBIC).convert('RGBA')
            arc.putalpha(arc.getchannel('A').point(lambda a: round(a * min(1, rise / full_rise))))
            return arc

        def emitter(member, n, damage, whole=True):
            pixels = np.array(decode(f.row, member, n))
            r, g, b = np.moveaxis(pixels[..., :3].astype(float), 2, 0)
            yy, xx = np.indices(r.shape)
            # Native neutral metal above the pedestal determines telescoping
            # height. Purple/white electrical coverage is a separate control.
            metal = (pixels[..., 3] > 0) & (yy < 95) & (xx > 102) & (xx < 157)
            metal &= ~((r > g * 1.4) & (b > g * 1.4)) & ~((r > 220) & (g > 220) & (b > 220))
            start = 67 if damage else 49
            top = np.where(metal)[0].min() if metal.any() else start
            rise = max(0, float(start - top))
            image = bases[int(damage)].copy() if whole else f.blank()
            if whole and rise:
                source = part_sources[int(damage)]
                reg = shaft_registrations[int(damage)]
                image.alpha_composite(project_registered_master(f, source, reg,
                    [(128,105),(138,105),(138,132),(128,132)],
                    [(128,105-rise),(138,105-rise),(138,132),(128,132)]))
            image.alpha_composite(f.translate(crowns[int(damage)], dy=-rise))
            image.alpha_composite(open_electricity(member, n, damage, rise))
            return image

        shaft_registrations = [r for r in f.registrations if r.get('sourceRegion') == [365, 1000, 525, 1390]]
        for n in range(body['visibleFrames']):
            f.put(body, n, f.snow(body, n, bases[int(n != 0)]),
                'Fixed complete photographed pedestal; separate native emitter ownership; small red indicator buttons remain fixed emissive material')
        for member in (rest, charge, close):
            for n in range(member['visibleFrames']):
                damage = n == 1 if member is rest else n >= 31
                image = emitter(member, n, damage, member is not rest)
                f.put(member, n, f.snow(member, n, image),
                    'Complete emitter and fixed socket; original charged purple/white contours continue through raised opening/release frames and fade with retraction; native slots, controller timing and closed state retained')
        for n in range(build['visibleFrames']):
            image = floor.copy()
            if n >= 2: image.alpha_composite(clip(telescope(f,low,build,n,(120,90,146,203),12),ground))
            if n >= 11:
                image.alpha_composite(telescope(f,stems[0],build,n,(127,80,139,150),5))
                image.alpha_composite(clip(telescope(f,crowns[0],build,n,(122,0,145,150),58),ground))
            if n == build['visibleFrames'] - 1:
                image = bases[0].copy(); image.alpha_composite(crowns[0])
            f.put(build, n, f.snow(build, n, image),
                'Fixed foundation and pedestal panels; native local cap travel extends the tower and emitter through their separate collars; original electrical states retained')
        f.export()
        # Newly carried arcs can cross an existing owner-paint envelope. Keep
        # their purple/white cores fixed rather than letting the paint flood
        # inherit the building's faction color across the connected emission.
        fixed_electricity_data(f.out)
