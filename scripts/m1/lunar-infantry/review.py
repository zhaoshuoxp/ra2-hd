"""Build an offline representative review; never activate incomplete unit artwork."""
import base64
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_cells import isolated_cells

root = Path('.artifacts/lunar-infantry')
out = root / 'review-v1'
out.mkdir(exist_ok=False)
source = json.loads((root / 'source-v1/lunr.shp.json').read_text())
master = root / 'authoring-v1/unit-master.png'
rgba = np.array(Image.open(master).convert('RGBA')).astype(float)
key = np.minimum(rgba[..., 0], rgba[..., 2]) - rgba[..., 1]
coverage = np.clip(1 - key / 255, 0, 1)
coverage[key > 180] = 0
rgba[..., :3] = np.divide(rgba[..., :3] - (1 - coverage[..., None]) * [255, 0, 255],
                         np.maximum(coverage[..., None], .01))
rgba[..., 3] *= coverage
cells = isolated_cells(Image.fromarray(np.uint8(np.clip(rgba, 0, 255))), 2, 2, 4)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def embed(p):
    return 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()

rows, records = [], []
for index, (fid, label) in enumerate([(0, 'Back'), (2, 'Left profile'), (4, 'Front'), (319, 'Airborne three-quarter')]):
    frame = source['frames'][fid]
    indices = np.array(frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
    body = Image.fromarray(((indices != 0) & (indices != 12)).astype(np.uint8) * 255).getbbox()
    width, height = body[2] - body[0], body[3] - body[1]
    detail = cells[index][0]
    for density in [2, 4]:
        assert detail.width >= width * density and detail.height >= height * density
        target = out / f'unit-{index}-{density}x.png'
        detail.convert('RGBa').resize((width * density, height * density), Image.Resampling.LANCZOS).convert('RGBA').save(target)
        records.append(dict(kind='representative', frame=fid, density=density,
                            file=str(target), sha256=sha(target), nativeBodySize=[width, height]))
    native = np.zeros((*indices.shape, 4), np.uint8)
    native[..., :3] = np.array(source['palette'], np.uint8)[indices]
    native[..., 3] = (indices != 0) * 255
    native_path = out / f'native-{fid}.png'
    Image.fromarray(native).crop(body).save(native_path)
    detail_path = out / f'unit-{index}-master.png'
    detail.save(detail_path)
    rows.append(f'<article><h3>{label}</h3><div class="compare"><div>Original<br><img class="pixel" src="{embed(native_path)}" width="{width*4}" height="{height*4}"></div>'
                f'<div>4X sample<br><img src="{embed(out/f"unit-{index}-4x.png")}"></div>'
                f'<div>Native logical size<br><img src="{embed(out/f"unit-{index}-4x.png")}" width="{width}" height="{height}"></div></div></article>')
cameo = Image.open(root / 'authoring-v1/cameo-master.png').convert('RGBA')
for density in [2, 4]:
    target = out / f'lunricon-{density}x.png'
    cameo.resize((60*density, 48*density), Image.Resampling.LANCZOS).save(target)
    records.append(dict(kind='cameo', density=density, file=str(target), sha256=sha(target)))
normal = json.loads((root / 'source-v1/lunricon.shp.json').read_text())['frames'][0]['pixels']
rank = json.loads((root / 'source-v1/lunruico.shp.json').read_text())['frames'][0]['pixels']
diff = (np.array(normal) != np.array(rank)).reshape(48, 60)
outside = diff.copy(); outside[:13, :21] = False
assert not outside.any(), 'Veteran icon is not a rank-only alias'
receipt = dict(status='REPRESENTATIVE_REVIEW_PENDING', runtimeActivation=False,
               sourceSha256=source['sha256'], visibleSlots=435, uniqueNativeFrames=305,
               nativeShadowSlots=435, masterSha256=sha(master),
               cameoMasterSha256=sha(root / 'authoring-v1/cameo-master.png'),
               exports=records, rankAlias=dict(id='lunruico.shp', base='lunricon.shp', changedPixels=int(diff.sum())),
               limitation='Four style and density samples only. Native per-frame production, remap and gameplay validation remain pending.')
(out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
html = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Lunar Infantry HD Review R1</title>
<style>body{{background:#182021;color:#eee;font:18px system-ui;max-width:1180px;margin:32px auto;padding:0 24px}}h1{{font-size:32px}}h2{{font-size:25px}}h3{{font-size:21px}}article{{background:#303b36;padding:20px;margin:18px 0}}.compare{{display:flex;align-items:center;gap:50px;min-height:180px}}.pixel{{image-rendering:pixelated}}.board{{max-width:100%;max-height:780px}}img{{object-fit:contain}}p{{line-height:1.5}}</style>
<h1>Lunar Infantry HD — Representative Review R1</h1>
<p>LUNR only. Four authored unit views and a normal/rank cameo pair. These are direction and sampling proofs, not a completed 435-frame runtime family. Native rules, shadows, camera and timing remain unchanged.</p>
<h2>Unit samples</h2>{''.join(rows)}
<h2>Cameo</h2><article class="compare"><div>Original<br><img class="pixel" width="240" height="192" src="{embed(root/'references-v1/lunricon.png')}"></div><div>4X<br><img src="{embed(out/'lunricon-4x.png')}"></div><div>Native size<br><img width="60" height="48" src="{embed(out/'lunricon-4x.png')}"></div></article>
<h2>Authoring reference</h2><img class="board" src="{embed(master)}">
<p>Created with the built-in image generation tool. Full sequence authoring, owner-color masks, both density atlases, actual-match checks and a new Mac test ZIP follow the representative decision. The existing accepted Desktop package is preserved.</p></html>'''
(out / 'Lunar-Infantry-Review-R1.html').write_text(html)
print(json.dumps(dict(status=receipt['status'], images=len(records), review=str(out/'Lunar-Infantry-Review-R1.html'))))
