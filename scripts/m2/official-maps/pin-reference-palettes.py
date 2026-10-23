"""Create new rubble reference boards using their actual native theater palette."""
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha

root = Path('.artifacts/m2-3')
prepared = root / 'native-guides-v3'
folder = root / 'authoring-shp-v3'
work = json.loads((folder / 'worklist.json').read_text())
contract = json.loads((root / 'environment-contract-v1.json').read_text())
plan = json.loads((root / 'authoring-jobs-v2.json').read_text())
sources = {s['member']: s for s in json.loads((prepared / 'source.json').read_text())['sources']}
corrections = []
for job in plan['jobs']:
    if job['format'] != 'shp':
        continue
    batch = next(b for b in work['batches'] if b['name'] == job['id'])
    selected = [(key, work['slots'][key]) for key in batch['slots'] if str(work['slots'][key]['nativeSlot'])
                in contract['sources'][work['slots'][key]['member']].get('framePalettes', {})]
    if not selected:
        continue
    board = Image.open(job['reference']).convert('RGBA')
    for key, info in selected:
        frame = sources[info['member']]['frames'][info['nativeSlot']]
        palette = contract['sources'][info['member']]['framePalettes'][str(info['nativeSlot'])]
        file = prepared / 'native' / (palette['sha256'] + '.pal')
        assert sha(file) == palette['sha256']
        colors = np.frombuffer(file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4
        file = prepared / 'native' / frame['indexFile']
        assert sha(file) == frame['indexSha256']
        index = np.frombuffer(file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
        alpha = np.uint8((index != 0) & (index != 12)) * 255
        sprite = Image.fromarray(np.dstack([colors[index].astype(np.uint8), alpha])).crop(info['nativeBounds'])
        x, y, width, height = info['slotRect']
        board.paste((0, 0, 0, 0), (x, y, x + width, y + height))
        px, py, pw, ph = info['referenceRect']
        board.alpha_composite(sprite.resize((pw, ph), Image.Resampling.NEAREST), (px, py))
        corrections.append(dict(key=key, nativeIndexSha256=frame['indexSha256'], palette=palette))
    file = folder / (job['id'] + '-palette-pinned-reference.png')
    assert not file.exists()
    board.save(file)
    job['reference'] = str(file.resolve())
    job['referenceSha256'] = sha(file)
    job['referencePolicy'] = 'Declared native frame palettes; no changes to geometry or immutable source bytes'
plan['paletteCorrections'] = corrections
(root / 'authoring-jobs-v3.json').open('x').write(json.dumps(plan, indent=2) + '\n')
print(json.dumps(dict(correctedSlots=len(corrections), jobs=len(plan['jobs']))))
