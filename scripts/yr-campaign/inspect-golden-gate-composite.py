"""Inspect bridge art at its original source-map anchors, without world edits."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--density', type=int, choices=[2, 4], default=2)
parser.add_argument('--state', type=int, choices=[0, 1, 2], default=0)
parser.add_argument('--mode', choices=['original', 'masters', 'exports'], default='exports')
parser.add_argument('--stage', type=Path)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-buildings'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
source_file = BASE / 'original-batch-1-all01umd/source.json'
original = read(source_file)
placements = [('04', 66, 99), ('09', 75, 99), ('10', 72, 99), ('11', 69, 99),
    ('12', 63, 99), ('13', 60, 99), ('14', 57, 99)]
parts, evidence = [], []
for number, x, y in placements:
    identity = 'CASANF' + number
    source, = [row for row in original['sources'] if row['identity'] == identity]
    frame = source['frames'][args.state]
    native_file = source_file.parent / 'native' / frame['png']
    native = Image.open(native_file).convert('RGBA')
    if args.mode == 'exports':
        assert args.stage
        file = args.stage / f'frames-{args.density}x' / source['member'] / f'{args.state:03d}.png'
        image = Image.open(file).convert('RGBA')
    else:
        image = Image.new('RGBA', tuple(value * args.density for value in source['canvas']))
        if args.mode == 'original':
            file = native_file
            subject = native.resize(tuple(value * args.density for value in native.size), Image.Resampling.NEAREST)
            at = frame['origin']
        else:
            folder = BASE / ('newurban-casanf' + number)
            selected_file = folder / 'selected-states-r1.json'
            canonical = read(folder / 'original-state-plan-r1.json')['states'][args.state]['canonical']
            file = ROOT / read(selected_file)['masters'][str(canonical)]['file'] if selected_file.exists() \
                else folder / 'masters-r1' / f'frame-{canonical}.png'
            master = Image.open(file).convert('RGBA')
            bounds = master.getchannel('A').point(lambda a: 255 if a >= 4 else 0).getbbox()
            box = native.getchannel('A').getbbox()
            subject = master.crop(bounds).convert('RGBa').resize(
                ((box[2] - box[0]) * args.density, (box[3] - box[1]) * args.density), Image.Resampling.LANCZOS).convert('RGBA')
            at = [frame['origin'][0] + box[0], frame['origin'][1] + box[1]]
        image.alpha_composite(subject, tuple(value * args.density for value in at))
    position = ((x - y) * 30 - source['canvas'][0] // 2, (x + y) * 15 - source['canvas'][1] // 2)
    parts.append((image, position))
    evidence.append(dict(identity=identity, tile=[x, y], frame=args.state, sourceSha256=source['sha256'],
        file=str(file), sha256=sha(file), canvasTopLeft=position))
left = min(at[0] for _, at in parts)
top = min(at[1] for _, at in parts)
right = max(at[0] + image.width // args.density for image, at in parts)
bottom = max(at[1] + image.height // args.density for image, at in parts)
canvas = Image.new('RGBA', ((right - left) * args.density, (bottom - top) * args.density))
# Original source buildings are ordered by their map-depth projection.
for image, at in sorted(parts, key=lambda part: sum(part[1])):
    canvas.alpha_composite(image, ((at[0] - left) * args.density, (at[1] - top) * args.density))
bounds = canvas.getchannel('A').point(lambda a: 255 if a >= 4 else 0).getbbox()
canvas = canvas.crop(bounds)
background = Image.new('RGBA', canvas.size, (35, 40, 46, 255))
background.alpha_composite(canvas)
assert not args.output.exists()
args.output.parent.mkdir(parents=True, exist_ok=True)
background.convert('RGB').save(args.output)
report = dict(status='DIAGNOSTIC_COMPOSITE_NOT_SOURCE_ACTOR_LIFECYCLE', mode=args.mode,
    density=args.density, state=args.state, parts=evidence, bounds=bounds,
    sourceJsonSha256=sha(source_file), originalMapSha256=original['missionSha256'],
    qualification='All source bodies, including the original zero-health CASANF10, are drawn only in this offline asset inspection. Native source initialization removes that member. Original world geometry and health are unchanged.')
args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(output=str(args.output), size=list(canvas.size), mode=args.mode)))
