"""Build the embedded four-cameo correction review without changing prior evidence."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64
import hashlib
import io
import json

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / '.artifacts/menu-ui/remaining-v1'
OUT = ART / 'four-corrections-v1'
PACK = ROOT / '.local/ui-packs/remaining-ui-v3'
NOTES = {
    'gapicon': 'Broader pedestal extending downward toward the original lower footprint.',
    'sealicon': 'Dry torso and dock foreground; remove the invented water around the body.',
    'shkicon': 'Anatomical left arm (image right) hangs naturally beside the body.',
    'ttnkicon': 'Two distinct turret assemblies at the source heights and positions.',
}


def figure(image, caption):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    data = base64.b64encode(buffer.getvalue()).decode()
    return f'<figure><figcaption>{caption}</figcaption><img alt="{caption}" src="data:image/png;base64,{data}"></figure>'


def main():
    before = json.loads((OUT / 'selected-before.json').read_text())
    pairs = json.loads((ROOT / 'scripts/ui/cameo-aliases.json').read_text())
    rank = Image.open(PACK / 'cameo-rank.png').convert('RGBA')
    parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Four source-fidelity corrections</title>
<style>:root{--scale:2;color-scheme:dark;background:#24262a;color:#eee;font:18px Arial,sans-serif}
body{margin:28px}h1{font-size:30px}h2{font-size:24px}p{max-width:1000px;line-height:1.5}
.row{display:flex;gap:30px;flex-wrap:wrap}figure{margin:0;min-width:210px}figcaption{font-size:16px;margin:8px 0}
img{display:block;width:calc(60px * var(--scale));height:auto}section{margin:32px 0}button{font:inherit;padding:8px 14px}
</style><h1>Four source-fidelity corrections</h1>
<p>These four candidates await visual acceptance. The other 88 canonical cameos and reviewed small UI assets are accepted and preserved.
Original references govern content and composition. Exports remain 240x192 for a 60x48 logical sidebar slot.
All images are embedded; ranked variants share the same base artwork. No default pack selection has changed.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">1x UI size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>
<button onclick="document.documentElement.style.setProperty('--scale',4)">4x detail</button>''']
    board = Image.new('RGB', (720, 4 * 224), '#24262a')
    draw = ImageDraw.Draw(board)
    entries, count = [], 0
    for row, (name, note) in enumerate(NOTES.items()):
        original = Image.open(ART / f'sources/{name}.png').convert('RGBA')
        previous = Image.open(ART / before[name]['master']).convert('RGBA').resize((240, 192), Image.Resampling.LANCZOS)
        current = Image.open(PACK / f'{name}.png').convert('RGBA')
        assert current.size == (240, 192) and current.getchannel('A').getextrema() == (255, 255)
        current.save(OUT / f'{name}.png')
        parts.append(f'<section id="{name}"><h2>{name} — Review pending</h2><p>{note}</p><div class="row">')
        for col, (image, label) in enumerate([(original, 'Retail original'), (previous, 'Previous candidate'), (current, 'Current correction')]):
            parts.append(figure(image, label))
            board.paste(image.resize((240, 192), Image.Resampling.NEAREST), (col * 240, row * 224 + 28))
            draw.text((col * 240 + 5, row * 224 + 7), f'{name}: {label}', fill='white')
            count += 1
        alternate = next((alt for alt, base in pairs.items() if base == name + '.shp'), None)
        if alternate:
            parts.append(figure(Image.alpha_composite(current, rank), alternate + ' — shared base + rank'))
            count += 1
        parts.append('</div></section>')
        entries.append(dict(id=name + '.shp', sha256=hashlib.sha256((PACK / f'{name}.png').read_bytes()).hexdigest(),
                            alternate=alternate, status='REVIEW_PENDING', correction=note))
    parts.append('</html>')
    (OUT / 'review.html').write_text('\n'.join(parts))
    board.save(OUT / 'comparison.png')
    receipt = dict(status='FOUR_CORRECTIONS_REVIEW_PENDING', embeddedImages=count, promoted=False,
                   pack=PACK.name, acceptedCanonical=88, assets=entries)
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
