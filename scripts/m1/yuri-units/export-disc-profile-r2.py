"""Export the generated lower cabin independently at both retained atlas densities."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

parser = argparse.ArgumentParser()
parser.add_argument('master', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--resources', type=Path, default=Path('.local'))
parser.add_argument('--revision', default='r4-lighting-packed')
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
master = Image.open(args.master).convert('RGBA').convert('RGBa')
assert master.width >= 1500 and master.getchannel('a').getextrema()[0] == 0
args.output.mkdir(parents=True, exist_ok=False)
receipt = {'master': str(args.master.resolve()), 'masterSha256': sha(args.master), 'variants': []}

for density in [2, 4]:
    previous = args.resources / f'hd-packs/yuri-disk-vxl/r1-{density}x'
    destination = args.output / f'{args.revision}-{density}x'
    destination.mkdir()
    manifest = json.loads((previous / 'manifest.json').read_text())
    manifest.update(revision=f'{args.revision}-{density}x', acceptance='SOURCE_DERIVED_CANDIDATE_VISUAL_REVIEW_PENDING')
    for part in manifest['parts']:
        for file in part['files'].values():
            shutil.copyfile(previous / file['file'], destination / file['file'])
        if part['member'] != 'disktur.vxl':
            continue
        base = Image.open(previous / part['files']['base']['file']).convert('RGBA')
        data = Image.open(previous / part['files']['data']['file']).convert('RGBA')
        for frame in part['frames']:
            x, y, width, height = frame['rect']
            original = np.array(base.crop((x, y, x + width, y + height)))
            old_data = np.array(data.crop((x, y, x + width, y + height)))
            # Register the high-resolution redraw to the retained deck and front
            # annulus. Each density samples the master directly, in premultiplied alpha.
            box = (75.5, 140 - 9 * 377 / 80, 1604.5, 140 + (166 - 9) * 377 / 80)
            authored = np.array(master.resize((width, height), Image.Resampling.LANCZOS, box=box).convert('RGBA'))
            yy, xx = np.indices((height, width)); px = (xx + .5) / width; py = (yy + .5) / height
            old_width = np.interp(py, [0, .04, .10, .30, .42, .53, .56], [.055, .105, .16, .235, .235, .18, 0])
            new_width = np.interp(py, [0, .045, .07, .14, .23, .33, .41, .47, .51, .54, .56],
                                  [0, 0, .075, .13, .18, .205, .23, .22, .175, .08, 0])
            support = np.maximum(old_width, new_width)
            weight = np.clip((support + .012 - abs(px - .5)) * width / 3, 0, 1)
            weight *= np.clip((.565 - py) * height / 2, 0, 1)
            # The generated rear plate sits above the native back rim. Only the
            # new cabin may occupy that strip; retain the native annular footprint.
            cabin_coverage = np.clip((new_width - abs(px - .5)) * width, 0, 1)
            plate = np.sqrt(((px - .5) / .48) ** 2 + ((py - .52) / .43) ** 2)
            plate_coverage = np.clip((1 - plate) * height, 0, 1)
            authored[..., 3] = np.rint(authored[..., 3] * np.maximum(cabin_coverage, plate_coverage)).astype('uint8')
            a = original[..., 3:4].astype(float) / 255; b = authored[..., 3:4].astype(float) / 255
            mix = weight[..., None]; alpha = a * (1 - mix) + b * mix
            rgb = (original[..., :3] * a * (1 - mix) + authored[..., :3] * b * mix) / np.maximum(alpha, 1e-8)
            rgba = np.uint8(np.clip(np.concatenate([rgb, alpha * 255], axis=2).round(), 0, 255))
            assert np.array_equal(rgba[weight == 0], original[weight == 0])
            rgba[py < .045] = 0
            # The lower body, outer rim and its alpha remain retained resources.
            red, green, blue = np.moveaxis(rgba[..., :3].astype(float), 2, 0)
            paint = (red > 1.55 * green) & (red > 1.4 * blue) & (red > 50) & (rgba[..., 3] > 0)
            remap = old_data.copy(); changed = weight > 0
            remap[changed] = [0, 0, 0, 255]
            remap[..., 0][changed & paint] = 255
            ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
            shade = abs(red[..., None] - ramp).argmin(axis=2)
            remap[..., 1][changed & paint] = shade[changed & paint]
            # Store low-frequency illumination in the unused high shade nibble.
            # RG tile storage stays unchanged; visible metal detail is unfiltered.
            luminance = rgba[..., :3] @ np.array([.2126, .7152, .0722])
            alpha_weight = rgba[..., 3] / 255
            cone = (abs(px - .5) < new_width + .005) & (py < .555)
            discriminant = (py - .0225) ** 2 - (1.45 ** 2 - .9 ** 2) * (px - .5) ** 2
            radius = (1.45 * (py - .0225) - .9 * np.sqrt(np.maximum(0, discriminant))) / (1.45 ** 2 - .9 ** 2)
            plate_radius = np.sqrt(((px - .5) / 1.0) ** 2 + ((py - .45) / .92) ** 2)
            labels = np.where(cone, np.where(radius < .17, 0, 1), np.where(plate_radius > .36, 2, 3))
            labels[paint] = 4
            illumination = np.ones((height, width))
            for label in range(5):
                selection = labels == label; weights = selection * alpha_weight
                samples = luminance[selection & (alpha_weight > .9)]
                if not samples.size:
                    continue
                field = gaussian_filter(luminance * weights, density * 2.5) / np.maximum(1e-6, gaussian_filter(weights, density * 2.5))
                illumination[selection] = field[selection] / max(15, float(np.median(samples)))
            levels = np.uint8(np.clip(illumination * 7, 1, 15).round())
            levels[rgba[..., 3] == 0] = 0
            remap[..., 1] = (remap[..., 1] & 15) | (levels << 4)
            frame['ownerPixels'] = int((remap[..., 0] >= 128).sum())
            frame['fixedRedPixels'] = 0
            base.paste(Image.fromarray(rgba), (x, y)); data.paste(Image.fromarray(remap), (x, y))
            if frame['heading'] == 0:
                Image.fromarray(rgba).save(args.output / f'profile-{density}x.png')
        for role, image in [('base', base), ('data', data)]:
            target = destination / part['files'][role]['file']; image.save(target)
            part['files'][role].update(sha256=sha(target), bytes=target.stat().st_size)
        part['surfaceLighting'] = 'material-normalized-g4-v1'
        part['provenance']['profileRepair'] = {'masterSha256': sha(args.master),
            'scope': 'Lower cabin, coherent lighting and continuous annular highlight; retained outer rim pixels',
            'dataShadeHighNibble': 'Material-normalized illumination; visible RGBA is not blurred'}
    target = destination / 'manifest.json'; target.write_text(json.dumps(manifest, indent=2) + '\n')
    receipt['variants'].append({'density': density, 'path': str(target), 'sha256': sha(target)})
(args.output / 'export.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
