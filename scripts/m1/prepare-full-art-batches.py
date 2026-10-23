"""Prepare deterministic native-pose boards for complete Conscript art authoring."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if '.artifacts' not in args.output.resolve().parts:
    parser.error('Local source derivatives must remain under .artifacts.')
args.output.mkdir(parents=True, exist_ok=False)
source = json.loads(Path('.artifacts/m1-1/conscript-source.json').read_text())
style = Path('.artifacts/m1-1/art-review-v1/conscript-samples-v3.png')
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 25)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
groups = [('standing', 0, 7), ('walking', 8, 55), ('idle-one', 56, 70), ('idle-two-and-extra', 71, 85),
          ('crawl-and-prone', 86, 133), ('death-one', 134, 148), ('death-two', 149, 163),
          ('standing-fire', 164, 211), ('prone-fire', 212, 259), ('go-prone', 260, 275),
          ('stand-up', 276, 291), ('paradrop-and-cheer', 292, 300)]
batches = []
for group, first, last in groups:
    for start in range(first, last + 1, 12):
        ids = list(range(start, min(start + 12, last + 1)))
        batch_id = f'{group}-{ids[0]:03d}-{ids[-1]:03d}'
        folder = args.output / batch_id
        folder.mkdir()
        board = Image.new('RGB', (1536, 1024), (41, 51, 47))
        draw = ImageDraw.Draw(board)
        samples = []
        for n, fid in enumerate(ids):
            f = source['frames'][fid]
            x, y = (n % 4) * 384, (n // 4) * 341
            scale = min(8, math.floor(340 / f['width']), math.floor(280 / f['height']))
            left = x + (384 - f['width'] * scale) // 2
            top = y + 48 + (280 - f['height'] * scale) // 2
            sprite = Image.new('RGBA', (f['width'], f['height']))
            sprite.putdata([(*source['palette'][i], 255) if i != 0 else (0, 0, 0, 0) for i in f['pixels']])
            sprite = sprite.resize((f['width'] * scale, f['height'] * scale), Image.Resampling.NEAREST)
            board.paste(sprite, (left, top), sprite)
            draw.text((x + 24, y + 16), f'FRAME / {fid:03d}', fill='white', font=font)
            samples.append({'nativeFrame': fid, 'cell': [x, y, 384, 341], 'contentOrigin': [left, top],
                            'sourceScale': scale, 'sourceTrim': [f['x'], f['y'], f['width'], f['height']]})
        for n in range(len(ids), 12):
            draw.text(((n % 4) * 384 + 16, (n // 4) * 341 + 16), 'UNUSED - LEAVE EMPTY', fill='#9bab9f', font=small)
        board.save(folder / 'native-poses.png')
        prompt = f'''Use case: precise-object-edit / consistent game sprite production.
Image 1 is the EDIT TARGET, a 1536x1024 native-pose board. Image 2 is the approved character STYLE REFERENCE only.
Produce exactly the same 1536x1024 board as Image 1, preserving its four-column/three-row cells, labels, spacing and {len(ids)} occupied cells. Leave unused cells empty. Native frame IDs: {', '.join(f'{i:03d}' for i in ids)}. Action group: {group}.
Repaint only the occupied soldier sprites in Image 1 with the same detailed pre-rendered RTS character as Image 2: gray steel helmet, bright red team-color shoulder/chest cloth in original locations, closed tan/brown greatcoat, black boots, dark belt/backpack and rifle. Preserve the native source facing, camera angle, pose, limb arrangement, rifle orientation, silhouette size, body proportions, foot position and exact on-board position separately in EVERY cell. Back-facing frames MUST remain back-facing; profile remains profile. Do not substitute the reference's frontal pose. Each phase is distinct, not a duplicate.
Use the detail and materials of Image 2: crisp helmet highlights, cloth seams and folds, readable hands and rifle, black boots. Render newly authored fine detail, not enlargement or smoothing of original pixels. Same costume, lighting and body model across every frame.
Falling firing particles are small crisp metallic brass ammunition, NOT smoke or gray puffs. Preserve their original locations and counts. Crawl/prone poses stay horizontal near the ground. Transition and death poses exactly follow each source silhouette; non-graphic fully dressed fictional game sprites only. Do not add gore, props, scenery, cast shadows, extra people, muzzle flames or new effects.
Keep flat background RGB(41,51,47), all cell labels and all sprite positions unchanged. No textured backdrop, glow, gradient or vignette. This is a pose-controlled production board for later deterministic crop and transparency processing; do not rearrange or beautify the layout.
'''
        (folder / 'prompt.txt').write_text(prompt)
        metadata = {'id': batch_id, 'group': group, 'size': [1536, 1024], 'samples': samples,
                    'status': 'AWAITING_AUTHORING', 'activationAllowed': False}
        (folder / 'batch.json').write_text(json.dumps(metadata, indent=2) + '\n')
        batches.append(metadata)
assert sorted(s['nativeFrame'] for b in batches for s in b['samples']) == list(range(301))
manifest = {'kind': 'complete-authoring-worklist-not-a-pack', 'source': source['source'],
            'styleReference': str(style), 'styleSha256': hashlib.sha256(style.read_bytes()).hexdigest(),
            'sampleAcceptance': 'User approved artwork and corrected resolution review; proceed to complete member.',
            'approvedSampleFrames': [0, 2, 8, 11, 164, 167], 'batches': batches,
            'visibleFrameCount': 301, 'activationAllowed': False, 'fullArtAcceptance': 'PENDING'}
(args.output / 'worklist.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'batches': len(batches), 'frames': 301, 'root': str(args.output)}))
