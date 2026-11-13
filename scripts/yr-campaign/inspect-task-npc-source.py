"""Lay out exact indexed source poses for reference review without altering HD artwork."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity', choices=['CAML', 'EINS', 'MUMY', 'RMNV', 'PENTGEN', 'DNOB'])
parser.add_argument('worklist', type=Path)
parser.add_argument('action')
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
member, = json.loads(args.worklist.read_text())['families'][args.identity]['members']
source_file = Path(member['sourceFile'])
source = json.loads(source_file.read_text())
assert source['schema'] == 'yr-original-task-infantry-slots-v1'
assert source['identity'] == args.identity and source['sha256'] == member['sourceSha256']
guide_file = Path(source['originalGuide']['file'])
assert sha(guide_file) == source['originalGuide']['sha256']
assert sha(guide_file.parent/'native'/source['member']) == source['sha256']
palette_file = guide_file.parent/'native'/source['paletteIdentity']['member']
assert sha(palette_file) == source['paletteIdentity']['sha256']
colors = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(int)*4
assert colors.tolist() == source['palette']
slots = [slot for slot in member['slots'] if any(row['action'] == args.action
    for row in slot['sequenceMembership'])]
assert slots
args.output.mkdir(parents=True, exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
boards = []
for offset in range(0, len(slots), 16):
    samples = []
    for slot in slots[offset:offset+16]:
        frame = source['frames'][slot['frame']]
        sprite = None
        if not slot['empty']:
            pixels = np.array(frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
            bounds = Image.fromarray(np.uint8((pixels != 0) & (pixels != 12))*255).getbbox()
            rgba = np.dstack([colors[pixels].astype(np.uint8), np.uint8(pixels != 0)*255])
            ground = pixels == 12
            ground[bounds[1]:bounds[3], bounds[0]:bounds[2]] = False
            rgba[ground] = 0
            native = Image.fromarray(rgba).crop(bounds)
            sprite = native.resize((native.width*2, native.height*2), Image.Resampling.NEAREST)
        samples.append((slot, sprite))
    width = max([image.width+32 for _, image in samples if image is not None]+[260])
    height = max([image.height+72 for _, image in samples if image is not None]+[120])
    title = f'{args.identity} / original {args.action} / 2X nearest reference only'
    board = Image.new('RGB', (max(width*4, int(font.getlength(title))+30),
        height*((len(samples)+3)//4)+50), (72, 88, 78))
    draw = ImageDraw.Draw(board)
    draw.text((14, 10), title, font=font, fill='white')
    for index, (slot, image) in enumerate(samples):
        x, y = 14+index%4*width, 54+index//4*height
        matches = [row for row in slot['sequenceMembership'] if row['action'] == args.action]
        text = f'{slot["frame"]:03d} / '+('empty' if slot['empty'] else
            ', '.join(f"f{row['facing']} p{row['phase']}" for row in matches))
        draw.text((x, y), text, font=font, fill='white')
        if image is not None:
            board.paste(image, (x, y+34), image)
    file = args.output/f'page-{offset//16+1}.png'
    board.save(file)
    boards.append({'file': str(file), 'sha256': sha(file),
        'slots': [slot['frame'] for slot, _ in samples], 'referenceScale': 2,
        'resampling': 'NEAREST_REFERENCE_ONLY'})
report = {'schema': 'yr-task-npc-original-source-inspection-v1', 'identity': args.identity,
    'action': args.action, 'status': 'SOURCE_REFERENCE_BOARDS_READY_INSPECTION_PENDING',
    'worklistSha256': sha(args.worklist), 'sourceFile': str(source_file),
    'sourceFileSha256': sha(source_file), 'sourceShpSha256': source['sha256'],
    'palette': source['paletteIdentity'], 'nativeSlots': len(slots), 'boards': boards,
    'hdArtworkChanged': 0, 'selectedResourcesChanged': 0, 'runtimeCredit': 'NONE'}
(args.output/'boards.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'status': report['status'], 'slots': len(slots), 'boards': len(boards)}))
