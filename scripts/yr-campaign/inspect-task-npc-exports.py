"""Build native-pixel 2X/4X inspection boards without changing exported artwork."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity', choices=['CAML', 'EINS', 'MUMY', 'RMNV', 'PENTGEN', 'DNOB'])
parser.add_argument('worklist', type=Path)
parser.add_argument('exports', nargs=2, type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
member, = json.loads(args.worklist.read_text())['families'][args.identity]['members']
source = json.loads(Path(member['sourceFile']).read_text())
assert source['schema'] == 'yr-original-task-infantry-slots-v1'
manifests = {json.loads((folder/'manifest.json').read_text())['density']:
    (folder/'manifest.json') for folder in args.exports}
assert set(manifests) == {2, 4}
frames = {}
for density, file in manifests.items():
    manifest = json.loads(file.read_text())
    assert manifest['identity'] == args.identity and manifest['sourceSha256'] == source['sha256']
    assert manifest['worklistSha256'] == sha(args.worklist)
    frames[density] = {frame['frame']: frame for frame in manifest['frames']}
assert set(frames[2]) == set(frames[4])
args.output.mkdir(parents=True, exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
boards = []
for batch in member['batches']:
    slots = [sample['frame'] for sample in batch['samples'] if sample['frame'] in frames[2]]
    if not slots:
        continue
    samples = []
    for slot in slots:
        pair = []
        for density in [2, 4]:
            frame = frames[density][slot]
            file = Path(frame['path'])
            assert sha(file) == frame['sha256']
            image = Image.open(file).convert('RGBA')
            assert image.size == tuple(value*density for value in source['canvas'])
            native = source['frames'][slot]
            x, y, w, h = [native[key]*density for key in ['x', 'y', 'width', 'height']]
            alpha = np.asarray(image)[..., 3].copy()
            alpha[y:y+h, x:x+w] = 0
            assert not alpha.any(), 'Authored pixels outside native trim'
            bounds = image.getchannel('A').getbbox()
            assert bounds, 'A required nonempty source frame is empty'
            pair.append(image.crop(bounds))
        samples.append((slot, pair))
    cell_width = max(max(sum(image.width for image in pair)+48 for _, pair in samples),
        max(int(font.getlength(f'{slot:03d}    2X / 4X'))+28 for slot, _ in samples))
    cell_height = max(max(image.height for image in pair)+64 for _, pair in samples)
    columns, rows = batch['grid']
    title = args.identity+' / '+batch['action']+' / actual export pixels'
    board_width = max(columns*cell_width, int(font.getlength(title))+30)
    board = Image.new('RGB', (board_width, rows*cell_height+48), (64, 82, 73))
    draw = ImageDraw.Draw(board)
    draw.text((14, 10), title, fill='white', font=font)
    for index, (slot, pair) in enumerate(samples):
        x, y = index%columns*cell_width+14, index//columns*cell_height+52
        draw.text((x, y), f'{slot:03d}    2X / 4X', fill='white', font=font)
        for image in pair:
            board.paste(image, (x, y+34), image)
            x += image.width+18
    file = args.output/(batch['id']+'.png')
    board.save(file)
    boards.append({'batch': batch['id'], 'file': str(file), 'sha256': sha(file),
        'frames': slots, 'size': list(board.size), 'resampling': 'NONE'})
report = {'schema': 'yr-task-npc-export-inspection-boards-v1', 'identity': args.identity,
    'status': 'BOARDS_READY_VISUAL_INSPECTION_PENDING', 'sourceSha256': source['sha256'],
    'worklistSha256': sha(args.worklist), 'densities': [2, 4],
    'manifestSha256': [sha(folder/'manifest.json') for folder in args.exports],
    'nativePoses': len(frames[2]), 'independentDensityFrames': 2*len(frames[2]),
    'completeSourceCoverage': set(frames[2]) == set(range(source['bodyFrames'])),
    'boards': boards, 'selectedResourcesChanged': 0, 'userVisualAcceptance': 'PENDING'}
(args.output/'boards.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({key: report[key] for key in ['status', 'nativePoses', 'completeSourceCoverage']}))
