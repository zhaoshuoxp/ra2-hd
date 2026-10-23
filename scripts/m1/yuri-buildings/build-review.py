"""Export direction samples at both densities; never publish a production family."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path('scripts/m1/owner-color').resolve()))
from paint import complete_data

ROOT = Path('.artifacts/yuri-buildings')
OUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'review-v1')
OUT.mkdir(exist_ok=False)
receipts = json.loads((ROOT / 'generation-receipts-v2.json').read_text())
selected = [r for r in receipts if r['key'] not in ('YAYARD-TEMPERATE', 'YAGGUN-TURRET-0-R2')]
records = []
cards = []


def embed(file):
    return 'data:image/png;base64,' + base64.b64encode(Path(file).read_bytes()).decode()


def decode_member(row, member, index):
    raw = json.loads((ROOT / 'source-v1/members' / (member['source']['sha256'] + '.json')).read_text())
    frame = raw['frames'][index]
    pixels = np.array(frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
    rgb = np.array(row['palette']['colors'], dtype=np.uint8)[pixels]
    canvas = Image.new('RGBA', raw['canvas'])
    canvas.paste(Image.fromarray(np.dstack((rgb, (pixels != 0).astype(np.uint8) * 255))), (frame['x'], frame['y']))
    return canvas


inventory = json.loads((ROOT / 'source-v1/inventory.json').read_text())
for receipt in selected:
    key = receipt['key']
    identity = key.split('-')[0]
    theater = 'SNOW' if key.endswith('SNOW') else 'TEMPERATE'
    native = Image.open(ROOT / 'references-v1' / f'{identity}-{theater}' / 'normal.png').convert('RGBA')
    notes = 'Normal design sample. Complete state sequences and native runtime integration remain pending.'
    if 'TURRET' in key:
        # Reference capture is a real Original renderer crop, not a new HD action.
        native = Image.open(ROOT / 'turret-references-v1' / identity / '0.png').convert('RGBA')
        a = np.array(native)
        background = np.max(np.abs(a[..., :3].astype(int) - [52, 72, 61]), axis=2) <= 20
        a[..., 3][background] = 0
        native = Image.fromarray(a)
        bbox = native.getbbox()
        native = native.crop(bbox)
        native = native.resize((50, max(1, round(native.height * 50 / native.width))), Image.Resampling.LANCZOS)
        notes = 'Heading 0 component direction only; 50 CSS px width for comparison. Native buffer crop is normalized, not a verified world socket export.'
        if identity == 'YAGGUN':
            notes += ' Generated peripheral haze remains a named exception; both attempts are retained. It must be resolved before production.'
        else:
            notes += ' Native smintur has zero owner-index voxels: fixed neutral metal is excluded from paint.'
    elif key.endswith('OPEN'):
        row = next(r for r in inventory['matrix'] if r['id'] == identity and r['theater'] == theater)
        animation = next(a for a in row['animations'] if a['name'] == 'YAPPET_F')
        member = next(m for m in row['members'] if m['source']['member'] == animation['member'])
        native = decode_member(row, member, animation['normal']['end'])
        notes = 'Open endpoint direction only. This sample is not an articulated animation or a stationary-foundation proof.'
    elif theater == 'SNOW':
        notes = 'Localized snow direction sample; moving-part coverage and complete snow sequences remain pending.'
    bbox = native.getbbox()
    assert bbox, key
    raw_path = ROOT / 'art-v1' / key / 'normal-raw.png'
    master = Image.open(raw_path).convert('RGBA')
    coverage = Image.fromarray((np.array(master)[..., 3] >= 200).astype(np.uint8) * 255)
    subject = coverage.getbbox()
    crop = master.crop(subject)
    directory = OUT / key
    directory.mkdir()
    native.save(directory / 'native.png')
    widths = []
    exports = []
    variants = {'red': [], 'blue': [], 'green': [], 'mask': []}
    for density in (2, 4):
        size = ((bbox[2] - bbox[0]) * density, (bbox[3] - bbox[1]) * density)
        corrected = key in ('YAGGUN-TURRET-0', 'YAPPET-OPEN', 'YAREFN-TURRET-0')
        if corrected:
            scale = min(size[0] / crop.width, size[1] / crop.height)
            size = (round(crop.width * scale), round(crop.height * scale))
        assert size[0] <= crop.width and size[1] <= crop.height, (key, size, crop.size)
        canvas = Image.new('RGBA', (native.width * density, native.height * density))
        offset = (round((bbox[0] + bbox[2]) * density / 2 - size[0] / 2), bbox[3] * density - size[1])
        canvas.paste(crop.resize(size, Image.Resampling.LANCZOS), offset)
        rgba = np.array(canvas)
        data = np.zeros_like(rgba)
        data[..., 3] = 255
        if identity not in ('GAFWLL',) and key != 'YAGGUN-TEMPERATE' and not key.startswith('YAREFN-TURRET'):
            data, _, _ = complete_data(rgba, data, density, identity, 'representative-only')
        mask = data[..., 0] >= 128
        shade = data[..., 1]
        Image.fromarray(data).save(directory / f'data-{density}x.png')
        for color, base in [('red', None), ('blue', (70, 140, 255)), ('green', (70, 230, 100))]:
            pixels = rgba.copy()
            if base:
                # Review illustration only: B's categorical shades preserve a ramp.
                level = (63 - shade.astype(float) * 55 / 15) / 63
                pixels[..., :3][mask] = np.clip(level[..., None] * np.array(base), 0, 255)[mask]
            file = directory / f'{color}-{density}x.png'
            Image.fromarray(pixels).save(file)
            variants[color].append(embed(file))
        overlay = rgba.copy()
        overlay[..., :3][mask] = (255, 220, 0)
        file = directory / f'mask-{density}x.png'
        Image.fromarray(overlay).save(file)
        variants['mask'].append(embed(file))
        exports.append({'density': density, 'canvas': list(canvas.size), 'nativeCanvas': list(native.size),
                        'destinationBounds': [*offset, offset[0] + size[0], offset[1] + size[1]], 'sourceSubject': list(subject),
                        'scale': [size[0] / crop.width, size[1] / crop.height], 'upsampling': False,
                        'proportions': 'UNIFORM_REGISTRATION_CORRECTED' if corrected else 'NATIVE_DIRECTION_BOUNDS_FIT',
                        'ownerMaskPixels': int(mask.sum()), 'status': 'REPRESENTATIVE_ONLY_NOT_RUNTIME_SELECTED'})
        widths.append(native.width)
    record = {'key': key, 'id': identity, 'master': str(raw_path), 'masterDimensions': list(master.size),
              'masterSha256': hashlib.sha256(raw_path.read_bytes()).hexdigest(), 'subjectBounds': list(subject),
              'exports': exports, 'notes': notes, 'variants': variants}
    records.append(record)
    assets = html.escape(json.dumps(variants), quote=True)
    cards.append(f'<article id="{key}" data-assets="{assets}"><h2>{key}</h2><p>{notes}</p>'
                 '<div class="comparisons">'
                 f'<figure><figcaption>Original reference</figcaption><img class="native" src="{embed(directory / "native.png")}" width="{native.width}" height="{native.height}"></figure>'
                 + ''.join(f'<figure><figcaption>{d}x buffer · {native.width*d} × {native.height*d}</figcaption>'
                           f'<img class="density d{d}" data-density="{d}" src="{variants["red"][i]}" width="{native.width}" height="{native.height}"></figure>'
                           for i, d in enumerate((2, 4))) + '</div></article>')

ledger = json.loads((ROOT / 'ledger-v2.json').read_text())
applicable = [f for f in ledger['families'] if f['id'] != 'YADEPT']
approved = (ROOT / 'representative-acceptance-v1.json').exists()
metadata = {'status': 'APPROVED_DIRECTION_PROPORTION_CORRECTIONS' if approved else 'REPRESENTATIVE_BATCH_REVIEW_PENDING', 'productionCompleteNewFamilies': 0,
            'rulesAudited': 17, 'applicableRules': 16, 'applicableTheaterCells': 96,
            'uniqueSourceGroupsApplicable': sum(len(f['sourceGroups']) for f in applicable),
            'imagegenCalls': len(receipts), 'newDesigns': 14, 'samples': len(records),
            'ownerControls': 'PROVISIONAL_AUTHORED_MATERIAL_ILLUSTRATIONS_NOT_NATIVE_OWNER_COLOR_PROOF',
            'geometry': 'Direction crops fitted once to the native sample bounds, not full-sequence geometry validation',
            'records': [{k: v for k, v in r.items() if k != 'variants'} for r in records]}
(OUT / 'export-provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')
for family in ledger['families']:
    family['representatives'] = [r['key'] for r in records if r['id'] == family['id']]
ledger['status'] = metadata['status']
ledger['representativeReview'] = str(OUT / 'Yuri-Buildings-Representative-Review.html')
ledger['representativeProvenance'] = str(OUT / 'export-provenance.json')
(OUT / 'ledger.json').write_text(json.dumps(ledger, indent=2) + '\n')

map_root = Path('.artifacts/map-selection-layout')
map_cards = ''.join(f'<figure><figcaption>{label}</figcaption><img class="map" src="{embed(file)}"></figure>'
                    for label, file in [('Before · HTML scrollTop 4.5 px', map_root / 'before-v5/full-0.png'),
                                        ('After · HTML scrollTop 0 px', map_root / 'final-package-yr-v1/full-0.png')])
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Task C Yuri buildings representative review</title><style>
*{box-sizing:border-box}body{margin:0;background:#151c21;color:#e9edf0;font:17px/1.5 system-ui,sans-serif}
header,main{max-width:1450px;margin:auto;padding:24px}h1{font-size:30px}h2{font-size:22px;margin:0 0 10px}
p{max-width:1100px}article,.evidence{background:#202b32;border:1px solid #45545e;border-radius:8px;padding:20px;margin:22px 0}
nav{position:sticky;top:0;background:#10191ff2;padding:12px 24px;z-index:1;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
select{font:inherit;padding:5px}a{color:#99d9ff}.comparisons{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end}
figure{margin:0;max-width:100%;overflow:auto;background:#334b40;padding:12px}figcaption{font-size:15px;margin-bottom:8px}
img{display:block;object-fit:contain}.native{image-rendering:pixelated}.map{width:min(100%,1000px);height:auto}
.buffer .density{width:var(--buffer-width);height:var(--buffer-height)}.buffer figure{max-width:100%;max-height:900px}
.warning{color:#ffd587;font-weight:600}table{border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #58616a;text-align:left}
</style><header><h1>Task C · Yuri buildings representative batch</h1>
<p class="warning">PARTIAL_BATCH_DELIVERED · One direction decision is pending. These paired 2x/4x samples are not complete game resources.</p>
<p>14 new designs, 18 direction samples, and 20 preserved image-generation outputs. Both densities are derived independently from adequate high-resolution subjects; none of these samples upscales a 2x atlas. Original/2x/4x use the same CSS geometry at 100% browser zoom.</p>
<p>Choose the direction for the batch, with named exceptions if needed. Construction, selling, damage, complete mechanical sequences, theater exports, native owner-color capture and final package activation follow the direction decision.</p>
</header><nav><label>Owner illustration <select id="owner"><option value="red">Authored red</option><option value="blue">Blue</option><option value="green">Green</option><option value="mask">Paint mask</option></select></label>
<label>View <select id="view"><option value="logical">Same native logical size</option><option value="buffer">Full exported buffer size</option></select></label>
<label>Sample <select id="sample"><option value="all">All samples</option>__OPTIONS__</select></label></nav><main>
<p>Owner controls are provisional material illustrations using categorical shade ramps. They do not prove gameplay remapping. Fixed violet architecture, glass and lights remain unchanged. Wall masonry, the stationary Gatling base and the neutral Slave Miner turret are excluded. Native all-frame masks and non-red capture evidence remain pending.</p>
__CARDS__
<section class="evidence"><h2>Accepted design references and native scope</h2><p>NAPSIS and NACLON retain their accepted Soviet design direction. Native YR source contracts differ: NAPSIS changes canvas 264 × 208 to 262 × 210 with shifted trims; NACLON retains its canvas but changes body/construction/shadow coverage. New YR exports are required, so the accepted RA2 atlases are preserved and are not declared compatible.</p>
<p>The retail inventory contains 17 rules identities and 102 theater cells. Native production closure reaches 16 identities / 96 cells. YADEPT is retained as an explicit native TechLevel 15 exclusion above the normal skirmish limit 10. Required SHP and VXL/HVA dependencies remain in the resumable ledger.</p>
<table><tr><th>Work</th><th>Status</th></tr><tr><td>136 native SHP source contracts / 5,398 slots / 118 zero-extent slots</td><td>Audited</td></tr><tr><td>New complete 2x and 4x family selections</td><td>0 · pending batch direction and production</td></tr><tr><td>Native owner colors, functions, four combined density/theater runs</td><td>Pending production</td></tr><tr><td>RA2/YR packaged map-layout regression</td><td>PASS · controlled real UI</td></tr></table></section>
<section class="evidence"><h2>Map selection content shift · before / after</h2>
<p>In actual application fullscreen, delayed scrollIntoView moved the HTML ancestor by 4.5 CSS px while OS bounds and transforms remained stable. The fix changes only selected-row reveal in MapSel: scroll the map list itself and keep the row visible. No global offset or page reset is applied.</p>
<p>The packaged app passed six YR cycles and two quick RA2 cycles across actual fullscreen and windowed modes, with saved end-of-list selection, scrollbar drag, search, Use Map and Cancel. Outer anchors stayed stable. Physical input/display-panel checks and Windows are not certified.</p>__MAP__</section>
<p>Review app: RA2-HD-Task-C-Map-Review. Its current resources are accepted predecessor resources; this app demonstrates the map fix, not completed Yuri HD. Use Launch-Isolated-Review.command beside the app to preserve the normal profile.</p>
</main><script>
const articles=[...document.querySelectorAll('article')];
function update(){const owner=document.querySelector('#owner').value,key=document.querySelector('#sample').value;
document.body.classList.toggle('buffer',document.querySelector('#view').value==='buffer');
for(const article of articles){article.hidden=key!=='all'&&article.id!==key;const assets=JSON.parse(article.dataset.assets);
article.querySelectorAll('.density').forEach((img,i)=>{img.src=assets[owner][i];img.style.setProperty('--buffer-width',Number(img.getAttribute('width'))*Number(img.dataset.density)+'px');img.style.setProperty('--buffer-height',Number(img.getAttribute('height'))*Number(img.dataset.density)+'px')})}}
document.querySelectorAll('select').forEach(s=>s.addEventListener('change',update));update();
</script></html>'''
options = ''.join(f'<option value="{r["key"]}">{r["key"]}</option>' for r in records)
page = page.replace('__OPTIONS__', options).replace('__CARDS__', ''.join(cards)).replace('__MAP__', map_cards)
if approved:
    page = page.replace('PARTIAL_BATCH_DELIVERED · One direction decision is pending.', 'PARTIAL_BATCH_DELIVERED · Batch direction approved; three proportion corrections shown.')
    page = page.replace('Choose the direction for the batch, with named exceptions if needed.', 'Batch direction is approved. The three noted samples now use uniform scaling; other accepted directions remain available as reference.')
    page = page.replace('follow the direction decision.', 'are authorized and remain in progress.')
    page = page.replace('<option value="all">All samples</option>', '<option value="changed">Three corrected samples</option><option value="all">All samples (reference)</option>')
    page = page.replace("article.hidden=key!=='all'&&article.id!==key", "article.hidden=key==='changed'?!['YAGGUN-TURRET-0','YAPPET-OPEN','YAREFN-TURRET-0'].includes(article.id):key!=='all'&&article.id!==key")
(OUT / 'Yuri-Buildings-Representative-Review.html').write_text(page)

# Static overview is a navigation aid; the HTML retains full exported pixels.
board = Image.new('RGB', (1800, 5 * 360), '#202b32')
draw = ImageDraw.Draw(board)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 23)
for i, record in enumerate(records):
    x, y = i % 4 * 450, i // 4 * 360
    draw.text((x + 15, y + 12), record['key'], fill='white', font=font)
    im = Image.open(OUT / record['key'] / 'red-4x.png')
    im.thumbnail((420, 295), Image.Resampling.LANCZOS)
    board.paste(im, (x + 15, y + 50), im)
board.save(OUT / 'overview.png')
print(json.dumps({k: v for k, v in metadata.items() if k != 'records'}))
