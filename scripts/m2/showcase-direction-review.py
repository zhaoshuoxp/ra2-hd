"""Export representative density pilots and a self-contained direction review."""
import base64
import hashlib
import html
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops

root = Path('.artifacts/m2-2')
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=False)
source_root = root / 'prepared-native-v2'
water_selection = json.loads(Path(sys.argv[sys.argv.index('--water-panels') + 1]).read_text()) \
    if '--water-panels' in sys.argv else None
source = json.loads((source_root / 'source.json').read_text())
members = {entry['member']: entry for entry in source['sources']}
masters = root / 'authoring-direction-v1'
references = root / 'direction-references-v2'
sha = lambda data: hashlib.sha256(data).hexdigest()


def data_url(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()


def png_bytes(image):
    output = io.BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


def panel(master, cell, regions=None):
    width, height = master.size
    x, y = cell % 2, cell // 2
    box = (x * width // 2, y * height // 2, (x + 1) * width // 2, (y + 1) * height // 2)
    if regions:
        rx, ry, rw, rh = regions[str(cell)]
        box = (round(rx * width), round(ry * height), round((rx + rw) * width), round((ry + rh) * height))
    crop = master.crop(box)
    bounds = crop.getbbox()
    assert bounds
    return crop.crop(bounds), [box[0] + bounds[0], box[1] + bounds[1],
                               box[0] + bounds[2], box[1] + bounds[3]]


categories = [
    ('ground-water', 'Ground, shore and water', 'Native contacts and phase geometry remain mandatory.'),
    ('props-resources', 'Ore, gems, vegetation and rocks', 'Amount states, shadows and removal remain mandatory.'),
    ('civil-buildings', 'Civilian and technology buildings', 'Normal direction only. Larger independent production masters are required.'),
    ('bridges', 'Concrete and wood bridges', 'Passage, damage and repair require complete native state families.'),
    ('neutral-actors', 'Neutral vehicles and animals', 'Heading, owner masks and action sequences remain mandatory.'),
]
pilots = [
    ('ground-water', 0, 'ruff01.tem', 0), ('ground-water', 2, 'water04.tem', 0),
    ('ground-water', 3, 'wb04x.tem', 0), ('props-resources', 0, 'tib01.tem', 11),
    ('props-resources', 1, 'gem01.tem', 11), ('props-resources', 2, 'tree05.tem', 0),
    ('props-resources', 3, 'trock01.tem', 0), ('neutral-actors', 2, 'cow.shp', 16),
    ('neutral-actors', 3, 'cow.shp', 80),
]
records = []
for category, cell, member, slot in pilots:
    master_path = Path(water_selection['panels'][str(cell)]['master']) \
        if water_selection and category == 'ground-water' else masters / f'{category}-master.png'
    if water_selection and category == 'ground-water':
        assert sha(master_path.read_bytes()) == water_selection['panels'][str(cell)]['masterSha256']
    master = Image.open(master_path).convert('RGBA')
    crop, bounds = panel(master, cell, water_selection.get('regions')
                         if water_selection and category == 'ground-water' else None)
    entry = members[member]
    frame = entry.get('images', entry.get('frames'))[slot]
    native = Image.frombytes('RGBA', tuple(frame['size']), (source_root / 'native' / frame['file']).read_bytes())
    alpha = native.getchannel('A')
    native_bounds = alpha.getbbox()
    assert native_bounds
    logical_width = native_bounds[2] - native_bounds[0]
    logical_height = native_bounds[3] - native_bounds[1]
    record = dict(category=category, cell=cell, member=member, slot=slot, nativeSize=list(native.size),
                  nativeMetadata=frame, sourceSha256=entry['sha256'], palette=entry['palette'],
                  master=str(master_path), masterSha256=sha(master_path.read_bytes()), masterCrop=bounds,
                  cropSize=list(crop.size), nativeBounds=list(native_bounds), outputs={},
                  status='APPROVED_DIRECTION_REGISTRATION_PILOT' if water_selection else 'UNAPPROVED_DIRECTION_REGISTRATION_PILOT', runtimeBinding=False)
    if crop.width < logical_width * 4 or crop.height < logical_height * 4:
        record['status'] = 'STYLE_ONLY_INSUFFICIENT_MASTER_RESOLUTION'
        records.append(record)
        continue
    name = f'{category}-{cell}-{member}-{slot}'
    native_path = out / f'{name}-native.png'
    native_path.write_bytes(png_bytes(native))
    record['nativePreview'] = native_path.name
    for density in (2, 4):
        # Each output samples the original master crop directly, never the other density.
        sampled = crop.resize((logical_width * density, logical_height * density), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (native.width * density, native.height * density))
        canvas.alpha_composite(sampled, (native_bounds[0] * density, native_bounds[1] * density))
        mask = alpha.resize(canvas.size, Image.Resampling.NEAREST)
        canvas.putalpha(ImageChops.multiply(canvas.getchannel('A'), mask))
        path = out / f'{name}-{density}x.png'
        path.write_bytes(png_bytes(canvas))
        record['outputs'][str(density)] = dict(file=path.name, size=list(canvas.size), sha256=sha(path.read_bytes()),
                                             directlySampledMasterSha256=record['masterSha256'])
    records.append(record)

sections = []
media = []
for key, title, note in categories:
    native_path, master_path = references / f'{key}-native-board.png', masters / f'{key}-master.png'
    for role, path in (('native-reference', native_path), ('generated-direction', master_path)):
        image = Image.open(path)
        media.append(dict(category=key, role=role, file=str(path), sha256=sha(path.read_bytes()), size=list(image.size)))
    direction_board = f'<img class="board" src="{data_url(master_path)}" alt="Direction {title}">'
    if water_selection and key == 'ground-water':
        corrected = Path(water_selection['panels']['1']['master'])
        assert water_selection['panels']['1']['master'] == water_selection['panels']['2']['master']
        assert sha(corrected.read_bytes()) == water_selection['panels']['1']['masterSha256']
        media.append(dict(category=key, role='sea-color-correction-only', file=str(corrected),
                          sha256=sha(corrected.read_bytes()), size=list(Image.open(corrected).size)))
        direction_board = f'''<div class="board corrected-board"><canvas id="water-board"></canvas>
<img id="water-original" hidden src="{data_url(master_path)}" alt="Preserved original grass and waterfall">
<img id="water-corrected" hidden src="{data_url(corrected)}" alt="Corrected sea panel source"></div>'''
    samples = []
    for record in [record for record in records if record['category'] == key and record['outputs']]:
        width, height = record['nativeSize']
        columns = [f'<figure><img class="sample" width="{width}" height="{height}" src="{data_url(out / record["nativePreview"])}"><figcaption>Original</figcaption></figure>']
        for density, output in record['outputs'].items():
            columns.append(f'<figure><img class="sample" width="{width}" height="{height}" src="{data_url(out / output["file"])}"><figcaption>{density}X direct sample · {output["size"][0]} × {output["size"][1]}</figcaption></figure>')
        samples.append(f'<div class="pilot"><p>{html.escape(record["member"])} · native slot {record["slot"]} · {width} × {height}</p><div class="samples">{"".join(columns)}</div></div>')
    section = f'''<section id="{key}"><h2>{title}</h2><p>{note}</p>
<div class="compare"><figure><figcaption>Original native guide</figcaption><img class="board" src="{data_url(native_path)}" alt="Original {title}"></figure>
<figure><figcaption>{'Approved direction; corrected sea panels only' if water_selection else 'Unapproved direction study'}</figcaption>{direction_board}</figure></div>
<details><summary>Representative density pilots ({len(samples)})</summary><p>Direct master samples with exact native occupancy masks. One selected slot per representative; no family or runtime acceptance. Display scale is shared between Original, 2X and 4X.</p>{''.join(samples)}</details></section>'''
    sections.append(section)
baseline = Path('/Users/Aone/RA2remaster/ra2-hd-m2-1-integration/.artifacts/m2-integration/matched-4x/native-placed-building-framebuffer.png')
media.append(dict(category='baseline', role='integrated-runtime-context', file=str(baseline), sha256=sha(baseline.read_bytes())))
template = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.2 temperate directions — review 1</title><style>
:root{font:18px/1.5 system-ui;color:#e5e9e7;background:#17201d}*{box-sizing:border-box}body{margin:0 auto;padding:30px;max-width:1480px}h1{font-size:32px}h2{font-size:27px;margin:0}p{max-width:1050px}a{color:#acdbbc}nav{display:flex;gap:18px;flex-wrap:wrap}section{margin:32px 0;padding:24px;border:1px solid #506157;border-radius:12px;background:#242e29}figure{margin:0;min-width:0}figcaption{margin:8px 0;color:#c6d2ca;font-size:16px}.compare{display:grid;grid-template-columns:1fr 1fr;gap:24px}.board{width:100%;height:650px;object-fit:contain;background:#435346}details{margin-top:20px}summary{cursor:pointer;font-weight:600}.samples{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.samples figure{padding:20px;background:#435346;min-height:110px}.sample{object-fit:contain;display:block;max-width:none}.pilot{margin:20px 0;padding:10px;border:1px solid #526457}.controls{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0}select{font:inherit}.status{padding:16px;border-left:4px solid #d5b579;background:#34352b}.context{max-width:100%;height:auto}@media(max-width:800px){body{padding:14px}.compare{grid-template-columns:1fr}.board{height:auto}.samples{grid-template-columns:1fr}}
</style><h1>M2.2 temperate art directions</h1><p class="status">Review 1 · New directions await user approval. M2.1 is integrated into local main. Substantial M2.2 families and native states remain missing; whole-map completion is pending.</p>
<p>Approve or revise the material/style direction of each group. Native geometry, footprints, masks, frame order, separate shadows and gameplay remain fixed. Approval authorizes batch production; final combined in-game review is a later decision.</p>
<nav>@@NAV@@</nav><div class="controls"><label>Cutout background <select id="background"><option value="#435346">Neutral green</option><option value="#ddd8cd">Light</option><option value="#151b18">Dark</option></select></label><label>Density pilot inspection <select id="scale"><option value="1">Native logical size</option><option value="2">2× inspection</option><option value="4">4× inspection</option></select></label></div>
@@SECTIONS@@<section id="baseline"><h2>Accepted integrated runtime context</h2><p>Copied M2.1 integrated application, XMP03T4.map, 4X, matched 1080p output. This is baseline evidence: new M2.2 objects are still Original here. No newly authored direction is composited into this screenshot.</p><img class="context" src="@@BASELINE@@" alt="Accepted integrated M2.1 scene"></section>
<p>Baseline: local main 7533e13; runtime bc945a2; terrain temperate-m2-1-seams-v13d. Map ledger: 258 reused identity rows, 375 missing identity rows, one non-renderable registry endpoint, 62 control-only rows. Density pilots are authoring checks; animation, full-family fallback, allocation and in-game checks remain pending.</p>
<script>document.querySelector('#background').onchange=e=>document.querySelectorAll('.board,.samples figure').forEach(el=>el.style.background=e.target.value);document.querySelector('#scale').onchange=e=>document.querySelectorAll('.sample').forEach(img=>{img.style.width=Number(img.getAttribute('width'))*Number(e.target.value)+'px';img.style.height=Number(img.getAttribute('height'))*Number(e.target.value)+'px';});</script></html>'''
substitutions = {'@@NAV@@': ''.join(f'<a href="#{key}">{title}</a>' for key, title, _ in categories),
                 '@@SECTIONS@@': ''.join(sections), '@@BASELINE@@': data_url(baseline)}
import re
page = re.sub('|'.join(re.escape(key) for key in substitutions), lambda match: substitutions[match[0]], template)
if water_selection:
    page = page.replace('review 1', 'review 2').replace(
        'Review 1 · New directions await user approval.',
        'Review 2 · Other directions approved. Sea color corrected; original grass and waterfall retained.')
    page = page.replace('Approve or revise the material/style direction of each group.',
        'The recorded user decision authorizes category production. Only the two sea panels change here.')
    page = page.replace('</style>', '.corrected-board{display:grid;place-items:center}'
        '.corrected-board canvas{max-width:100%;max-height:100%;object-fit:contain}</style>')
    panel_script = '''<script>
Promise.all([document.querySelector('#water-original').decode(),document.querySelector('#water-corrected').decode()]).then(()=>{
 const original=document.querySelector('#water-original'), corrected=document.querySelector('#water-corrected');
 const canvas=document.querySelector('#water-board');canvas.width=original.naturalWidth;canvas.height=original.naturalHeight;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(original,0,0);
 const baseline=context.getImageData(0,0,canvas.width,canvas.height).data;
 const halfX=canvas.width/2,halfY=canvas.height/2,regions=@@WATER_REGIONS@@;
 for(const cell of [1,2]){const [rx,ry,rw,rh]=regions[cell];
  const [x,y,w,h]=[rx*canvas.width,ry*canvas.height,rw*canvas.width,rh*canvas.height].map(Math.round);
  context.clearRect(x,y,w,h);
  context.drawImage(corrected,rx*corrected.naturalWidth,ry*corrected.naturalHeight,
   rw*corrected.naturalWidth,rh*corrected.naturalHeight,x,y,w,h);}
 const final=context.getImageData(0,0,canvas.width,canvas.height).data,changed=[0,0,0,0];
 let protectedChanges=0;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  const cell=Math.floor(y/halfY)*2+Math.floor(x/halfX),at=(y*canvas.width+x)*4;
  if([0,1,2,3].some(channel=>baseline[at+channel]!==final[at+channel])){
   changed[cell]++;
   const allowed=[1,2].some(cell=>{const [rx,ry,rw,rh]=regions[cell];
    return x>=Math.round(rx*canvas.width)&&x<Math.round((rx+rw)*canvas.width)
     &&y>=Math.round(ry*canvas.height)&&y<Math.round((ry+rh)*canvas.height);});
   if(!allowed)protectedChanges++;
  }}
 window.__m2WaterPanelReport={changedPixels:changed,protectedChanges,protectedPanelsExact:protectedChanges===0,
  scope:'Top-right shoreline/sea and bottom-left sea only; previous grass and waterfall pixels are unchanged.'};
});</script>'''
    panel_script = panel_script.replace('@@WATER_REGIONS@@', json.dumps(water_selection.get('regions',
        {'0': [0, 0, .5, .5], '1': [.5, 0, .5, .5], '2': [0, .5, .5, .5], '3': [.5, .5, .5, .5]})))
    page = page.replace('</html>', panel_script + '</html>')
(out / 'index.html').write_text(page)
manifest = dict(schema='m2-2-direction-review-v1', status='DIRECTION_APPROVED_SEA_CORRECTION_REVIEW' if water_selection else 'ART_DIRECTION_APPROVAL_PENDING',
                media=media, pilots=records, reviewSha256=sha(page.encode()),
                productionPublished=False, runtimeAcceptance=False, wholeMapComplete=False,
                waterPanelSelection=water_selection)
(out / 'review.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(dict(review=str(out / 'index.html'), categories=len(categories), pilots=len(records),
                      exportPairs=sum(bool(record['outputs']) for record in records))))
