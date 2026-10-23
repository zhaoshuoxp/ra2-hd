"""Embed matched copied-runtime comparisons and eight-color material inspection offline."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--two', type=Path, required=True)
parser.add_argument('--four', type=Path, required=True)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--baseline-two', type=Path)
parser.add_argument('--two-damage', type=Path)
parser.add_argument('--four-damage', type=Path)
parser.add_argument('--base-pack', type=Path, default=Path('.local/environment-packs/environment-m2-2-complete-v6'))
parser.add_argument('--pack', type=Path, default=Path('.local/environment-packs/environment-m2-2-complete-v9'))
parser.add_argument('--only', help='Comma-separated rules identities for a focused review')
args = parser.parse_args()
only = set(args.only.split(',')) if args.only else None
args.output.mkdir(exist_ok=False)
media, cases, probes = [], [], []


def embed_image(image, source):
    stream = io.BytesIO()
    image.save(stream, format='PNG', optimize=True)
    data = stream.getvalue()
    media.append(dict(source=source, sha256=hashlib.sha256(data).hexdigest(), size=list(image.size)))
    return 'data:image/png;base64,' + base64.b64encode(data).decode()


def crop(root, case, mode):
    file = root / (case['name'] + '-' + mode + '.png')
    x0, y0, x1, y1 = case['bounds']
    box = [x0 - 12, y0 - 12, x1 + 12, y1 + 12]
    return embed_image(Image.open(file).crop(box), str(file.resolve()) + '#' + str(box))


reports = {density: json.loads((root / 'report.json').read_text()) for density, root in [(2, args.two), (4, args.four)]}
baseline_roots = {2: args.baseline_two or args.baseline, 4: args.baseline}
baseline_cases = {density: {c['name']: c for c in json.loads((root / 'report.json').read_text())['cases']}
                  for density, root in baseline_roots.items()}
roots = [(2, args.two), (4, args.four)]
roots += [(density, root) for density, root in [(2, args.two_damage), (4, args.four_damage)] if root]
for density, root in roots:
    report = json.loads((root / 'report.json').read_text())
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and report['ownerTransitionStatus'] == 'PASS'
    for c in report['cases']:
        family, state = c['name'].split('-', 1)
        if only and family not in only:
            continue
        images = {mode: crop(root, c, mode) for mode in ['original', 'hd']}
        if c['name'] in baseline_cases[density]:
            images['before'] = crop(baseline_roots[density], baseline_cases[density][c['name']], 'hd')
        cases.append(dict(family=family, state=state, density=density, images=images))

prepared = Path('.artifacts/m2-2/prepared-native-v2')
native = {s['member']: s for s in json.loads((prepared / 'source.json').read_text())['sources']}
ledger = json.loads(Path('docs/m2-2-map-coverage.json').read_text())
old_root, new_root = args.base_pack, args.pack
pack = json.loads((new_root / 'manifest.json').read_text())
records = {m['member']: m for f in pack['families'].values() for m in f['members']}
seen = set()
for row in ledger['rows']:
    if row['kind'] != 'building' or row['edition'] != 'yr' or not ('occupied' in row['states'] or row['id'] in ['CAHOSP', 'CATHOSP']):
        continue
    member = row['source']['member']
    if only and row['id'] not in only:
        continue
    if member not in records or not row.get('usage', {}).get('XMP03T4.map', {}).get('count', 0):
        continue
    if member in seen:
        continue
    seen.add(member)
    slot = 2 if 'occupied' in row['states'] else 0
    f = native[member]['frames'][slot]
    w, h = f['size']
    idx = np.frombuffer((prepared / 'native' / f'{member}-{slot}.index').read_bytes(), np.uint8).reshape(h, w)
    owner = (idx >= 16) & (idx <= 31)
    data = np.zeros((h, w, 4), np.uint8)
    data[..., 3] = 255; data[..., 0][owner] = 255; data[..., 1][owner] = idx[owner] - 16
    original = Image.frombytes('RGBA', (w, h), (prepared / 'native' / f['file']).read_bytes())
    probe = dict(family=row['id'], original=embed_image(original, member + ':native'),
        originalData=embed_image(Image.fromarray(data), member + ':native-index'), variants={})
    for density in [2, 4]:
        images = {}
        for role, root in [('before', old_root), ('hd', new_root)]:
            manifest_file = root / records[member]['path']
            hd = json.loads(manifest_file.read_text())
            variant = next(v for v in hd['variants'] if v['density'] == density)
            entry = variant['frames'][slot]
            x, y, rw, rh = entry['sampleRect']
            for kind in ['base', 'data']:
                file = manifest_file.parent / str(density) / entry['page'] / (kind + '.png')
                image = Image.open(file).crop((x, y, x + w * density, y + h * density))
                if kind == 'data':
                    if role == 'hd': images['data'] = embed_image(image, str(file.resolve()))
                else: images[role] = embed_image(image, str(file.resolve()))
        probe['variants'][str(density)] = images
    probes.append(probe)
assert len(probes) == (len(only) if only else 29)
payload = json.dumps(dict(cases=cases, probes=probes, colors=reports[4]['allowedColors']), separators=(',', ':'))
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>M2.2 occupied-building color review</title><style>
:root{color-scheme:dark}body{font:18px/1.5 system-ui;background:#161c22;color:#eef3f6;margin:0}main{max-width:1250px;padding:26px;margin:auto}
h1{font-size:32px}h2{font-size:26px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}button,select{font:inherit;background:#293947;color:inherit;border:1px solid #718491;padding:8px;border-radius:6px}
.row{display:flex;gap:18px;align-items:flex-start;overflow:auto}.row figure{margin:0;flex:1;min-width:210px}figcaption{margin:6px 0;font-weight:600}
img,canvas{display:block;background:#11161b;max-width:none}.note{color:#b7c6d1}details{margin:18px 0}#info{min-height:30px}</style>
<main><h1>Occupied-building color review</h1><p>REVIEW_SCOPE Compare native occupied, evacuated and damaged states below. Red brick, tile roofs and medical crosses retain their Original material colors. All content is embedded for offline use.</p>
<h2>Actual Mac match captures</h2><nav><select id="family"></select><select id="state"></select><select id="density"><option value="4">HD 4X</option><option value="2">HD 2X</option></select><button id="zoom">Detail scale</button></nav>
<div class="row"><figure><figcaption>Original</figcaption><img id="original" alt="Original native state"></figure><figure id="beforeFigure"><figcaption>Previous HD</figcaption><img id="before" alt="Previous HD native state"></figure><figure><figcaption>Corrected HD</figcaption><img id="hd" alt="Corrected HD native state"></figure></div><p id="info" class="note"></p>
<h2>All eight owner colors</h2><p class="note">Material inspection uses the actual exported occupied frame and native indices. Match captures above validate native entry, ownership changes and rendering.</p><nav><select id="probeFamily"></select><select id="color"></select><select id="probeDensity"><option value="4">HD 4X</option><option value="2">HD 2X</option></select></nav>
<div class="row"><figure><figcaption>Original</figcaption><canvas id="probeOriginal"></canvas></figure><figure><figcaption>Previous HD</figcaption><canvas id="probeBefore"></canvas></figure><figure><figcaption>Corrected HD</figcaption><canvas id="probeHd"></canvas></figure></div>
<p class="note">Matched camera projection and frame geometry; no camera zoom or gameplay change. Edge buildings are centered with unrestricted fixture panning. User visual review is pending for this correction. Accepted terrain, water, bridges and unrelated artwork are retained.</p>
<script>const data=PAYLOAD,$=id=>document.getElementById(id);let detail=false,token=0;
const families=[...new Set(data.cases.map(c=>c.family))];families.forEach(f=>$('family').add(new Option(f,f)));
function updateStates(){const old=$('state').value;$('state').replaceChildren();[...new Set(data.cases.filter(c=>c.family===$('family').value).map(c=>c.state))].forEach(s=>$('state').add(new Option(s,s)));if([...$('state').options].some(o=>o.value===old))$('state').value=old;else $('state').value='occupied-enemy';show()}
function show(){const c=data.cases.find(c=>c.family===$('family').value&&c.state===$('state').value&&c.density===Number($('density').value));if(!c)return;for(const mode of ['original','before','hd']){const image=$(mode);image.src=c.images[mode]||c.images.original;image.onload=()=>{image.style.width=image.naturalWidth*(detail?2:1)+'px'}}$('beforeFigure').hidden=!c.images.before;$('info').textContent=c.family+' / '+c.state+' / '+c.density+'X; matched native framebuffer crops.'}
$('family').onchange=updateStates;$('state').onchange=show;$('density').onchange=show;$('zoom').onclick=()=>{detail=!detail;show()};
data.probes.forEach(p=>$('probeFamily').add(new Option(p.family,p.family)));data.colors.forEach((c,i)=>$('color').add(new Option(c.name,i)));$('color').value='2';
async function pixels(url){const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height)}
async function probe(){const current=++token,p=data.probes.find(p=>p.family===$('probeFamily').value),density=Number($('probeDensity').value),v=p.variants[density],color=data.colors[Number($('color').value)].color,factors=[63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8];const rows=[['probeOriginal',p.original,p.originalData,1],['probeBefore',v.before,v.data,density],['probeHd',v.hd,v.data,density]];for(const [id,baseUrl,dataUrl,scale] of rows){const [b,m]=await Promise.all([pixels(baseUrl),pixels(dataUrl)]);if(current!==token)return;for(let i=0;i<b.data.length;i+=4)if(m.data[i]===255){const factor=factors[m.data[i+1]]*4;b.data[i]=Math.floor(color.r/255*factor);b.data[i+1]=Math.floor(color.g/255*factor);b.data[i+2]=Math.floor(color.b/255*factor)}const canvas=$(id);canvas.width=b.width;canvas.height=b.height;canvas.getContext('2d').putImageData(b,0,0);canvas.style.width=(b.width/scale*1.5)+'px'}window.__probeReady={family:p.family,density,color:data.colors[Number($('color').value)].name}}
for(const id of ['probeFamily','probeDensity','color'])$(id).onchange=()=>probe();updateStates();probe();window.__reviewManifest={families:families.length,cases:data.cases.length,probes:data.probes.length,colors:data.colors.length};</script></main></html>'''.replace('PAYLOAD', payload)
page = page.replace('REVIEW_SCOPE', 'Focused correction: ' + ', '.join(sorted(only)) +
                    ' on American Town. Unchanged building checks retain the earlier validation.' if only else
                    'All 44 garrison buildings and both hospitals were checked on American Town.')
file = args.output / 'M2.2-Occupancy-Colors-Offline.html'
file.write_text(page)
receipt = dict(schema='m2-2-occupancy-offline-review-v1', review=str(file.resolve()),
    sha256=hashlib.sha256(file.read_bytes()).hexdigest(), bytes=file.stat().st_size,
    families=len(set(c['family'] for c in cases)), cases=len(cases), probes=len(probes), colors=len(reports[4]['allowedColors']),
    media=media, userAcceptance='PENDING')
(args.output / 'review.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='media'}))
