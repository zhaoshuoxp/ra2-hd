"""Build an embedded progress gallery from explicitly selected cameo masters."""
from pathlib import Path
from PIL import Image
import base64
import hashlib
import html
import io
import json

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / '.artifacts/menu-ui/remaining-v1'
OUT = ART / 'remaining-gallery'


def picture(image, caption):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    data = base64.b64encode(buffer.getvalue()).decode()
    return f'<figure><figcaption>{html.escape(caption)}</figcaption><img alt="{html.escape(caption)}" src="data:image/png;base64,{data}"></figure>'


def main():
    OUT.mkdir(exist_ok=True)
    selected = json.loads((ART / 'selected-masters.json').read_text())
    pairs = json.loads((ROOT / 'scripts/ui/cameo-aliases.json').read_text())
    rank = Image.open(ART / 'source-fidelity-review-v1/cameo-rank.png').convert('RGBA')
    parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Remaining cameo restoration</title>
<style>:root{--scale:2;color-scheme:dark;background:#24262a;color:#eee;font:18px Arial,sans-serif}
body{margin:28px}h1{font-size:30px}h2{font-size:23px}p{max-width:1000px;line-height:1.5}
.row{display:flex;flex-wrap:wrap;gap:28px}figure{margin:0;min-width:210px}figcaption{font-size:16px;margin:8px 0}
img{display:block;width:calc(60px * var(--scale));height:auto}section{margin:28px 0}button{font:inherit;padding:8px 14px}
</style><h1>Remaining cameo restoration — review</h1>
<p>Retail originals are the sole content references. Exports are 240x192; logical size remains 60x48.
Rank variants reuse the same base image. All images are embedded. The original 12 accepted cameos are unchanged.
Only explicitly marked assets are accepted; this gallery is not full-roster completion or activation.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">1x UI size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>
<button onclick="document.documentElement.style.setProperty('--scale',4)">4x detail</button>''']
    ledger = json.loads((ART / 'production-ledger.json').read_text())
    parts.append(f'<p>{ledger.get("authoredCanonical", len(selected) + 12)} canonical HD images prepared; '
                 f'{ledger["acceptedCanonical"]} accepted, including the original 12 unchanged cameos. '
                 'All other candidates require visual review. Use the original-size control before judging detail.</p>')
    images = 0
    receipts = []
    order = ['clegicon', 'clonicon'] + sorted(set(selected) - {'clegicon', 'clonicon'})
    for name in order:
        entry = selected[name]
        master = ART / entry['master']
        image = Image.open(master).convert('RGBA')
        assert abs(image.width / image.height - 1.25) < .01, name
        assert image.getchannel('A').getextrema() == (255, 255), name
        image = image.resize((240, 192), Image.Resampling.LANCZOS)
        image.save(OUT / f'{name}.png')
        original = Image.open(ART / f'sources/{name}.png').convert('RGBA')
        status = 'Accepted' if entry['status'] == 'ACCEPTED' else 'Review pending'
        parts.append(f'<section id="{name}"><h2>{html.escape(name)} — {status}</h2><div class="row">')
        parts.append(picture(original, 'Retail original'))
        parts.append(picture(image, 'Source-guided HD'))
        images += 2
        alternate = next((alt for alt, base in pairs.items() if base == name + '.shp'), None)
        if alternate:
            parts.append(picture(Image.alpha_composite(image, rank), alternate + ' — shared base + rank'))
            images += 1
        parts.append('</div></section>')
        receipts.append(dict(id=name + '.shp', master=entry['master'], status=entry['status'],
                             sha256=hashlib.sha256(master.read_bytes()).hexdigest(), alternate=alternate))
    exceptions = json.loads((ART / 'source-exceptions.json').read_text())
    parts.append('<details><summary>Source exceptions retained as Original</summary>')
    for name, entry in exceptions.items():
        parts.append(f'<section><h2>{html.escape(name)}</h2><p>{html.escape(entry["reason"])}</p>')
        parts.append(picture(Image.open(ART / ('sources/' + name.replace('.shp', '.png'))), 'Unchanged retail source'))
        parts.append('</section>')
        images += 1
    parts.append('<p>Absent retail references: ' + ', '.join(ledger['missingRetailReferences']) + '.</p></details>')
    parts.append('</html>')
    (OUT / 'review.html').write_text('\n'.join(parts))
    (OUT / 'receipt.json').write_text(json.dumps(dict(status=ledger['status'],
        embeddedImages=images, selectedCanonical=len(selected), promoted=False, assets=receipts), indent=2) + '\n')
    print(json.dumps(dict(canonical=len(selected), images=images, page=str(OUT / 'review.html'))))


if __name__ == '__main__':
    main()
