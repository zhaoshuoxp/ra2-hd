"""One self-contained review of new building art, native states and the laboratory loop."""
import base64
import hashlib
import html
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import crop, pin, read, write
from newurban_batch97_materials import ROOT

folder = ROOT / 'review-v1'
folder.mkdir(exist_ok=False)
exported = read(ROOT / 'export-and-preservation-v4.json')
sources = {s['member']: s for s in read(ROOT / 'source-v1.json')['sources']}
native = {2: (ROOT / 'native-2x-v2', read(ROOT / 'native-2x-v2/report.json')),
          4: (ROOT / 'native-4x-v1', read(ROOT / 'native-4x-v1/report.json'))}
assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' for _, report in native.values())
assets, videos = [], []
encoded_cache = {}


def embed(image, label, role, source=None, density=None, logical=None, extra=''):
    pixels = np.array(image.convert('RGBA'))
    pixels[..., :3][pixels[..., 3] == 0] = 0
    digest = hashlib.sha256(pixels.tobytes()).hexdigest()
    key = digest, image.size
    if key not in encoded_cache:
        stream = io.BytesIO()
        Image.fromarray(pixels).save(stream, format='WEBP', lossless=True, exact=True, method=6)
        payload = stream.getvalue()
        with Image.open(io.BytesIO(payload)) as decoded:
            assert np.array_equal(np.asarray(decoded.convert('RGBA')), pixels)
        encoded_cache[key] = payload
    payload = encoded_cache[key]
    assets.append(dict(label=label, role=role, source=source, density=density, size=list(image.size),
        decodedRgbaSha256=digest, embeddedSha256=hashlib.sha256(payload).hexdigest(),
        transparentReviewRgbCanonicalized=True, codec='LOSSLESS_WEBP', byteLength=len(payload)))
    uri = 'data:image/webp;base64,' + base64.b64encode(payload).decode()
    attrs = f' data-density="{density}"' if density is not None else ''
    size = f' style="--logical-width:{logical[0]};--physical-width:{image.width}"' if logical else f' style="--physical-width:{image.width}"'
    return f'<figure{attrs} class="{extra}"><img loading="lazy" src="{uri}" alt="{html.escape(label)}"{size}><figcaption>{html.escape(label)}</figcaption></figure>'


def original(source, slot):
    frame = source['frames'][slot]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    palette_hash = '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676' if slot == 3 and source['member'] != 'cgslab_f.shp' else source['palette']['sha256']
    palette = np.fromfile(ROOT / 'native' / (palette_hash + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
    return Image.fromarray(np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255)).astype(np.uint8))


def authored(record, slot, density):
    source = sources[record['member']]
    pixels = crop(record['metadata']['file'], slot, density)
    data = crop(record['metadata']['file'], slot, density, 'data')
    palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
    weight = data[..., :1].astype(float) / 255
    pixels[..., :3] = np.rint(pixels[..., :3] * (1 - weight) + palette[16 + data[..., 1]] * weight).astype(np.uint8)
    return Image.fromarray(pixels)


def native_image(directory, capture, label):
    file = directory / capture['file']
    return embed(Image.open(file), label, 'ACTUAL_PACKAGED_MAC_NATIVE_CROP', pin(file), extra='native')


body = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>M2.4 NewUrban Final Buildings — Batch 97</title>',
    '<style>body{font:17px/1.5 system-ui;margin:0;background:#101a22;color:#e9eff3}main{max-width:1550px;margin:auto;padding:24px}h1{font-size:32px}h2{font-size:25px;margin-top:32px}h3{font-size:21px}p{max-width:1100px}a{color:#9ed9ff}.toolbar{position:sticky;top:0;background:#20303eee;padding:12px;z-index:5;display:flex;gap:12px;flex-wrap:wrap}button,select{font:inherit;padding:8px;background:#314655;color:white;border:1px solid #638099;border-radius:5px}.grid{display:flex;flex-wrap:wrap;gap:16px}.quick figure{width:210px}.quick img{max-width:200px;max-height:240px;object-fit:contain}.family{border:1px solid #425969;margin:20px 0;padding:14px;border-radius:8px}figure{margin:0;padding:8px;background:#172630;border-radius:5px;overflow:auto}figure img{display:block;max-width:100%;height:auto}.plates img{width:calc(var(--logical-width)*2px);max-width:none}.native img{width:calc(var(--physical-width)*1px/var(--dpr,2));max-width:100%}figcaption{font-size:15px;margin-top:8px;max-width:480px}.state{border-top:1px solid #3a4f5d;margin-top:14px;padding-top:12px}body[data-mode="1"] [data-density]:not([data-density="1"]),body[data-mode="2"] [data-density]:not([data-density="2"]),body[data-mode="4"] [data-density]:not([data-density="4"]){display:none}.muted{color:#adc1cd}code{font-size:14px;overflow-wrap:anywhere}video{max-width:100%;width:640px}summary{cursor:pointer;font-size:20px}#flag figure{width:190px}#flag img{width:144px;height:228px;object-fit:contain}footer{margin:40px 0}</style>',
    '<body data-mode="4"><main><h1>M2.4 NewUrban Final Buildings — Batch 97</h1>',
    '<p>Review the new snow-free variants of four accepted Snow structures, nine remaining building designs, their applicable damaged / occupied / rubble states, and the laboratory animation. Accepted hospitals, tech airports, oil machinery, factions and terrain need no repeat art review.</p>',
    '<p class="muted">Mac 2X / 4X technical checks passed. New visual acceptance is pending. Windows was not tested; local main integration and full M2.4 completion remain open. This delivery contains the embedded page, metadata and a resource ledger, without another game package.</p>',
    '<div class="toolbar"><label>Artwork <select id="mode"><option value="4">4X</option><option value="2">2X</option><option value="1">Original</option><option value="all">Compare all</option></select></label><a href="#overview">Quick overview</a><a href="#families">All states</a><a href="#native">In game</a><a href="#flag">Laboratory loop</a></div>',
    '<h2 id="overview">Quick overview</h2><p>Four seasonal adaptations reuse accepted Snow architecture. The tech secret lab, LAX theme building and LA control tower have distinct original designs; they are not replacements for the accepted tech airport.</p><div class="grid quick">']
