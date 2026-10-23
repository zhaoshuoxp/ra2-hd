"""Build the consolidated review from the small exports and current native captures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import html
import base64
import json
import shutil

ROOT = Path('.artifacts/menu-ui')
OUT = ROOT / 'review-v4'
RUN = ROOT / 'runtime-v6'
PACK = Path('.local/ui-packs/direction-v5')
NAMES = {'giicon': 'GI', 'e2icon': 'Conscript', 'htnkicon': 'Rhino', 'gtnkicon': 'Grizzly',
         'powricon': 'Allied Power Plant', 'npwricon': 'Tesla Reactor', 'tslaicon': 'Tesla Coil',
         'agisicon': 'Aegis Cruiser', 'v3icon': 'V3 Launcher', 'dogicon': 'Attack Dog',
         'harvicon': 'War Miner', 'jjeticon': 'Rocketeer'}
OUT.mkdir(exist_ok=True)


def embedded_png(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


manifest = json.loads((PACK / 'manifest.json').read_text())
assets = [a for a in manifest['assets'] if a['id'].endswith('.shp')]
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
board = Image.new('RGB', (1088, 768), '#17212b')
draw = ImageDraw.Draw(board)
cards = []
for index, asset in enumerate(assets):
    name = asset['id'][:-4]
    shutil.copyfile(PACK / asset['file'], OUT / asset['file'])
    shutil.copyfile(ROOT / 'inventory-v1' / f'{name}.png', OUT / f'original-{name}.png')
    image = Image.open(OUT / asset['file']).convert('RGB')
    assert image.size == (240, 192)
    x, y = (index % 4) * 272 + 16, (index // 4) * 256 + 12
    draw.text((x, y), NAMES[name], font=font, fill='#e6edf3')
    board.paste(image, (x, y + 36))
    cards.append(f'<article><h3>{html.escape(NAMES[name])}</h3><div class="pair">'
                 f'<figure><img src="{embedded_png(OUT / f"original-{name}.png")}" alt="Original {name}"><figcaption>Original</figcaption></figure>'
                 f'<figure><img src="{embedded_png(OUT / asset["file"])}" alt="Restored {name}"><figcaption>Candidate</figcaption></figure>'
                 '</div></article>')
board.save(OUT / 'cameo-board.png')
css = '''body{background:#121a22;color:#e6edf3;font:20px/1.5 system-ui;margin:28px}
main{max-width:1600px;margin:auto}h1{font-size:30px}h2{font-size:26px}h3{font-size:21px;margin:0 0 12px}
button{font:inherit;padding:8px 14px;margin:4px}a{color:#b6d5ff}.notice{border:1px solid #947546;padding:16px}
.cameos{display:flex;flex-wrap:wrap;gap:16px}.pair{display:flex;gap:16px;flex-wrap:wrap}
article{padding:16px;border:1px solid #465664}figure{margin:0}figcaption{font-size:17px}
.cameos img{width:72px;height:57.6px}.cameos[data-size="4k"] img{width:144px;height:115.2px}
.cameos[data-size="export"] img{width:240px;height:192px}
.captures{display:grid;grid-template-columns:1fr 1fr;gap:16px}.captures img{width:100%;height:auto}
.captures figure{overflow:auto}.captures img.full{width:auto;max-width:none}
table{border-collapse:collapse;font-size:17px}td,th{padding:8px;border:1px solid #465664;text-align:left}
.scroll{overflow:auto;max-height:500px}@media(max-width:900px){.captures{grid-template-columns:1fr}}'''
parts = [f'<!doctype html><meta charset="utf-8"><title>Faithful sidebar cameo review</title><style>{css}</style><main>',
         '<h1>Faithful sidebar cameo review — revision 4</h1>',
         '<p class="notice">REPRESENTATIVE_REVIEW_PENDING / PARTIAL_BATCH_DELIVERED. The Reactor material direction was approved. These 12 revised exports now incorporate the gas-mask and bottom-content corrections; consolidated acceptance remains pending. Only the isolated review launch can load this selection. Full-roster generation and production promotion have not occurred.</p>',
         '<p>Each source is 60×48 logical pixels; each candidate is 240×192. Choose the actual output footprint below. Earlier reviews mistakenly described a 64-pixel canvas; this page uses the verified 60-pixel source width. Images contain no baked labels or blank label strips; names remain live outlined text in the game.</p>',
         '<h2>Original and revised icons at the same size</h2><div>',
         '<button onclick="document.querySelector(\'.cameos\').dataset.size=\'1080p\'">1080p sidebar: 72×57.6</button>',
         '<button onclick="document.querySelector(\'.cameos\').dataset.size=\'4k\'">4K sidebar: 144×115.2</button>',
         '<button onclick="document.querySelector(\'.cameos\').dataset.size=\'export\'">Export: 240×192</button></div>',
         '<p>Sizes are source-output pixels represented as CSS pixels for comparison; browser and OS scaling may affect their physical display size.</p>',
         '<div class="cameos" data-size="4k">', *cards, '</div>',
         f'<p><a download="cameo-board.png" href="{embedded_png(OUT / "cameo-board.png")}">All 12 exports in one board</a> · <a href="ledger.json">Asset identity and correction ledger</a></p>']
# A compact, self-contained comparison is convenient in attachment previews.
(OUT / 'icons-embedded.html').write_text(''.join(parts) + '</main>')
for title, stem in [('Main menu', 'menu'), ('Loading', 'loading'), ('Gameplay', 'game'),
                    ('Native mixed-faction sidebar fixture', 'sidebar-fixture')]:
    if not (RUN / f'{stem}-1080p.png').exists():
        continue
    parts.append(f'<h2>{title}</h2><div class="captures">')
    for resolution in ['1080p', '4k']:
        name = f'{stem}-{resolution}.png'
        shutil.copyfile(RUN / name, OUT / name)
        parts.append(f'<figure><img src="{embedded_png(OUT / name)}" alt="{title} {resolution}" '
                     'onclick="this.classList.toggle(\'full\')">'
                     f'<figcaption>{resolution} · same logical view; click to toggle full pixels</figcaption></figure>')
    parts.append('</div>')
parts.append('<h2>Coverage and validation</h2><p>Menu and loading retain the previous unapproved background direction. Accepted sidebar panels and cursors remain Original. The mixed-faction HUD is a staged native-widget fixture, not normal simultaneous faction availability. macOS captures use software density emulation; physical input and Windows remain unverified.</p>')
inventory = json.loads((ROOT / 'inventory-v1/inventory.json').read_text())
selected = {a['id'] for a in assets}
rows = []
for record in inventory['roster']:
    if record['inclusion'] != 'BUILD_MENU_CANDIDATE':
        continue
    row = dict(record)
    row['normalStatus'] = 'REVIEW_CANDIDATE' if row['cameo'] in selected else 'NOT_AUTHORED'
    row['alternateStatus'] = 'REVIEW_CANDIDATE' if row['alternate'] in selected else 'NOT_AUTHORED'
    rows.append(row)
remaining = sorted({name for row in rows for name in [row['cameo'], row['alternate']] if name not in selected})
(OUT / 'completeness.json').write_text(json.dumps(rows, indent=2) + '\n')
(OUT / 'remaining-cameos.json').write_text(json.dumps(dict(status='REPRESENTATIVE_REVIEW_PENDING', remaining=remaining), indent=2) + '\n')
parts.append(f'<p>{len(assets)} representative exports; {len(remaining)} additional unique build-menu references have no revised candidate. Alternate, country-specific and superweapon coverage is not complete.</p>')
parts.append('<div class="scroll"><table><tr><th>Object</th><th>Normal cameo</th><th>Alternate</th></tr>')
for row in rows:
    parts.append('<tr>' + ''.join(f'<td>{html.escape(str(value))}</td>' for value in
                 [row['id'], row['cameo'] + ' / ' + row['normalStatus'], row['alternate'] + ' / ' + row['alternateStatus']]) + '</tr>')
parts.append('</table></div><p><a href="completeness.json">Per-object checklist</a> · <a href="remaining-cameos.json">Exact remaining references</a> · <a href="../review-v1/review.html">Previous controls and screen inventory</a> (old cameo art rejected)</p></main>')
shutil.copyfile(ROOT / 'art-v4/ledger.json', OUT / 'ledger.json')
if (RUN / 'result.json').exists():
    shutil.copyfile(RUN / 'result.json', OUT / 'validation.json')
(OUT / 'review.html').write_text(''.join(parts))
print(json.dumps(dict(review=str(OUT / 'review.html'), cameos=len(assets), remaining=len(remaining))))
