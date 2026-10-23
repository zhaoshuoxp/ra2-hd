"""Package four authored parts at uniform scale; never paint or infer hidden artwork."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--revision', choices=['1', '2'], default='2')
args = parser.parse_args()
root = Path('.artifacts/m1-3d')
out = root / f'candidate-v{args.revision}'
out.mkdir(exist_ok=False)
# Reviewed source landmarks: center of flush hull bearing / turret lower bearing.
# Uniform physical scale only, no perspective warp, silhouette mask or generated color edit.
landmarks = {
    'body-0': ([711, 480], 52), 'body-90': ([738, 448], 52),
    'turret-0': ([613, 839], 39), 'turret-90': ([903, 877], 39),
}
if args.revision == '2':
    landmarks.update({'turret-0': ([572, 801], 39), 'turret-90': ([940, 837], 39)})
manifest = {'revision': args.revision, 'schemaVersion': 1, 'status': 'FOUR_COMBINATION_REVIEW_PENDING',
    'canvas': [64, 56], 'offset': [-32, -38], 'density': 4, 'bearing': [0, -9.5],
    'owner': 'Fixed reference red; other owners/colors use original family.',
    'parts': {}}
for name, (pivot, width) in landmarks.items():
    path = root / f'authoring-v{args.revision}' / f'{name}.png'
    raw = Image.open(path).convert('RGBA')
    # Use substantive alpha only for extent measurement; retain every source alpha in export.
    bbox = raw.getchannel('A').point(lambda a: 255 if a >= 8 else 0).getbbox()
    scale = width / (bbox[2] - bbox[0])
    pad = max(raw.size) * 2
    padded = Image.new('RGBA', (raw.width + 2 * pad, raw.height + 2 * pad))
    padded.paste(raw, (pad, pad))
    left = pivot[0] + (-32 - 0) / scale + pad
    top = pivot[1] + (-38 + 9.5) / scale + pad
    box = (left, top, left + 64 / scale, top + 56 / scale)
    exported = padded.convert('RGBa').resize((256, 224), Image.Resampling.LANCZOS, box=box).convert('RGBA')
    exported.save(out / f'{name}.png')
    manifest['parts'][name] = {'file': f'{name}.png', 'source': str(path), 'sourceSize': raw.size,
        'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'alphaBounds': bbox,
        'sourcePivot': pivot, 'uniformLogicalScale': scale,
        'sha256': hashlib.sha256((out / f'{name}.png').read_bytes()).hexdigest()}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
# Offline assembly is explicitly a reference only; runtime uses two independent world layers.
for b in [0, 90]:
    for t in [0, 90]:
        body = Image.open(out / f'body-{b}.png').convert('RGBA')
        body.alpha_composite(Image.open(out / f'turret-{t}.png').convert('RGBA'))
        body.save(out / f'reference-b{b}-t{t}.png')
print(json.dumps({'status': 'PACKAGED', 'output': str(out), 'parts': list(manifest['parts'])}))
