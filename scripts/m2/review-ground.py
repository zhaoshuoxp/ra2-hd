"""Embed the flat-ground trial and exact accepted V10 control in one offline page."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
for name in ['original', 'two', 'four', 'baseline', 'destination']:
    parser.add_argument(name, type=Path)
parser.add_argument('--authoring-root', type=Path, default=Path('.artifacts/m2-1/authoring-v11'))
parser.add_argument('--previous', type=Path)
parser.add_argument('--previous-label', default='Previous flat-ground 4X trial')
parser.add_argument('--original-references', action='store_true')
parser.add_argument('--version', default='V11')
parser.add_argument('--secondary-original', type=Path)
parser.add_argument('--secondary-four', type=Path)
args = parser.parse_args()
assert bool(args.secondary_original) == bool(args.secondary_four)
assert not (args.secondary_four and args.previous), 'Secondary comparison supports Original/2X/4X labels only'
original, two, four, baseline, destination = (getattr(args, name) for name in
                                             ['original', 'two', 'four', 'baseline', 'destination'])
roots = [original] + ([args.previous] if args.previous else []) + [two, four]
labels = (['Original ground / V10 structural base'] + ([args.previous_label] if args.previous else [])
          + [f'{args.version} 2X', f'{args.version} 4X'])
reports = [json.loads((root / 'report.json').read_text()) for root in roots]
scenes = ['grass-flat', 'dirt-flat', 'grass-dirt-transition', 'ground-water-contact', 'mixed', 'cliff-center']
records = []
size, display = reports[0]['graphics']['framebuffer'], reports[0]['graphics']['viewport']
assert all(r['graphics']['framebuffer'] == size and r['graphics']['viewport'] == display for r in reports)


def embed(file):
    data = file.read_bytes()
    records.append(dict(file=str(file), sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
    mime = 'video/webm' if file.suffix == '.webm' else 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(data).decode()


images = {scene: [embed(root / f'{scene}-actual-size-framebuffer.png') for root in roots] for scene in scenes}
coverage = {}
for view in reports[-1]['groundRegionViews']:
    baseline_view = next(v for v in reports[0]['groundRegionViews'] if v['name'] == view['name'])
    assert [(c['tile'], c['point']) for c in view['cells']] == [(c['tile'], c['point']) for c in baseline_view['cells']]
    for report in reports[1:-1]:
        comparison = next(v for v in report['groundRegionViews'] if v['name'] == view['name'])
        assert [(c['tile'], c['point']) for c in comparison['cells']] == [(c['tile'], c['point']) for c in baseline_view['cells']]
    cells = []
    for cell in view['cells']:
        selected = bool(cell.get('binding') and cell['binding']['group'] == 'ground')
        cells.append(dict(point=cell['point'], member=cell['member'], tile=cell['tile'], hd=selected))
    coverage[view['name']] = cells
if args.secondary_four:
    secondary_reports = [json.loads((root / 'report.json').read_text())
                         for root in [args.secondary_original, args.secondary_four]]
    secondary_views = [next(v for v in report['groundRegionViews'] if v['name'] == 'grass-flat')
                       for report in secondary_reports]
    assert all(r['graphics']['framebuffer'] == size and r['graphics']['viewport'] == display
               for r in secondary_reports)
    assert [(c['tile'], c['point']) for c in secondary_views[0]['cells']] == [
        (c['tile'], c['point']) for c in secondary_views[1]['cells']]
    scenes.append('secondary-grass-flat')
    images['secondary-grass-flat'] = [embed(args.secondary_original / 'grass-flat-actual-size-framebuffer.png'),
                                      None, embed(args.secondary_four / 'grass-flat-actual-size-framebuffer.png')]
    coverage['secondary-grass-flat'] = [dict(point=c['point'], member=c['member'], tile=c['tile'],
                                            hd=bool(c.get('binding') and c['binding']['group'] == 'ground'))
                                       for c in secondary_views[1]['cells']]
videos = ''.join(f'<figure><figcaption>{label}: native panning</figcaption>'
                 f'<video controls muted preload="none" src="{embed(root / "terrain-pan.webm")}"></video></figure>'
                 for label, root in [('Original', baseline), ('New 2X', two), ('New 4X', four)])
source_figures = []
for name in ['materials-master.png', 'transitions-1-master.png', 'transitions-2-master.png']:
    authored = (f'<figure><figcaption>{name}: authored source, separate from runtime evidence</figcaption>'
                f'<img class="master" alt="{name}" src="{embed(args.authoring_root / name)}"></figure>')
    if args.original_references:
        reference = name.replace('-master.png', '-reference.png')
        native = (f'<figure><figcaption>{reference}: Original enlarged material reference</figcaption>'
                  f'<img class="nativeReference" alt="{reference}" src="{embed(args.authoring_root / reference)}"></figure>')
        source_figures.append(f'<div class="sourcePair">{native}{authored}</div>')
    else:
        source_figures.append(authored)
masters = ''.join(source_figures)
rows = []
for label, report in zip(['Retained V10 base / Original ground'] + labels[1:],
                         [json.loads((baseline / 'report.json').read_text())] + reports[1:]):
    frames = report['sustainedPanFrames']
    rows.append(f'<tr><td>{label}</td><td>{report["mapEntryToFixtureMs"]}</td>'
                f'<td>{frames["mean"]:.2f}</td><td>{frames["p95"]:.2f}</td>'
                f'<td>{report.get("terrain", {}).get("gpuBytes", 0) / 1048576:.2f}</td></tr>')
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>M2.1 Flat Ground Review VERSION</title><style>
body{margin:24px;background:#1b2022;color:#e8eaec;font:20px/1.5 system-ui}h1{font-size:32px;margin:0 0 12px}
p{max-width:1150px}button,select{font:inherit;padding:8px 14px;margin:4px;border:1px solid #708078;background:#26332c;color:white;border-radius:5px}
button.active{background:#496c4c}#viewport{position:relative;overflow:auto;max-height:78vh;border:1px solid #7b8d7e;background:#111;margin:14px 0}
#sceneImage{display:block;max-width:none;width:var(--image-width)}#viewport.fit img{width:100%;height:auto}
#coverage{position:absolute;left:0;top:0;pointer-events:none}#coverage[hidden]{display:none}
video{width:min(100%,960px)}.master,.nativeReference{width:min(100%,1000px)}figcaption{font-weight:600;margin:10px 0}figure{margin:20px 0}
.sourcePair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;max-width:1200px}
table{border-collapse:collapse}td,th{padding:8px 14px;border:1px solid #647567;text-align:left}details{margin:18px 0}.note{color:#c0c8c1}
</style><h1>M2.1 Flat Ground Review VERSION</h1>
<p>INTRO This trial reconstructs 48 complete flat grass, ochre-earth and grass/earth transition identities, including every native directional and random variant.</p>
<p>Approved V10 cliffs/ramps and acknowledged roads are retained byte for byte. Rough ground, slopes, ramp fixups, water and shores remain Original controls. Flat-ground appearance awaits user review before further production.</p>
<p id="dimensions"></p><label>View <select id="scene"></select></label>
BUTTONS
<button id="coverageButton">Show replacement coverage</button><button id="fit">Fit view (optional)</button><button id="pixels">Inspect framebuffer pixels</button>
<p id="caption" class="note"></p><div id="viewport"><img id="sceneImage" alt="Actual flat-ground game display comparison"><svg id="coverage" hidden></svg></div>
<p>Coverage marks actual native cells: cyan means newly authored flat ground, orange means retained context (Original terrain or approved V10 roads/cliffs). The Original-ground button shows the same planned coverage positions. The overlay is optional and leaves source screenshots unchanged. Native camera clamping, map geometry, picking, light and game speed are retained.</p>
<p>Default image size matches the recorded game display. Use this size to judge grass/earth detail, color fidelity, transition continuity and seams. PRIORNOTE Framebuffer-pixel inspection is an optional enlargement. Animation ticks and native random terrain variants can differ between independent captures. The 2X view uses the ordinary shared 2X preference for existing M1 art; all other views use existing M1 4X art. Primary grass/earth cameras overlap because of native map-edge clamping. The optional secondary grass view compares Original and 4X on a broader grass area; its 2X button is disabled.</p>
<details><summary>Short panning footage</summary>VIDEOS</details>
<details><summary>Authored masters (separate from actual game-size evidence)</summary>MASTERS</details>
<details><summary>Scope and measured runtime</summary><table><tr><th>Runtime</th><th>Map entry (ms)</th><th>Pan mean (ms)</th><th>Pan p95 (ms)</th><th>Terrain GPU (MiB)</th></tr>ROWS</table>
<p>Apple M2, ANGLE Metal/WebGL 2. Fixed retail map, seed, players and controlled legal fixtures followed by native actions. Control panning/performance reuses matched retained V10 evidence; its four flat-ground cameras are a fresh smoke run. Technical checks do not establish user appearance acceptance. Whole-map production and Windows checks remain pending.</p></details>
<script>
const images=IMAGES, scenes=SCENES, size=SIZE, display=DISPLAY, coverage=COVERAGE, labels=LABELS;
let currentScene=DEFAULTSCENE, density=labels.length-1, pixels=false, showCoverage=false;
const select=document.querySelector('#scene'), viewport=document.querySelector('#viewport'), svg=document.querySelector('#coverage');
for(const scene of scenes){const option=document.createElement('option');option.value=scene;option.textContent=scene;select.append(option);}select.value=currentScene;
function drawCoverage(){const img=document.querySelector('#sceneImage'), scale=img.getBoundingClientRect().width/display[0];
svg.toggleAttribute('hidden',!showCoverage);svg.setAttribute('width',display[0]*scale);svg.setAttribute('height',display[1]*scale);
svg.setAttribute('viewBox','0 0 '+display[0]+' '+display[1]);svg.replaceChildren();
for(const cell of coverage[currentScene]||[]){const marker=document.createElementNS('http://www.w3.org/2000/svg','circle');
marker.setAttribute('cx',cell.point.x);marker.setAttribute('cy',cell.point.y);marker.setAttribute('r','5');
marker.setAttribute('fill',cell.hd?'#27edee':'#ffab54');marker.setAttribute('stroke','#13191a');marker.setAttribute('stroke-width','1.5');
svg.append(marker);}}
function show(){const img=document.querySelector('#sceneImage');if(!images[currentScene][density])density=labels.length-1;img.src=images[currentScene][density];
img.style.setProperty('--image-width',(pixels?size[0]:display[0])+'px');
document.querySelectorAll('[data-density]').forEach(b=>{const i=Number(b.dataset.density);b.disabled=!images[currentScene][i];b.classList.toggle('active',i===density);});
const cells=coverage[currentScene]||[], count=cells.filter(c=>c.hd).length;
document.querySelector('#caption').textContent=labels[density]+' — '+currentScene+
(cells.length?'; coverage: '+count+' new ground cells, '+(cells.length-count)+' retained context cells':'');drawCoverage();}
select.onchange=()=>{currentScene=select.value;show();};document.querySelectorAll('[data-density]').forEach(b=>b.onclick=()=>{density=Number(b.dataset.density);show();});
document.querySelector('#dimensions').textContent='Source framebuffer: '+size[0]+' × '+size[1]+'. Recorded display: '+display[0].toFixed(1)+' × '+display[1]+' CSS pixels. Default view matches the game display.';
document.querySelector('#coverageButton').onclick=()=>{showCoverage=!showCoverage;document.querySelector('#coverageButton').textContent=showCoverage?'Hide replacement coverage':'Show replacement coverage';drawCoverage();};
document.querySelector('#fit').onclick=()=>{viewport.classList.toggle('fit');document.querySelector('#fit').textContent=viewport.classList.contains('fit')?'Return to game display size':'Fit view (optional)';show();};
document.querySelector('#pixels').onclick=()=>{pixels=!pixels;viewport.classList.remove('fit');document.querySelector('#pixels').textContent=pixels?'Return to game display size':'Inspect framebuffer pixels';show();};
window.addEventListener('resize',drawCoverage);document.querySelector('#sceneImage').onload=drawCoverage;show();
</script></html>'''
intro = ('Appearance decision pending. Original flat-ground patterns and palette are reconstructed '
         'with continuous crisp low grass and shallow earth detail, retaining the accepted V10 structural base.')
prior_note = (f'Compare the latest 4X image with {args.previous_label} at the same display size.'
              if args.previous else '')
buttons = ''.join(f'<button data-density="{i}">{label}</button>' for i, label in enumerate(labels))
replacements = dict(VIDEOS=videos, MASTERS=masters, ROWS=''.join(rows), IMAGES=json.dumps(images),
                    SCENES=json.dumps(scenes), SIZE=json.dumps(size), DISPLAY=json.dumps(display),
                    COVERAGE=json.dumps(coverage), LABELS=json.dumps(labels), VERSION=args.version,
                    INTRO=intro, PRIORNOTE=prior_note, BUTTONS=buttons,
                    DEFAULTSCENE=json.dumps('secondary-grass-flat' if args.secondary_four else 'grass-flat'))
document = re.sub(r'\b(?:VIDEOS|MASTERS|ROWS|IMAGES|SCENES|SIZE|DISPLAY|COVERAGE|LABELS|VERSION|BUTTONS|INTRO|PRIORNOTE|DEFAULTSCENE)\b',
                  lambda match: replacements[match.group()], document)
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(document)
summary = dict(file=str(destination.resolve()), bytes=destination.stat().st_size, embedded=True,
               captures=sum(bool(v) for row in images.values() for v in row), videos=3, masters=3,
               originalReferences=3 if args.original_references else 0,
               coverage={k: dict(authored=sum(c['hd'] for c in v), original=sum(not c['hd'] for c in v))
                         for k, v in coverage.items()}, media=records)
print(json.dumps(summary, indent=2))
