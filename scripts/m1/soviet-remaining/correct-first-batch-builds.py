"""Revise only the four earlier buildup sequences; copy accepted state bytes."""
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = Path('.artifacts/m1-6b')
check = json.loads((root / 'production-checklist-v1.json').read_text())['families']
for name in ['NAHAND', 'NAREFN', 'NAWEAP', 'NACNST']:
    old = root / ('full-exports-r2' if name == 'NAREFN' else 'full-exports-v4') / name
    out = root / 'full-exports-animation-r4' / name
    shutil.copytree(old, out)
    report = json.loads((old / 'candidate-review.json').read_text())
    build = next(m for m in check[name] if 'BUILDUP' in m['roles'])
    member = build['member']
    raw = json.loads((root / 'source-v1' / name / (member + '.json')).read_text())
    count = len(build['authorFrames'])
    seam = {'NAHAND': 90, 'NAREFN': 100, 'NAWEAP': 100, 'NACNST': 113}[name]
    operations = []
    for density in [2, 4]:
        size = tuple(v * density for v in raw['canvas'])
        final = raw['frames'][count - 1]
        master = Image.new('RGBA', size)
        master.alpha_composite(Image.open(old / f'{member[:-4]}-{count-1:02}-{density}x.png'), (final['x'] * density, final['y'] * density))
        upper, lower = master.copy(), master.copy()
        upper.paste((0, 0, 0, 0), (0, seam * density, size[0], size[1]))
        lower.paste((0, 0, 0, 0), (0, 0, size[0], seam * density))
        alpha = np.asarray(master.getchannel('A')) > 8
        occupied = alpha.any(axis=0)
        floors = np.where(occupied, size[1] - 1 - alpha[::-1].argmax(axis=0), -1)
        yy = np.arange(size[1])[:, None]
        ground = (yy <= floors[None, :]) & occupied[None, :]
        def masked(image, mask):
            result = np.array(image)
            result[..., 3] *= mask.astype(np.uint8)
            return Image.fromarray(result)
        foot = masked(master, (yy >= floors[None, :] - 5 * density) & occupied[None, :])
        sequence = []
        for n in range(count):
            frame = raw['frames'][n]
            base_dy = max(0, frame['y'] - seam) * density
            upper_dy = max(0, frame['y'] - final['y']) * density
            image = Image.new('RGBA', size); image.alpha_composite(lower, (0, base_dy))
            image = masked(image, ground); image.alpha_composite(foot)
            moving = Image.new('RGBA', size); moving.alpha_composite(upper, (0, upper_dy))
            moving.paste((0, 0, 0, 0), (0, seam * density, size[0], size[1])); image.alpha_composite(moving)
            if n < round(count * .3):
                coverage = Image.new('L', tuple(raw['canvas']))
                coverage.paste(Image.fromarray(np.uint8(np.array(frame['pixels']).reshape(frame['height'], frame['width']) > 0) * 255), (frame['x'], frame['y']))
                coverage = coverage.filter(ImageFilter.MaxFilter(3)).resize(size, Image.Resampling.NEAREST)
                image = masked(image, np.array(coverage) > 0)
            if n == count - 1:
                image = master.copy()
            w, h = frame['width'], frame['height']
            trimmed = Image.new('RGBA', ((w + w % 2) * density, (h + h % 2) * density))
            trimmed.paste(image.crop((frame['x'] * density, frame['y'] * density, (frame['x'] + w) * density, (frame['y'] + h) * density)), (0, 0))
            pixels = np.array(trimmed); rgb = pixels[..., :3].astype(float)
            indices = np.array(frame['pixels'], np.uint8).reshape(h, w)
            remap = Image.fromarray(np.uint8((indices >= 16) & (indices <= 31)) * 255).filter(ImageFilter.MaxFilter(7)).resize((w * density, h * density), Image.Resampling.NEAREST)
            allowed = np.zeros(pixels.shape[:2], bool); allowed[:h*density, :w*density] = np.array(remap) > 0
            red = allowed & (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (pixels[..., 3] > 0)
            shades = abs(rgb[..., 0, None] - np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8]) * 4).argmin(axis=2)
            data = np.zeros_like(pixels); data[..., 3] = 255; data[..., 0][red] = 255; data[..., 1][red] = shades[red]
            stem = f'{member[:-4]}-{n:02}-{density}x'
            trimmed.save(out / (stem + '.png')); Image.fromarray(data).save(out / (stem + '-data.png'))
            entry = next(r for r in report['frames'] if r['member'] == member and r['nativeFrame'] == n)
            export = next(e for e in entry['exports'] if e['density'] == density)
            export.update(visiblePixels=int((pixels[..., 3] > 0).sum()), remapPixels=int(red.sum()), shades=np.unique(shades[red]).tolist())
            if density == 2:
                canvas = Image.new('RGBA', size, '#34483d'); canvas.alpha_composite(trimmed, (frame['x'] * density, frame['y'] * density))
                sequence.append(canvas.resize(tuple(raw['canvas']), Image.Resampling.BOX).convert('RGB'))
                operations.append(dict(member=member, nativeFrame=n, operation='Rigid structure and upper mechanism rising behind fixed ground/socket', frameScale=[1,1], baseTranslation=base_dy/density, upperTranslation=upper_dy/density))
        if sequence:
            w,h = raw['canvas']; sheet = Image.new('RGB', (w*5, ((count+4)//5)*(h+25)), '#34483d'); draw = ImageDraw.Draw(sheet)
            for n, image in enumerate(sequence):
                x,y=n%5*w,n//5*(h+25);sheet.paste(image,(x,y+25));draw.text((x+4,y+2),str(n),fill='white',font_size=18)
            sheet.save(out / (member + '-rigid-contact.png'))
    report['composition'] = [r for r in report['composition'] if r['member'] != member] + operations
    report['correction'] = 'Only buildup resources revised; all other PNG bytes copied from delivered accepted states'
    (out / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
    print(name, 'BUILDUP_REVISED_OTHER_STATES_PRESERVED', flush=True)
