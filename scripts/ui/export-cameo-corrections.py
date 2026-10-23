"""Export source-faithful candidates and shared rank layers without selecting the pack."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64
import hashlib
import html
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / '.artifacts/menu-ui/remaining-v1'
OUT = ART / 'source-fidelity-review-v1'
PREVIOUS = ROOT / '.local/ui-packs/original-screens-v4'
PACK = ROOT / '.local/ui-packs/cameo-corrections-v1'
CANDIDATES = {'ccomicon': 'r4', 'desoicon': 'r3', 'csphicon': 'r3', 'ahrvicon': 'r4'}
ALIASES = json.loads((ROOT / 'scripts/ui/cameo-aliases.json').read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_once(path, data):
    if path.exists() and path.read_bytes() != data:
        raise ValueError(f'Immutable output differs: {path}')
    path.write_bytes(data)


def picture(path, caption):
    encoded = base64.b64encode(path.read_bytes()).decode()
    return (f'<figure><figcaption>{html.escape(caption)}</figcaption>'
            f'<img alt="{html.escape(caption)}" src="data:image/png;base64,{encoded}"></figure>')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PACK.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((PREVIOUS / 'manifest.json').read_text())
    for path in PREVIOUS.iterdir():
        if path.is_file() and path.name != 'manifest.json':
            destination = PACK / path.name
            if destination.exists() and digest(destination) != digest(path):
                raise ValueError(f'Immutable output differs: {destination}')
            shutil.copyfile(path, destination)
    entries = {entry['id']: entry for entry in manifest['assets']}
    for name, revision in CANDIDATES.items():
        source = ART / f'masters/{name}-{revision}.png'
        image = Image.open(source).convert('RGBA')
        assert abs(image.width / image.height - 1.25) < .01
        output = OUT / f'{name}.png'
        image.resize((240, 192), Image.Resampling.LANCZOS).save(output)
        write_once(PACK / output.name, output.read_bytes())
        entries[name + '.shp'] = dict(id=name + '.shp', file=output.name, sha256=digest(output),
                                    width=240, height=192, logicalWidth=60, logicalHeight=48)

    # A vector-shaped rank glyph follows the retail 20x12 corner footprint.
    # One transparent full-canvas layer is shared by every eligible alternate.
    rank = Image.new('RGBA', (960, 768))
    draw = ImageDraw.Draw(rank)
    def polygon(points, color):
        draw.polygon([(round(x * 16), round(y * 16)) for x, y in points], fill=color)
    polygon([(0, 6), (10, 0), (20, 6), (20, 12), (10, 6), (0, 12)], '#453613')
    polygon([(1, 6), (10, 1), (19, 6), (19, 10), (10, 5), (1, 10)], '#dfb63e')
    polygon([(1, 6), (10, 1), (19, 6), (19, 7), (10, 3), (1, 8)], '#fff0aa')
    rank = rank.resize((240, 192), Image.Resampling.LANCZOS)
    rank.save(OUT / 'cameo-rank.png')
    write_once(PACK / 'cameo-rank.png', (OUT / 'cameo-rank.png').read_bytes())
    entries['cameo-rank'] = dict(id='cameo-rank', file='cameo-rank.png', sha256=digest(OUT / 'cameo-rank.png'),
                                 width=240, height=192, logicalWidth=60, logicalHeight=48)
    reused = {}
    for alternate, normal in ALIASES.items():
        if normal not in entries:
            continue
        entries[alternate] = {**entries[normal], 'id': alternate, 'overlay': 'cameo-rank'}
        reused[alternate] = normal
    manifest.update(revision=PACK.name, assets=list(entries.values()))
    write_once(PACK / 'manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())

    parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Source fidelity corrections and shared cameo ranks</title><style>
:root{--scale:1;color-scheme:dark;font:18px Arial,sans-serif;background:#24262a;color:#eee}
body{margin:28px}h1{font-size:30px}h2{font-size:24px;margin-top:32px}
.row{display:flex;flex-wrap:wrap;gap:28px}figure{margin:0;min-width:200px}
figcaption{font-size:16px;margin:8px 0}img{width:calc(60px * var(--scale));height:auto;display:block}
button{font:inherit;padding:8px 14px}p{max-width:1000px;line-height:1.5}
</style><h1>Source fidelity corrections</h1>
<p>The retail image is the sole design reference. Previous reinterpretations are rejected.
These candidates remain unaccepted; no default selection changed. Export size is 240 x 192,
displayed at the original 60 x 48 logical size. All images are embedded.</p>
<button onclick="document.documentElement.style.setProperty('--scale',1)">1x UI size</button>
<button onclick="document.documentElement.style.setProperty('--scale',2)">2x inspection</button>
<button onclick="document.documentElement.style.setProperty('--scale',4)">4x detail</button>''']
    titles = {'ccomicon': 'Chrono Commando', 'desoicon': 'Desolator', 'csphicon': 'Chronosphere', 'ahrvicon': 'Chrono Miner'}
    for name in CANDIDATES:
        parts.append(f'<h2>{titles[name]}</h2><div class="row">')
        parts.append(picture(ART / f'sources/{name}.png', 'Retail original'))
        old = ART / f'masters/{name}-r2.png' if name != 'ahrvicon' else ART / 'masters/ahrvicon-r3.png'
        parts.append(picture(old, 'Previous rejected candidate'))
        parts.append(picture(OUT / f'{name}.png', 'Source-guided correction'))
        parts.append('</div>')
    parts.append('''<h2>One base image, separate rank layer</h2><p>30 source pairs are mapped.
Only pairs with a present HD base are exported. Both IDs share one decoded base texture;
the rank layer is shared across all alternates. These are preview composites, not duplicate pack images.</p>''')
    for name in ['ccomicon', 'desoicon', 'giicon']:
        alternate = next(key for key, value in reused.items() if value == name + '.shp')
        normal_path = PACK / entries[name + '.shp']['file']
        preview = Image.alpha_composite(Image.open(normal_path).convert('RGBA'), rank)
        preview_path = OUT / alternate.replace('.shp', '-preview.png')
        preview.save(preview_path)
        parts.append('<div class="row">' + picture(normal_path, name + ' — shared base')
                     + picture(preview_path, alternate + ' — base + rank') + '</div>')
    parts.append('<p>The remaining roster and small UI assets are still in progress; this page does not claim full completion.</p></html>')
    (OUT / 'review.html').write_text('\n'.join(parts))
    receipt = dict(status='SOURCE_FIDELITY_REVIEW_PENDING', promoted=False, method='built-in image_gen',
                   manifestSha256=digest(PACK / 'manifest.json'), candidates=CANDIDATES,
                   mappedPairs=len(ALIASES), exportedPairs=reused, embeddedImages=18,
                   sharedBaseBytesSaved=len(reused) * 240 * 192 * 4,
                   rankLayerBytes=240 * 192 * 4, pack=str(PACK.relative_to(ROOT)))
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
