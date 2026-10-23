"""Make original-geometry controls and accepted HD references, without selection."""
import numpy as np
from PIL import Image, ImageDraw
from newurban_batch93_io import ROOT, GUIDE, assemble, crop, native, pin, read, write

prep = read(ROOT / 'road-reuse-preparation-v1.json')
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
names = ['proad01.ubn', 'proad05.ubn', 'proad10.ubn', 'proad17.ubn', 'proad18.ubn',
         'proad21.ubn', 'proadc03.ubn', 'p_end03.ubn', 'prslpe01.ubn']
files = []
for name in names:
    row, = [r for r in prep['records'] if r['targetMember'] == name]
    target = sources[name]
    a, _ = assemble([(i, np.fromfile(i['rgba']['file'], np.uint8).reshape(*reversed(i['size']), 4))
                     for i in row['images'] if i['nativeOffset'] > 0])
    b, _ = assemble([(i, native(target, i)) for i in target['images'] if i['nativeOffset'] > 0])
    panels = [a, b]
    height = max(p.height for p in panels) * 3 + 42
    width = max(p.width for p in panels) * 3 + 24
    board = Image.new('RGB', (width * 2, height), '#101820')
    draw = ImageDraw.Draw(board)
    for n, picture in enumerate(panels):
        picture = picture.resize((picture.width * 3, picture.height * 3), Image.Resampling.NEAREST)
        board.paste(picture, (n * width + 10, 36), picture)
        draw.text((n * width + 10, 10), f'{name}: {"Temperate original" if n == 0 else "NewUrban original"}', fill='white')
    file = ROOT / (name + '-original-assembly.png')
    board.save(file)
    files.append(pin(file))
    hd, _ = assemble([(i, crop(prep['acceptedTemperate'], row['donorMember'], i['subTile'], 4))
                      for i in row['images'] if i['nativeOffset'] > 0], 4)
    bg = Image.new('RGBA', hd.size, '#101820')
    bg.alpha_composite(hd)
    file = ROOT / (name + '-accepted-temperate-4x.png')
    bg.convert('RGB').save(file)
    files.append(pin(file))
write(ROOT / 'whole-member-original-inspection-v1.json', dict(status='ORIGINAL_AND_ACCEPTED_REFERENCE_ONLY_NO_NEW_COVERAGE',
    preparation=pin(ROOT / 'road-reuse-preparation-v1.json'), files=files,
    windows='NOT_RUN', m24Complete=False))
print(dict(referenceMembers=len(names), files=len(files)))
