"""Register authored views using native projection ratios; no repainting or perspective warp."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('.artifacts/m1-3e')
out = root / 'candidate-v1'
out.mkdir(exist_ok=False)
accepted = Path('.artifacts/m1-3d/candidate-v2')
previous = json.loads((accepted / 'manifest.json').read_text())
native = json.loads((root / 'native-projection.json').read_text())
headings = list(range(0, 360, 45))
# Manually inspected centers of the hull bearing and lower turret bearing.
pivots = {
    'body-45': [725, 450], 'body-135': [776, 375], 'body-180': [756, 480],
    'body-225': [721, 441], 'body-270': [740, 447], 'body-315': [755, 366],
    'turret-45': [725, 890], 'turret-135': [1305, 604], 'turret-180': [1000, 541],
    'turret-225': [620, 405], 'turret-270': [450, 562], 'turret-315': [475, 620],
}
manifest = {'schemaVersion': 1, 'revision': '1', 'status': 'EIGHT_HEADING_REVIEW_PENDING',
    'canvas': [80, 72], 'offset': [-40, -46], 'density': 4, 'bearing': [0, -9.5],
    'headings': headings, 'owner': 'Fixed reference red; complete original fallback for other colors.',
    'registration': 'Original VXL projected-width ratios anchored to accepted 0-degree artwork. Hand-reviewed bearing landmarks.',
    'parts': {}}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for part in ['body', 'turret']:
    for heading in headings:
        name = f'{part}-{heading}'
        source = root / 'authoring-v1' / f'{name}.png'
        raw = Image.open(source).convert('RGBA')
        bbox = raw.getchannel('A').point(lambda a: 255 if a >= 8 else 0).getbbox()
        if heading in [0, 90]:
            # Copy accepted pixels without any resampling. Padding extends transparent canvas only.
            exported = Image.new('RGBA', (320, 288))
            old = Image.open(accepted / f'{name}.png').convert('RGBA')
            exported.paste(old, (32, 32))
            assert exported.crop((32, 32, 288, 256)).tobytes() == old.tobytes()
            entry = dict(previous['parts'][name])
            entry['acceptedExportSha256'] = sha(accepted / f'{name}.png')
            entry['acceptedPixelsUnchanged'] = True
        else:
            pivot = pivots[name]
            width = native['parts'][part][str(heading)]['artworkWidth']
            scale = width / (bbox[2] - bbox[0])
            pad = max(raw.size) * 2
            padded = Image.new('RGBA', (raw.width + 2 * pad, raw.height + 2 * pad))
            padded.paste(raw, (pad, pad))
            left, top = pivot[0] - 40 / scale + pad, pivot[1] - 36.5 / scale + pad
            box = (left, top, left + 80 / scale, top + 72 / scale)
            exported = padded.convert('RGBa').resize((320, 288), Image.Resampling.LANCZOS, box=box).convert('RGBA')
            entry = {'sourcePivot': pivot, 'uniformLogicalScale': scale, 'nativeAnchoredWidth': width}
        exported.save(out / f'{name}.png')
        entry.update({'file': f'{name}.png', 'source': str(source), 'sourceSize': raw.size,
            'sourceSha256': sha(source), 'alphaBounds': bbox, 'sha256': sha(out / f'{name}.png')})
        manifest['parts'][name] = entry
        substantive = exported.getchannel('A').point(lambda a: 255 if a >= 8 else 0).getbbox()
        assert substantive[0] > 0 and substantive[1] > 0 and substantive[2] < 320 and substantive[3] < 288, name
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
# Assembly previews are explicitly offline references, not engine evidence.
sheet = Image.new('RGB', (8 * 192, 210), '#566251')
draw = ImageDraw.Draw(sheet)
for index, h in enumerate(headings):
    body = Image.open(out / f'body-{h}.png').convert('RGBA')
    body.alpha_composite(Image.open(out / f'turret-{h}.png').convert('RGBA'))
    body.save(out / f'reference-b{h}-t{h}.png')
    preview = body.resize((160, 144), Image.Resampling.LANCZOS)
    sheet.paste(preview, (index * 192 + 16, 45), preview)
    draw.text((index * 192 + 16, 20), f'Heading {h} / 2x logical preview', fill='white')
sheet.save(root / 'assembly-preview.png')
print(json.dumps({'status': 'PACKAGED', 'parts': len(manifest['parts']), 'output': str(out)}))
