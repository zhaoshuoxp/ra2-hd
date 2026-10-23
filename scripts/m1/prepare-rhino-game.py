"""Copy accepted artwork unchanged and derive non-color team-paint selector data."""
import hashlib
import json
from pathlib import Path
from PIL import Image

source = Path('.artifacts/m1-3e/candidate-v1')
out = Path('.local/hd-packs/rhino-authored/1')
out.mkdir(parents=True, exist_ok=False)
hash_bytes = lambda b: hashlib.sha256(b).hexdigest()
accepted = json.loads((source / 'manifest.json').read_text())
inventory = json.loads(Path('.artifacts/m1-3/source-v1/inventory.json').read_text())
manifest = {'schemaVersion': 1, 'unit': 'HTNK', 'theater': 'TEMPERATE', 'size': [320, 288],
            'registration': [80, 72, -40, -46], 'parts': {},
            'sources': {p[k]['member']: p[k]['sha256'] for p in inventory['parts'] for k in ['source', 'hva']}}
for key, entry in accepted['parts'].items():
    data = (source / entry['file']).read_bytes()
    assert hash_bytes(data) == entry['sha256']
    (out / f'{key}.png').write_bytes(data)
    # Selector only: no authored base pixel is repainted or resampled. Reject
    # neutral metal and near-transparent extraction noise, soften hue boundary.
    pixels = list(Image.open(source / entry['file']).convert('RGBA').getdata())
    mask = bytes(round(255 * min(1, max(0, (r - max(g, b) - 12) / 24))) if a >= 16 else 0
                 for r, g, b, a in pixels)
    (out / f'{key}.mask').write_bytes(mask)
    manifest['parts'][key] = {'sha256': hash_bytes(data), 'maskSha256': hash_bytes(mask)}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
Path('src/engine/renderable/rhino/identity.ts').write_text(
    '// Pinned optional local pack; accepted base PNGs are unchanged.\n'
    + 'export const manifestHash = ' + json.dumps(hash_bytes((out / 'manifest.json').read_bytes())) + ';\n')
print(json.dumps({'parts': len(manifest['parts']), 'manifestHash': hash_bytes((out / 'manifest.json').read_bytes())}))
