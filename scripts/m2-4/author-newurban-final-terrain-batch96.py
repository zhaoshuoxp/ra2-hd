"""Produce remaining NewUrban terrain using accepted materials and two new masters."""
from collections import Counter
import hashlib
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from newurban_batch96_io import BASELINE, GUIDE, PRIOR, ROOT, SOURCES, assemble, coordinates, crop, extrude, field_at, material, native, paved_end, paving_fix, pin, read, road_slope, round_paving, sha, with_native_coverage, write
from newurban_batch95_io import adapt_cliff_grass, register_canvas

sys.path.insert(0, 'scripts/m2')
from showcase_registration import authored_coverage, capacity, independently_sample, register

VERSION = sys.argv[1] if len(sys.argv) > 1 else 'v6'
assert VERSION.startswith('v') and VERSION[1:].isdigit()
OUTPUT = ROOT / f'authored-{VERSION}'
OUTPUT.mkdir(exist_ok=False)
donors = {(s['theater'], s['member']): s for s in read(PRIOR / 'accepted-native-donors-v1/source.json')['sources']}
urban = read('.local/terrain-urban-selection.json')
gaps = [r for r in read(PRIOR / 'inventory-reconciliation-v1.json')['remainingGaps'] if r['kind'] == 'tmp']
assert len(gaps) == 21
expected_selection = read(ROOT / 'selection-v1.json')['candidate'] if (ROOT / 'selection-v1.json').exists() else BASELINE
assert read('.local/terrain-newurban-selection.json') == expected_selection
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
records, masters = [], {}


def prepare_master(source):
    name = source['member']
    frames = [(f, native(source, f)) for f in source['images'] if f['nativeOffset'] > 0]
    original, low = assemble(frames)
    master_file = ROOT / f'{name}-mother-v1.png'
    master = Image.open(master_file).convert('RGBA')
    rect, rgb = register(master, dict(slotRect=[0, 0, *master.size], alphaCutoff=180,
        rejectFluorescentFringe=True), master.size, True)
    ratio = capacity(rect, [0, 0, *original.size])
    assert ratio >= 4, (name, ratio)
    alpha_source = np.asarray(master.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3])))
    coverage = authored_coverage(alpha_source, 180, True)
    layers = {}
    for density in [2, 4]:
        size = tuple(n * density for n in original.size)
        selected = independently_sample(rgb, size)
        alpha = np.asarray(Image.fromarray(coverage.astype(np.uint8) * 255).resize(size, Image.Resampling.LANCZOS))
        yy, xx = (np.indices(selected.shape[:2]) + .5) / density
        x, y = xx + low[0], yy + low[1]
        if name.startswith('libbas'):
            color = selected.astype(float)
            green = np.clip((color[..., 1] - color[..., 0] * .97) / 12, 0, 1)
            green *= np.clip((color[..., 1] - color[..., 2] - 18) / 25, 0, 1)
            green = ndimage.gaussian_filter(green, .3 * density, mode='nearest')
            grass = field_at(material('clear01.ubn', 0, density), x, y)
            selected = np.rint(np.clip(color * (1 - green[..., None]) + grass * green[..., None], 0, 255)).astype(np.uint8)
        else:
            color = selected.astype(float)
            wood = (color[..., 0] > color[..., 1] * 1.13) & (color[..., 1] > color[..., 2] * 1.12)
            foreground = np.where(y < 15, 1., wood.astype(float))
            foreground = ndimage.gaussian_filter(foreground, .18 * density, mode='nearest')
            floor = field_at(material('pave01.ubn', 0, density), x, y)
            selected = np.rint(np.clip(color * foreground[..., None] + floor * (1 - foreground[..., None]), 0, 255)).astype(np.uint8)
        pixels = np.dstack((selected, alpha))
        Image.fromarray(pixels).save(OUTPUT / f'{name}-{density}x-master-registration.png')
        layers[density] = pixels
    masters[name] = dict(originalSize=original.size, low=low.tolist(), layers=layers,
        source=pin(master_file), contentRect=rect, measuredMinimumDensity=ratio)


