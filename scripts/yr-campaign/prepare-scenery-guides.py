"""Create labeled original scenery references without authored-HD credit."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('worklist', type=Path)
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
worklist = read(args.worklist)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 30)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
board = Image.new('RGB', (1600, 4 * 460), (35, 40, 46))
for ordinal, job in enumerate(worklist['jobs']):
    assert job['kind'] == 'terrain' and job['originalSource']['shadowMatchesRenderer']
    source_file = Path(job['originalSource']['file'])
    assert sha(source_file) == job['originalSource']['sha256']
    source, = [source for source in read(source_file)['sources'] if source['identity'] == job['identity']]
    assert source['sha256'] == job['sourceSha256'] and source['bodyFrames'] == 1
    folder = Path(job['directory']) / 'guides-r1'
    folder.mkdir(exist_ok=False)
    native = Image.open(source_file.parent / 'native' / source['frames'][0]['png']).convert('RGBA')
    reference = Image.new('RGBA', (1450, 1400), (35, 40, 46, 255))
    draw = ImageDraw.Draw(reference)
    draw.text((24, 20), job['name'] + ' / original frame 0', font=font, fill='white')
    draw.text((24, 62), source['nativeRules'].get('Name', job['identity']), font=font, fill='white')
    scale = min(7, 1300 / native.width, 1200 / native.height)
    enlarged = native.resize((round(native.width * scale), round(native.height * scale)), Image.Resampling.NEAREST)
    reference.alpha_composite(enlarged, ((1450 - enlarged.width) // 2, 130 + (1240 - enlarged.height) // 2))
    reference.convert('RGB').save(folder / 'frame-0.png')
    x, y = ordinal % 4 * 400, ordinal // 4 * 460
    d = ImageDraw.Draw(board); d.text((x + 12, y + 12), job['name'], font=small, fill='white')
    scale = min(3, 360 / native.width, 390 / native.height)
    sample = native.resize((round(native.width * scale), round(native.height * scale)), Image.Resampling.NEAREST)
    board.paste(sample, (x + (400 - sample.width) // 2, y + 55 + (395 - sample.height) // 2), sample)
    (Path(job['directory']) / 'original-state-plan-r1.json').open('x').write(json.dumps(dict(
        status='ORIGINAL_REFERENCES_ONLY_NOT_AUTHORED_HD', sourceSha256=source['sha256'],
        states=[dict(frame=0, canonical=0, size=source['frames'][0]['size'],
            paletteSha256=source['palette']['sha256'])], uniqueMasters=1, userVisualAcceptance='PENDING'), indent=2) + '\n')
output = args.worklist.parent / 'original-contact-board-r1.png'
assert not output.exists()
board.save(output)
print(json.dumps(dict(jobs=len(worklist['jobs']), output=str(output), status='ORIGINAL_REFERENCES_ONLY_NOT_HD')))
