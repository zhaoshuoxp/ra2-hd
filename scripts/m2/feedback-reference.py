"""Prepare native artwork references; this script does not author replacement art."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path('.artifacts/m2-1/authoring-v5')
groups = json.loads((root / 'export-input.json').read_text())['groups']
members = {m['member']: m for group in groups for m in group['members']}


def native(name, slot=0):
    member = members[name]
    size = member['images'][slot]['logical']
    file = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{slot}.rgba"
    return Image.frombytes('RGBA', tuple(size), file.read_bytes())


material = Image.new('RGB', (1254, 1254))
for index, name in enumerate(['clear01.tem', 'green01.tem', 'sandy01.tem', 'dlat08.tem']):
    image = np.asarray(native(name))
    v, u = np.indices((627, 627), dtype=float) / 626
    x = np.clip(np.rint(30 * (u - v + 1)), 0, 59).astype(int)
    y = np.clip(np.rint(15 * (u + v)), 0, 29).astype(int)
    pixels = image[y, x, :3].copy()
    covered = image[y, x, 3] > 0
    pixels[~covered] = pixels[covered].mean(axis=0).astype(np.uint8)
    material.paste(Image.fromarray(pixels), ((index % 2) * 627, (index // 2) * 627))
material.save(root / 'native-material-reference.png')

slopes = Image.new('RGBA', (1254, 1254))
for index, name in enumerate(['slope01.tem', 'slope02.tem', 'slope03.tem', 'slope04.tem']):
    image = native(name)
    image = image.resize((image.width * 9, image.height * 9), Image.Resampling.NEAREST)
    slopes.paste(image, ((index % 2) * 627 + (627 - image.width) // 2,
                         (index // 2) * 627 + (627 - image.height) // 2), image)
slopes.save(root / 'native-slopes-reference.png')

layout = {}
name = 'ramp01.tem'
member = members[name]
parts = []
for slot, image in enumerate(member['images']):
    if member['nativeOffsets'][slot] <= 0:
        continue
    x = image['origin'][0] + image['offset'][0]
    y = image['origin'][1] + image['offset'][1] - image['height'] * 15
    parts.append(dict(subTile=slot, rect=[x, y, *image['logical']]))
left = min(p['rect'][0] for p in parts)
top = min(p['rect'][1] for p in parts)
right = max(p['rect'][0] + p['rect'][2] for p in parts)
bottom = max(p['rect'][1] + p['rect'][3] for p in parts)
assembly = Image.new('RGBA', (right - left, bottom - top))
for part in sorted(parts, key=lambda p: p['rect'][1]):
    part['rect'][0] -= left
    part['rect'][1] -= top
    image = native(name, part['subTile'])
    assembly.alpha_composite(image, tuple(part['rect'][:2]))
layout[name] = dict(bounds=[left, top, assembly.width, assembly.height], parts=parts,
                    nativeAlphaBounds=assembly.getbbox(),
                    zeroOffsetSlots=[i for i, offset in enumerate(member['nativeOffsets']) if offset <= 0])
scale = min(1152 / assembly.width, 1152 / assembly.height)
expanded = assembly.resize((round(assembly.width * scale), round(assembly.height * scale)), Image.Resampling.NEAREST)
board = Image.new('RGBA', (1254, 1254))
board.paste(expanded, ((1254 - expanded.width) // 2, (1254 - expanded.height) // 2), expanded)
board.save(root / 'native-ramp-assembly-reference.png')
(root / 'assembly-layout.json').write_text(json.dumps(layout, indent=2) + '\n')
print(json.dumps(layout))
