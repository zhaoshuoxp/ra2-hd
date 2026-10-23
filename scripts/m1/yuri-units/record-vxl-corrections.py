"""Pin reviewed heading overrides with true 4x detail and native provenance."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image
from authored_slots import isolated_cells

p = argparse.ArgumentParser()
p.add_argument('folder', type=Path)
p.add_argument('generated', type=Path)
p.add_argument('--inputs-file', type=Path, required=True)
p.add_argument('--note', required=True)
p.add_argument('--headings', nargs='+', type=int, help='Select only reviewed cells from this correction board')
a = p.parse_args()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
m = json.loads((a.folder / 'manifest.json').read_text())
wl = Path(m['worklist'])
w = json.loads(wl.read_text())
b = next(b for b in w['boards'] if b['id'] == m['boardId'])
assert sha(Path(b['selectedArt'])) == m['previousMasterSha256'] == b['selectedArtSha256']
assert sha(Path(b['board'])) == m['sourceBoardSha256']
image = Image.open(a.generated).convert('RGBA')
assert image.getchannel('A').getextrema()[0] == 0
cells = isolated_cells(image, *m['grid'], occupied=len(m['headings']))
selected = a.headings or m['headings']
assert set(selected).issubset(m['headings'])
checks = []
for heading, (detail, _) in zip(m['headings'], cells, strict=True):
    f = next(f for f in b['frames'] if f['heading'] == heading)
    x0, y0, x1, y1 = f['sourceBounds']
    density = min(detail.width / ((x1 - x0) / f['ratio']), detail.height / ((y1 - y0) / f['ratio']))
    assert density >= 4, (heading, density)
    checks.append({'heading': heading, 'availableDensity': density})
inputs = json.loads(a.inputs_file.read_text())
prompt = Path(inputs['promptFile'])
references = [{'path': s, 'sha256': sha(Path(s))} for s in inputs['referencedImagePaths']]
output = a.folder / 'authored-v1.png'
assert not output.exists()
shutil.copyfile(a.generated, output)
receipt = {'path': str(output.resolve()), 'sha256': sha(output), 'grid': m['grid'],
           'occupied': len(cells), 'note': a.note, 'promptFile': str(prompt),
           'promptSha256': sha(prompt), 'references': references, 'densityChecks': checks}
for i, heading in enumerate(m['headings']):
    if heading in selected:
        b.setdefault('authoredFrameOverrides', {})[str(heading)] = {**receipt, 'index': i}
b['pendingCorrectionHeadings'] = [h for h in b.get('pendingCorrectionHeadings', []) if h not in selected]
if not b['pendingCorrectionHeadings']:
    b.update(visualQa='PASS', status='AUTHORED_HEADINGS_REVIEWED')
wl.write_text(json.dumps(w, indent=2) + '\n')
(a.folder / 'selection.json').write_text(json.dumps({**m, **receipt}, indent=2) + '\n')
print(json.dumps({'board': b['id'], 'headings': selected, 'minimumDensity': min(c['availableDensity'] for c in checks)}))