bodies = [r for r in exported['records'] if r['member'] != 'cgslab_f.shp']
for record in bodies:
    source = sources[record['member']]
    body.append(embed(authored(record, 0, 4), source['bindings'][0]['id'] + ' / ' + source['nativeRules']['Name'],
        'NEW_ART_QUICK_OVERVIEW', record['metadata']))
body.append('</div><h2 id="families">All applicable artwork states</h2><p>All density choices share the same logical display scale. Original is a reference, not HD credit. Unused compatibility slots remain in the source contract; they do not add playable states or require separate review.</p>')
for record in bodies:
    source = sources[record['member']]
    identity = source['bindings'][0]['id']
    slots = [(0, 'Normal')]
    if record['bodySlots'] >= 3:
        slots.append((1, 'Damaged'))
        if source['nativeRules'].get('CanBeOccupied', '').lower() in ['yes', 'true', '1']:
            slots.append((2, 'Occupied'))
        slots.append((3, 'Rubble'))
    body.append(f'<section class="family"><h3>{identity} / {html.escape(source["nativeRules"]["Name"])}</h3><p class="muted"><code>{record["member"]} · {source["sha256"]}</code></p>')
    for slot, state in slots:
        body.append(f'<div class="state"><strong>{state}</strong><div class="grid plates">')
        frame = source['frames'][slot]
        body.append(embed(original(source, slot), identity + ' / ' + state + ' / Original',
            'ORIGINAL_REFERENCE_NOT_HD', pin(ROOT / 'native' / frame['indexFile']), 1, frame['size']))
        for density in [2, 4]:
            body.append(embed(authored(record, slot, density), f'{identity} / {state} / {density}X',
                'EXPORTED_DENSITY_WITH_ORIGINAL_OWNER_PALETTE', record['metadata'], density, frame['size']))
        body.append('</div></div>')
    body.append('</section>')

body.append('<h2 id="native">Actual packaged Mac display</h2><p>Three official original maps are a minimum cover of all 14 source-member paths. Captures retain their framebuffer pixels and camera. New-state checks use disclosed legal fixtures and native orders, with no map or rule edits.</p>')
for row in native[4][1]['maps']:
    body.append(f'<details open><summary>YR / {row["map"]}</summary>')
    for normal in row['normal']:
        name = normal['name']
        body.append(f'<h3>{name} / Original placement</h3><div class="grid">')
        control = next(x for x in native[4][1]['originalControls'] if x['map'] == row['map'])
        capture = next(x['capture'] for x in control['captures'] if x['name'] == name)
        body.append('<div data-density="1">' + native_image(native[4][0], capture, name + ' / Original') + '</div>')
        for density, (directory, report) in native.items():
            capture = next(x['capture'] for m in report['maps'] for x in m['normal'] if x['name'] == name)
            body.append(f'<div data-density="{density}">' + native_image(directory, capture, f'{name} / {density}X original placement') + '</div>')
        body.append('</div><details><summary>Native transitions</summary>')
        for density, (directory, report) in native.items():
            cases = [b for m in report['maps'] for b in m['nativeStates']['buildings'] if b['normal']['name'] == name]
            assert len(cases) == 1
            case = cases[0]
            body.append(f'<div data-density="{density}" class="grid">')
            for key in ['normalCapture', 'occupiedCapture', 'damagedCapture', 'rubbleCapture']:
                if key in case:
                    body.append(native_image(directory, case[key], f'{name} / {density}X / {key.replace("Capture", "")}'))
            body.append('</div>')
        body.append('</details>')
    body.append('</details>')

