"""Fixed foundations and rigid deployment parts for small Allied defenses."""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, indices, raw_for, register, sha

identity = sys.argv[1]
assert identity in ('GAGAP', 'GAPILL')
theater = sys.argv[2] if len(sys.argv) > 2 else 'TEMPERATE'
assert theater in ('TEMPERATE', 'SNOW')
row = row_for(identity, theater)
dry_row = row_for(identity)
body = next(m for m in row['members'] if 'body' in m['roles'])
build = next(m for m in row['members'] if 'BUILDUP' in m['roles'])
size = tuple(body['canvas'])
hd_size = tuple(v * DENSITY for v in size)
out = ROOT / 'full-exports-v1' / (identity if theater == 'TEMPERATE' else identity + '-SNOW')
out = export_output(out)
out.mkdir(parents=True, exist_ok=False)
source = ROOT / 'production-art-v1' / identity / 'keys-raw.png'
sheet = Image.open(source).convert('RGBA')
cell = lambda index: sheet.crop((index % 2 * sheet.width // 2, index // 2 * sheet.height // 2,
                                 (index % 2 + 1) * sheet.width // 2, (index // 2 + 1) * sheet.height // 2))
normal = normal_for(ROOT / 'review-v1' / f'{identity}-candidate-2x.png')
damage, damage_registration = register(cell(0), size, decode(row, body, 1).getbbox())
early, early_registration = register(cell(1), size, decode(row, build, 0).getbbox())
if theater == 'SNOW':
    snow_source = ROOT / 'production-art-v1' / identity / 'snow-raw.png'
    snow = Image.open(snow_source).convert('RGBA')
    normal, _ = register(snow.crop((0, 0, snow.width // 2, snow.height)), size, decode(row, body, 0).getbbox())
    damage, damage_registration = register(snow.crop((snow.width // 2, 0, snow.width, snow.height)),
                                           size, decode(row, body, 1).getbbox())
    # Add only source-proven snow deposits to the separately authored early
    # assembly. The dry machinery is not globally whitened or re-scaled.
    dry_build = next(m for m in dry_row['members'] if 'BUILDUP' in m['roles'])
    native_snow = np.array(decode(row, build, 0))
    native_dry = np.array(decode(dry_row, dry_build, 0))
    light = native_snow[..., :3].astype(float)
    deposit = (light.min(axis=2) > 180) & (light.max(axis=2) - light.min(axis=2) < 45)
    deposit &= np.max(np.abs(light - native_dry[..., :3].astype(float)), axis=2) > 30
    mask = Image.fromarray(np.uint8(deposit) * 255).resize(hd_size, Image.Resampling.LANCZOS)
    # Sample actual newly authored snow, retaining its surface texture.
    tex = np.array(normal)
    white = (tex[..., :3].min(axis=2) > 205) & (tex[..., 3] > 240)
    yy, xx = np.where(white)
    assert len(xx), 'Snow master lacks snow material'
    grain = tex[yy, xx]
    pixels = np.zeros((hd_size[1], hd_size[0], 4), np.uint8)
    for y in range(hd_size[1]):
        for x in range(hd_size[0]):
            pixels[y, x] = grain[(y * 71 + x * 13) % len(grain)]
    pixels[..., 3] = np.array(mask)
    early.alpha_composite(Image.fromarray(pixels))
blank = lambda: Image.new('RGBA', hd_size)


def band(image, y0, y1):
    out = blank()
    out.alpha_composite(image.crop((0, y0 * DENSITY, hd_size[0], y1 * DENSITY)), (0, y0 * DENSITY))
    return out


def support(member, frame, expand=0):
    mask = Image.fromarray(np.uint8(indices(member, frame) > 0) * 255)
    if expand:
        mask = mask.filter(ImageFilter.MaxFilter(expand * 2 + 1))
    return mask.resize(hd_size, Image.Resampling.LANCZOS)


def clip(image, mask):
    result = image.copy()
    result.putalpha(Image.fromarray(np.uint8(np.array(image.getchannel('A'), float) * np.array(mask) / 255)))
    return result


frames = {(body['source']['member'], n): normal if n == 0 else damage for n in range(3)}
operations = []
native_top = decode(row, body, 0).getbbox()[1]
for n in range(build['visibleFrames']):
    if identity == 'GAGAP':
        # The head translates intact on the telescoping shaft; the base does
        # not inherit the changing whole-frame construction envelope.
        head, shaft, foundation = band(normal, 0, 51), band(normal, 51, 88), band(normal, 88, size[1])
        dy = max(0, decode(row, build, n).getbbox()[1] - native_top)
        image = foundation.copy()
        image.alpha_composite(shaft)
        moving = blank()
        moving.alpha_composite(head, (0, dy * DENSITY))
        image.alpha_composite(moving)
        if n <= 1:
            # Native open base panels are a separately authored early pose.
            image = early.copy()
            if n == 1:
                image.alpha_composite(moving)
        else:
            image = clip(image, support(build, n, 1))
    else:
        # Raise the intact bunker through its fixed ground ring. The below-
        # ground portion is occluded rather than vertically scaled.
        dy = max(0, decode(row, build, n).getbbox()[1] - native_top)
        image = early.copy()
        moving = blank()
        moving.alpha_composite(normal, (0, dy * DENSITY))
        image.alpha_composite(clip(moving, support(build, n, 1)))
        if n == 0:
            image = early.copy()
    if n == build['visibleFrames'] - 1:
        image = normal.copy()
    frames[build['source']['member'], n] = image
    operations.append({'frame': n, 'rigidVerticalTranslation': dy, 'foundationTranslation': [0, 0],
                       'wholeBuildingScale': [1, 1]})

records = []
for member in row['members']:
    name = member['source']['member']
    raw = raw_for(member['source']['sha256'])
    previews = []
    for n in range(member['visibleFrames']):
        f = raw['frames'][n]
        image = frames[name, n]
        target_size = tuple(max(1, v * DENSITY) for v in f['legacyRenderSize'])
        exported = Image.new('RGBA', target_size)
        if not f['empty']:
            exported.paste(image.crop((f['x'] * DENSITY, f['y'] * DENSITY, (f['x'] + f['width']) * DENSITY,
                                        (f['y'] + f['height']) * DENSITY)))
        rgba = np.array(exported)
        rgb = rgba[..., :3].astype(float)
        remappable = row['art'].get('Remapable', 'yes').lower() != 'no'
        red = remappable & (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (rgba[..., 3] > 0)
        shades = np.abs(rgb[..., 0, None] - np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4).argmin(axis=2)
        data = np.zeros_like(rgba)
        data[..., 3] = 255
        data[..., 0][red] = 255
        data[..., 1][red] = shades[red]
        stem = f'{name[:-4]}-{n:03}-{DENSITY}x'
        exported.save(out / f'{stem}.png')
        Image.fromarray(data).save(out / f'{stem}-data.png')
        records.append({'member': name, 'nativeFrame': n, 'exports': [{'density': DENSITY,
            'base': f'{stem}.png', 'data': f'{stem}-data.png'}], 'remapPixels': int(red.sum())})
        preview = Image.new('RGBA', hd_size)
        preview.alpha_composite(exported, (f['x'] * DENSITY, f['y'] * DENSITY))
        previews.append(preview.resize(size, Image.Resampling.LANCZOS))
    board = Image.new('RGB', (size[0] * len(previews), size[1] + 28), '#34483d')
    for n, im in enumerate(previews):
        board.paste(im, (n * size[0], 28), im)
        ImageDraw.Draw(board).text((n * size[0] + 5, 2), str(n), fill='white', font_size=20)
    board.save(out / f'{name}-contact.png')
    if name == build['source']['member']:
        gif = []
        for im in previews:
            frame = Image.new('RGB', size, '#34483d')
            frame.paste(im, (0, 0), im)
            gif.append(frame)
        gif[0].save(out / 'construction.gif', save_all=True, append_images=gif[1:], duration=150, loop=0)

(out / 'candidate-review.json').write_text(json.dumps({'identity': identity, 'theater': theater, 'density': DENSITY,
    'status': 'COMPLETE_MEMBER_EXPORT_VISUAL_QA_PENDING', 'frames': records, 'operations': operations,
    'authoredKeys': str(source), 'authoredKeysSha256': sha(source), 'damageRegistration': damage_registration,
    'earlyRegistration': early_registration, 'approvalSha256': sha(ROOT / 'representative-acceptance-v1.json'),
    'nativeShadows': 'RETAINED_ORIGINAL', 'runtime': 'NOT_ACTIVATED'}, indent=2) + '\n')
print(identity, len(records), 'candidate slots, runtime pending')
