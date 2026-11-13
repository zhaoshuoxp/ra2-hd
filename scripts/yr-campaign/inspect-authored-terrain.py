"""Assemble actual independent TMP density exports for manual visual inspection."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
authoring = args.authoring
recipe = read(authoring / args.revision / 'recipe.json')
source = read(authoring / 'source.json')
layout = read(authoring / 'layout.json')
pack = Path('.local/terrain-packs') / args.revision
manifest = read(pack / 'manifest.json')
members = {member['member'] for member in source['members']}
groups = [group for group in manifest['groups'] if any(member['member'] in members for member in group['members'])]
assert set(member['member'] for group in groups for member in group['members']) == members
output = authoring / args.revision / 'inspection'
output.mkdir(exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 23)
records = []
for density in [2, 4]:
    images = []
    for group in groups:
        variant, = [variant for variant in group['variants'] if variant['density'] == density]
        atlas = Image.frombytes('RGBA', tuple(variant['size']), (pack / variant['file']).read_bytes())
        offset = 0
        for member in group['members']:
            name = member['member']
            info = layout[name]
            width, height = info['bounds'][2:]
            whole = Image.new('RGBA', (width * density, height * density))
            for part in info['parts']:
                x, y, _, _ = part['rect']
                sx, sy, sw, sh = variant['rects'][offset + part['subTile']]
                whole.alpha_composite(atlas.crop((sx, sy, sx + sw, sy + sh)), (x * density, y * density))
            offset += len(member['images'])
            file = f"{name.replace('.', '-')}-{density}x.png"
            whole.save(output / file)
            records.append(dict(member=name, density=density, file=file, size=list(whole.size)))
            images.append((name, whole))
    width = max(max(image.width, round(font.getlength(f'{name} / {density}X')))
        for name, image in images) + 24
    height = max(image.height for _, image in images) + 58
    sheet = Image.new('RGB', (width * 2, height * ((len(images) + 1) // 2)), '#273a31')
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(images):
        x, y = index % 2 * width, index // 2 * height
        draw.text((x + 12, y + 8), f'{name} / {density}X', font=font, fill='white')
        sheet.paste(image, (x + 12, y + 42), image)
    sheet.save(output / f'complete-members-{density}x.png')
(output / 'index.json').write_text(json.dumps(dict(status='ACTUAL_DENSITY_EXPORTS_MANUAL_INSPECTION_PENDING',
    records=records, originalRgbUsedAsNewDetail=False, nativeRuntime='PENDING'), indent=2) + '\n')
print(json.dumps(dict(members=len(members), densityExports=len(records), output=str(output))))
