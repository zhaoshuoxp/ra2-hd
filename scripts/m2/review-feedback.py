"""Build a standalone grouped review from the exact native runtime captures."""
import shutil
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

original, prior, two, four, destination = map(Path, sys.argv[1:6])
baseline_performance = Path(sys.argv[6])
media = destination.parent / 'M2.1-Review-Media'
embedded = '--embedded' in sys.argv
style_review = '--style-review' in sys.argv
if style_review and not embedded:
    raise ValueError('Style reviews require fully embedded media')
if not embedded:
    media.mkdir(exist_ok=False)
media_records = []
scenes = ['mixed', 'road', 'cliff', 'ramp', 'transition', 'water-control',
          'cliff-selected', 'ramp-selected', 'rough-ground']
reports = [json.loads((root / 'report.json').read_text()) for root in [original, prior, two, four]]


def copy_media(file, prefix):
    if embedded:
        data = file.read_bytes()
        mime = 'image/png' if file.suffix == '.png' else 'video/webm'
        media_records.append(dict(file=f'{prefix}-{file.name}', sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
        return f'data:{mime};base64,' + base64.b64encode(data).decode()
    target = media / f'{prefix}-{file.name}'
    shutil.copyfile(file, target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    assert digest == hashlib.sha256(file.read_bytes()).hexdigest()
    media_records.append(dict(file=target.name, sha256=digest, bytes=target.stat().st_size))
    return f'{media.name}/{target.name}'


prefixes = ['native', 'v6', 'v7e-2x', 'v7e-4x'] if style_review else ['native', 'v4', 'v6-2x', 'v6-4x']
images = {scene: [copy_media(root / f'{scene}-actual-size-framebuffer.png', prefix)
                  for prefix, root in zip(prefixes, [original, prior, two, four])] for scene in scenes}
targets = {row['name']: row for row in reports[3]['sourceViews']}
if style_review:
    targets['cliff'] = dict(tile=reports[3]['cliffView'], screenPoint=reports[3]['cliffViewScreenPoint'],
                            nativeEntry=reports[3]['cliffViewBinding']['member'])
framebuffer = reports[0]['graphics']['framebuffer']
display = reports[0]['graphics']['viewport']
assert all(r['graphics']['framebuffer'] == framebuffer for r in reports)
summary = []
performance = [json.loads((baseline_performance / 'report.json').read_text()), reports[2], reports[3]]
for label, report in zip(['Retained M1 baseline 4X', 'V6 terrain + M1 2X', 'V6 terrain + M1 4X'], performance):
    frames = report.get('sustainedPanFrames', {})
    summary.append(f'<tr><td>{label}</td><td>{report.get("mapEntryToFixtureMs", "unrecorded")}</td>'
                   f'<td>{frames.get("mean", 0):.2f}</td><td>{frames.get("p95", 0):.2f}</td>'
                   f'<td>{report.get("terrain", {}).get("gpuBytes", 0) / 1048576:.2f}</td></tr>')
videos = ''.join(f'<figure><figcaption>{label}: native panning, same framebuffer</figcaption>'
                 f'<video controls muted preload="none" src="{copy_media(root / "terrain-pan.webm", label.lower())}"></video></figure>'
                 for label, root in [('Original', baseline_performance), ('2X', two), ('4X', four)])
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>M2.1 Temperate Feedback Review V6</title><style>
body{margin:24px;background:#1b2022;color:#e8eaec;font:20px/1.5 system-ui}h1{font-size:32px;margin:0 0 12px}
p{max-width:1100px}button,select{font:inherit;padding:8px 14px;margin:4px;border:1px solid #708078;background:#26332c;color:#fff;border-radius:5px}
button.active{background:#496c4c}#viewport{position:relative;overflow:auto;max-height:78vh;border:1px solid #7b8d7e;background:#111;margin:14px 0}
#sceneImage{display:block;max-width:none;width:var(--image-width)}#viewport.fit img{width:100%;height:auto}figcaption{font-size:20px;font-weight:600;margin:10px 0}
video{width:min(100%,960px)}table{border-collapse:collapse}td,th{padding:8px 14px;border:1px solid #647567;text-align:left}
#target{position:absolute;width:20px;height:20px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #151515;transform:translate(-50%,-50%);pointer-events:none}#target[hidden]{display:none}.note{color:#c0c8c1}details{margin:18px 0}label{margin-right:12px}
</style><h1>M2.1 Temperate Feedback Review V6</h1>
<p>Art direction decision pending. This app previews selected native identities only; full production and final acceptance remain pending. Existing M1 units/buildings are retained. Water, shoreline, ore, props, trees and civilian buildings are Original controls.</p>
<p id="dimensions"></p><label>Scene <select id="scene"></select></label>
<button data-density="0">Original terrain</button><button data-density="1">V4 4X control</button><button data-density="2">V6 2X terrain</button><button data-density="3">V6 4X terrain</button>
<button id="targetButton">Show selected tile</button><button id="fit">Fit view (optional)</button><button id="pixels">Inspect framebuffer pixels</button><p id="caption" class="note"></p>
<div id="viewport"><img id="sceneImage" alt="Actual runtime terrain comparison"><span id="target" hidden></span></div>
<p>Default view matches the recorded game display size. Inspect cell joins, road paint, repeating grass/dirt detail and cliff/ramp registration. Optional framebuffer-pixel inspection enlarges the image relative to that recorded display. Texture density does not change camera coverage or cell/unit size. The road/elevation groups are selected representative assemblies; neighboring unselected variants remain Original.</p>
<p>V6 preserves the acknowledged V4 roads byte for byte. Ground preserves native RGB topology and edge colors while adding authored material detail. Rough-ground LAT stones are a complete 40-member correction; standalone rock objects remain Original. Slopes and the full Ramp01 component are repainted from native references. Water and shoreline pixels are Original; this comparison checks adjoining ground.</p>
<p>The six original review scenes are retained. Cliff-selected and ramp-selected identify actual selected native entries; the old cliff view centers unselected Cliff04. The selected cliff view targets the native Cliff02 component. Native camera clamping is retained. Rough-ground shows the newly covered embedded stones. Adjacent unselected structural members remain Original pending the direction gate. Whole-map cliff and shoreline improvements are not claimed.</p>
<details><summary>Short panning footage</summary>VIDEOS</details>
<details><summary>Measured scope and validation</summary><table><tr><th>Runtime</th><th>Map entry (ms)</th><th>Pan mean (ms)</th><th>Pan p95 (ms)</th><th>Terrain GPU (MiB)</th></tr>ROWS</table>
<p>Apple M2, ANGLE Metal/WebGL 2, fixed retail map/seed/player setup, native speed and matched mixed fixtures. Baseline timings and its panning clip are retained matched M1 evidence; its new source-camera snapshots are a separate smoke run. Individual first-use/mixed spikes are retained in the report. User appearance approval and final full-batch performance acceptance remain separate.</p>
<p>Native and V4 comparisons use accepted M1 4X art with native terrain. 2X comparison uses the ordinary shared 2X preference for M1 and terrain. Small idle-animation/tick differences are disclosed; map/view/output dimensions are matched.</p>
</details><script>
const images=IMAGES, scenes=SCENES, size=SIZE, display=DISPLAY, targets=TARGETS;let currentScene='mixed', density=3, pixels=false, showTarget=false;
const select=document.querySelector('#scene'), viewport=document.querySelector('#viewport');
for(const scene of scenes){const option=document.createElement('option');option.value=scene;option.textContent=scene;select.append(option);}
function show(){const img=document.querySelector('#sceneImage');img.src=images[currentScene][density];
img.style.setProperty('--image-width',(pixels?size[0]:display[0])+'px');
document.querySelector('#caption').textContent=['Native terrain with current M1 4X','V4 4X prior control','V6 independent 2X export','V6 independent 4X export'][density]+' — '+currentScene;
document.querySelectorAll('[data-density]').forEach(button=>button.classList.toggle('active',Number(button.dataset.density)===density));
const target=document.querySelector('#target'), row=targets[currentScene], scale=pixels?size[0]/display[0]:1;target.hidden=!showTarget||!row||viewport.classList.contains('fit');
if(row){target.style.left=row.screenPoint.x*scale+'px';target.style.top=row.screenPoint.y*scale+'px';
document.querySelector('#caption').textContent+='; selected native entry '+row.nativeEntry+' at ['+row.tile.slice(0,2)+']';}}
select.onchange=()=>{currentScene=select.value;show();};document.querySelectorAll('[data-density]').forEach(button=>button.onclick=()=>{density=Number(button.dataset.density);show();});
document.querySelector('#dimensions').textContent='Source framebuffer: '+size[0]+' × '+size[1]+'. Recorded display: '+display[0].toFixed(1)+' × '+display[1]+' CSS pixels. Default image view matches that display. Scroll within the frame when needed.';
document.querySelector('#targetButton').onclick=()=>{showTarget=!showTarget;document.querySelector('#targetButton').textContent=showTarget?'Hide selected tile':'Show selected tile';show();};
document.querySelector('#fit').onclick=()=>{viewport.classList.toggle('fit');document.querySelector('#fit').textContent=viewport.classList.contains('fit')?'Return to game display size':'Fit view (optional)';show();};
document.querySelector('#pixels').onclick=()=>{pixels=!pixels;viewport.classList.remove('fit');document.querySelector('#pixels').textContent=pixels?'Return to game display size':'Inspect framebuffer pixels';show();};show();
</script></html>'''
if style_review:
    document = document.replace("let currentScene='mixed'", "let currentScene='cliff'")
    document = document.replace('showTarget=false', 'showTarget=true')
    document = document.replace('id="targetButton">Show selected tile', 'id="targetButton">Hide selected tile')
    document = document.replace('function show(){', 'select.value=currentScene;\nfunction show(){')
    document = document.replace('option.textContent=scene;',
        "option.textContent=scene==='cliff'?'cliff - new 3D Cliff03/04':"
        "scene==='cliff-selected'?'Cliff02 - retained control':scene;")
    sources = ''.join(f'<figure><figcaption>{name.title()} source master, not runtime evidence</figcaption>'
                      f'<img style="width:min(100%,900px)" alt="{name} source" src="'
                      + copy_media(Path(f'.artifacts/m2-1/authoring-v7/{name}-e-master.png'), 'source')
                      + '"></figure>' for name in ['ground', 'cliff', 'ramp'])
    document = document.replace('<details><summary>Measured scope and validation</summary>',
        '<details><summary>Source masters (separate from actual game-size evidence)</summary>MASTERS'
        + '</details><details><summary>Measured scope and validation</summary>')
    document = document.replace('Feedback Review V6', 'Style Review V7E').replace('V4 4X control', 'V6 4X prior')
    document = document.replace('V4 4X prior control', 'V6 4X prior control').replace('V6 independent', 'V7E independent')
    document = document.replace('V6 2X terrain', 'V7E 2X terrain').replace('V6 4X terrain', 'V7E 4X terrain')
    document = document.replace('V6 preserves the acknowledged V4 roads byte for byte. Ground preserves native RGB topology and edge colors while adding authored material detail. Rough-ground LAT stones are a complete 40-member correction; standalone rock objects remain Original. Slopes and the full Ramp01 component are repainted from native references. Water and shoreline pixels are Original; this comparison checks adjoining ground.',
        'V7E changes the source art to continuous modern 3D shading. Complete authored RGB replaces the prior native-pixel base plus detail-band method. Global material colors are anchored to Original; native transition masks and alpha remain. Grass, slopes and ramp fixups share one continuous material. V4 roads remain byte-identical. Rough-ground covers embedded stones; standalone rocks remain Original. Water and shoreline remain Original controls.')
    document = document.replace('The six original review scenes are retained. Cliff-selected and ramp-selected identify actual selected native entries; the old cliff view centers unselected Cliff04. The selected cliff view targets the native Cliff02 component. Native camera clamping is retained. Rough-ground shows the newly covered embedded stones. Adjacent unselected structural members remain Original pending the direction gate. Whole-map cliff and shoreline improvements are not claimed.',
        'The cliff scene now includes authored Cliff03/04, the newly added bounded representatives. Cliff-selected deliberately retains the earlier Cliff02 control; use cliff to compare the new 3D rock faces. Ramp-selected targets Slope02. All camera coordinates and native clamping remain matched to the prior review. The representative contains 133 native members / 176 images; adjacent unselected structures remain Original. The complete 305-member production target remains gated by user art-direction approval.')
    document = document.replace('Native and V4 comparisons use accepted M1 4X art with native terrain.',
        'Original and V6 comparisons retain their respective terrain with accepted M1 4X art.')
    document = document.replace('<details><summary>Short panning footage</summary>',
        '<p>Visual questions remain open: whether the quieter grass/soil is clearer at this scale, '
        'whether repeated material is still distracting, and whether transitions to Original thick grass '
        'and adjacent structures are acceptable for the representative direction. Technical PASS does '
        'not resolve these appearance questions.</p><details><summary>Short panning footage</summary>')
    summary = [row.replace('V6 terrain', 'V7E terrain') for row in summary]

replacements = dict(VIDEOS=videos, ROWS=''.join(summary), IMAGES=json.dumps(images),
                    SCENES=json.dumps(scenes), TARGETS=json.dumps(targets), SIZE=json.dumps(framebuffer),
                    DISPLAY=json.dumps(display), MASTERS=sources if style_review else '')
# Substitute only the original template, never newly inserted media bytes.
document = re.sub(r'\b(?:VIDEOS|ROWS|IMAGES|SCENES|TARGETS|SIZE|DISPLAY|MASTERS)\b',
                  lambda match: replacements[match.group()], document)

destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(document)
if not embedded:
    (media / 'manifest.json').write_text(json.dumps(media_records, indent=2) + '\n')
print(json.dumps(dict(file=str(destination.resolve()), bytes=destination.stat().st_size, framebuffer=framebuffer,
                      scenes=len(scenes), captures=36, videos=3, embedded=embedded, media=media_records)))
