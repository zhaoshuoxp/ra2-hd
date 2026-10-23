"""Verify Tesla depth-only repair against the delivered component rasters."""
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
    old, new = before[key], after[key]
    folder = args.output / key
    folder.mkdir()
    changed, probes, old_violations = [], 0, 0
    for phase, (previous, current) in enumerate(zip(old['phases'], new['phases'])):
        def layers(nodes):
            return {n['name']: place(Image.open(n['image']), n['box'], [160, 126]) for n in nodes}
        a, b = layers(previous), layers(current)
        for name in a:
            if not name.startswith('red-support-'):
                assert name in b and np.array_equal(a[name], b[name]), (key, phase, name)
        old_support = np.zeros((504, 640, 4), np.uint8)
        new_support = old_support.copy()
        for name, layer in a.items():
            if name.startswith('red-support-'):
                old_support = over(layer, old_support)
        # Restore the former left-rear, left-front, right-combined crop order.
        for name in ['red-support-rear-left', 'red-support-front-left',
                     'red-support-rear-right', 'red-support-front-right']:
            if name in b:
                new_support = over(b[name], new_support)
        assert np.array_equal(old_support, new_support), (key, phase, 'support geometry changed')
        images = []
        for nodes in [a, b]:
            canvas = np.zeros((504, 640, 4), np.uint8)
            for layer in nodes.values():
                canvas = over(layer, canvas)
            images.append(canvas)
        diff = np.any(images[0] != images[1], axis=-1)
        if diff.any():
            changed.append({'phase': phase, 'differentPixels': int(diff.sum())})
        if phase < 10 or phase >= 20:
            assert not diff.any(), (key, phase, 'outside repair interval')
        if 10 <= phase < 20:
            names = list(b)
            central = [i for i, n in enumerate(names) if n in ['center-shaft', 'spherical-conductor'] or n.startswith('coil-tier-')]
            for name in ['red-support-rear-left', 'red-support-rear-right']:
                if name in b:
                    assert names.index(name) < min(central)
            for name in ['red-support-front-left', 'red-support-front-right']:
                if name in b:
                    assert names.index(name) > max(central)
            sphere = b.get('spherical-conductor', np.zeros_like(images[0]))
            rear = np.zeros_like(images[0])
            front = rear.copy()
            for name, layer in b.items():
                if name.startswith('red-support-rear-'):
                    rear = over(layer, rear)
                elif name.startswith('red-support-front-'):
                    front = over(layer, front)
            # Resampling stores the conductor interior at alpha 250..254.
            # Check actual high-coverage pixels, not an empty alpha-255 set.
            mask = (sphere[..., 3] >= 250) & (rear[..., 3] > 8) & (front[..., 3] == 0)
            if mask.any():
                # Any background can contribute at most (1 - sphere alpha)
                # in linear light, plus one output quantization step.
                limit = (1 - sphere[mask, 3:4] / 255) + .005
                color = linearize(sphere[mask, :3] / 255)
                error = np.abs(linearize(images[1][mask, :3] / 255) - color)
                assert np.all(error <= limit), (key, phase, 'rear support covers sphere')
                old_error = np.abs(linearize(images[0][mask, :3] / 255) - color)
                old_violations += int(np.any(old_error > limit, axis=-1).sum())
            probes += int(mask.sum())
        Image.fromarray(images[1]).save(folder / f'{phase:02}-preview.png')
        if key == 'tesla' and 10 <= phase < 20:
            sheet = Image.new('RGB', (1280, 550), (52, 72, 61))
            draw = ImageDraw.Draw(sheet)
            for i, (frame, label) in enumerate(zip(images, ['V26 before', 'V27 corrected depth'])):
                img = Image.fromarray(frame)
                sheet.paste(img, (i * 640, 46), img)
                draw.text((i * 640 + 20, 8), f'{label} / phase {phase}', font_size=28)
            sheet.save(args.output / f'comparison-{phase:02}.png')
    assert changed and probes > 0 and old_violations > 0, (key, 'No covered sphere pixels exercised')
    rows.append({'key': key, 'changedPhases': changed, 'highCoverageSphereOcclusionProbes': probes,
                 'previousIncorrectForegroundPixels': old_violations,
                 'supportPixelsAndTrajectories': 'EXACT', 'otherComponentPixelsAndPositions': 'EXACT',
                 'phases0Through9And20Through24': 'EXACT'})
write(args.output / 'report.json', {'status': 'PASS_REAR_SUPPORT_DEPTH_AND_UNCHANGED_COMPONENT_GEOMETRY',
    'before': str(args.before), 'beforeSha256': sha(args.before), 'after': str(args.after),
    'afterSha256': sha(args.after), 'rows': rows, 'visualAcceptance': 'PENDING'})
print('Both theaters: support geometry exact, rear supports behind sphere and central components')
