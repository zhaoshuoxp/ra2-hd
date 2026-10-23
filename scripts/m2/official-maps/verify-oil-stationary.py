"""Verify actual atlases against independently stationary native pixels."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert not args.output.exists()
args.output.mkdir()
guide = Path('.artifacts/m2-3/native-guides-v3')
source = next(row for row in json.loads((guide/'source.json').read_text())['sources'] if row['member'] == 'ctoild_a.shp')
native = np.stack([np.frombuffer((guide/'native'/frame['indexFile']).read_bytes(), np.uint8)
                   .reshape(69, 61) for frame in source['frames'][:64]])
reference = Path('.local/environment-packs/environment-m2-3-gameplay-feedback-complete-v19')


def frames(root, member, density):
    folder = root/'members'/member.replace('.', '-')
    metadata = json.loads((folder/'manifest.json').read_text())
    variant = next(row for row in metadata['variants'] if row['density'] == density)
    pages = {row['id']: Image.open(folder/str(density)/row['id']/'base.png').convert('RGBA') for row in variant['pages']}
    result = {}
    for frame in variant['frames']:
        x, y, w, h = frame['contentRect']
        result[frame['nativeFrame']] = np.array(pages[frame['page']].crop((x, y, x+w, y+h)))
    return result


report = dict(status='RUNNING', cases=[], movingSource='New isolated walking-beam master; retained R7 drive material',
              stationarySource='Common R6 composed material; native stationary tank, support and floor samples')
for density in (2, 4):
    old = frames(args.before, 'ctoild_a.shp', density)
    new = frames(args.after, 'ctoild_a.shp', density)
    common = frames(reference, 'ctoild_a.shp', density)
    body = frames(args.after, 'ctoild.shp', density)
    for state in range(2):
        numbers = list(range(state*32, (state+1)*32))
        original = native[numbers]
        fixed = np.all(original == original[0], axis=0) & (original[0] != 0) & (original[0] != 12)
        y, x = np.indices(fixed.shape)
        gray = ((original[0] >= 32) & (original[0] <= 79)) | (original[0] == 15)
        # Tank behind the beam, support below its pivot, and the concrete floor.
        # Rotating drive material may change despite constant native palette values.
        structures = ((x < 24) & (y < 49) & gray) | ((x >= 20) & (x < 31) & (y >= 30)) | (y >= 54)
        fixed &= structures
        fixed = np.repeat(np.repeat(fixed, density, 0), density, 1)
        # Native mask fringes can lose coverage when neighboring foreground moves.
        # Transparent texels have zero RGB by contract and cannot be compared as visible art.
        visible = np.all(np.stack([old[n][..., 3] > 0 for n in numbers]), axis=0)
        fringes = int((fixed & ~visible).sum())
        fixed &= visible
        old_changed = np.any(np.stack([old[n][..., :3] for n in numbers]) != old[numbers[0]][..., :3], axis=(0, 3)) & fixed
        new_changed = np.any(np.stack([new[n][..., :3] for n in numbers]) != new[numbers[0]][..., :3], axis=(0, 3)) & fixed
        seam_error = np.any(new[numbers[0]][..., :3] != common[state*32][..., :3], axis=2) & fixed
        row = dict(density=density, state='normal' if state == 0 else 'damaged',
                   fixedPixels=int(fixed.sum()), nativeCoverageFringesExcluded=fringes,
                   r7MovingFixedPixels=int(old_changed.sum()),
                   r8MovingFixedPixels=int(new_changed.sum()), commonReferenceMismatchPixels=int(seam_error.sum()))
        report['cases'].append(row)
        assert old_changed.any(), 'R7 defect control did not exercise fixed material movement'
        assert not new_changed.any() and not seam_error.any(), row
        board = Image.new('RGBA', (4*664, 2*488), (28, 28, 28, 255))
        for cell, number in enumerate(numbers[::4]):
            canvas = Image.new('RGBA', (166*density, 122*density))
            canvas.alpha_composite(Image.fromarray(body[state]), (29*density, (12 if state == 0 else 26)*density))
            canvas.alpha_composite(Image.fromarray(new[number]), (75*density, 37*density))
            canvas = canvas.resize((664, 488), Image.Resampling.NEAREST)
            board.alpha_composite(canvas, ((cell%4)*664, (cell//4)*488))
        ImageDraw.Draw(board).text((12, 12), f"{row['state']} | {density}X | native composed poses", fill='white', font_size=24)
        board.save(args.output/f"oil-{row['state']}-{density}x.png")
report['status'] = 'PASS_NATIVE_STATIONARY_PIXELS_AND_COMMON_BODY_REGISTRATION'
(args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
