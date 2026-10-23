"""Incrementally replace only the exposed central shaft in immutable R6 slots."""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image
from production_common import ROOT, row_for
from central_grinder import replace_column

previous = ROOT / 'feedback-r6/grinder-volume-exports-v2'
output = ROOT / sys.argv[1]

for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        source = previous / f'YAGRND-{theater}-{density}x'
        target = output / source.name
        shutil.copytree(source, target)
        report = json.loads((source / 'candidate-review.json').read_text())
        native = row_for('YAGRND', theater)
        body_member = next(m['source']['member'] for m in native['members'] if 'body' in m['roles'])
        active_member = next(m['source']['member'] for m in native['members'] if 'ACTIVE' in m['roles'])
        def expand(row, data=False):
            image = Image.new('RGBA', (320 * density, 220 * density), (0, 0, 0, 255) if data else (0, 0, 0, 0))
            file = row['data' if data else 'base']
            if file:
                image.paste(Image.open(source / file), (row['native']['x'] * density, row['native']['y'] * density))
            return image
        fixed = [expand(next(r for r in report['frames'] if r['member'] == body_member and r['nativeFrame'] == n))
                 for n in (0, 1)]
        changed = 0
        for row in report['frames']:
            member, n = row['member'], row['nativeFrame']
            if not row['base'] or member not in (body_member, active_member):
                continue
            if member == body_member and n > 1:
                continue
            damage = n >= 48 if member == active_member else n == 1
            phase = min(46, n - 49) if damage and n >= 49 else 0 if damage else n if member == active_member else 0
            image, transform = replace_column(expand(row), fixed[int(damage)], density, phase, damage, expand(row, True))
            rect = tuple(row['native'][k] * density for k in ('x', 'y'))
            size = Image.open(source / row['base']).size
            image.crop((*rect, rect[0] + size[0], rect[1] + size[1])).save(target / row['base'])
            row['operation'] += '; separate solid central shaft rotates about its vertical axle with foreground masking'
            report['localPartTransforms'].append(transform)
            changed += 1
        report['centralColumn'] = dict(bounds=[150, 79, 169, 111], axis=[0, 1, 0],
            reference='feedback-r7/original-actions-v1/YAGRND-native-complete-intake.webm',
            slotSchedule='Native 0..47 / 49..95; fixed endpoint and native foreground/effect occlusion',
            limitation='One revolution is a candidate phase mapping; Original occluded phases do not establish its exact hidden angular speed.')
        (target / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
        print(theater, density, changed, 'central slots updated; all other files copied unchanged', flush=True)
