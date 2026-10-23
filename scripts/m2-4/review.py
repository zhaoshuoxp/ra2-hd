"""Package a compact review with untouched native framebuffer images and exact-size sprite comparisons."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

output = Path(sys.argv[1])
output.mkdir(exist_ok=False)
media = output / 'media'
media.mkdir()
root = Path('.artifacts/m2-4')
report = json.loads((root / 'native-snow-2x-v1/report.json').read_text())
scenes = []
files = []


def copy_image(source, name):
    target = media / name
    shutil.copyfile(source, target)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    assert digest == hashlib.sha256(source.read_bytes()).hexdigest()
    files.append(dict(file=f'media/{name}', source=str(source.resolve()), sha256=digest,
                      size=list(Image.open(target).size), rescaled=False))
    return f'media/{name}'


for index, row in enumerate(report['captureRoute']):
    name = f'{index:02d}-{row["name"]}-framebuffer.png'
    scene = dict(name=row['name'], tile=row['tile'], images={})
    for label, directory in [('Original', 'native-snow-original-review-v1'),
                             ('2X', 'native-snow-2x-v1'), ('4X', 'native-snow-4x-v1')]:
        scene['images'][label] = copy_image(root / directory / name, f'{label}-{name}')
    dimensions = {tuple(Image.open(output / file).size) for file in scene['images'].values()}
    assert len(dimensions) == 1, 'Matched captures must retain identical framebuffer dimensions'
    scenes.append(scene)

states = []
for state in ['normal', 'occupied', 'damaged', 'rubble']:
    images = {}
    for label, directory in [('2X', 'native-snow-2x-v1'), ('4X', 'native-snow-4x-v1')]:
        filename = f'CAEUR1-{state}-native-detail.png'
        images[label] = copy_image(root / directory / filename, f'{label}-{filename}')
    states.append(dict(name=f'CAEUR1 {state}', images=images))
comparisons = []
for density in [2, 4]:
    for kind in ['terrain', 'environment']:
        folder = root / f'snow-{kind}-review-{density}x-v1'
        for source in sorted(folder.glob('*.png')):
            comparisons.append(dict(name=f'{source.stem} source atlas comparison',
                image=copy_image(source, f'atlas-{density}X-{source.name}')))

manifest = dict(schema='m2-4-native-snow-review-v1', scenes=scenes, states=states,
                comparisons=comparisons, files=files, technical='PASS_SELECTED_NATIVE_CASES',
                visual='AWAITING_USER_DIRECTION_REVIEW', fullSnowCoverage=False, m24Complete=False)
(output / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
data = json.dumps(dict(scenes=scenes, states=states, comparisons=comparisons)).replace('<', '\\u003c')
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Snow representative review</title><style>
body{margin:24px;background:#141923;color:#eef2f8;font:18px/1.5 system-ui}h1{font-size:30px;margin:0 0 12px}
p{max-width:1000px}button,select{font:inherit;padding:8px 12px;color:inherit;background:#263248;border:1px solid #53637c;border-radius:6px;margin:4px}
button.active{background:#3968b4}section{margin:28px 0}.viewer{overflow:auto;border:1px solid #526077;background:#070b12;max-height:80vh}
.viewer img{display:block;max-width:none;width:auto}.viewer.fit img{max-width:100%;height:auto}.caption{color:#bfcbdc;margin:8px 0}
details{margin:20px 0}summary{cursor:pointer;font-size:22px}a{color:#a5c8ff}.status{color:#a8dec5}
</style><h1>M2.4 Snow representative review</h1>
<p class="status">Mac technical checks passed. Visual direction awaits review. This is a representative subset; complete SNOW and M2.4 coverage remain pending.</p>
<p>Review the snow surface, seams, slope, cliff, dirt road, four trees and house states. Original, 2X and 4X scene captures use the same map, seed, output and camera positions. State captures use disclosed legal native fixtures and ordinary orders/damage. Original separate shadows and normal game geometry remain unchanged.</p>
<section><h2>Matched in-game scenes</h2><select id="scene" aria-label="Scene"></select><span id="sceneModes"></span>
<button id="fitScene">Fit preview</button><a id="sceneFile" target="_blank">Open source PNG</a>
<div class="caption" id="sceneCaption"></div><div class="viewer" id="sceneViewer"><img id="sceneImage" alt="Matched native scene"></div></section>
<section><h2>Native house states</h2><select id="state" aria-label="State"></select><span id="stateModes"></span>
<button id="fitState">Fit preview</button><a id="stateFile" target="_blank">Open source PNG</a>
<div class="caption">Default display is 1:1 framebuffer pixels. Fit preview changes only the viewer. State transitions passed at both densities; source files retain their original 960 by 720 pixels.</div>
<div class="viewer" id="stateViewer"><img id="stateImage" alt="Native house state"></div></section>
<details><summary>Native source atlas comparisons</summary><p>These comparisons show native source pixels and independently sampled HD at the stated density. They complement the actual in-game captures above.</p><select id="comparison" aria-label="Atlas comparison"></select><div class="viewer"><img id="comparisonImage" alt="Source atlas comparison"></div></details>
<p><a href="review-manifest.json">Image hashes and capture provenance</a>. Windows and user visual acceptance are not claimed. The independent app and complete selected dependencies are in the sibling RA2-HD-M2.4-Snow-Samples folder.</p>
<script>const data=__DATA__;
function viewer(prefix,items){let mode='2X';const select=document.getElementById(prefix),buttons=document.getElementById(prefix+'Modes');
items.forEach((item,index)=>select.add(new Option(item.name,index)));
function render(){const item=items[Number(select.value)],file=item.images[mode];document.getElementById(prefix+'Image').src=file;
document.getElementById(prefix+'File').href=file;buttons.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.textContent===mode));
const caption=document.getElementById(prefix+'Caption');if(caption)caption.textContent=item.name+' / '+mode+' / same native camera and output / 1:1 pixels by default';}
Object.keys(items[0].images).forEach(label=>{const button=document.createElement('button');button.textContent=label;button.onclick=()=>{mode=label;render()};buttons.append(button)});
select.onchange=render;document.getElementById('fit'+prefix[0].toUpperCase()+prefix.slice(1)).onclick=function(){const active=document.getElementById(prefix+'Viewer').classList.toggle('fit');this.textContent=active?'Show 1:1 pixels':'Fit preview'};render();}
viewer('scene',data.scenes);viewer('state',data.states);const comparison=document.getElementById('comparison');data.comparisons.forEach((item,index)=>comparison.add(new Option(item.name,index)));
comparison.onchange=()=>document.getElementById('comparisonImage').src=data.comparisons[Number(comparison.value)].image;comparison.onchange();
</script></html>'''.replace('__DATA__', data)
(output / 'index.html').write_text(html)
print(json.dumps(dict(output=str(output.resolve()), images=len(files), scenes=len(scenes), states=len(states))))
