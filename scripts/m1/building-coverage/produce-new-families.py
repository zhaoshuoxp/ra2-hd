"""Compose approved new families using fixed masters and rigid native stages."""
import json
import os
import math
import sys
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
from production_common import ROOT, area, row_for, raw_for, indices, resting, register, cut, mask_poly, sha

D = int(os.environ.get('RA2_EXPORT_DENSITY', '2'))
identity = sys.argv[1]
assert identity in ['NAINDP', 'NABNKR']
out = (Path(os.environ['RA2_EXPORT_OUTPUT']) if os.environ.get('RA2_EXPORT_OUTPUT') else ROOT / (sys.argv[2] if len(sys.argv) > 2 else 'full-exports-v1')) / identity
out.mkdir(parents=True, exist_ok=False)
row = row_for(identity)
body = next(m for m in row['members'] if 'body' in m['roles'])
build = next(m for m in row['members'] if 'BUILDUP' in m['roles'])
size = tuple(v * D for v in body['canvas'])
blank = lambda: Image.new('RGBA', size)
normal_path = ROOT / 'review-v1' / (identity + '-TEMPERATE-hd4.png')
normal = area(Image.open(normal_path).convert('RGBA'), size)
damage_path = ROOT / 'full-art-v1' / identity / ('damaged-raw-v2.png' if identity == 'NAINDP' else 'damaged-raw.png')
damaged, registration = register(damage_path, body['canvas'], resting(row, True).getbbox(), D)
frames, operations = {}, {}
receipt = json.loads((ROOT / 'review-v1/review-receipt.json').read_text())
approved = next(r for r in receipt['samples'] if r['id'] == identity)


def same_transform(path):
    source = Image.open(path).convert('RGBA')
    factor = approved['uniformScale'] * D
    xy = [round(approved['offset4x'][i] * D / 4 - approved['alphaCrop'][i] * factor) for i in [0, 1]]
    image = blank()
    image.alpha_composite(area(source, tuple(round(v * factor) for v in source.size)), tuple(xy))
    return image


def put(member, n, im, operation, **details):
    frames[member['source']['member'], n] = im
    operations[member['source']['member'], n] = {'operation': operation, **details}


if identity == 'NABNKR':
    # The occupied edit shares the source canvas. Use the accepted transform,
    # never a fresh bounding-box fit that shrinks the base around protruding guns.
    source = Image.open(ROOT / 'full-art-v1/NABNKR/occupied-raw.png').convert('RGBA')
    factor = approved['uniformScale'] * D
    xy = [round(approved['offset4x'][i] * D / 4 - approved['alphaCrop'][i] * factor) for i in [0, 1]]
    occupied_edit = blank()
    occupied_edit.alpha_composite(area(source, tuple(round(v * factor) for v in source.size)), tuple(xy))
    # Isolate actual authored barrels instead of using native RGB differences,
    # which also include unrelated roof shades and would heal damaged masonry.
    raw_mask = Image.new('RGBA', source.size)
    draw = ImageDraw.Draw(raw_mask)
    for points in [((345,620),(449,603),(465,620),(352,647)),
                   ((713,639),(799,686),(789,704),(713,660)),
                   ((107,698),(192,703),(192,733),(107,722)),
                   ((1051,839),(1176,851),(1176,881),(1050,869)),
                   ((226,972),(320,917),(336,937),(242,996)),
                   ((730,997),(750,994),(793,1058),(777,1074)),
                   ((345,862),(412,824),(425,840),(355,880)),
                   ((704,879),(720,872),(760,932),(744,945))]:
        draw.polygon(points, fill=(255,255,255,255))
    placed_mask = blank()
    placed_mask.alpha_composite(area(raw_mask, tuple(round(v * factor) for v in source.size)), tuple(xy))
    mask = placed_mask.getchannel('A')
    for n, base in [(0, normal), (1, damaged), (2, normal), (3, damaged)]:
        result = base.copy()
        if n >= 2:
            # Only native occupied sockets may acquire authored barrels.
            a = np.array(result)
            b = np.array(occupied_edit)
            coverage = np.array(mask, np.float32) / 255
            coverage *= (b[..., 3] > 0)
            a = np.rint(a * (1 - coverage[..., None]) + b * coverage[..., None]).astype(np.uint8)
            result = Image.fromarray(a)
        put(body, n, result, 'Fixed normal/damaged base; occupied-only authored barrel sockets', occupied=n >= 2)
else:
    active = next(m for m in row['members'] if 'IDLE' in m['roles'])
    for n in range(3):
        put(body, n, normal if n == 0 else damaged, 'Fixed architectural master; native damage state')
    # Native machinery phases articulate the two front piston heads. Each head
    # translates intact; its cylinder body and all brickwork remain stationary.
    boxes = [(148, 117, 171, 137), (169, 106, 192, 126)]
    activity = np.zeros(body['canvas'][::-1], bool)
    for n in range(active['visibleFrames']):
        activity |= indices(active, n) != 0
    support = Image.fromarray(np.uint8(activity) * 255).filter(ImageFilter.MaxFilter(7)).resize(size, Image.Resampling.NEAREST)
    for n in range(active['visibleFrames']):
        damage = n >= 13
        base = damaged if damage else normal
        image = base.copy()
        phase = (n - 13 if damage else min(n, 11))
        translations = []
        for part, (x0, y0, x1, y1) in enumerate(boxes):
            # Motion magnitude is bounded by the native piston stroke.
            native_phase = indices(active, n)
            reference = indices(active, 13 if damage else 0)
            region = native_phase[y0:y1, x0:x1]
            reference_region = reference[y0:y1, x0:x1]
            changed = int(np.count_nonzero(region != reference_region))
            dy = round((math.sin(2 * math.pi * phase / (13 if damage else 12) + part * math.pi) - math.sin(part * math.pi)) * D)
            if not changed:
                dy = 0
            box = tuple(v * D for v in (x0, y0, x1, y1))
            head = base.crop(box)
            # The local source band is metal within the cylinder envelope;
            # overlapping shaft pixels hide the translated head's lower edge.
            image.alpha_composite(head, (x0 * D, y0 * D + dy))
            translations.append({'part': part, 'dy': dy / D, 'nativeChangedPixels': changed})
        put(active, n, cut(image, support), 'Local rigid piston heads; fixed base and sockets', phase=phase, translations=translations)

