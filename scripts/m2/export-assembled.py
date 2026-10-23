"""Export continuous materials and complete authored TMP assemblies at each density."""
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

feedback = '--feedback' in sys.argv
style = next((arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--style=')), None)
root = Path('.artifacts/m2-1/authoring-v7' if style else
            '.artifacts/m2-1/authoring-v5' if feedback else '.artifacts/m2-1/authoring-v4')
native_root = Path('.artifacts/m2-1/inventory/native')
revision = sys.argv[1]
destination = Path('.local/terrain-packs') / revision
destination.mkdir(parents=True, exist_ok=False)
groups = json.loads((root / 'export-input.json').read_text())['groups']
layout = json.loads((root / 'active-assembly-layout.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()


def periodic(pixels):
    """Remove only the boundary discontinuity of a full-bleed material field."""
    height, width = pixels.shape[:2]
    boundary = np.zeros_like(pixels)
    boundary[0] = pixels[-1] - pixels[0]
    boundary[-1] = -boundary[0]
    boundary[:, 0] += pixels[:, -1] - pixels[:, 0]
    boundary[:, -1] -= pixels[:, -1] - pixels[:, 0]
    denominator = 2 * np.cos(2 * np.pi * np.arange(height)[:, None] / height)
    denominator = denominator + 2 * np.cos(2 * np.pi * np.arange(width)[None, :] / width) - 4
    denominator[0, 0] = 1
    frequency = np.fft.fft2(boundary, axes=(0, 1)) / denominator[:, :, None]
    frequency[0, 0] = 0
    return pixels - np.fft.ifft2(frequency, axes=(0, 1)).real


material_file = root / (f'ground-{style}-master.png' if style else 'ground-master.png')
material = Image.open(material_file).convert('RGB')
half = material.width // 2
swatches = [periodic(np.asarray(material.crop((x * half, y * half, (x + 1) * half, (y + 1) * half)),
                    dtype=np.float32)) for y in range(2) for x in range(2)]
targets = [np.array([158, 164, 76]), np.array([227, 207, 132])]
for i in range(2):
    swatches[i] += targets[i] - swatches[i].mean(axis=(0, 1))

plates, master_records = {}, []
for kind, names in [('road', ['proad01.tem', 'proad02.tem']), ('cliff', ['cliff01.tem', 'cliff02.tem'])]:
    file = root / f'{kind}-master.png'
    master = Image.open(file).convert('RGBA')
    records = []
    for i, name in enumerate(names):
        column = master.crop((i * master.width // 2, 0, (i + 1) * master.width // 2, master.height))
        pixels = np.asarray(column)
        ys, xs = np.where(pixels[:, :, 3] > 180)
        rect = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
        crop = column.crop(tuple(rect))
        bounds = layout[name]['bounds']
        # Bind the generated opaque outline to the native active-alpha bounds.
        # Preserve padding that belongs to the native logical assembly canvas.
        a = layout[name]['nativeAlphaBounds']
        scale = min(crop.width / (a[2] - a[0]), crop.height / (a[3] - a[1]))
        if scale < 4:
            raise ValueError(f'Inadequate 4X assembly master: {name}, scale {scale:.2f}')
        rgb = np.asarray(crop.convert('RGB')).copy()
        valid = np.asarray(crop.getchannel('A')) > 180
        rgb[~valid] = rgb[valid].mean(axis=0).astype(np.uint8)
        plates[name] = Image.fromarray(rgb)
        records.append(dict(member=name, crop=rect, densityCapacity=scale, nativeBounds=bounds,
                            nativeAlphaBounds=a, zeroOffsetSlots=layout[name]['zeroOffsetSlots']))
    master_records.append(dict(file=str(file), sha256=sha(file.read_bytes()), size=list(master.size), members=records))


def project(member, image, density):
    if style and not member['member'].startswith('proad') and member['member'] not in ['cliff01.tem', 'cliff02.tem']:
        from style_export import project_style
        return project_style(member, image, density)
    if feedback and not member['member'].startswith(('proad', 'cliff')):
        from feedback_export import project_feedback
        return project_feedback(member, image, density)
    width, height = image['logical']
    native = Image.frombytes('RGBA', (width, height),
                            (native_root / f"{member['nativeName']}-{image['subTile']}.rgba").read_bytes())
    size = (width * density, height * density)
    alpha = np.asarray(native.getchannel('A').resize(size, Image.Resampling.NEAREST))
    native_pixels = np.asarray(native)
    guide_pixels = native_pixels[:, :, :3].copy()
    covered = native_pixels[:, :, 3] > 0
    if covered.any():
        guide_pixels[~covered] = guide_pixels[covered].mean(axis=0).astype(np.uint8)
    guide = np.asarray(Image.fromarray(guide_pixels).filter(ImageFilter.GaussianBlur(1))
                       .resize(size, Image.Resampling.BICUBIC), dtype=np.float32)
    if member['nativeOffsets'][image['subTile']] <= 0:
        rgb = np.asarray(native.resize(size, Image.Resampling.NEAREST).convert('RGB'), dtype=np.float32)
    else:
        name = re.sub(r'^(proad0[12])[a-c](\.tem)$', r'\1\2', member['member'])
        if name in plates:
            info = layout[name]
            a = info['nativeAlphaBounds']
            plate = plates[name].resize(((a[2] - a[0]) * density, (a[3] - a[1]) * density), Image.Resampling.LANCZOS)
            complete = Image.new('RGB', (info['bounds'][2] * density, info['bounds'][3] * density))
            complete.paste(plate, (a[0] * density, a[1] * density))
            rect = next(p['rect'] for p in info['parts'] if p['subTile'] == image['subTile'])
            x, y, w, h = [n * density for n in rect]
            rgb = np.asarray(complete.crop((x, y, x + w, y + h)), dtype=np.float32)
        else:
            y, x = np.indices(alpha.shape, dtype=np.float32)
            nx = x / density + image['origin'][0] + image['offset'][0]
            ny = y / density + image['origin'][1] + image['offset'][1] - image['height'] * 15
            u = np.mod(nx / 60 + ny / 30 - .5, 1)
            v = np.mod(ny / 30 - nx / 60 + .5, 1)
            sampled = [pixels[(v * (half - 1)).astype(int), (u * (half - 1)).astype(int)] for pixels in swatches[:2]]
            if member['setIndex'] == 0:
                grass = np.ones(alpha.shape)
            elif member['setIndex'] == 41:
                grass = np.zeros(alpha.shape)
            else:
                grass = np.clip((guide[:, :, 1] - guide[:, :, 0] + 13) / 27, 0, 1)
            rgb = sampled[0] * grass[:, :, None] + sampled[1] * (1 - grass[:, :, None])
            if member['group'] == 'elevation-representative':
                expected = targets[0] * grass[:, :, None] + targets[1] * (1 - grass[:, :, None])
                shading = np.clip(guide.mean(axis=2) / np.maximum(expected.mean(axis=2), 1), .55, 1.35)
                rgb *= shading[:, :, None]
            rgb = rgb * .92 + guide * .08
    result = np.empty((*alpha.shape, 4), dtype=np.uint8)
    result[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    result[:, :, 3] = alpha
    valid = alpha > 0
    for _ in range(2):
        previous = valid.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)]:
            neighbor = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: neighbor[dy:] = False
            if dy > 0: neighbor[:dy] = False
            if dx < 0: neighbor[:, dx:] = False
            if dx > 0: neighbor[:, :dx] = False
            fill = ~valid & neighbor
            result[fill, :3] = np.roll(result[:, :, :3], (dy, dx), axis=(0, 1))[fill]
            valid |= fill
    return Image.fromarray(result)


manifest = dict(schema='tmp-terrain-hd-v1', revision=revision, theater='TEMPERATE', editions=['ra2', 'yr'],
                scope='REPRESENTATIVE_ART_DIRECTION_REVIEW_ONLY', groups=[])
review = root / revision
review.mkdir(exist_ok=False)
for group in groups:
    entry = dict(id=group['id'], scope=group['scope'], members=[
        {key: m[key] for key in ['member', 'sourceHashes', 'images']} for m in group['members']], variants=[])
    for density in [2, 4]:
        frames = [project({**member, 'group': group['id']}, image, density)
                  for member in group['members'] for image in member['images']]
        width = 1024 if density == 2 else 2048
        rects = []
        x, y, row_height = 2, 2, 0
        for frame in frames:
            if x + frame.width + 2 > width:
                x, y, row_height = 2, y + row_height + 4, 0
            rects.append([x, y, frame.width, frame.height])
            x += frame.width + 4
            row_height = max(row_height, frame.height)
        atlas = Image.new('RGBA', (width, y + row_height + 2))
        for frame, (x, y, w, h) in zip(frames, rects):
            atlas.paste(frame, (x, y))
            for strip, point in [(frame.crop((0, 0, 1, h)).resize((2, h)), (x - 2, y)),
                (frame.crop((w - 1, 0, w, h)).resize((2, h)), (x + w, y)),
                (frame.crop((0, 0, w, 1)).resize((w, 2)), (x, y - 2)),
                (frame.crop((0, h - 1, w, h)).resize((w, 2)), (x, y + h))]:
                atlas.paste(strip, point)
        file = f"{group['id']}-{density}x.rgba"
        data = atlas.tobytes()
        (destination / file).write_bytes(data)
        atlas.save(review / f"{group['id']}-{density}x-atlas.png")
        entry['variants'].append(dict(density=density, size=list(atlas.size), file=file, sha256=sha(data), rects=rects))
    manifest['groups'].append(entry)
data = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(destination / 'manifest.json').write_bytes(data)
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(data))
for file in [Path('.local/terrain-selection.json'), Path('desktop/terrain-hd-contract.json')]:
    file.write_text(json.dumps(pointer, indent=2) + '\n')
recipe = dict(schema='m2-1-assembled-master-v1', generator='built-in image_gen', pack=pointer,
              material=dict(file=str(material_file), sha256=sha(material_file.read_bytes()), size=list(material.size),
                            method='Periodic boundary correction; dominant authored color with 8 percent native guide'),
              assemblies=master_records, assemblyLayout='active-assembly-layout.json',
              exports='Each density samples adequate original masters independently; exact native alpha and logical metadata',
              sourceZeroOffsets='Retain original pixels for decoder placeholder slots; no native decoder change',
              rejected=['V2 microtexture lacked clarity', 'V3 repeated diamond edges and single-subtile road repainting'],
              scope=manifest['scope'])
if feedback:
    from feedback_export import provenance
    recipe['feedback'] = provenance
    recipe['material']['method'] = provenance['method']
    recipe['reused'] = 'V4 road and cliff master bytes, layouts and export path retained exactly'
    recipe['rejected'].append('V4 ground palette drift and blurred semantic transitions; slope and ramp repainting')
if style:
    from style_export import provenance
    recipe['styleExperiment'] = provenance
    recipe['material']['method'] = provenance['method']
    recipe['reused'] = 'Exact V4 road group, plus existing Cliff01/02 controls; new Cliff03/04 are bounded representatives'
(review / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
print(json.dumps(dict(pack=pointer, groups=[dict(id=g['id'], images=sum(len(m['images']) for m in g['members']))
                                         for g in manifest['groups']]), indent=2))
