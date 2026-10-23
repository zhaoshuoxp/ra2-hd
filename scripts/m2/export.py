"""Project authored master detail through immutable native TMP material/coverage."""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

forms = '--forms' in sys.argv
root = Path('.artifacts/m2-1/authoring-v3' if forms else '.artifacts/m2-1/authoring-v1')
source = Path('.artifacts/m2-1/inventory/native')
revision = sys.argv[1] if len(sys.argv) > 1 else 'temperate-m2-1-representative-v1'
out = Path('.local/terrain-packs') / revision
out.mkdir(parents=True, exist_ok=False)
master_file = root / ('form-master.png' if forms else 'material-master.png')
master = Image.open(master_file).convert('RGBA' if forms else 'RGB')
half = master.width // 2
swatches = [master.crop((x * half, y * half, (x + 1) * half, (y + 1) * half))
            for y in range(2) for x in range(2)]
detail = [np.asarray(s.convert('RGB'), dtype=np.float32)
          - np.asarray(s.convert('RGB').filter(ImageFilter.GaussianBlur(10)), dtype=np.float32) for s in swatches]
groups = json.loads(Path('.artifacts/m2-1/authoring-v1/export-input.json').read_text())['groups']
sha = lambda data: hashlib.sha256(data).hexdigest()
form_crops = []
crop_rects = []
if forms:
    for swatch in swatches:
        pixels = np.asarray(swatch)
        ys, xs = np.where(pixels[:, :, 3] > 180)
        rect = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
        crop_rects.append(rect)
        pixels = pixels[rect[1]:rect[3], rect[0]:rect[2]].copy()
        valid = pixels[:, :, 3] > 180
        # Generated alpha is authoring context only. Extend authored RGB outside
        # that outline; publication always restores exact native TMP coverage.
        mean = pixels[:, :, :3][valid].mean(axis=0).astype(np.uint8)
        pixels[~valid, :3] = mean
        form_crops.append(Image.fromarray(pixels[:, :, :3]))


def authored_forms(member, image, native, density):
    width, height = image['logical']
    size = (width * density, height * density)
    native_rgb = np.asarray(native.filter(ImageFilter.GaussianBlur(1)).resize(size, Image.Resampling.BICUBIC)
                            .convert('RGB'), dtype=np.float32)
    y, x = np.indices((size[1], size[0]), dtype=np.float32)
    nx = x / density + image['origin'][0] + image['offset'][0]
    ny = y / density + image['origin'][1] + image['offset'][1]
    u = (nx / 60 + ny / 30 - .5) % 1
    v = (ny / 30 - nx / 60 + .5) % 1
    sampled = []
    for crop in form_crops[:2]:
        pixels = np.asarray(crop, dtype=np.float32)
        sx = np.clip((u - v + 1) * .5 * (crop.width - 1), 0, crop.width - 1).astype(int)
        sy = np.clip((u + v) * .5 * (crop.height - 1), 0, crop.height - 1).astype(int)
        sampled.append(pixels[sy, sx])
    # Match palette relationships while retaining the authored larger forms.
    targets = [np.array([158, 164, 76]), np.array([227, 207, 132])]
    for i in range(2):
        sampled[i] *= targets[i] / np.maximum(np.asarray(form_crops[i]).mean(axis=(0, 1)), 1)
    if member['setIndex'] == 0:
        grass = np.ones((size[1], size[0]))
    elif member['setIndex'] == 41:
        grass = np.zeros((size[1], size[0]))
    else:
        grass = np.clip((native_rgb[:, :, 1] - native_rgb[:, :, 0] + 13) / 27, 0, 1)
    painted = sampled[0] * grass[:, :, None] + sampled[1] * (1 - grass[:, :, None])
    if 'road' in member['group']:
        if member['member'].startswith('proad01'):
            painted = np.asarray(form_crops[2].resize(size, Image.Resampling.LANCZOS), dtype=np.float32)
        else:
            asphalt = np.clip((120 - native_rgb.mean(axis=2)) / 40, 0, 1)
            quiet_road = np.asarray(form_crops[2].crop((40, 170, 340, 280)).resize(size,
                Image.Resampling.LANCZOS), dtype=np.float32)
            painted = painted * (1 - asphalt[:, :, None]) + quiet_road * asphalt[:, :, None]
            concrete = np.clip((native_rgb.mean(axis=2) - 160) / 45, 0, 1)
            gray = 1 - np.clip((native_rgb.max(axis=2) - native_rgb.min(axis=2)) / 35, 0, 1)
            curb = concrete * gray
            painted = painted * (1 - curb[:, :, None]) + native_rgb * curb[:, :, None]
    elif member['member'] == 'cliff01.tem' and image['subTile'] == 0:
        painted = np.asarray(form_crops[3].resize(size, Image.Resampling.LANCZOS), dtype=np.float32)
    elif 'elevation' in member['group']:
        rock = np.clip((native_rgb[:, :, 0] - native_rgb[:, :, 1] - 12) / 35, 0, 1)
        stone = np.asarray(form_crops[3].crop((40, 80, 290, 290)).resize(size,
            Image.Resampling.LANCZOS), dtype=np.float32)
        painted = painted * (1 - rock[:, :, None]) + stone * rock[:, :, None]
    # Retain a small broad guide for native state boundaries. New artwork, rather
    # than the predecessor's interpolated RGB, now supplies the dominant signal.
    return np.clip(painted * .88 + native_rgb * .12, 0, 255)


