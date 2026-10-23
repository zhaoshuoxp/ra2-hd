"""Assemble immutable native reference geometry for the style experiment."""
import json
from pathlib import Path
from PIL import Image

root = Path('.artifacts/m2-1/authoring-v7')
source = json.loads((root / 'export-input.json').read_text())
members = {m['member']: m for g in source['groups'] for m in g['members']}
layouts = {}
board = Image.new('RGBA', (1254, 1254))
for index, name in enumerate(['cliff03.tem', 'cliff04.tem', 'ramp01.tem']):
    member = members[name]
    parts = []
    for image in member['images']:
        if member['nativeOffsets'][image['subTile']] <= 0:
            continue
        parts.append(dict(subTile=image['subTile'], rect=[image['origin'][0] + image['offset'][0],
            image['origin'][1] + image['offset'][1] - image['height'] * 15, *image['logical']]))
    left = min(p['rect'][0] for p in parts)
    top = min(p['rect'][1] for p in parts)
    width = max(p['rect'][0] + p['rect'][2] for p in parts) - left
    height = max(p['rect'][1] + p['rect'][3] for p in parts) - top
    assembled = Image.new('RGBA', (width, height))
    for part in sorted(parts, key=lambda p: p['rect'][1]):
        part['rect'][0] -= left
        part['rect'][1] -= top
        w, h = part['rect'][2:]
        raw = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{part['subTile']}.rgba"
        assembled.alpha_composite(Image.frombytes('RGBA', (w, h), raw.read_bytes()), tuple(part['rect'][:2]))
    layouts[name] = dict(bounds=[left, top, width, height], parts=parts, nativeAlphaBounds=assembled.getbbox(),
                        zeroOffsetSlots=[i for i, offset in enumerate(member['nativeOffsets']) if offset <= 0])
    assembled.save(root / f'{name}-native.png')
    if index < 2:
        scale = min(550 / width, 1100 / height)
        enlarged = assembled.resize((round(width * scale), round(height * scale)), Image.Resampling.NEAREST)
        board.alpha_composite(enlarged, (index * 627 + (627 - enlarged.width) // 2,
                                        (1254 - enlarged.height) // 2))
board.save(root / 'native-cliff-reference.png')
(root / 'assembly-layout.json').write_text(json.dumps(layouts, indent=2) + '\n')
print({name: row['bounds'] for name, row in layouts.items()})
