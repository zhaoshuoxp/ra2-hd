"""Build a standalone grouped review from the exact native runtime captures."""
import base64
import json
import re
import sys
from pathlib import Path

original, two, four, destination = map(Path, sys.argv[1:5])
scenes = ['mixed', 'road', 'cliff', 'ramp', 'transition', 'water-control']
reports = [json.loads((root / 'report.json').read_text()) for root in [original, two, four]]


def embed(file, mime):
    return f'data:{mime};base64,' + base64.b64encode(file.read_bytes()).decode()


images = {scene: [embed(root / f'{scene}-actual-size-framebuffer.png', 'image/png')
                  for root in [original, two, four]] for scene in scenes}
framebuffer = reports[0]['graphics']['framebuffer']
display = reports[0]['graphics']['viewport']
assert all(r['graphics']['framebuffer'] == framebuffer for r in reports)
summary = []
for label, report in zip(['Native terrain / M1 4X', 'Terrain + M1 2X', 'Terrain + M1 4X'], reports):
    frames = report.get('sustainedPanFrames', {})
    summary.append(f'<tr><td>{label}</td><td>{report.get("mapEntryToFixtureMs", "unrecorded")}</td>'
                   f'<td>{frames.get("mean", 0):.2f}</td><td>{frames.get("p95", 0):.2f}</td>'
                   f'<td>{report.get("terrain", {}).get("gpuBytes", 0) / 1048576:.2f}</td></tr>')
videos = ''.join(f'<figure><figcaption>{label}: native panning, same framebuffer</figcaption>'
                 f'<video controls muted preload="none" src="{embed(root / "terrain-pan.webm", "video/webm")}"></video></figure>'
                 for label, root in [('Original', original), ('2X', two), ('4X', four)])
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>M2.1 Temperate Representative Review</title><style>
body{margin:24px;background:#1b2022;color:#e8eaec;font:20px/1.5 system-ui}h1{font-size:32px;margin:0 0 12px}
p{max-width:1100px}button,select{font:inherit;padding:8px 14px;margin:4px;border:1px solid #708078;background:#26332c;color:#fff;border-radius:5px}
button.active{background:#496c4c}#viewport{overflow:auto;max-height:78vh;border:1px solid #7b8d7e;background:#111;margin:14px 0}
#sceneImage{display:block;max-width:none;width:var(--image-width)}#viewport.fit img{width:100%;height:auto}figcaption{font-size:20px;font-weight:600;margin:10px 0}
video{width:min(100%,960px)}table{border-collapse:collapse}td,th{padding:8px 14px;border:1px solid #647567;text-align:left}
.note{color:#c0c8c1}details{margin:18px 0}label{margin-right:12px}
</style><h1>M2.1 Temperate Representative Review</h1>
<p>Art direction decision pending. This app previews selected native identities only; full production and final acceptance remain pending. Existing M1 units/buildings are retained. Water, shoreline, ore, props, trees and civilian buildings are Original controls.</p>
<p id="dimensions"></p><label>Scene <select id="scene"></select></label>
<button data-density="0">Original terrain</button><button data-density="1">2X terrain</button><button data-density="2">4X terrain</button>
<button id="fit">Fit view (optional)</button><button id="pixels">Inspect framebuffer pixels</button><p id="caption" class="note"></p>
<div id="viewport"><img id="sceneImage" alt="Actual runtime terrain comparison"></div>
<p>Default view matches the recorded game display size. Inspect cell joins, road paint, repeating grass/dirt detail and cliff/ramp registration. Optional framebuffer-pixel inspection enlarges the image relative to that recorded display. Texture density does not change camera coverage or cell/unit size. The road/elevation groups are selected representative assemblies; neighboring unselected variants remain Original.</p>
<p>This V4 direction candidate replaces user-rejected V2 microtexture and internally rejected V3 assembly seams. Ground uses continuous authored materials; the complete straight-road and cliff components are repainted as whole assemblies before native subtile cutting. Road junctions/ends/slopes and adjacent unselected cliffs are Original controls. Final full production remains gated on the new direction decision.</p>
<details><summary>Short panning footage</summary>VIDEOS</details>
<details><summary>Measured scope and validation</summary><table><tr><th>Runtime</th><th>Map entry (ms)</th><th>Pan mean (ms)</th><th>Pan p95 (ms)</th><th>Terrain GPU (MiB)</th></tr>ROWS</table>
<p>Apple M2, ANGLE Metal/WebGL 2, fixed retail map/seed/player setup, native speed and matched mixed fixtures. Individual first-use/mixed spikes are retained in the report. User appearance approval and final full-batch performance acceptance remain separate.</p>
<p>Original comparison uses accepted M1 4X art with native terrain. 2X comparison uses the ordinary shared 2X preference for M1 and terrain. Small idle-animation/tick differences are disclosed; map/view/output dimensions are matched.</p>
</details><script>
const images=IMAGES, scenes=SCENES, size=SIZE, display=DISPLAY;let currentScene='mixed', density=2, pixels=false;
const select=document.querySelector('#scene'), viewport=document.querySelector('#viewport');
for(const scene of scenes){const option=document.createElement('option');option.value=scene;option.textContent=scene;select.append(option);}
function show(){const img=document.querySelector('#sceneImage');img.src=images[currentScene][density];
img.style.setProperty('--image-width',(pixels?size[0]:display[0])+'px');
document.querySelector('#caption').textContent=['Native terrain with current M1 4X','Independent authored 2X export','Independent authored 4X export'][density]+' — '+currentScene;
document.querySelectorAll('[data-density]').forEach(button=>button.classList.toggle('active',Number(button.dataset.density)===density));}
select.onchange=()=>{currentScene=select.value;show();};document.querySelectorAll('[data-density]').forEach(button=>button.onclick=()=>{density=Number(button.dataset.density);show();});
document.querySelector('#dimensions').textContent='Source framebuffer: '+size[0]+' × '+size[1]+'. Recorded display: '+display[0].toFixed(1)+' × '+display[1]+' CSS pixels. Default image view matches that display. Scroll within the frame when needed.';
document.querySelector('#fit').onclick=()=>{viewport.classList.toggle('fit');document.querySelector('#fit').textContent=viewport.classList.contains('fit')?'Return to game display size':'Fit view (optional)';};
document.querySelector('#pixels').onclick=()=>{pixels=!pixels;viewport.classList.remove('fit');document.querySelector('#pixels').textContent=pixels?'Return to game display size':'Inspect framebuffer pixels';show();};show();
</script></html>'''
replacements = dict(VIDEOS=videos, ROWS=''.join(summary), IMAGES=json.dumps(images),
                    SCENES=json.dumps(scenes), SIZE=json.dumps(framebuffer), DISPLAY=json.dumps(display))
# Substitute only the original template, never newly inserted media bytes.
document = re.sub(r'\b(?:VIDEOS|ROWS|IMAGES|SCENES|SIZE|DISPLAY)\b',
                  lambda match: replacements[match.group()], document)

destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(document)
print(json.dumps(dict(file=str(destination.resolve()), bytes=destination.stat().st_size, framebuffer=framebuffer,
                      scenes=len(scenes), captures=18, videos=3)))
