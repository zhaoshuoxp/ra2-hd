"""Compose unscaled native TMP captures for per-map visual inspection."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('matrices', nargs='+', type=Path)
parser.add_argument('--authored-terrain', action='store_true')
args = parser.parse_args()
args.output.mkdir(exist_ok=True)
index_file = args.output / 'index.json'
index = json.loads(index_file.read_text()) if index_file.exists() else dict(
    schema='native-authored-terrain-unscaled-review-v1' if args.authored_terrain
        else 'native-road-map-unscaled-review-v1', status='IN_PROGRESS', boards=[])
existing = {row['file']: row for row in index['boards']}
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
added = []
for matrix_file in args.matrices:
    matrix = json.loads(matrix_file.read_text())
    for case in matrix['maps']:
        if not (case.get('status') or '').startswith('PASS_NATIVE_ORIGINAL_TMP'):
            continue
        source_file = Path(case['report'])
        if case.get('reportSha256'):
            assert sha(source_file) == case['reportSha256']
        source = json.loads(source_file.read_text())
        report_sha = sha(source_file)
        captures = source['captures']
        for start in range(0, len(captures), 4):
            rows = captures[start:start+4]
            filename = f"{case['edition']}-{case['mission'].removesuffix('.map')}-{case['density']}x-{start//4+1}.png"
            if filename in existing:
                if existing[filename]['sourceReport']['sha256'] == report_sha:
                    continue
                filename = Path(filename).stem + '-' + report_sha[:12] + '.png'
                if filename in existing:
                    assert existing[filename]['sourceReport']['sha256'] == report_sha
                    continue
            board = Image.new('RGB', (1800, 632 * ((len(rows) + 1) // 2)), (22, 24, 28))
            draw, inputs = ImageDraw.Draw(board), []
            for i, capture in enumerate(rows):
                file = source_file.parent / capture['file']
                image = Image.open(file).convert('RGB'); assert image.size == (900, 600)
                x, y = i % 2 * 900, i // 2 * 632
                label = f"{case['edition'].upper()} / {case['mission']} / {capture['member']} / {case['density']}X"
                draw.text((x+8, y+3), label, font=font, fill=(238, 240, 242))
                board.paste(image, (x, y+32))
                inputs.append(dict(file=str(file), sha256=sha(file), member=capture['member'],
                    sourceSha256=capture['sourceSha256'], tile=capture['tile']))
            target = args.output / filename; assert not target.exists(); board.save(target)
            entry = dict(file=filename, sha256=sha(target), size=list(board.size),
                sourceReport=dict(file=str(source_file), sha256=report_sha), inputs=inputs,
                pixelsResizedOrFiltered=False, visualReview='PENDING')
            index['boards'].append(entry); existing[filename] = entry; added.append(filename)
index_file.write_text(json.dumps(index, indent=2) + '\n')
print(json.dumps(dict(boards=len(index['boards']), added=added)))
