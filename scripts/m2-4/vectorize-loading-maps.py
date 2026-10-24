"""Trace source country maps and flags into scalable, palette-exact UI paths."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('originals', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--dependencies', type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.dependencies.resolve()))
import cv2
import numpy as np

args.output.mkdir(exist_ok=False)
entries = json.loads((args.originals / 'inventory.json').read_text())
manifest = {}
for entry in entries:
    if 'country' not in entry or entry['country'] in ('Observer', 'YuriCountry'):
        continue
    raw = (args.originals / entry['file']).read_bytes()
    image = np.frombuffer(raw, np.uint8).reshape(entry['height'], entry['width'], 4)
    # Keep the generated silver outer border; the source country UI occupies this inset.
    region = image[8:592, 448:790, :3]
    colors = np.unique(region.reshape(-1, 3), axis=0)
    paths = []
    for color in colors:
        mask = (np.all(region == color, axis=2).astype(np.uint8) * 255)
        mask = cv2.resize(mask, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        commands = []
        for contour in contours:
            points = cv2.approxPolyDP(contour, .6, True).reshape(-1, 2)
            if len(points) < 3:
                continue
            coordinates = points.astype(float) / 2 + [.25, 8.25]
            commands.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in coordinates) + 'Z')
        if commands:
            paths.append({'color': '#' + ''.join(f'{int(x):02x}' for x in color), 'd': ''.join(commands)})
    name = f"loading-map-{entry['edition']}-{entry['country'].lower()}.json"
    payload = {'bounds': [448, 8, 342, 584], 'paths': paths}
    encoded = (json.dumps(payload, separators=(',', ':')) + '\n').encode()
    (args.output / name).write_bytes(encoded)
    manifest[f"{entry['edition']}/{entry['country']}"] = {
        'file': name, 'sha256': hashlib.sha256(encoded).hexdigest(), 'bytes': len(encoded),
        'source': entry['source'], 'sourceSha256': entry['sha256'],
        'palette': entry['palette'], 'paletteSha256': entry['paletteSha256'], 'colors': len(paths),
    }
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'countries': len(manifest), 'bytes': sum(x['bytes'] for x in manifest.values())}))