body.append('<h2 id="flag">Laboratory animation</h2><p>The original yellow motif and 16 native loop phases are retained. The fixed pole and attachment edge share one registered HD patch across all phases. Original trailing slots 16–31 remain uncredited compatibility data. Click a phase or play the loop; clips below are actual native full-cycle recordings.</p><button id="play">Pause preview</button><input id="phase" aria-label="Animation phase" type="range" min="0" max="15" value="0"><span id="phaseLabel">0</span><div class="grid" id="flag">')
flag = next(r for r in exported['records'] if r['member'] == 'cgslab_f.shp')
source = sources[flag['member']]
left, top, right, bottom = 104, 2, 127, 40
for slot in range(16):
    for density in [1, 2, 4]:
        image = original(source, slot) if density == 1 else authored(flag, slot, density)
        frame = source['frames'][slot]
        canvas = Image.new('RGBA', ((right - left) * density, (bottom - top) * density))
        canvas.alpha_composite(image, ((frame['origin'][0] - left) * density, (frame['origin'][1] - top) * density))
        body.append(f'<div data-phase="{slot}" style="display:{"block" if slot == 0 else "none"}">' + embed(canvas,
            f'Laboratory phase {slot} / {"Original" if density == 1 else str(density) + "X"}',
            'FIXED_NATIVE_CANVAS_REGISTERED_LOOP', flag['metadata'], density, [right-left, bottom-top]) + '</div>')
body.append('</div><div class="grid">')
for density, (directory, report) in native.items():
    for cycle in report['linkedBuildingCycles']:
        # Native cycle receipts retain the recording and every witnessed source phase.
        filename = cycle.get('videoFile', cycle.get('clip', cycle.get('video')))
        if isinstance(filename, dict):
            filename = filename.get('file')
        if not filename:
            matches = list(directory.glob(f'cgslab_f.shp-{cycle["state"]}*.webm'))
            assert len(matches) == 1
            filename = matches[0].name
        file = directory / filename
        payload = file.read_bytes()
        videos.append(dict(source=pin(file), density=density, state=cycle['state']))
        body.append(f'<figure data-density="{density}"><video controls preload="none" loop src="data:video/webm;base64,{base64.b64encode(payload).decode()}"></video><figcaption>{density}X / {cycle["state"]} / actual native cycle</figcaption></figure>')
body.append('</div><details><summary>Technical receipt and remaining scope</summary><p>13 complete selected SHP families, 14 source members and 164 density slots. Of these, 16 trailing laboratory slots retain Original compatibility data. Native shadows, source canvases, rules, pathfinding and object restrictions remain unchanged. All 208 inherited environment families retain their exact payloads.</p><p>Three authored NewUrban source gaps remain: CIV1, DNOA and the Yuri Citadel Wall. Twenty-two inherited conditional scanner rows remain explicit for route reconciliation. This page does not establish full M2.4 completion or Windows acceptance.</p><p>Terrain CPU backing uses lossless RGBA runs only when smaller; the GPU atlas, filtering and pixels stay exact. Original encoded source hashes, all 220 density atlases, real GPU reuploads and isolated context restoration were checked. The fixed 512 / 1280 MiB world and 128 MiB prepared-cache budgets remain unchanged.</p></details><footer>Batch 96 is user accepted. Batch 97 visual status: pending. Keep feedback in the current execution conversation.</footer>')
body.append('<script>document.documentElement.style.setProperty("--dpr",String(window.devicePixelRatio||1));document.getElementById("mode").onchange=e=>document.body.dataset.mode=e.target.value;let phase=0,playing=true;const slider=document.getElementById("phase"),label=document.getElementById("phaseLabel");function show(n){phase=n;slider.value=n;label.textContent=String(n);document.querySelectorAll("[data-phase]").forEach(e=>e.style.display=Number(e.dataset.phase)===n?"block":"none")}slider.oninput=e=>show(Number(e.target.value));document.getElementById("play").onclick=e=>{playing=!playing;e.target.textContent=playing?"Pause preview":"Play preview"};setInterval(()=>{if(playing)show((phase+1)%16)},200);</script></main></body></html>')
file = folder / 'M2.4-NewUrban-Final-Buildings-Batch97-Embedded.html'
with file.open('x') as stream:
    stream.write('\n'.join(body))
metadata = dict(schema='m2-4-embedded-art-review-v1', status='READY_FOR_CONSOLIDATED_VISUAL_REVIEW',
    candidate=exported['candidate'], review=pin(file), images=assets, videos=videos,
    imageInstances=len(assets), uniqueImagePayloads=len(encoded_cache), allPixelsIndependentlyDecoded=True,
    newBuildingFamilies=13, sourceMembers=14, nativeReports={str(k): pin(directory / 'report.json') for k, (directory, _) in native.items()},
    originalReferenceIsNotHdCredit=True, nativeShotsUsePhysicalPixelDisplayScale=True,
    browser='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', visual='PENDING_USER_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(folder / 'review-metadata-v1.json', metadata)
print(dict(review=pin(file), imageInstances=len(assets), nativeVideos=len(videos), uniqueImages=len(encoded_cache)))