def project(member, image, density):
    width, height = image['logical']
    native = Image.frombytes('RGBA', (width, height),
                            (source / f"{member['nativeName']}-{image['subTile']}.rgba").read_bytes())
    rgb = np.asarray(native.resize((width * density, height * density), Image.Resampling.BICUBIC).convert('RGB'), dtype=np.float32)
    alpha = np.asarray(native.getchannel('A').resize((width * density, height * density), Image.Resampling.NEAREST))
    # Native low-frequency color, landform shading and road paint remain the guide.
    # New generated detail comes from the original adequate-resolution master at
    # each density, never from resizing the finished 2X export.
    y, x = np.indices(alpha.shape, dtype=np.float32)
    nx = x / density + image['origin'][0] + image['offset'][0]
    ny = y / density + image['origin'][1] + image['offset'][1]
    u = np.floor((nx / 2 + ny) * 4).astype(int) % half
    v = np.floor((ny - nx / 2) * 4).astype(int) % half
    # Material classes use native color relationships, not file/set labels alone.
    grass = np.clip((rgb[:, :, 1] - rgb[:, :, 0] + 8) / 26, 0, 1)
    asphalt = np.clip((95 - rgb.mean(axis=2)) / 40, 0, 1)
    rock = np.clip((rgb[:, :, 0] - rgb[:, :, 1] - 16) / 45, 0, 1)
    if 'road' not in member['group']:
        asphalt *= 0
    if 'elevation' not in member['group']:
        rock *= 0
    material = detail[0][v, u] * grass[:, :, None] + detail[1][v, u] * (1 - grass[:, :, None])
    material = material * (1 - asphalt[:, :, None]) + detail[2][v, u] * asphalt[:, :, None]
    material = material * (1 - rock[:, :, None]) + detail[3][v, u] * rock[:, :, None]
    # Keep joining edges at native color. This also preserves Original controls.
    edge = np.minimum.reduce([x, y, width * density - 1 - x, height * density - 1 - y])
    strength = np.clip(edge / (2 * density), 0, 1) * .8
    result = np.empty((*alpha.shape, 4), dtype=np.uint8)
    result[:, :, :3] = (authored_forms(member, image, native, density) if forms
                       else np.clip(rgb + material * strength[:, :, None], 0, 255)).astype(np.uint8)
    result[:, :, 3] = alpha
    # Extend only RGB into transparent texels before linear sampling. Alpha and
    # native coverage stay exact; black transparent RGB would reveal cell seams.
    valid = alpha > 0
    for _ in range(2):
        previous = valid.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)]:
            neighbor = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: neighbor[dy:, :] = False
            if dy > 0: neighbor[:dy, :] = False
            if dx < 0: neighbor[:, dx:] = False
            if dx > 0: neighbor[:, :dx] = False
            fill = ~valid & neighbor
            result[fill, :3] = np.roll(result[:, :, :3], (dy, dx), axis=(0, 1))[fill]
            valid |= fill
    return Image.fromarray(result)


