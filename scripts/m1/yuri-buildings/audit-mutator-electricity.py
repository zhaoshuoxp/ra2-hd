"""Verify building electricity continuity and unchanged peer/native state pixels."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from production_common import ROOT, sha

exports, previous, output = map(Path, sys.argv[1:4])
assert not output.exists()
checks = []
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        name = f'YAGNTC-{theater}-{density}x'
        current, old = exports / name, previous / name
        review = json.loads((current / 'candidate-review.json').read_text())
        frames = []
        for record in review['frames']:
            n, member = record['nativeFrame'], record['member']
            changed = (member.endswith('_f.shp') and n % 31 in range(1, 15)) or (
                member.endswith('_h.shp') and n % 31 in range(30))
            if record['base'] is None:
                assert record['data'] is None and record['native']['empty'] and not changed
                frames.append({'member': member, 'nativeFrame': n, 'changed': False,
                               'purplePixels': 0, 'fixedColor': True})
                continue
            same_base = sha(current / record['base']) == sha(old / record['base'])
            same_data = sha(current / record['data']) == sha(old / record['data'])
            assert same_base != changed, (name, member, n, 'unexpected material changes or missing arc')
            if not changed and not (member.endswith('_f.shp') and n % 31 >= 15):
                assert same_data, (name, member, n, 'unrelated owner mask changed')
            image = np.array(Image.open(current / record['base']).convert('RGBA'))
            data = np.array(Image.open(current / record['data']).convert('RGBA'))
            red, green, blue = np.moveaxis(image[..., :3].astype(float), 2, 0)
            purple = (image[..., 3] >= 8) & (red > green * 1.4) & (blue > green * 1.4) & (blue > 100)
            purple &= red <= 2.5 * np.maximum(green, blue)
            assert not data[..., 0][purple].any(), (member, n, 'electricity must retain its fixed color')
            if changed:
                assert purple.sum() > density * density * 3, (member, n, 'invisible open-state electricity')
            if member.endswith('_h.shp') and n % 31 == 30:
                assert not purple.any(), 'No electricity may remain after the emitter closes'
            frames.append({'member': member, 'nativeFrame': n, 'changed': changed, 'dataChanged': not same_data,
                           'purplePixels': int(purple.sum()), 'fixedColor': True})
        checks.append({'theater': theater, 'density': density, 'slots': len(frames),
                       'changedSlots': sum(r['changed'] for r in frames),
                       'unchangedSlots': sum(not r['changed'] for r in frames), 'frames': frames})

# This contact sheet uses original 2X buffers, without rescaling their pixels.
canvas = Image.new('RGB', (1620, 1096), '#24372f')
draw = ImageDraw.Draw(canvas)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 28)
poses = [('yggntc_f.shp', 7, 'Opening F7'), ('yggntc_h.shp', 0, 'Released / raised H0'),
         ('yggntc_h.shp', 30, 'Closed H30')]
for row, parent in enumerate([previous, exports]):
    folder = parent / 'YAGNTC-TEMPERATE-2x'
    review = json.loads((folder / 'candidate-review.json').read_text())
    for column, (member, n, label) in enumerate(poses):
        record = next(r for r in review['frames'] if (r['member'], r['nativeFrame']) == (member, n))
        image = Image.open(folder / record['base']).convert('RGBA')
        origin = record['native']; x = column * 540; y = row * 548
        canvas.paste(image, (x + origin['x'] * 2, y + 54 + origin['y'] * 2), image)
        draw.text((x + 12, y + 12), ('Before: ' if row == 0 else 'Corrected: ') + label, font=font, fill='white')
preview = output.with_suffix('.png')
assert not preview.exists(); canvas.save(preview)
report = {'status': 'PASS_BUILDING_ELECTRICITY_CONTINUITY_AND_INCREMENTAL_PIXELS', 'checks': checks,
          'changedSlots': sum(r['changedSlots'] for r in checks),
          'unchangedSlots': sum(r['unchangedSlots'] for r in checks),
          'originalChargedBasePixels': 'BYTE_IDENTICAL', 'closedPixels': 'BYTE_IDENTICAL',
          'arcSource': 'Original charged SHP purple/white contours, fitted to the native moving emitter',
          'preview': str(preview.resolve()), 'boundary': 'Export pixels only; actual copied-app phases require native verification'}
output.write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], report['changedSlots'], 'changed;', report['unchangedSlots'], 'unchanged slots')
