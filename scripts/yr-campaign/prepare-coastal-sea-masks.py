"""Audit original floor-water ownership independently from new cliff RGB."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_coastal_sea import (
    original_floor_water, snow_coastal_extra_coverage, bridge_coastal_extra_coverage)
from showcase_snow_scope import admit_snow_scope
from showcase_newurban_coastal_scope import coastal_set_indices, bridge_floor_contacts

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('sea_recipe', type=Path)
parser.add_argument('water_reference', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
source, layout = read(args.authoring / 'source.json'), read(args.authoring / 'layout.json')
reference = read(args.water_reference)
assert reference['schema'] == 'yr-original-water-palette-control-v1'
snow = source['theater'] == 'SNOW'
if snow:
    _, key, _ = admit_snow_scope(read(args.authoring / 'material-profile.json'), source)
    assert key == 'sourcePinnedSnowCoastalContours'
else:
    assert source['theater'] == 'NEWURBAN' and source['editions'] == ['yr']
newurban_sets = {} if snow else coastal_set_indices(source)
extension, set_index = ('sno', 79) if snow else ('ubn', 112)
sea_recipe = read(args.sea_recipe)
bridges = set(newurban_sets) == {'ovrps07.ubn', 'ovrps09.ubn', 'ovrps12.ubn'}
if snow:
    extra = snow_coastal_extra_coverage(source, layout, sea_recipe['nativeExtraOwnership'])
elif bridges:
    extra = bridge_coastal_extra_coverage(source, layout, sea_recipe['nativeExtraOwnership'])
else:
    extra = {}
assert not args.output.exists()
args.output.mkdir()
records, images = {}, []
for member in source['members']:
    name, native_source = member['member'], member['native']
    if snow:
        assert name.startswith('wclifx') and name.endswith('.' + extension) and native_source['setIndex'] == set_index
    else:
        assert native_source['setIndex'] == newurban_sets[name]
    file = args.authoring / (name + '-native.png')
    native = np.asarray(Image.open(file).convert('RGBA'))
    mask = original_floor_water(native, native_source, layout[name], reference['colors'], extra.get(name))
    assert mask.any() and not (mask & (native[..., 3] == 0)).any()
    target = args.output / (name.replace('.', '-') + '.mask')
    target.write_bytes(mask.astype(np.uint8).tobytes())
    records[name] = dict(sourceSha256=native_source['sha256'],
        paletteSha256=native_source['palette']['sha256'], nativeAssemblySha256=sha(file),
        file=str(target.resolve()), sha256=sha(target), logical=list(native.shape[1::-1]),
        waterPixels=int(mask.sum()), sourceRgbUsedAsTexture=False)
    if bridges:
        records[name]['shoreContact'] = bridge_floor_contacts(source)[name]
    guide = native.copy()
    guide[mask, :3] = [20, 210, 255]
    image = Image.fromarray(guide).resize((native.shape[1]*4, native.shape[0]*4), Image.Resampling.NEAREST)
    images.append((name, image))
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 23)
boards = []
for start in range(0, len(images), 6):
    selected = images[start:start+6]
    board = Image.new('RGB', (1020, 600*((len(selected)+1)//2)), '#263a31')
    draw = ImageDraw.Draw(board)
    for index, (name, image) in enumerate(selected):
        x, y = index % 2 * 510, index // 2 * 600
        draw.text((x+12, y+10), name + ' / native role guide', font=font, fill='white')
        board.paste(image, (x+12, y+46), image)
    file = args.output / f'source-water-ownership-{start//6+1}.png'
    board.save(file)
    boards.append(dict(file=str(file.resolve()), sha256=sha(file)))
document = dict(schema='yr-source-pinned-coastal-sea-masks-v1',
    status='SOURCE_FLOOR_OWNERSHIP_VISUAL_REVIEW_PENDING', theater=source['theater'],
    paletteSha256=source['members'][0]['native']['palette']['sha256'],
    members=records, acceptedSea=sea_recipe['materialProfile']['acceptedShoreWater'],
    sourceRgbUsedAsTexture=False, sourceGuideOnly=True, boards=boards,
    nativeFloorPolicy='ORIGINAL_OPAQUE_PIXELS_WITHIN_MAIN_BLOCK_RECTANGLE',
    nativeColorPolicy='SOURCE_BLUE_CONTROLS_PLUS_PINNED_REFERENCE_WATER_COLORS',
    referenceWaterColors=dict(file=str(args.water_reference.resolve()), sha256=sha(args.water_reference)),
    geometryPolicy='Connected original blue/gray sea regions within height-zero main blocks, clipped by original opaque pixels. The exact native perimeter remains sea; small isolated blue rock samples and extra cliff faces retain cliff material.')
if snow or bridges:
    document['nativeExtraOwnership'] = sea_recipe['nativeExtraOwnership']
(args.output / 'index.json').write_text(json.dumps(document, indent=2) + '\n')
print(json.dumps(dict(members=len(records), waterPixels={name: row['waterPixels'] for name, row in records.items()},
                     output=str(args.output))))
