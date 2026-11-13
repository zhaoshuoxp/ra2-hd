"""Prepare actual-density authored SHP contact sheets for manual inspection."""
import argparse
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/m2/official-maps'))
from owner_review import compose_owner, frame_palette

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('--output', type=Path)
parser.add_argument('--animation-sheets', action='store_true',
    help='Inspect every long-animation frame in groups of four, with distinct member filenames.')
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
stage = args.stage.resolve()
original = read(stage / 'prepared/source.json')
contract = read(stage / 'contract.json')
pack = read(stage / 'pack/manifest.json')
members = [member for family in pack['families'].values() for member in family['members']]
output = args.output.resolve() if args.output else stage / 'inspection'
output.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 26)
records = []
for member in members:
    source, = [source for source in original['sources'] if source['member'] == member['member']]
    metadata_file = stage / 'pack' / member['path']
    metadata = read(metadata_file)
    assert source['bodyFrames'] <= 4 or args.animation_sheets, \
        'Long animations require explicit complete animation sheets.'
    for variant in metadata['variants']:
        density = variant['density']
        images = []
        for frame in variant['frames']:
            number = frame['nativeFrame']
            folder = metadata_file.parent / str(density) / frame['page']
            x, y, width, height = frame['contentRect']
            bounds = (x, y, x + width, y + height)
            base = Image.open(folder / 'base.png').convert('RGBA').crop(bounds)
            data = Image.open(folder / 'data.png').convert('RGBA').crop(bounds)
            palette = frame_palette(stage / 'prepared', source, contract['sources'][source['member']], number)
            image = compose_owner(base, data, palette)
            image.save(output / f'{source["member"]}-{density}x-frame-{number}.png')
            images.append((number, image))
        batches = [images[start:start + 4] for start in range(0, len(images), 4)] \
            if args.animation_sheets else [images]
        for batch in batches:
            width = max(380, max(image.width for _, image in batch) + 32)
            height = max(image.height for _, image in batch) + 66
            board = Image.new('RGB', (width * 2, height * ((len(batch) + 1) // 2)), (36, 41, 46))
            draw = ImageDraw.Draw(board)
            for ordinal, (number, image) in enumerate(batch):
                left, top = ordinal % 2 * width, ordinal // 2 * height
                draw.text((left + 12, top + 8), f'{source["identity"]} / {density}X / state {number}',
                    font=font, fill='white')
                board.paste(image, (left + (width - image.width) // 2,
                    top + 50 + (height - 50 - image.height) // 2), image)
            suffix = '' if len(members) == 1 else '-' + source['identity'].lower()
            if args.animation_sheets:
                suffix = '-' + source['member'].replace('.', '-') + f'-{batch[0][0]}-{batch[-1][0]}'
            file = output / f'states-{density}x{suffix}.png'
            board.save(file)
            records.append(dict(member=source['member'], density=density, frames=len(batch), file=str(file)))
(output / 'index.json').write_text(json.dumps(dict(status='PREPARED_FOR_MANUAL_VISUAL_INSPECTION',
    policy='Actual independent density pixels without resizing. No user acceptance is inferred.', records=records), indent=2) + '\n')
print(json.dumps(dict(members=len(members), sheets=len(records), output=str(output))))