for name in ['libbas01.ubn', 'cliffa07.ubn']:
    prepare_master(SOURCES[name])

for gap in gaps:
    source = SOURCES[gap['member']]
    name = source['member']
    record = dict(member=name, original=pin(GUIDE / 'native' / source['nativeFile']),
        sourceSha256=source['sha256'], maps=gap['maps'], setIndex=source['setIndex'], frames=[])
    complete = {}
    for density in [2, 4]:
        frames = []
        for image in source['images']:
            original = native(source, image)
            policy = {}
            if image['nativeOffset'] <= 0:
                pixels = original.repeat(density, 0).repeat(density, 1)
                policy['policy'] = 'UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY'
            elif name in ['droads16.ubn', 'droads47.ubn', 'droads48.ubn', 'droads49.ubn']:
                donor = donors['TEMPERATE', name.replace('.ubn', '.tem')]
                frame = donor['images'][image['subTile']]
                for key in ['grid', 'origin', 'height', 'rampType', 'hasZData']:
                    assert image[key] == frame[key]
                pixels = register_canvas(crop(donor['pointer'], donor['member'], frame['subTile'], density), image, frame, density)
                pixels, _ = adapt_cliff_grass(pixels, image, density, material('clear01.ubn', 0, density))
                pixels = with_native_coverage(extrude(pixels), source, image, density)
                policy.update(policy='ACCEPTED_TEMPERATE_DIRT_TRACK_STRUCTURE_TARGET_HD_GRASS',
                    donor=donor['member'], donorPack=donor['pointer'], donorOriginal=donor['original'])
            elif name == 'drslpe04.ubn':
                donor = 'drslpe03.ubn'
                assert {k: v for k, v in image.items() if k not in ['member', 'file', 'rgbaSha256', 'nativeOffset', 'radar']} == {
                    k: v for k, v in SOURCES[donor]['images'][image['subTile']].items()
                    if k not in ['member', 'file', 'rgbaSha256', 'nativeOffset', 'radar']}
                pixels = crop(BASELINE, donor, image['subTile'], density)
                pixels = with_native_coverage(extrude(pixels), source, image, density)
                policy.update(policy='SAME_DIRECTION_ACCEPTED_NARROW_PAVED_SLOPE_COMPLETE_REUSE', donor=donor, donorPack=BASELINE)
            elif name.startswith('prslpe'):
                pixels, policy = road_slope(source, image, density)
            elif name in ['grfix05.ubn', 'grfix06.ubn', 'gbfix03.ubn']:
                pixels, policy = paving_fix(source, image, density)
            elif name in ['rough04.ubn', 'rough05.ubn', 'rough09.ubn', 'rough10.ubn']:
                pixels, policy = round_paving(source, image, density)
            elif name == 'rough01.ubn':
                donor = donors['URBAN', 'rough01.urb']
                width = image['grid'][0]
                p, q = image['subTile'] % width, image['subTile'] // width
                donor_slot = q + p * donor['images'][0]['grid'][0]
                pixels = crop(urban, 'rough01.urb', donor_slot, density)[:, ::-1].copy()
                pixels = with_native_coverage(extrude(pixels), source, image, density)
                policy.update(policy='MIRRORED_ACCEPTED_PARKING_LOT_WITH_TRANSPOSED_SOURCE_GRID',
                    donor='rough01.urb', donorSlot=donor_slot, donorPack=urban,
                    originalGrid=image['grid'], donorGrid=donor['images'][0]['grid'])
            elif name in ['droads43.ubn', 'droads46.ubn']:
                pixels, policy = paved_end(source, image, density)
            elif name in masters:
                master = masters[name]
                x, y = ((np.array(image['origin']) + image['offset'] - master['low']) * density).astype(int)
                w, h = np.array(image['size']) * density
                pixels = master['layers'][density][y:y + h, x:x + w].copy()
                assert pixels.shape[:2] == (h, w)
                if name == 'cliffa07.ubn' and image['subTile'] == 0:
                    gx, gy = coordinates(image, density)
                    pixels = with_native_coverage(field_at(material('pave01.ubn', 0, density), gx, gy), source, image, density)
                elif name == 'cliffa07.ubn':
                    native_alpha = original[..., 3].repeat(density, 0).repeat(density, 1)
                    covered = original[..., 3] > 0
                    band = ndimage.binary_dilation(covered, structure=np.ones((3, 3))) != ndimage.binary_erosion(
                        covered, structure=np.ones((3, 3)), border_value=0)
                    allowed = band.repeat(density, 0).repeat(density, 1)
                    allowed[59 * density:] = False
                    pixels[..., 3][~allowed] = native_alpha[~allowed]
                    # Extra-image architecture uses the new smooth authored edge.
                    # The original main diamond, canvas, offsets and native depth stay fixed.
                else:
                    pixels = with_native_coverage(pixels[..., :3], source, image, density)
                policy.update(policy='INDEPENDENTLY_DOWNSAMPLED_NEW_HD_MASTER_WITH_ACCEPTED_GROUND',
                    mother=master['source'], motherContentRect=master['contentRect'],
                    motherMinimumDensity=master['measuredMinimumDensity'],
                    extraArchitectureAlpha='AUTHORED_INSIDE_UNCHANGED_NATIVE_CANVAS' if name.startswith('cliffa') and image['subTile'] == 1 else 'ORIGINAL_TARGET_DIAMOND')
            else:
                raise AssertionError(name)
            assert pixels.shape[:2] == tuple(n * density for n in image['size'][::-1])
            directory = OUTPUT / name / f'{density}x'
            directory.mkdir(parents=True, exist_ok=True)
            file = directory / f'{image["subTile"]}.rgba'
            with file.open('xb') as stream:
                stream.write(pixels.tobytes())
            record['frames'].append(dict(density=density, subTile=image['subTile'], size=list(pixels.shape[1::-1]),
                output=pin(file), originalRgbUsedAsNewDetail=False, **policy))
            if image['nativeOffset'] > 0:
                frames.append((image, pixels))
        complete[density], _ = assemble(frames, density)
        complete[density].save(OUTPUT / f'{name}-{density}x-whole.png')
    low, _ = assemble([(f, native(source, f)) for f in source['images'] if f['nativeOffset'] > 0])
    comparison = Image.new('RGB', (1600, 450), '#14202a')
    draw = ImageDraw.Draw(comparison)
    for column, (label, picture) in enumerate([('Original x4', low.resize((low.width * 4, low.height * 4), Image.Resampling.NEAREST)),
        ('New 2X', complete[2]), ('New 4X', complete[4])]):
        picture.thumbnail((520, 390))
        comparison.paste(picture, (column * 530 + 5, 50), picture)
        draw.text((column * 530 + 10, 10), label, font=font, fill='white')
    draw.text((10, 420), name, font=small, fill='white')
    comparison.save(OUTPUT / f'{name}-comparison.png')
    records.append(record)

write(ROOT / f'authoring-{VERSION}.json', dict(status='AUTHORED_21_COMPLETE_MEMBERS_PENDING_STATIC_AND_NATIVE_CHECK',
    baseline=BASELINE, sources=len(records), records=records,
    newMothers=[{k: v for k, v in row.items() if k != 'layers'} for row in masters.values()],
    framePolicies=dict(Counter(f['policy'] for r in records for f in r['frames'])),
    originalRgbUsedAsNewDetail=False, originalMapModified=False, targetRulesDepthChanged=False,
    native='NOT_RUN', visual='NOT_REVIEWED', windows='NOT_RUN', m24Complete=False))
print(dict(sources=len(records), densitySlots=sum(len(r['frames']) for r in records), output=str(OUTPUT)))
