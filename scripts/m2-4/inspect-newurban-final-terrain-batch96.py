"""Inspect all remaining originals beside accepted complete source candidates."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch95_io import assemble, crop, read

ROOT = Path('.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021')
PRIOR = Path('.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
donors = {(s['theater'], s['member']): s for s in
          read(PRIOR / 'accepted-native-donors-v1/source.json')['sources']}
rows = read(PRIOR / 'inventory-reconciliation-v1.json')['remainingGaps']
names = [r['member'] for r in rows if r['kind'] == 'tmp']
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
for part in range((len(names) + 4) // 5):
    values = names[part * 5:(part + 1) * 5]
    canvas = Image.new('RGB', (1400, len(values) * 300), (20, 28, 34))
    draw = ImageDraw.Draw(canvas)
    for row, name in enumerate(values):
        source = sources[name]
        frames = [(f, np.fromfile(GUIDE / 'native' / f['file'], np.uint8)
                   .reshape(*reversed(f['size']), 4))
                  for f in source['images'] if f['nativeOffset'] > 0]
        original, _ = assemble(frames)
        original = original.resize((original.width * 3, original.height * 3), Image.Resampling.NEAREST)
        original.thumbnail((445, 250))
        canvas.paste(original, (10, row * 300 + 35), original)
        draw.text((10, row * 300 + 5), name + ' / original x3', font=font, fill='white')
        donor = donors.get(('URBAN', name.replace('.ubn', '.urb')))
        if donor is None:
            donor = donors.get(('TEMPERATE', name.replace('.ubn', '.tem')))
        if donor:
            frames = [(f, np.fromfile(f['file'], np.uint8).reshape(*reversed(f['size']), 4))
                      for f in donor['images'] if f['nativeOffset'] > 0]
            native, _ = assemble(frames)
            native = native.resize((native.width * 3, native.height * 3), Image.Resampling.NEAREST)
            native.thumbnail((445, 250))
            canvas.paste(native, (475, row * 300 + 35), native)
            draw.text((475, row * 300 + 5), donor['member'] + ' / original', font=font, fill='white')
            hd, _ = assemble([(f, crop(donor['pointer'], donor['member'], f['subTile'], 4))
                              for f in donor['images'] if f['nativeOffset'] > 0], 4)
            hd.thumbnail((445, 250))
            canvas.paste(hd, (940, row * 300 + 35), hd)
            draw.text((940, row * 300 + 5), donor['member'] + ' / accepted HD', font=font, fill='white')
    canvas.save(ROOT / f'original-and-donor-inspection-part{part + 1}-v1.png')
print(dict(sources=len(names), pages=(len(names)+4)//5))
