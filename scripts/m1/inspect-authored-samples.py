"""Read-only alpha and alignment checks for the six M1.1 authored sample cells."""
import argparse
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat

parser = argparse.ArgumentParser()
parser.add_argument('candidate', type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--source', type=Path, default=Path('.artifacts/m1-1/conscript-source.json'))
parser.add_argument('--selection', type=Path, default=Path('.artifacts/m1-1/art-review-v1/sample-selection.json'))
args = parser.parse_args()
source = json.loads(args.source.read_text())
selection = json.loads(args.selection.read_text())
image = Image.open(args.candidate).convert('RGBA')
report = {'candidate': str(args.candidate), 'purpose': 'Read-only six-frame asset-readiness probe; not art acceptance',
          'size': list(image.size), 'expectedSize': [1536, 1024], 'frames': [], 'failures': []}
if image.size != (1536, 1024):
    report['failures'].append('canvas-size-mismatch')
else:
    alpha = image.getchannel('A')
    report['alphaExtrema'] = list(alpha.getextrema())
    if alpha.getextrema()[0] != 0:
        report['failures'].append('no-fully-transparent-background')
    allowed = Image.new('L', image.size)
    allowed_draw = ImageDraw.Draw(allowed)
    for sample in selection['samples']:
        frame = source['frames'][sample['nativeFrame']]
        ox, oy, width, height = sample['cell']
        expected = Image.new('L', (width, height))
        draw = ImageDraw.Draw(expected)
        for y in range(frame['height']):
            for x in range(frame['width']):
                if frame['pixels'][y * frame['width'] + x]:
                    px = 56 + (frame['x'] + x - 18) * 10
                    py = 72 + (frame['y'] + y - 18) * 10
                    draw.rectangle((px, py, px + 9, py + 9), fill=255)
        left = ox + 56 + (frame['x'] - 18) * 10
        top = oy + 72 + (frame['y'] - 18) * 10
        allowed_draw.rectangle((left, top, left + frame['width'] * 10 - 1,
                                top + frame['height'] * 10 - 1), fill=255)
        actual = alpha.crop((ox, oy, ox + width, oy + height)).point(lambda value: 255 if value >= 128 else 0)
        expected_count = ImageStat.Stat(expected).sum[0] / 255
        actual_count = ImageStat.Stat(actual).sum[0] / 255
        intersection = ImageStat.Stat(ImageChops.multiply(expected, actual)).sum[0] / 255
        union = expected_count + actual_count - intersection
        bounds = actual.getbbox()
        source_bounds = expected.getbbox()
        row = {'nativeFrame': sample['nativeFrame'], 'sourceBounds': source_bounds, 'authoredBounds': bounds,
               'coverageIoU': round(intersection / union, 4) if union else 1,
               'sourceCoverageRetained': round(intersection / expected_count, 4),
               'authoredAreaRatio': round(actual_count / expected_count, 4),
               'boundsDeltaNativePixels': [round((a - b) / 10, 2) for a, b in zip(bounds, source_bounds)] if bounds else None}
        if not bounds:
            report['failures'].append(f'empty-frame-{sample["nativeFrame"]}')
        report['frames'].append(row)
    outside = ImageChops.multiply(alpha, ImageChops.invert(allowed))
    report['outsideDeclaredTrimAlphaSum'] = ImageStat.Stat(outside).sum[0]
    report['outsideDeclaredTrimBounds'] = outside.getbbox()
    if outside.getbbox():
        report['failures'].append('coverage-outside-native-frame-rectangles')
report['status'] = 'FAIL' if report['failures'] else 'PASS_STRUCTURAL_ONLY'
report['limitations'] = ['Does not certify red remap masks, native-density appearance or event-driven animation.',
                        'Coverage IoU is reported as evidence, not silently equated with user art approval.',
                        'A six-frame sample cannot activate the full-member override.']
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
sys.exit(1 if report['failures'] else 0)
