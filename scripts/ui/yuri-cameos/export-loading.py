"""Add a full Yuri loading background without changing any accepted cameo bytes."""
from pathlib import Path
from PIL import Image
import hashlib
import io
import json
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / '.artifacts/yuri-cameos/loading-followup-v1'
PACK = ROOT / '.local/ui-packs/yuri-cameos-e-loading-v1'
PRIOR = ROOT / '.local/ui-packs/yuri-cameos-e-v5'
sha = lambda data: hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        assert path.read_bytes() == data, f'Immutable output differs: {path}'
    else:
        path.write_bytes(data)


def save_json(path, data):
    save(path, (json.dumps(data, indent=2) + '\n').encode())


source = Path(sys.argv[1])
raw = source.read_bytes()
image = Image.open(io.BytesIO(raw)).convert('RGBA')
assert image.width > 800 and image.height > 600 and image.width * 3 == image.height * 4
assert image.getchannel('A').getextrema() == (255, 255)
assert image.width * image.height * 4 <= 16 * 1024 * 1024
save(OUT / 'service-output.png', raw)
buf = io.BytesIO()
image.save(buf, format='PNG')
data = buf.getvalue()
save(OUT / 'loading-background-yuri-master.png', data)
old_bytes = (PRIOR / 'manifest.json').read_bytes()
old = json.loads(old_bytes)
assert len(old['assets']) == 473
for name in {a['file'] for a in old['assets']} | {v['file'] for v in old.get('menuVideo', {}).values()}:
    save(PACK / name, (PRIOR / name).read_bytes())
entry = dict(id='loading-background-yuri', file='loading-background-yuri.png', width=image.width,
             height=image.height, logicalWidth=800, logicalHeight=600, sha256=sha(data))
assert entry['id'] not in {a['id'] for a in old['assets']}
save(PACK / entry['file'], data)
manifest = dict(old, revision=PACK.name, assets=old['assets'] + [entry])
save_json(PACK / 'manifest.json', manifest)
selection = dict(schemaVersion=1, revision=PACK.name, sha256=sha((PACK / 'manifest.json').read_bytes()), reviewOnly=True)
save_json(OUT / 'selection.json', selection)
save_json(OUT / 'pack-delta.json', dict(schemaVersion=1, taskId='E', edition='yr',
    expectedPredecessorRevision=old['revision'], expectedPredecessorSha256=sha(old_bytes),
    additions=[dict(entry, operation='ADD', expectedPredecessor=None)], acceptedEntriesPreserved=473))
receipt = dict(schemaVersion=1, taskId='E', generation='built-in imagegen', serviceOutput=str(source),
    serviceOutputSha256=sha(raw), master=str((OUT / 'loading-background-yuri-master.png').relative_to(ROOT)),
    masterSha256=sha(data), nativeSource='.artifacts/yuri-cameos/loading-followup-v1/native-source.json',
    dimensions=list(image.size), logicalDimensions=[800, 600], decodedBytes=image.width * image.height * 4,
    density=image.width / 800, resampling='NONE: authored image is used directly',
    manifest=str((PACK / 'manifest.json').relative_to(ROOT)), manifestSha256=selection['sha256'],
    selection=selection, acceptedCameosChanged=False, priorCanonicalVisualAcceptance=True,
    loadingArtworkVisualAcceptance='PENDING', nativeArchivesCopied=False)
save_json(OUT / 'export-receipt.json', receipt)
print(json.dumps(dict(entries=len(manifest['assets']), dimensions=list(image.size),
                     decodedBytes=receipt['decodedBytes'], acceptedEntriesPreserved=473)))
