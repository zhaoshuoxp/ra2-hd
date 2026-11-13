"""Inspect actual exported pyramid parts at their unchanged original map anchors."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision', type=int)
parser.add_argument('density', type=int, choices=[2, 4])
parser.add_argument('state', type=int, choices=[0, 1, 2, 3])
parser.add_argument('output', type=Path)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-buildings'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
jobs = read(BASE / 'worklist-r1.json')['jobs']
placements = [('desert-caegyp06', 80, 97, 3), ('desert-caegyp01', 80, 101, args.state),
    ('desert-caegyp05', 84, 97, args.state), ('desert-caegyp04', 84, 101, args.state)]
parts, evidence = [], []
for name, x, y, frame in placements:
    job, = [job for job in jobs if job['name'] == name]
    source_file = Path(job['originalSource']['file'])
    assert sha(source_file) == job['originalSource']['sha256']
    original = read(source_file)
    source, = [source for source in original['sources'] if source['identity'] == job['identity']]
    revision = 1 if name.endswith('06') else args.revision
    file = ROOT / f'.artifacts/yr-campaign/task-{name}-stage-r{revision}/frames-{args.density}x' \
        / source['member'] / f'{frame:03d}.png'
    image = Image.open(file).convert('RGBA')
    position = ((x - y) * 30 - source['canvas'][0] // 2,
        (x + y) * 15 - source['canvas'][1] // 2)
    parts.append((image, position))
    evidence.append(dict(identity=job['identity'], tile=[x, y], frame=frame,
        sourceSha256=source['sha256'], file=str(file), sha256=sha(file), topLeft=position))
left = min(position[0] for _, position in parts)
top = min(position[1] for _, position in parts)
right = max(position[0] + image.width // args.density for image, position in parts)
bottom = max(position[1] + image.height // args.density for image, position in parts)
image = Image.new('RGBA', ((right - left) * args.density, (bottom - top) * args.density))
for part, position in parts:
    image.alpha_composite(part, ((position[0] - left) * args.density, (position[1] - top) * args.density))
bounds = image.getchannel('A').getbbox()
image = image.crop(bounds)
background = Image.new('RGBA', image.size, (35, 40, 46, 255))
background.alpha_composite(image)
assert not args.output.exists()
background.convert('RGB').save(args.output)
report = dict(status='OFFLINE_ACTUAL_EXPORT_COMPOSITE_NATIVE_CONFIRMATION_PENDING', density=args.density,
    state=args.state, originalMapSha256=sha(ROOT / '.local/campaign/yr/all04dmd/all04dmd.map'),
    scope='Unchanged tile projection, canvas-center anchors and trim origins. Common 4x4 foundation offsets cancel.',
    parts=evidence, bounds=bounds)
args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
