"""Embed actual copied-runtime captures, native clips and export comparisons offline."""
import argparse
import base64
import hashlib
import html
import json
import io
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--original', type=Path, required=True)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--two', type=Path, required=True)
parser.add_argument('--four', type=Path, required=True)
parser.add_argument('--gallery', type=Path, required=True)
parser.add_argument('--reused-actions', type=Path, nargs='*', default=[])
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
media = []

def embed(file):
    data = file.read_bytes()
    original_hash = hashlib.sha256(data).hexdigest()
    if file.suffix == '.png':
        with Image.open(file) as image:
            buffer = io.BytesIO()
            image.save(buffer, format='PNG', optimize=True, compress_level=9)
            data = buffer.getvalue()
            with Image.open(io.BytesIO(data)) as copy:
                assert copy.mode == image.mode and copy.size == image.size and copy.tobytes() == image.tobytes()
        optimized = args.output / 'media' / f'{len(media):04}.png'
        optimized.parent.mkdir(exist_ok=True)
        optimized.write_bytes(data)
        source = file
        file = optimized
    else:
        source = file
    digest = hashlib.sha256(data).hexdigest()
    media.append(dict(file=str(file.resolve()), source=str(source.resolve()), sourceSha256=original_hash,
                      sha256=digest, bytes=len(data), pixels='EXACT_NATIVE_CAPTURE_OR_EXPORT'))
    mime = 'video/webm' if file.suffix == '.webm' else 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(data).decode()

scenes = []
for file in sorted(args.two.glob('route-*-framebuffer.png')):
    if int(file.name.split('-')[1]) not in [1, 3, 4, 5, 10, 15, 18, 20, 21]:
        continue
    row = dict(name=file.stem.removesuffix('-framebuffer'), images={})
    for key, root in [('original', args.original), ('baseline', args.baseline), ('2', args.two), ('4', args.four)]:
        counterpart = root / file.name
        if not counterpart.exists():
            continue
        with Image.open(counterpart) as image:
            assert image.size == (1489, 1080), counterpart
        row['images'][key] = embed(counterpart)
    assert len(row['images']) == 4, row['name']
    scenes.append(row)
gallery = json.loads(args.gallery.read_text())
families = []
for family in gallery['families']:
    families.append(dict(name=family['identity'], logical=family['logical'], members=family['members'],
        samples=family['samples'], images={density: embed(Path(entry['file'])) for density, entry in family['images'].items()}))
for family in json.loads(Path('.artifacts/m2-2/complete-vxl-gallery-v1/gallery.json').read_text())['families']:
    families.append(dict(name='Neutral vehicle / ' + family['name'], logical=family['logical'], members=family['members'],
        samples=family['samples'], images={density: embed(Path(entry['file'])) for density, entry in family['images'].items()}))
clips = []
for root in [args.two, args.four, *args.reused_actions]:
    for file in sorted(root.glob('*.webm')):
        clips.append(dict(name=f'{root.name} / {file.stem}', src=embed(file)))
states = []
for root, density in [(args.two, 2), (args.four, 4), *[(root, 2) for root in args.reused_actions]]:
    for file in sorted(root.glob('*-framebuffer.png')):
        if file.name.startswith('route-'):
            continue
        if not any(name in file.name for name in ['building-native-rubble', 'house-native-occupied', 'cow-native-death',
            'ore-native-harvest', 'ore-tree-native-regrowth', 'bridge-native-engineer-repair', 'native-paid-production', 'cona-native-move-turn']):
            continue
        states.append(dict(name=f'{density}X / {file.stem.removesuffix("-framebuffer")}', src=embed(file)))
