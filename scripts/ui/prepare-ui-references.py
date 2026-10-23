"""Decode audited RGBA files and assemble exact, unretouched source reference sheets."""
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parents[2]
screens = root / '.artifacts/menu-ui/original-screens'
(screens / 'units').mkdir(exist_ok=True)
for entry in json.loads((screens / 'inventory.json').read_text())['assets']:
    if 'error' in entry:
        continue
    image = Image.frombytes('RGBA', (entry['width'], entry['height']), (screens / (entry['name'] + '.rgba')).read_bytes())
    image.save(screens / (entry['name'] + '.png'))
    if entry['name'].startswith('ls800') and entry['name'] != 'ls800obs.shp':
        image.crop((210, 8, 396, 158)).save(screens / 'units' / (entry['name'][5:-4] + '.png'))
out = root / '.artifacts/menu-ui/ui-originals'
inventory = json.loads((out / 'inventory.json').read_text())
yuri = out / 'inventory-yuri.json'
for entry in inventory + (json.loads(yuri.read_text()) if yuri.exists() else []):
    for frame in entry['framesData']:
        source = out / frame['file']
        Image.frombytes('RGBA', (entry['width'], entry['height']), source.read_bytes()).save(source.with_suffix('.png'))
controls = ['tab00', 'tab01', 'tab02', 'tab03', 'diplobtn', 'optbtn', 'repair', 'sell', 'r-up', 'r-dn', 'sidebttn']
panels = ['credits', 'top', 'side1', 'side2', 'side2b', 'side3', 'addon', 'lendcap', 'bttnbkgd', 'rendcap', 'powerp']
for side in ['allied', 'soviet']:
    entries = {e['key'].removeprefix(side + '-'): e for e in inventory if e['key'].startswith(side + '-')}
    for kind, names, size in [('controls', controls, (640, 440)), ('panels', panels, (504, 480)),
                              ('commands', [n for n in entries if n.startswith('button')], (192, 400))]:
        sheet = Image.new('RGBA', size, (255, 0, 255, 255))
        layout, count = [], 0
        for row, name in enumerate(names):
            entry = entries[name]
            for frame in range(entry['frames']):
                if kind == 'panels':
                    x, y = count % 3 * 168, count // 3 * 80
                else:
                    x, y = frame * (128 if kind == 'controls' else 96), row * 40
                image = Image.open(out / entry['framesData'][frame]['file'].replace('.rgba', '.png')).convert('RGBA')
                sheet.alpha_composite(image, (x, y))
                layout.append(dict(key=entry['key'], frame=frame, x=x, y=y, width=entry['width'], height=entry['height']))
                count += 1
        sheet.save(out / f'{side}-{kind}-reference.png')
        (out / f'{side}-{kind}-layout.json').write_text(json.dumps(layout, indent=2) + '\n')
