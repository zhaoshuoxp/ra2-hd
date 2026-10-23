"""Embed matched complete-ledger runtime captures and every selected source board."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
for name in ['original', 'two', 'four', 'destination']:
    parser.add_argument(name, type=Path)
parser.add_argument('--previous', type=Path, default=Path('.artifacts/m2-1/copied-v11b-4x'))
parser.add_argument('--root', type=Path, default=Path('.artifacts/m2-1/authoring-production-v3'))
parser.add_argument('--seam-correction', action='store_true')
parser.add_argument('--seam-revision', default='temperate-m2-1-seams-v13d')
args = parser.parse_args()
roots = [args.original, args.previous, args.two, args.four]
reports = [json.loads((p / 'report.json').read_text()) for p in roots]
labels = ['Original terrain', 'Accepted V11B 4X', 'Production V12C 2X', 'Production V12C 4X']
if args.seam_correction:
    version = args.seam_revision.rsplit('-', 1)[-1].upper()
    labels = ['Original terrain', 'Previous V12C 4X', f'Seam correction {version} 2X', f'Seam correction {version} 4X']
size, display = reports[0]['graphics']['framebuffer'], reports[0]['graphics']['viewport']
assert all(r['graphics']['framebuffer'] == size and r['graphics']['viewport'] == display for r in reports)
records = []


def embed(file):
    raw = file.read_bytes()
    records.append(dict(file=str(file), sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw)))
    mime = 'video/webm' if file.suffix == '.webm' else 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


views = {v['name']: v for key in ['groundRegionViews', 'cliffRegionViews', 'productionViews']
         for v in reports[-1].get(key, []) if v.get('cells')}
if args.seam_correction:
    views = {k: v for k, v in views.items() if k in ['grass-slope-full', 'road-main-full', 'road-slope-full']}
    changed = set(json.loads((args.root / args.seam_revision / 'validation.json').read_text())['changedMembers'])
scenes = ['mixed', *views]
images, coverage = {}, {}
for name in scenes:
    images[name] = []
    for root, report in zip(roots, reports):
        file = root / f'{name}-actual-size-framebuffer.png'
        if name in views and file.exists():
            paired = next(v for key in ['groundRegionViews', 'cliffRegionViews', 'productionViews']
                          for v in report.get(key, []) if v['name'] == name)
            assert [(c['tile'], c['point']) for c in paired['cells']] == [
                (c['tile'], c['point']) for c in views[name]['cells']], (name, root)
        images[name].append(embed(file) if file.exists() else None)
    assert images[name][0] and images[name][-2] and images[name][-1], name
    coverage[name] = [dict(point=c['point'], tile=c['tile'], member=c.get('binding', {}).get('member'),
                           hd=(c.get('binding', {}).get('member') in changed if args.seam_correction
                               else bool(c.get('binding')))) for c in views.get(name, {}).get('cells', [])]
videos = ''.join(f'<figure><figcaption>{label}: native panning</figcaption><video controls muted preload="none" '
                 f'src="{embed(root / "terrain-pan.webm")}"></video></figure>'
                 for label, root in zip([labels[0], labels[2], labels[3]], [args.original, args.two, args.four]))
generation = json.loads((args.root / 'generation-provenance.json').read_text())
if args.seam_correction:
    prior = json.loads(Path('.artifacts/m2-1/authoring-production-v3/generation-provenance.json').read_text())
    generation['entries'] += [e for e in prior['entries'] if e['name'] in [f'road-main-{i}' for i in range(7, 11)]]
masters = []
for entry in generation['entries']:
    reference = next(r for r in entry['references'] if 'reference.png' in r['file'])
    figures = []
    for label, record, cls in [('Original reference', reference, 'nativeReference'),
                               ('Authored master', entry['master'], 'master')]:
        file = Path(record['file'])
        assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256']
        figures.append(f'<figure><figcaption>{entry["name"]}: {label}</figcaption>'
                       f'<img loading="lazy" class="{cls}" alt="{entry["name"]} {label}" src="{embed(file)}"></figure>')
    masters.append('<div class="sourcePair">' + ''.join(figures) + '</div>')
rows = []
for label, report in zip([labels[0], labels[2], labels[3]], [reports[0], reports[2], reports[3]]):
    frames = report['sustainedPanFrames']
    rows.append(f'<tr><td>{label}</td><td>{report["mapEntryToFixtureMs"]}</td><td>{frames["mean"]:.2f}</td>'
                f'<td>{frames["p95"]:.2f}</td><td>{frames["stalls50"]}</td>'
                f'<td>{report["terrain"]["gpuBytes"] / 1048576:.2f}</td></tr>')
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>M2.1 Complete Selected Production V12C</title><style>
body{margin:24px;background:#1b2022;color:#e8eaec;font:20px/1.5 system-ui}h1{font-size:32px}p{max-width:1160px}
button,select{font:inherit;padding:8px 14px;margin:4px;background:#26332c;color:white;border:1px solid #708078;border-radius:5px}
button.active{background:#496c4c}button:disabled{opacity:.4}#viewport{position:relative;overflow:auto;max-height:78vh;border:1px solid #708078;margin:14px 0}
#sceneImage{display:block;max-width:none;width:var(--image-width)}#viewport.fit img{width:100%;height:auto}
#coverage{position:absolute;left:0;top:0;pointer-events:none}#coverage[hidden]{display:none}video{width:min(100%,960px)}
.master,.nativeReference{width:100%}.sourcePair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;max-width:1200px}
figure{margin:20px 0}figcaption{font-weight:600}table{border-collapse:collapse}td,th{padding:8px 14px;border:1px solid #647567}details{margin:20px 0}
</style><h1>M2.1 Complete Selected Production V12C</h1>
<p>The approved terrain directions now cover the full selected ledger: 305 native members / 742 images. Accepted grass, earth, LAT, representative roads and cliff/ramps retain their exact pixels; 236 remaining members add coherent road pieces, rough-ground transitions, slopes and structural connectors.</p>
<p>Water, shores, bridges, thick-grass families, trees, ore/gems, standalone rocks, props and civilian objects remain native controls. This is a bounded temperate prototype. Final complete-batch appearance awaits user review.</p>
<p id="dimensions"></p><label>View <select id="scene"></select></label>BUTTONS
<button id="coverageButton">Show replacement coverage</button><button id="fit">Fit view (optional)</button><button id="pixels">Inspect framebuffer pixels</button>
<p id="caption"></p><div id="viewport"><img id="sceneImage" alt="Actual game-size comparison"><svg id="coverage" hidden></svg></div>
<p>Cyan markers identify actual selected HD bindings; orange identifies native terrain controls. The same positions appear on the Original comparison. Default width matches the recorded game display; framebuffer inspection enlarges the view. Independent captures can differ in animation ticks and native random variants. Existing M1 art follows the shared density: 4X in Original terrain and 4X views, 2X in the 2X view. Unavailable comparison buttons are disabled.</p>
<details><summary>Short panning footage</summary>VIDEOS</details>
<details><summary>All 41 selected authored boards and paired Original references</summary>MASTERS</details>
<details><summary>Measured runtime and scope</summary><table><tr><th>Runtime</th><th>Entry ms</th><th>Pan mean ms</th><th>Pan p95 ms</th><th>Intervals above 50 ms</th><th>Terrain GPU MiB</th></tr>ROWS</table>
<p>Apple M2, ANGLE Metal/WebGL 2; same retail primary map, framebuffer, seed, players, speed, camera sequence and controlled legal unit/building roster. Native orders, picking, placement, shroud and OFF/ON lifecycle are recorded separately. All three coherent groups publish atomically and share one texture each. World caps remain 256/1280 MiB; UI 16 MiB; prepared CPU 128 MiB. Windows and physical-input acceptance remain unverified.</p></details>
<script>
const images=IMAGES, scenes=SCENES, size=SIZE, display=DISPLAY, coverage=COVERAGE, labels=LABELS;
let currentScene='cliff-closure-full',density=3,pixels=false,showCoverage=false;
const select=document.querySelector('#scene'),viewport=document.querySelector('#viewport'),svg=document.querySelector('#coverage');
for(const scene of scenes){const option=document.createElement('option');option.value=scene;option.textContent=scene;select.append(option);}select.value=currentScene;
function drawCoverage(){const img=document.querySelector('#sceneImage'),scale=img.getBoundingClientRect().width/display[0];
svg.toggleAttribute('hidden',!showCoverage);svg.setAttribute('width',display[0]*scale);svg.setAttribute('height',display[1]*scale);
svg.setAttribute('viewBox','0 0 '+display[0]+' '+display[1]);svg.replaceChildren();
for(const c of coverage[currentScene]||[]){const marker=document.createElementNS('http://www.w3.org/2000/svg','circle');
marker.setAttribute('cx',c.point.x);marker.setAttribute('cy',c.point.y);marker.setAttribute('r','5');marker.setAttribute('fill',c.hd?'#27edee':'#ffab54');
marker.setAttribute('stroke','#13191a');marker.setAttribute('stroke-width','1.5');svg.append(marker);}}
function show(){const img=document.querySelector('#sceneImage');if(!images[currentScene][density])density=3;img.src=images[currentScene][density];
img.style.setProperty('--image-width',(pixels?size[0]:display[0])+'px');document.querySelectorAll('[data-density]').forEach(b=>{
const i=Number(b.dataset.density);b.disabled=!images[currentScene][i];b.classList.toggle('active',i===density);});
const cells=coverage[currentScene]||[];document.querySelector('#caption').textContent=labels[density]+' — '+currentScene+
(cells.length?'; '+cells.filter(c=>c.hd).length+' selected HD cells, '+cells.filter(c=>!c.hd).length+' native controls':'');drawCoverage();}
select.onchange=()=>{currentScene=select.value;show();};document.querySelectorAll('[data-density]').forEach(b=>b.onclick=()=>{density=Number(b.dataset.density);show();});
document.querySelector('#dimensions').textContent='Source framebuffer: '+size[0]+' × '+size[1]+'. Recorded display: '+display[0].toFixed(1)+' × '+display[1]+' CSS pixels.';
document.querySelector('#coverageButton').onclick=()=>{showCoverage=!showCoverage;drawCoverage();};
document.querySelector('#fit').onclick=()=>{viewport.classList.toggle('fit');show();};
document.querySelector('#pixels').onclick=()=>{pixels=!pixels;viewport.classList.remove('fit');show();};
window.addEventListener('resize',drawCoverage);document.querySelector('#sceneImage').onload=drawCoverage;show();
</script></html>'''
if args.seam_correction:
    document = document.replace('M2.1 Complete Selected Production V12C', f'M2.1 Road and Grass Ramp Seam Review {version}')
    document = document.replace(
        'The approved terrain directions now cover the full selected ledger: 305 native members / 742 images. Accepted grass, earth, LAT, representative roads and cliff/ramps retain their exact pixels; 236 remaining members add coherent road pieces, rough-ground transitions, slopes and structural connectors.',
        'The V12C remainder is user accepted. This correction changes only dirt/paved-road mixtures and ordinary grassy slopes. '
        f'Compare the previous V12C and {version} buttons at game display size, especially the dirt-road crossing and the broad grassy ramp behind it.')
    document = document.replace('Final complete-batch appearance awaits user review.',
                                'Road/ramp correction appearance awaits user review; all other accepted art is retained exactly.')
    document = document.replace('Cyan markers identify actual selected HD bindings; orange identifies native terrain controls.',
                                'Cyan markers identify the changed road/ramp bindings; orange identifies retained accepted art or native context.')
    document = document.replace('All 41 selected authored boards and paired Original references',
                                'Continuous grass source and retained road sources with Original references')
    document = document.replace("currentScene='cliff-closure-full'", "currentScene='grass-slope-full'")
    document = document.replace("' selected HD cells, '", "' changed road/ramp cells, '")
    document = document.replace("' native controls'", "' retained context cells'")
    document = document.replace('Native orders, picking, placement, shroud and OFF/ON lifecycle are recorded separately.',
                                'New 2X/4X native orders and ramp passage are recorded. Unchanged lifecycle, fallback, RA2 and secondary-map evidence reuses the V12C receipts. '
                                f'Original-terrain footage reuses the matched V12C control; both {version} clips are fresh.')
    registered = args.root / args.seam_revision / 'assembly-inspection.png'
    document = document.replace('</details>\n<details><summary>Measured runtime and scope',
                                '<figure><figcaption>Registered 4X road and slope exports; separate from native runtime evidence</figcaption>'
                                f'<img style="width:min(100%,1200px)" alt="Registered exports" src="{embed(registered)}"></figure>'
                                '</details>\n<details><summary>Measured runtime and scope')
replacements = dict(BUTTONS=''.join(f'<button data-density="{i}">{label}</button>' for i, label in enumerate(labels)),
                    VIDEOS=videos, MASTERS=''.join(masters), ROWS=''.join(rows), IMAGES=json.dumps(images),
                    SCENES=json.dumps(scenes), SIZE=json.dumps(size), DISPLAY=json.dumps(display),
                    COVERAGE=json.dumps(coverage), LABELS=json.dumps(labels))
document = re.sub(r'\b(?:BUTTONS|VIDEOS|MASTERS|ROWS|IMAGES|SCENES|SIZE|DISPLAY|COVERAGE|LABELS)\b',
                  lambda m: replacements[m.group()], document)
assert not args.destination.exists()
args.destination.write_text(document)
summary = dict(file=str(args.destination.resolve()), bytes=args.destination.stat().st_size,
               sha256=hashlib.sha256(args.destination.read_bytes()).hexdigest(), embedded=True,
               captures=sum(bool(v) for row in images.values() for v in row), scenes=len(scenes), videos=3,
               masters=len(masters), originalReferences=len(masters), media=records)
print(json.dumps(summary, indent=2))
