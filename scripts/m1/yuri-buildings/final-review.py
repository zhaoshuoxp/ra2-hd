"""Create one self-contained atlas/state review from current immutable selections."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path('.artifacts/yuri-buildings')
OUT = ROOT / sys.argv[1]
OUT.mkdir(exist_ok=False)
catalog = json.loads(Path('desktop/yuri-building-coverage.json').read_text())
requested = next((arg.split('=', 1)[1].split(',') for arg in sys.argv[2:] if arg.startswith('--identities=')), None)
if requested:
    catalog = {k: v for k, v in catalog.items() if v['family'] in requested}
feedback = '--feedback' in sys.argv
if feedback:
    catalog = {k: v for identity in ('YAPPET', 'YAGNTC', 'NATBNK') for k, v in catalog.items() if v['family'] == identity}
inventory = json.loads((ROOT / 'source-v1/inventory.json').read_text())
assets, families = {}, []


def asset(file, digest):
    if digest not in assets:
        assert hashlib.sha256(file.read_bytes()).hexdigest() == digest, file
        assets[digest] = file
    return digest


for key, selection in catalog.items():
    row = next(r for r in inventory['matrix'] if r['id'] == selection['family'] and r['theater'] == selection['theater'])
    family = json.loads((Path('.local') / selection['familyPath']).read_text())
    members, states, rest = [], [], []
    for binding, native in zip(family['members'], row['members']):
        root = Path('.local/hd-packs') / binding['packId'] / binding['revision']
        manifest = json.loads((root / 'manifest.json').read_text())
        assert hashlib.sha256((root / 'manifest.json').read_bytes()).hexdigest() == binding['sha256']
        for variant in manifest['variants']:
            for page in variant['pages']:
                for role in ('base', 'data', 'map'):
                    if role in page:
                        page[role + 'Asset'] = asset(root / page[role], page[role + 'Sha256'])
        index = len(members)
        members.append({'name': binding['member'], 'logical': manifest['logical'], 'variants': manifest['variants']})
        if 'body' in native['roles']:
            for n in range(min(3, native['visibleFrames'])):
                body_frame = n * 16 + 5 if selection['family'] == 'GAFWLL' else n
                states.append({'label': ['Normal body', 'Damaged body', 'Critical body'][n], 'type': 'body', 'damaged': n > 0,
                               'member': index, 'frames': [body_frame], 'rate': 1})
            rest.append({'type': 'body', 'member': index, 'frame': 5 if selection['family'] == 'GAFWLL' else 0,
                         'damagedFrame': 21 if selection['family'] == 'GAFWLL' else min(1, native['visibleFrames'] - 1)})
        if 'bib' in native['roles']:
            rest.insert(0, {'type': 'bib', 'member': index, 'frame': 0, 'damagedFrame': min(1, native['visibleFrames'] - 1)})
        for animation in row['animations']:
            if animation['member'] != binding['member']:
                continue
            for condition in ('normal', 'damaged'):
                props = animation.get(condition)
                if not props:
                    continue
                start = props['start']
                end = min(props['loopEnd'], props['end'], native['visibleFrames'] - 1)
                frames = list(range(start, end + 1)) or [start]
                if props['reverse']:
                    frames.reverse()
                states.append({'label': f'{animation["name"]} · {condition}', 'type': animation['type'], 'damaged': condition == 'damaged',
                               'member': index, 'frames': frames, 'rate': props['rate'], 'offset': animation['offset']})
            if animation['type'] in ('ACTIVE', 'IDLE') or animation['name'].endswith('_E'):
                rest.append({'type': animation['type'], 'member': index, 'frame': animation['normal']['start'],
                             'damagedFrame': animation.get('damaged', animation['normal'])['start'], 'offset': animation['offset']})
        states.append({'label': binding['member'] + ' · all native slots', 'type': 'member', 'member': index,
                       'frames': list(range(native['visibleFrames'])), 'rate': 15})
    body = next((m for m, n in zip(members, row['members']) if 'body' in n['roles']), members[0])
    if family.get('turrets'):
        member = {'name': 'Native heading component', 'turret': True, 'logical': {'canvas': [80, 90], 'frames': []}, 'variants': []}
        for density in (2, 4):
            binding = family['turrets'][str(density)]
            root = Path('.local') / binding['path']
            turret = json.loads((root / 'manifest.json').read_text())
            assert hashlib.sha256((root / 'manifest.json').read_bytes()).hexdigest() == binding['sha256']
            width, height = [v * density for v in turret['canvas']]
            pages, frames = [], []
            for n, heading in enumerate(turret['headings']):
                mask = (root / heading['mask']).read_bytes()
                assert hashlib.sha256(mask).hexdigest() == heading['maskSha256']
                data = Image.new('RGBA', (width, height), (0, 0, 0, 255))
                data.putalpha(Image.new('L', (width, height), 255))
                channels = list(data.split()); channels[0] = Image.frombytes('L', (width, height), mask)
                data = Image.merge('RGBA', channels)
                file = OUT / f'{selection["family"]}-{density}x-heading-{n}-mask.png'
                if not file.exists():
                    data.save(file)
                digest = hashlib.sha256(file.read_bytes()).hexdigest()
                pages.append({'id': str(n), 'size': [width, height],
                    'baseAsset': asset(root / heading['base'], heading['baseSha256']), 'dataAsset': asset(file, digest)})
                frames.append({'nativeFrame': n, 'page': str(n), 'sampleRect': [0, 0, width, height]})
                if density == 2:
                    member['logical']['frames'].append({'nativeFrame': n, 'trimOrigin': [0, 0], 'trimSize': [80, 90],
                        'legacyRenderSize': [80, 90], 'empty': False})
            member['variants'].append({'density': density, 'pages': pages, 'frames': frames})
        states.append({'label': 'Turret: eight native headings', 'type': 'turret', 'member': len(members),
                       'frames': list(range(8)), 'rate': 1})
        members.append(member)
    families.append({'key': key, 'name': selection['family'], 'theater': selection['theater'],
                     'canvas': body['logical']['canvas'], 'members': members, 'states': states, 'rest': rest})

payload = {'families': families, 'status': 'TECHNICAL_REVIEW_READY_FINAL_VISUAL_ACCEPTANCE_PENDING'}
native_reports = [Path(p) for p in sys.argv[2:] if not p.startswith('--')]
report_cards, evidence = [], []
consolidated = {'primaryRuns': []} if requested else json.loads((ROOT / 'consolidated-native-v1.json').read_text())
primary = {Path(r['report']).parent.name: r for r in consolidated['primaryRuns']}
for file in native_reports:
    report = json.loads(file.read_text())
    result = primary.get(file.parent.name, {}).get('finalStatus', report['status'])
    label = f'{file.parent.name} · {"SNOW" if report["snow"] else "TEMPERATE"}'
    report_cards.append(f'<tr><td>{html.escape(label)}</td><td>{html.escape(result)}</td>'
                        f'<td>{len(report.get("families", {}))} families</td><td>{report.get("worldAllocation", {}).get("total", 0) / 1048576:.1f} MiB</td></tr>')
    evidence_names = ['NATBNK-native-occupied', 'NATBNK-native-occupied-fire', 'NATBNK-native-evacuated',
                     'YAPPET-native-charged', 'YAPPET-native-closed', 'YAGNTC-native-charged', 'YAGNTC-native-fired', 'YAGNTC-native-mutated'] if feedback else [
                 'YAGRND-native-intake-moving', 'YAPOWR-native-occupied', 'NATBNK-native-occupied',
                 'YAPPET-native-charged', 'YAGNTC-native-fired', 'YABRCK-enemy-owner-before-capture',
                 'YABRCK-native-captured-new-owner', 'YAWEAP-native-production', 'YAYARD-native-dock-repair',
                 'NAPSIS-native-detection', 'YAGRND-native-destroyed', 'YAGNTC-native-charged',
                 'YAGNTC-native-mutated', 'NATBNK-native-occupied-fire', 'NATBNK-native-evacuated']
    for name in evidence_names:
        png = file.parent / (name + '-detail.png')
        if png.exists():
            encoded = base64.b64encode(png.read_bytes()).decode()
            evidence.append(f'<figure><figcaption>{html.escape(file.parent.name + " / " + name)}</figcaption>'
                            f'<img loading="lazy" src="data:image/png;base64,{encoded}" width="650" height="650"></figure>')
    for clip in report.get('clips', [])[:(4 if feedback else 2)]:
        video = Path(clip)
        if video.exists():
            encoded = base64.b64encode(video.read_bytes()).decode()
            evidence.append(f'<figure><figcaption>{html.escape(video.name)} · native drawing-buffer capture</figcaption>'
                            f'<video controls preload="none" src="data:video/webm;base64,{encoded}"></video></figure>')

effect_reports = next((v.split('=', 1)[1].split(',') for v in sys.argv[2:] if v.startswith('--effect-frames=')), [])
for report_file in effect_reports:
    extraction = json.loads(Path(report_file).read_text())
    assert extraction['status'] == 'PASS_NATIVE_VIDEO_FRAME_EXTRACTION'
    for capture in extraction['frames']:
        png = Path(capture['file'])
        label = f'{Path(report_file).parent.name} · GENDEATH at {capture["seconds"]:.2f}s · unscaled native video crop'
        evidence.append(f'<figure><figcaption>{html.escape(label)}</figcaption><img loading="lazy" width="650" height="650" '
                        f'src="data:image/png;base64,{base64.b64encode(png.read_bytes()).decode()}"></figure>')

maps = []
for label, file in [('Before: document scrollTop 4.5 px', Path('.artifacts/map-selection-layout/before-v5/full-0.png')),
                    ('After: document scrollTop 0 px', Path('.artifacts/map-selection-layout/final-package-yr-v5/full-0.png'))]:
    if file.exists():
        maps.append(f'<figure><figcaption>{label}</figcaption><img loading="lazy" src="data:image/png;base64,'
                    + base64.b64encode(file.read_bytes()).decode() + '"></figure>')

document = OUT / 'Yuri-Buildings-Final-Review.html'
with document.open('w') as output:
    output.write('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Task C Yuri buildings final review</title><style>
*{box-sizing:border-box}body{margin:0;background:#141b21;color:#e5eef3;font:18px/1.5 system-ui,sans-serif}
header,main{max-width:1600px;margin:auto;padding:24px}h1{font-size:32px}h2{font-size:26px}
nav{position:sticky;top:0;z-index:2;background:#14222cf5;padding:16px;display:flex;gap:14px;flex-wrap:wrap}
select,button,input{font:inherit}select,button{padding:5px}label{display:flex;gap:8px;align-items:center}
.pair,.evidence{display:flex;flex-wrap:wrap;gap:20px}.pair figure{flex:1;min-width:400px;max-width:100%;overflow:auto;background:#304337;padding:18px}
figure{margin:0 0 24px}figcaption{font-size:17px;margin-bottom:10px}canvas{display:block;max-width:none}
.evidence figure{max-width:100%;background:#22323b;padding:14px}.evidence img,.evidence video{max-width:100%;height:auto;object-fit:contain}
video{width:1000px}table{border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #52626c}
.status{color:#ffd888}#error{color:#ff938b;white-space:pre-wrap}a{color:#9addff}
</style><header>''')
    if requested:
        output.write(f'''<h1>Task C · Incremental feedback review</h1>
<p class="status">{len(set(f['name'] for f in families))} affected families shown with complete independent 2X/4X resources. Final visual acceptance pending.</p>
<p>Half-full cylindrical reactor glass, component construction motion, exact Gatling completion mount, a closed Dominator endpoint guard and proportional miner yaw keys. Bunker artwork is retained; native arrival now turns its hull into alignment before occupancy.</p>
<p>Selected current atlases and native timing are shown below. Previous accepted Allied, Soviet, E and unaffected C results retain their earlier acceptance boundaries. The full historical matrix is not repeated.</p>''')
    elif feedback:
        output.write('''<h1>Task C · Three-item feedback review</h1>
<p class="status">YAPPET upper hinges, NATBNK occupant alignment and YAGNTC effect evidence. Final visual acceptance pending.</p>
<p>Dominator has four complete upper claws articulated at shoulder and elbow, with native opening/charged/closure and damaged slots in independent 2X/4X temperate and snow exports. Bunker entry now reaches the original dock before boarding; its art is retained. Mutator resources are retained: native charged electricity and target GENDEATH/Brute transitions replace the misleading emitter-only release snapshot.</p>
<p>Only these three feedback items are shown across seven source/theater selections. Other completed C content and the previous full review are preserved; they do not require another direction decision. Original snapshots below are diagnostic references from the prior app.</p>''')
    else:
        output.write('''<h1>Task C · Yuri buildings final consolidated review</h1>
<p class="status">Complete independent 2X and 4X resources selected for 16 applicable building families. Final visual acceptance pending.</p>
<p>33 theater selections include native snow and distinct Tank Bunker New Urban geometry. YADEPT remains explicitly excluded by native TechLevel 15 under normal skirmish limit 10; the audited denominator is 17.</p>
<p>The representative batch direction is approved. Gatling turret haze and the three flagged aspect ratios are corrected in the production exports. This review reads the selected full-state atlases, including empty slots, and preserves their buffer resolution during playback.</p>''')
    output.write('''</header><nav><label>Building <select id="family"></select></label><label>State <select id="state"></select></label>
<label>Paint <select id="owner"><option value="authored">Authored material</option><option value="green">Green</option><option value="blue">Blue</option><option value="cyan">Cyan</option><option value="gold">Gold</option><option value="mask">Material mask</option></select></label>
<label>Size <select id="view"><option value="logical">Native logical size</option><option value="buffer">Full 2X / 4X buffer</option></select></label>
<label>Layers <select id="assembly"><option value="assembly">State assembly</option><option value="member">Selected native member</option></select></label>
<button id="play">Play</button><input id="frame" type="range" min="0" value="0"><span id="position"></span><span id="timing"></span></nav>
<main><p id="details"></p><p id="error"></p><div class="pair"><figure><figcaption id="size-2"></figcaption><canvas id="canvas-2"></canvas></figure>
<figure><figcaption id="size-4"></figcaption><canvas id="canvas-4"></canvas></figure></div><h2>Native gameplay evidence</h2>
<p>Task-owned app and independently copied resources; isolated profiles; trainer off. Controlled legal fixtures precede native orders. Superweapons use a disclosed one-time charge preset, followed by native activation and closure. Static owner controls above illustrate masks; the captures below establish actual renderer behavior.</p>
''')
    if requested:
        output.write('<p>Only the explicitly included new native sessions below constitute incremental runtime evidence. Offline controls illustrate exported state and owner masks; user visual acceptance remains pending.</p>')
    elif feedback:
        output.write('<p>Incremental checks cover the changed hinges and bunker movement plus corrected Mutator evidence. The original full batch, density lifecycle, RA2 isolation and map-layout evidence retain their documented build boundaries; those matrices were not repeated. Native clips keep the actual drawing-buffer resolution.</p>')
    else:
        output.write('<p>Incremental native batch result: PASS. Earlier session failures remain preserved in their reports: wrong ship rule/queue, an unsuitable Dominator victim, an eager-peer assertion, and Sensor cloak/shore/shroud fixture assumptions. Targeted native follow-ups resolve those cases. A directory named native-snow-4x-v1 actually contains a supplemental temperate run and is not counted as snow coverage.</p>')
    output.write('<table><thead><tr><th>Session</th><th>Technical result</th><th>Coverage</th><th>World HD residency</th></tr></thead><tbody>')
    output.write(''.join(report_cards) + '</tbody></table><div class="evidence">' + ''.join(evidence) + '</div>')
    output.write('<h2>Map selection: observed cause and repair</h2><p>The delayed selected-row scrollIntoView scrolled the document by 4.5 px in fullscreen (4 px windowed), moving menu content while OS bounds stayed fixed. The repair scrolls only the map list. Focused fullscreen/windowed entry, list drag, search, keyboard, Use and Cancel checks keep outer anchors stable and the selected row visible. Controlled scrollbar interactions do not claim exhaustive physical-drag coverage.</p><div class="evidence">' + ''.join(maps) + '</div></main>')
    output.write('<script type="application/json" id="review-data">' + json.dumps(payload, separators=(',', ':')) + '</script>')
    for digest, file in assets.items():
        output.write(f'<script type="application/octet-stream" id="asset-{digest}">')
        output.write(base64.b64encode(file.read_bytes()).decode())
        output.write('</script>')
    output.write('<script>' + Path('scripts/m1/yuri-buildings/final-review.js').read_text() + '</script></html>')
(OUT / 'review-receipt.json').write_text(json.dumps({'status': payload['status'], 'file': str(document.resolve()),
    'sha256': hashlib.sha256(document.read_bytes()).hexdigest(), 'families': len(set(e['name'] for e in families)), 'theaterSelections': len(families),
    'uniqueEmbeddedAtlases': len(assets), 'bytes': document.stat().st_size, 'nativeReports': [str(p) for p in native_reports]}, indent=2) + '\n')
print(document, document.stat().st_size)
