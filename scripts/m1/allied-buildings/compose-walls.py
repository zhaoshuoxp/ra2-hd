"""Compose the native sixteen connection masks from authored rigid wall parts."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, indices, register, sheet_cells, export_frames, sha

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
assert theater in ('TEMPERATE', 'SNOW')
row = row_for('GAWALL', theater)
member = row['members'][0]
source = ROOT / 'production-art-v1/GAWALL' / ('snow-parts-raw.png' if theater == 'SNOW' else 'parts-raw.png')
cells = sheet_cells(Image.open(source).convert('RGBA'), 3, 3)
size = tuple(v * DENSITY for v in member['canvas'])
blank = lambda: Image.new('RGBA', size)
frames, operations = {}, []
for damage in range(3):
    # Native straight frames 5 and 10 have no tall junction post. The
    # four arms keep their fixed material coordinates and are occluded at
    # the native junction; no connection resizes an entire building.
    parts = [register(cells[damage * 3 + i], member['canvas'],
                      decode(row, member, damage * 16 + n).getbbox())[0]
             for i, n in enumerate((0, 5, 10))]
    arms = {}
    for bit, axis, x0, x1 in ((1, 1, 38, 78), (4, 1, 0, 39),
                              (2, 2, 38, 78), (8, 2, 0, 39)):
        arm = blank()
        arm.paste(parts[axis].crop((x0 * DENSITY, 0, x1 * DENSITY, size[1])), (x0 * DENSITY, 0))
        arms[bit] = arm
    for connection in range(16):
        n = damage * 16 + connection
        if connection in (5, 10):
            image = parts[1 if connection == 5 else 2].copy()
        else:
            image = blank()
            for bit in (1, 8):
                if connection & bit:
                    image.alpha_composite(arms[bit])
            image.alpha_composite(parts[0])
            for bit in (2, 4):
                if connection & bit:
                    image.alpha_composite(arms[bit])
        mask = Image.fromarray(np.uint8(indices(member, n) != 0) * 255)
        mask = mask.filter(ImageFilter.MaxFilter(3)).resize(size, Image.Resampling.LANCZOS)
        image.putalpha(Image.fromarray(np.uint8(np.array(image.getchannel('A'), float) * np.array(mask) / 255)))
        frames[member['source']['member'], n] = image
        operations.append({'frame': n, 'damageLevel': damage, 'connectionBits': connection,
                           'partTranslation': [0, 0], 'wholeBuildingScale': [1, 1]})
out = ROOT / 'full-exports-v1' / ('GAWALL' if theater == 'TEMPERATE' else 'GAWALL-SNOW')
export_frames(row, frames, out, {'authoredParts': str(source), 'authoredPartsSha256': sha(source),
                               'operations': operations, 'animation': 'Native connection and damage selection'})
print(theater, len(frames), 'complete wall frames')