# Construct from intact fixed-size components behind ground/socket planes.
# No per-frame image resizing, changing world foundation or camera is permitted.
alpha = np.asarray(normal.getchannel('A')) > 8
occupied = alpha.any(axis=0)
floors = np.where(occupied, alpha.shape[0] - 1 - alpha[::-1].argmax(axis=0), -1)
yy = np.arange(size[1])[:, None]
ground = Image.fromarray(np.uint8((yy <= floors[None, :]) & occupied[None, :]) * 255)
foot = Image.fromarray(np.uint8((yy >= floors[None, :] - 5 * D) & occupied[None, :]) * 255)
foundation = cut(normal, foot)
foundation_plate = same_transform(ROOT / 'full-art-v1' / identity / 'foundation-raw.png')
top = normal.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()[1]
for n in range(build['visibleFrames']):
    source_mask = Image.fromarray(np.uint8(indices(build, n) != 0) * 255)
    box = source_mask.getbbox()
    source_top = box[1] * D if box else size[1]
    # An intact architectural assembly rises through the fixed ground plane.
    # Avoid horizontal seams through bridges and walls: those create floating
    # fragments when independently translated upper/lower image strips meet.
    dy = max(0, source_top - top)
    image = foundation_plate.copy()
    moving = blank()
    moving.alpha_composite(normal, (0, dy))
    image.alpha_composite(cut(moving, ground))
    image.alpha_composite(foundation)
    if n < round(build['visibleFrames'] * .3):
        guide = source_mask.filter(ImageFilter.MaxFilter(3)).resize(size, Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(.4))
        image = cut(image, guide)
    if n == build['visibleFrames'] - 1:
        image = normal.copy()
    if n == 0:
        guide = source_mask.resize(size, Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(.35))
        image = cut(foundation_plate, guide)
    put(build, n, image, 'Rigid architectural assembly rises through fixed foundation and ground occlusion',
        frameScale=[1, 1], bodyTranslation=[0, dy / D], foundationTranslation=[0, 0])

records = []
shades = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
for member in row['members']:
    name = member['source']['member']
    raw = raw_for(member)
    contact = Image.new('RGB', (body['canvas'][0] * 5, math.ceil(member['visibleFrames'] / 5) * (body['canvas'][1] + 24)), '#34483d')
    for n in range(member['visibleFrames']):
        native = raw['frames'][n]
        full = frames[name, n]
        w, h = native['width'], native['height']
        export = Image.new('RGBA', (max(1, (w + w % 2) * D), max(1, (h + h % 2) * D)))
        if not native['empty']:
            export.paste(full.crop((native['x'] * D, native['y'] * D, (native['x'] + w) * D, (native['y'] + h) * D)))
        pixels = np.asarray(export)
        rgb = pixels[..., :3].astype(np.float32)
        red = (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (pixels[..., 3] > 0)
        shade = np.abs(rgb[..., 0, None] - shades).argmin(axis=2)
        data = np.zeros_like(pixels)
        data[..., 3] = 255
        data[..., 0][red] = 255
        data[..., 1][red] = shade[red]
        stem = f'{name[:-4]}-{n:02}-{D}x'
        export.save(out / (stem + '.png'))
        Image.fromarray(data).save(out / (stem + '-data.png'))
        thumb = area(full, tuple(body['canvas']))
        x, y = n % 5 * body['canvas'][0], n // 5 * (body['canvas'][1] + 24)
        contact.paste(thumb, (x, y + 24), thumb)
        ImageDraw.Draw(contact).text((x + 5, y + 3), str(n), fill='white', font_size=18)
        records.append({'member': name, 'nativeFrame': n, 'exports': [{'density': D, 'base': stem + '.png', 'data': stem + '-data.png'}],
                        **operations[name, n], 'remapPixels': int(red.sum())})
    contact.save(out / (name + '-contact.png'))
normal.save(out / 'normal-canvas.png')
damaged.save(out / 'damaged-canvas.png')
report = {'identity': identity, 'status': 'COMPLETE_SLOT_CANDIDATE_REQUIRES_VISUAL_AND_RUNTIME_VALIDATION',
          'density': D, 'approvalSha256': sha(ROOT / 'representative-acceptance-v1.json'),
          'acceptedNormalSha256': sha(normal_path), 'damageRegistration': registration, 'frames': records,
          'nativeShadows': 'RETAINED_UNMODIFIED', 'count': len(records)}
(out / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'family': identity, 'authoredSlots': len(records), 'status': report['status']}))