payload = json.dumps(dict(scenes=scenes, families=families, clips=clips, states=states), separators=(',', ':'))
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>RA2 HD M2.2 — Complete Temperate Showcase</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#141a20;color:#e8eef2;font:18px/1.5 system-ui}
main{max-width:1500px;margin:auto;padding:28px}h1{font-size:34px}h2{font-size:27px;margin:32px 0 12px}
button,select{font:inherit;padding:8px 12px;border:1px solid #627785;border-radius:7px;background:#26333e;color:inherit}
button[aria-pressed=true]{background:#306886}nav{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;align-items:center}
.viewport{overflow:auto;border:1px solid #44525f;background:#080b0e;max-height:950px}.scene{display:block;width:1241.3793103448277px;max-width:none}
.fit .scene{width:100%;max-width:1489px}.family{display:block;max-width:none}.note{color:#b9c7ce}
video{display:block;width:100%;max-width:1241px;background:black}details{border:1px solid #44525f;padding:12px;margin:14px 0}
a{color:#90d9ff}.state{display:block;width:100%;max-width:1489px}summary{cursor:pointer;font-size:21px}
</style><main><h1>M2.2 — Complete Temperate Showcase</h1>
<p>Actual unchanged retail XMP03T4.map, with Original, integrated M2.1 and complete M2.2 2X/4X comparisons. Every image and short clip is embedded in this file; no server or network is needed.</p>
<p class="note">These are native Mac captures with a fixed seed, legal test actors, revealed shroud and suspended bot thinking. The camera, game speed, rules and map are unchanged. Export boards are labeled separately. Whole-map visual acceptance and local main promotion are pending. Windows performance and physical input remain deferred.</p>
<p class="note">Use 4X for the complete-map HD review. With the fixed 256 MiB 2X world limit, the mixed six-actor test selects Original E1 and INIT families when residency is full; 4X retains both in HD. Complete environment families remain selected in both densities. Matched sustained panning averages 16.67 ms; map entry takes 6.887/11.123 seconds at 2X/4X versus 4.418/5.318 seconds for M2.1. These are short observations on the same 60 Hz Mac.</p>
<h2>Whole-map native views</h2><nav><select id="scene"></select><button data-mode="original">Original</button><button data-mode="baseline">M2.1 baseline</button><button data-mode="2">M2.2 2X</button><button data-mode="4">M2.2 4X</button><button id="fit">Fit / native logical size</button></nav>
<div class="viewport" id="sceneViewport"><img id="sceneImage" class="scene" alt="Native map capture"></div>
<details><summary>Native center crop</summary><p class="note">Exact framebuffer rectangle [420, 220, 480, 400], displayed without enlargement. Switch the scene or comparison above to update this crop.</p><canvas id="detail" width="480" height="400"></canvas></details>
<p class="note">Framebuffer: 1489 × 1080; native logical display: 1241.379 × 900. Fit changes only page display. Grass and waterfall direction masters retain their accepted previous shapes; only the approved sea panels were corrected.</p>
<h2>Native dynamic states</h2><p>Ordinary move, harvest/unload, ore growth, occupancy, damage/rubble, bridge passage/engineer repair and paid production/combat are recorded separately from static export checks.</p><div id="states"></div><div id="clips"></div>
<h2>Complete environment export comparisons</h2><p>98 canonical SHP families, 178 members and 978 body slots, followed by 12 neutral vehicles with eight bearings each. TRUCKA reuses accepted DTRUCK. These boards show representative original native frames and independently sampled authored exports at the same logical size. Native VXL captures use their recorded logical ratio. Empty slots, native shadows, source masks and intermediate frames are covered by the export verifier.</p>
<nav><select id="family"></select><select id="familyDensity"><option value="1">Original</option><option value="2">2X export</option><option value="4" selected>4X export</option></select><select id="inspect"><option value="1">Native size</option><option value="2">2× inspection</option><option value="4">4× inspection</option></select></nav>
<p id="familyInfo" class="note"></p><div class="viewport"><img id="familyImage" class="family" alt="Technical export comparison"></div>
<script>const data=PAYLOAD;let mode='4';const byId=id=>document.getElementById(id);
function scene(){const row=data.scenes[Number(byId('scene').value)];byId('sceneImage').src=row.images[mode];document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));}
byId('sceneImage').onload=()=>byId('detail').getContext('2d').drawImage(byId('sceneImage'),420,220,480,400,0,0,480,400);
data.scenes.forEach((row,i)=>byId('scene').add(new Option(row.name,i)));byId('scene').onchange=scene;
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;scene()});byId('fit').onclick=()=>byId('sceneViewport').classList.toggle('fit');
function family(){const row=data.families[Number(byId('family').value)];byId('familyImage').src=row.images[byId('familyDensity').value];byId('familyImage').style.width=row.logical[0]*Number(byId('inspect').value)+'px';byId('familyInfo').textContent=row.members.join(', ')+' — '+row.samples+' native-frame samples';}
data.families.forEach((row,i)=>byId('family').add(new Option(row.name,i)));['family','familyDensity','inspect'].forEach(id=>byId(id).onchange=family);
for(const row of data.states){const d=document.createElement('details'),s=document.createElement('summary'),i=document.createElement('img');s.textContent=row.name;i.className='state';i.alt=row.name;d.append(s,i);d.ontoggle=()=>{if(d.open)i.src=row.src};byId('states').append(d)}
for(const row of data.clips){const d=document.createElement('details'),s=document.createElement('summary'),v=document.createElement('video');s.textContent=row.name;v.controls=true;v.muted=true;v.preload='none';d.append(s,v);d.ontoggle=()=>{if(d.open)v.src=row.src;else v.pause()};byId('clips').append(d)}
scene();family();window.__reviewManifest={scenes:data.scenes.length,families:data.families.length,states:data.states.length,clips:data.clips.length};</script></main></html>'''.replace('PAYLOAD', payload)
file = args.output / 'M2.2-Combined-Offline.html'
file.write_text(page)
receipt = dict(schema='m2-2-combined-offline-review-v1', review=str(file.resolve()),
    reviewSha256=hashlib.sha256(file.read_bytes()).hexdigest(), bytes=file.stat().st_size,
    counts=dict(scenes=len(scenes), families=len(families), states=len(states), clips=len(clips)), media=media,
    status='BUILT_OFFLINE_QA_PENDING', userAcceptance='PENDING')
(args.output / 'review.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: value for key, value in receipt.items() if key != 'media'}))
