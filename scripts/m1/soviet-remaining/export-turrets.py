"""Register accepted upper-part artwork to isolated native renderer captures."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from production import ROOT, area, bounds

root = ROOT / 'turret-exports-v1'
root.mkdir(exist_ok=False)
captures = ROOT / 'turret-part-registration-v1'
report = json.loads((captures / 'result.json').read_text())
dependencies = json.loads((ROOT / 'dependencies-v1.json').read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
headings = list(range(0, 360, 45))
canvas = (80, 90); offset = (-40, -70); density = 2
for name in ['NALASR', 'NAFLAK']:
    target = root / name; target.mkdir()
    source = ROOT / 'art-v1' / name / ('motion-r2-raw.png' if name == 'NAFLAK' else 'motion-raw.png')
    sheet = Image.open(source).convert('RGBA'); info = report['families'][name]
    frames = []
    for i, heading in enumerate(headings):
        image = Image.open(captures / name / f'{heading}.png').convert('RGBA')
        rgb = np.array(image)[..., :3].astype(int)
        coverage = np.max(np.abs(rgb - [52, 72, 61]), axis=2) > 15
        y, x = np.where(coverage)
        assert len(x) > 30
        native_box = [x.min(), y.min(), x.max() + 1, y.max() + 1]
        sx, sy = image.width / info['crop'][2], image.height / info['crop'][3]
        box = [(native_box[0] / sx + info['crop'][0] - info['pivotScreen'][0] - offset[0]),
               (native_box[1] / sy + info['crop'][1] - info['pivotScreen'][1] - offset[1]),
               (native_box[2] / sx + info['crop'][0] - info['pivotScreen'][0] - offset[0]),
               (native_box[3] / sy + info['crop'][1] - info['pivotScreen'][1] - offset[1])]
        cell_box = [round(i % 4 * sheet.width / 4), round(i // 4 * sheet.height / 2),
                    round((i % 4 + 1) * sheet.width / 4), round((i // 4 + 1) * sheet.height / 2)]
        cell = sheet.crop(cell_box); cell = cell.crop(bounds(cell))
        source_density = min(cell.width / (box[2] - box[0]), cell.height / (box[3] - box[1]))
        assert source_density >= density
        output = Image.new('RGBA', (canvas[0] * density, canvas[1] * density))
        rectangle = [round(v * density) for v in box]
        assert 0 <= rectangle[0] < rectangle[2] <= output.width and 0 <= rectangle[1] < rectangle[3] <= output.height
        output.alpha_composite(area(cell, (rectangle[2] - rectangle[0], rectangle[3] - rectangle[1])), tuple(rectangle[:2]))
        pixels = np.array(output); r, g, b = [pixels[..., k].astype(float) for k in range(3)]
        mask = np.uint8((r > g * 1.5) & (r > b * 1.5) & (pixels[..., 3] > 0)) * 255
        base = target / f'{heading}.png'; data = target / f'{heading}.mask'
        output.save(base); data.write_bytes(mask.tobytes())
        frames.append(dict(heading=heading, base=base.name, baseSha256=sha(base), baseBytes=base.stat().st_size,
            mask=data.name, maskSha256=sha(data), maskBytes=data.stat().st_size,
            nativeBox=[int(v) for v in native_box], registeredBox=box, sourceCell=cell_box, sourceDensity=source_density))
    manifest = dict(schemaVersion=1, family=name, theater='TEMPERATE', density=density, canvas=canvas, offset=offset,
        registrationSource=str(captures / 'result.json'), registrationSha256=sha(captures / 'result.json'),
        artworkSource=str(source), artworkSha256=sha(source), headings=frames,
        sources={entry['member']:entry['sha256'] for part in dependencies[name]['parts'] for entry in part['files'] if 'sha256' in entry},
        gpuBytes=len(headings) * canvas[0] * canvas[1] * density * density * 5 + 4,
        behavior='Eight authored heading bins follow the native turret pivot and rotation; native weapon timing and muzzle effects retained')
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(name, '8 native-pivot registrations', manifest['gpuBytes'], 'bytes', flush=True)
