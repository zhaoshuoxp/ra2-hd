"""Check the conductor's two-sided column occlusion and preserved support depth."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from buildup import read, write, sha
from painted_rig import linearize, over, place

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
before, after = read(args.before), read(args.after)
rows = []
for key in ['tesla', 'tesla-snow']:
    folder = args.output / key
    folder.mkdir()
    changed, column_probes, shell_probes, previous_errors = [], 0, 0, 0
    for phase, (previous, current) in enumerate(zip(before[key]['phases'], after[key]['phases'])):
        def layers(nodes):
            return {n['name']: place(Image.open(n['image']), n['box'], [160, 126]) for n in nodes}
        def composite(parts):
            result = np.zeros((504, 640, 4), np.uint8)
            for layer in parts:
                result = over(layer, result)
            return result
        a, b = layers(previous), layers(current)
        for name in a:
            if name != 'spherical-conductor':
                assert name in b and np.array_equal(a[name], b[name]), (key, phase, name)
        old_image, new_image = composite(a.values()), composite(b.values())
        if 'spherical-conductor' in a:
            rear, front = b['spherical-conductor-rear'], b['spherical-conductor-front']
            assert np.array_equal(over(front, rear), a['spherical-conductor']), (key, phase, 'sphere geometry changed')
            names = list(b)
            central_names = [n for n in names if n in ['center-shaft', 'retained-lower-insulator',
                'completed-lower-assembly'] or n.startswith('coil-tier-')]
            assert names.index('spherical-conductor-rear') < min(names.index(n) for n in central_names)
            assert names.index('spherical-conductor-front') > max(names.index(n) for n in central_names)
            for n in names:
                if n.startswith('red-support-rear-'):
                    assert names.index(n) < names.index('spherical-conductor-rear')
                elif n.startswith('red-support-front-'):
                    assert names.index(n) > names.index('spherical-conductor-front')
            central = composite(b[n] for n in central_names)
            supports = composite(v for n, v in b.items() if n.startswith('red-support-front-'))
            column_mask = (rear[..., 3] > 8) & (central[..., 3] >= 250) & (front[..., 3] == 0) & (supports[..., 3] == 0)
            shell_mask = (front[..., 3] >= 250) & (central[..., 3] > 8) & (supports[..., 3] == 0)
            for mask, foreground in [(column_mask, central), (shell_mask, front)]:
                if not mask.any():
                    continue
                # A high-coverage foreground bounds any background contribution
                # in linear light. Allow two output quantization steps.
                limit = 1 - foreground[mask, 3:4] / 255 + .01
                color = linearize(foreground[mask, :3] / 255)
                error = np.abs(linearize(new_image[mask, :3] / 255) - color)
                assert np.all(error <= limit), (key, phase, 'incorrect axial depth')
                if foreground is central:
                    old_error = np.abs(linearize(old_image[mask, :3] / 255) - color)
                    previous_errors += int(np.any(old_error > limit, axis=-1).sum())
            column_probes += int(column_mask.sum())
            shell_probes += int(shell_mask.sum())
        delta = np.any(old_image != new_image, axis=-1)
        if delta.any():
            changed.append({'phase': phase, 'pixels': int(delta.sum())})
        if phase < 10 or phase >= 22:
            assert not delta.any(), (key, phase, 'outside axial transit')
        Image.fromarray(new_image).save(folder / f'{phase:02}-preview.png')
        if key == 'tesla' and 10 <= phase < 22:
            sheet = Image.new('RGB', (1280, 550), (52, 72, 61))
            draw = ImageDraw.Draw(sheet)
            for i, (frame, label) in enumerate(zip([old_image, new_image], ['V27 before', 'V28 axial transit'])):
                image = Image.fromarray(frame)
                sheet.paste(image, (i * 640, 46), image)
                draw.text((i * 640 + 20, 8), f'{label} / phase {phase}', font_size=28)
            sheet.save(args.output / f'comparison-{phase:02}.png')
    assert column_probes > 0 and shell_probes > 0 and previous_errors > 0
    rows.append({'key': key, 'changedPhases': changed, 'columnInFrontOfRearShellPixels': column_probes,
        'frontShellOverColumnPixels': shell_probes, 'previousWrongForegroundPixels': previous_errors,
        'sphereGeometryAndTrajectory': 'EXACT', 'otherComponentsAndSupportDepth': 'EXACT',
        'phases0Through9And22Through24': 'EXACT'})
write(args.output / 'report.json', {'status': 'PASS_TWO_SIDED_COLUMN_TRANSIT_AND_SUPPORT_DEPTH',
    'before': str(args.before), 'beforeSha256': sha(args.before), 'after': str(args.after),
    'afterSha256': sha(args.after), 'rows': rows, 'visualAcceptance': 'PENDING'})
print('Both theaters: column passes through sphere; geometry, trajectory and support depth preserved')
