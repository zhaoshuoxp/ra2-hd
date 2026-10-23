"""Inventory every native visible slot and prepare unactivated authoring batches."""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path('.artifacts/lunar-infantry')
source = json.loads((root / 'source-v1/lunr.shp.json').read_text())
inventory = json.loads((root / 'source-v1/inventory.json').read_text())
out = root / 'production-plan-v1'
out.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 24)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
frames = source['frames'][:source['totalFrames']//2]
membership = [[] for _ in frames]
for action, value in inventory['sequences'].items():
    start, count, stride = map(int, value.split(',')[:3])
    for facing in range(8 if stride else 1):
        for phase in range(count):
            index = start + stride*facing + phase
            assert 0 <= index < len(frames), (action, index)
            membership[index].append(dict(action=action, facing=facing, phase=phase))
unique, slots = {}, []
for f in frames:
    key = (f['width'], f['height'], f['sha256'])
    first = unique.setdefault(key, f['frame'])
    slots.append(dict(frame=f['frame'], canonicalFrame=first, trim=[f['x'], f['y'], f['width'], f['height']],
                      sourceSha256=f['sha256'], sequences=membership[f['frame']], empty=f['empty']))
groups = {}
for index in unique.values():
    action = membership[index][0]['action'] if membership[index] else 'NativeExtra'
    groups.setdefault(action, []).append(index)
batches = []
for action, indices in groups.items():
    for offset in range(0, len(indices), 12):
        ids = indices[offset:offset+12]
        columns = min(4, len(ids)); rows = math.ceil(len(ids)/columns)
        board = Image.new('RGB', (columns*384, rows*384), (65,75,65))
        draw = ImageDraw.Draw(board)
        for n, index in enumerate(ids):
            f = frames[index]
            pixels = np.array(f['pixels'], np.uint8).reshape(f['height'], f['width'])
            rgba = np.zeros((*pixels.shape, 4), np.uint8)
            rgba[..., :3] = np.array(source['palette'], np.uint8)[pixels]
            rgba[..., 3] = ((pixels != 0) & (pixels != 12)) * 255
            sprite = Image.fromarray(rgba); sprite = sprite.crop(sprite.getbbox())
            scale = min(7, 285/sprite.width, 300/sprite.height)
            sprite = sprite.resize((round(sprite.width*scale), round(sprite.height*scale)), Image.Resampling.NEAREST)
            x, y = n%columns*384, n//columns*384
            board.paste(sprite, (x+(384-sprite.width)//2, y+45+(320-sprite.height)//2), sprite)
            draw.text((x+16,y+12), f'FRAME {index:03d}', font=font, fill='white')
        name = f'{len(batches):02d}-{action.lower()}-{ids[0]:03d}-{ids[-1]:03d}'
        reference = out / (name+'.png'); board.save(reference)
        prompt = (f'Native animation authoring for LUNR Lunar Infantry. Image 1 is the exact pose reference; image 2 is the proposed unit style reference. '
                  f'Redraw EXACTLY {len(ids)} figures in a {columns} by {rows} grid, row-major frames {ids}. '
                  'Preserve every native camera facing, action phase, silhouette, proportions, weapon direction and handedness. '
                  'Use the same silver/white astronaut suit, rounded dark-visored helmet, red team-color equipment, twin silver rocket cylinders and compact laser weapon. '
                  'No duplicate static poses in place of distinct actions. Flying figures remain airborne; falling and dying poses must follow their own reference. '
                  'Use detailed painted-realistic materials, consistent upper-left lighting and crisp tiny-scale readability. '
                  'Figures centered in cells with 12 percent margin, no clipping or overlap. Pure opaque flat magenta RGB255,0,255 background, '
                  'no labels, text, grid lines, ground shadows, blood, scenery or invented effects. Leave unused cells entirely magenta. '
                  'Native references control pose; the style sheet only controls material identity. Do not turn back views into fronts.')
        (out/(name+'.txt')).write_text(prompt+'\n')
        batches.append(dict(id=name, action=action, grid=[columns,rows], frames=ids,
                            reference=str(reference), referenceSha256=sha(reference), prompt=str(out/(name+'.txt')),
                            status='AWAITING_REPRESENTATIVE_DECISION'))
receipt = dict(status='COMPLETE_NATIVE_WORKLIST_NOT_ACTIVATED', source=source['sha256'],
               visibleFrames=len(frames), originalShadowFrames=source['totalFrames']//2,
               uniqueFrames=len(unique), slots=slots, batches=batches, runtimeActivation=False)
(out/'worklist.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['slots','batches']} | {'batches':len(batches)}))