manifest = dict(schema='tmp-terrain-hd-v1', revision=revision, theater='TEMPERATE', editions=['ra2', 'yr'],
                scope='REPRESENTATIVE_ART_DIRECTION_REVIEW_ONLY', groups=[])
for group in groups:
    members = group['members']
    entry = dict(id=group['id'], scope=group['scope'], members=[
        {k: m[k] for k in ['member', 'sourceHashes', 'images']} for m in members], variants=[])
    for density in [2, 4]:
        frames = []
        for member in members:
            member['group'] = group['id']
            for image in member['images']:
                frames.append(project(member, image, density))
        width = 1024 if density == 2 else 2048
        rects = []
        x, y, row_height = 2, 2, 0
        for frame in frames:
            if x + frame.width + 2 > width:
                x, y, row_height = 2, y + row_height + 4, 0
            rects.append([x, y, frame.width, frame.height])
            x += frame.width + 4
            row_height = max(row_height, frame.height)
        height = y + row_height + 2
        atlas = Image.new('RGBA', (width, height))
        for frame, (x, y, w, h) in zip(frames, rects):
            atlas.paste(frame, (x, y))
            # Extruded sampling gutters prevent neighboring atlas content bleeding.
            atlas.paste(frame.crop((0, 0, 1, h)).resize((2, h)), (x - 2, y))
            atlas.paste(frame.crop((w - 1, 0, w, h)).resize((2, h)), (x + w, y))
            atlas.paste(frame.crop((0, 0, w, 1)).resize((w, 2)), (x, y - 2))
            atlas.paste(frame.crop((0, h - 1, w, h)).resize((w, 2)), (x, y + h))
        name = f"{group['id']}-{density}x.rgba"
        data = atlas.tobytes()
        (out / name).write_bytes(data)
        review = root / revision
        review.mkdir(exist_ok=True)
        atlas.save(review / f"{group['id']}-{density}x-atlas.png")
        entry['variants'].append(dict(density=density, size=[width, height], file=name, sha256=sha(data), rects=rects))
    manifest['groups'].append(entry)
data = (json.dumps(manifest, separators=(',', ':')) + '\n').encode()
(out / 'manifest.json').write_bytes(data)
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(data))
Path('.local/terrain-selection.json').write_text(json.dumps(pointer, indent=2) + '\n')
Path('desktop/terrain-hd-contract.json').write_text(json.dumps(pointer, indent=2) + '\n')
recipe = dict(schema='m2-1-master-provenance-v1', generator='built-in image_gen',
              source=master_file.as_posix(), sha256=sha(master_file.read_bytes()), size=list(master.size),
              adequateResolution=('Original authored forms exceed 585px wide for 240px-wide 4X tile canvases'
                                  if forms else '627x627 material swatches sampled directly for 240px-wide 4X tile canvases'),
              exports='Independent sampling of the same original master at each density',
              material=('Dominant authored forms with 12 percent broad native guide; immutable native alpha'
                        if forms else 'Native color guide plus generated high-frequency material; no authored objects or baked lighting'),
              scope=manifest['scope'], pack=pointer, rejected=[])
if forms:
    recipe.update(cropRects=crop_rects, directFormMembers=['proad01.tem and native variants', 'cliff01.tem/subtile 0'],
                  sampledMaterialMembers='Other representatives retain native structural guidance with authored ground/road/stone materials',
                  reference='native-form-reference.png', prompt='prompt.txt',
                  rejected=['Representative v2 was user rejected: sand-like microtexture without sufficient clarity'])
(root / revision / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
print(json.dumps(dict(selection=pointer, groups=[dict(id=g['id'], members=len(g['members']),
      images=sum(len(m['images']) for m in g['members']), variants=[dict(density=v['density'], size=v['size'])
      for v in g['variants']]) for g in manifest['groups']]), indent=2))
