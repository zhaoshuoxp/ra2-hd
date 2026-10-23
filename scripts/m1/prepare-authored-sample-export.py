"""Export six review-only sprites at an explicit density with authorized deterministic image processing.

Remove the review board's green background before downsampling, intersect alpha
with original pixel coverage, and derive remap data from the authored red cloth.
No pose repair, missing-detail synthesis, runtime manifest or activation occurs.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image


def background_like(color):
    """Board-specific green matte; keep neutral black boots and metallic detail."""
    r, g, b = color[:3]
    return r < 85 and g >= r + 3 and b >= r + 1 and g >= b


def red_cloth(color):
    r, g, b = color[:3]
    return r > 40 and r > 1.5 * g and r > 1.3 * b


parser = argparse.ArgumentParser()
parser.add_argument('--art', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--source', type=Path, default=Path('.artifacts/m1-1/conscript-source.json'))
parser.add_argument('--selection', type=Path, default=Path('.artifacts/m1-1/art-review-v1/sample-selection.json'))
parser.add_argument('--density', type=int, choices=(2, 4, 10), default=2,
                    help='2x/4x resource candidates or 10x source-detail review only')
parser.add_argument('--user-authorized-image-processing', action='store_true')
args = parser.parse_args()
if not args.user_authorized_image_processing:
    parser.error('Local image editing must be explicitly authorized before this export is run.')
if '.artifacts' not in args.output.resolve().parts:
    parser.error('Review samples must stay under .artifacts, outside runtime hd-packs.')
art = Image.open(args.art).convert('RGB')
source = json.loads(args.source.read_text())
selection = json.loads(args.selection.read_text())
if art.size != (1536, 1024) or len(selection['samples']) != 6:
    parser.error('Expected the reviewed six-frame board.')
# Refuse before writing anything, preserving every earlier inspection/export.
args.output.mkdir(parents=True, exist_ok=False)
records = []
density = args.density
ramp = [color[0] for color in source['palette'][16:32]]
for sample in selection['samples']:
    frame = source['frames'][sample['nativeFrame']]
    cell_x, cell_y = sample['cell'][:2]
    left = cell_x + 56 + (frame['x'] - 18) * 10
    top = cell_y + 72 + (frame['y'] - 18) * 10
    crop = art.crop((left, top, left + frame['width'] * 10, top + frame['height'] * 10))
    matte = Image.new('RGBA', crop.size)
    matte.putdata([(*c, 0 if background_like(c) else 255) for c in crop.getdata()])
    # Pillow resamples RGBA with premultiplied alpha, avoiding green fringes.
    rgba = matte.resize((frame['width'] * density, frame['height'] * density), Image.Resampling.BOX)
    width = (frame['width'] + frame['width'] % 2) * density
    height = (frame['height'] + frame['height'] % 2) * density
    base = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    data = Image.new('RGBA', (width, height), (0, 0, 0, 255))
    alpha_sum = clipped_alpha_sum = remap_pixels = remap_outside = background_pixels = 0
    source_area = sum(bool(index) for index in frame['pixels']) * density ** 2
    remap_rows = [i // frame['width'] for i, value in enumerate(frame['pixels']) if 16 <= value <= 31]
    remap_band = [max(0, min(remap_rows) - 2) * density, (max(remap_rows) + 3) * density]
    for y in range(frame['height'] * density):
        for x in range(frame['width'] * density):
            index = frame['pixels'][(y // density) * frame['width'] + x // density]
            color = rgba.getpixel((x, y))
            if not index:
                clipped_alpha_sum += color[3]
                continue
            if not color[3]:
                continue
            base.putpixel((x, y), color)
            alpha_sum += color[3]
            background_pixels += int(background_like(color))
            if remap_band[0] <= y < remap_band[1] and red_cloth(color):
                shade = min(range(16), key=lambda i: abs(ramp[i] - color[0]))
                data.putpixel((x, y), (255, shade, 0, 255))
                remap_pixels += 1
                remap_outside += int(not 16 <= index <= 31)
    names = {}
    for role, image in [('base', base), ('data', data)]:
        name = f'frame-{frame["nativeFrame"]:03d}-{density}x-{role}.png'
        target = args.output / name
        image.save(target)
        names[role] = {'file': name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    records.append({'nativeFrame': frame['nativeFrame'], 'size': [width, height],
                    'trimOrigin': [frame['x'], frame['y']], 'files': names,
                    'alphaWeightedArea': round(alpha_sum / 255, 2), 'sourceAreaAtDensity': source_area,
                    'sourceCoverageRetained': round(alpha_sum / (255 * source_area), 4),
                    'clippedAuthoredAreaAtDensity': round(clipped_alpha_sum / 255, 2),
                    'backgroundLikePixels': background_pixels, 'remapPixels': remap_pixels,
                    'remapBandYAtDensity': remap_band,
                    'authoredRemapPixelsOutsideOriginalRemap': remap_outside})
report = {'kind': 'six-frame-review-export-not-an-hd-pack', 'source': source['source'],
          'approvedArt': str(args.art), 'artSha256': hashlib.sha256(args.art.read_bytes()).hexdigest(),
          'density': density, 'sourceBoardDensity': 10,
          'densityPurpose': 'source-detail-review-only' if density == 10 else 'resource-candidate-review',
          'frames': records, 'status': 'REQUIRES_VISUAL_AND_REMAP_REVIEW',
          'activationAllowed': False,
          'method': 'green-matte removal, premultiplied BOX downsample, original-coverage intersection, authored-red remap within source shoulder band',
          'limitations': ['Original geometry and coverage limits are retained; authored poses may be clipped.',
                          'Matte and red-cloth extraction are board-specific heuristics, not semantic segmentation.',
                          'No missing detail or displaced ammunition is repaired by this conversion.',
                          'Full art and actual-match acceptance remain incomplete.']}
(args.output / 'review-export.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
