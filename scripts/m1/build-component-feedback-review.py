"""Build a self-contained review from unrescaled native captures and source views."""
import argparse
import base64
import io
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('evidence', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
data = {'APOC': {}, 'DISK': {}, 'source': {}}
for density in [2, 4]:
    root = args.evidence / f'uniform-{density}x-v11'
    report = json.loads((root / 'report.json').read_text())
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    for frame in report['frames']:
        original = Image.open(root / frame['file']).convert('RGBA')
        encoded = io.BytesIO(); original.save(encoded, format='WEBP', lossless=True, quality=60, method=0)
        assert Image.open(io.BytesIO(encoded.getvalue())).convert('RGBA').tobytes() == original.tobytes()
        image = 'data:image/webp;base64,' + base64.b64encode(encoded.getvalue()).decode()
        data[frame['identity']][f"{density}-{frame['angle']}-{int(frame['cross'])}"] = image
for heading in range(0, 360, 45):
    image = args.evidence / f'apoc-upper-export-v9/coherent-source-{heading}.png'
    data['source'][heading] = 'data:image/png;base64,' + base64.b64encode(image.read_bytes()).decode()
html = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Apocalypse and Flying Disc — Native R6 Review</title>
<style>
body{margin:0;background:#152028;color:#eaf0f4;font:18px/1.5 system-ui,sans-serif}main{max-width:1450px;margin:auto;padding:28px}
h1{font-size:32px;margin:0 0 12px}h2{font-size:26px;margin-top:32px}p{max-width:1100px;color:#b9cbd6}
button,select,input{font:inherit;padding:7px 12px;margin:4px;border-radius:6px}label{display:inline-block;margin-right:18px}
.controls{padding:12px;background:#253641;border-radius:8px}.row{display:grid;grid-template-columns:1.4fr 1fr;gap:24px;align-items:center}
figure{margin:18px 0}img{display:block;max-width:100%;height:auto;background:#33414b;border-radius:8px}figcaption{color:#b9cbd6;margin-top:8px}
.source{width:542px}.native{width:720px}#disc{width:720px}.badge{display:inline-block;padding:5px 10px;background:#654b1d;border-radius:6px}
@media(max-width:900px){.row{grid-template-columns:1fr}main{padding:16px}}
</style><main>
<h1>Apocalypse and Flying Disc — Native R6 Review</h1><span class="badge">Visual acceptance pending</span>
<p>macOS native game rendering at 3840 × 2160. The captures are original 720 × 540 crops with a recorded camera zoom of 2.5; this page fits them to the window. Two independent atlas densities are available.</p>
<h2>Apocalypse — source proportions and component connections</h2>
<p>The turret and both guns share one assembly source. Every view uses the same uniform scale and roof anchor. The accepted raw 180° and 270° silhouettes are retained. Only the exposed 0° and 90° tubes are shortened. The hull and native component joints remain separate.</p>
<div class="controls"><label>Density <select id="density"><option value="4">4X</option><option value="2">2X</option></select></label>
<label>Heading <select id="angle">ANGLES</select></label><label><input type="checkbox" id="cross"> Independent turret; hull at 0°</label>
<button id="previous">Previous</button><button id="next">Next</button></div>
<div class="row"><figure><img id="apoc" class="native" alt="Native Apocalypse capture"><figcaption id="apoc-caption"></figcaption></figure>
<figure><img id="source" class="source" alt="Coherent source upper assembly"><figcaption>Source assembly before the single uniform export scale. No nonuniform turret transform.</figcaption></figure></div>
<h2>Flying Disc — lowered cabin, annular highlight and fixed lighting</h2>
<p>The phase slider shows controlled native shader phases, including the two reported side joins. The preview animation cycles these captures; separate native continuous-motion recordings and telemetry are retained with the evidence.</p>
<div class="controls"><label>Phase <input id="phase" type="range" min="0" max="31" value="0"></label><button id="play">Play phases</button><span id="phase-label"></span></div>
<figure><img id="disc" alt="Native Flying Disc capture"><figcaption>Registered alpha remains fixed while surface detail and owner masks rotate together. The light direction remains fixed across the dome and lower slats.</figcaption></figure>
<p>Technical validation is scoped to these two units. Native Windows and final user visual acceptance are separate, pending statuses.</p>
</main><script>const data=DATA;
const el=id=>document.getElementById(id),angleList=[0,45,90,135,180,225,270,315];
function update(){const density=el('density').value,angle=Number(el('angle').value),cross=el('cross').checked&&angle!==0;
el('apoc').src=data.APOC[`${density}-${angle}-${Number(cross)}`];el('source').src=data.source[angle];
el('apoc-caption').textContent=`${density}X — turret ${angle}°; hull ${cross?0:angle}°`;
const phase=Number(el('phase').value)*11.25;el('disc').src=data.DISK[`${density}-${phase}-0`];el('phase-label').textContent=`${phase}°`;}
for(const id of ['density','angle','cross','phase'])el(id).addEventListener('input',update);
function step(delta){el('angle').value=angleList[(angleList.indexOf(Number(el('angle').value))+delta+8)%8];update();}
el('previous').onclick=()=>step(-1);el('next').onclick=()=>step(1);let timer;
el('play').onclick=()=>{if(timer){clearInterval(timer);timer=undefined;el('play').textContent='Play phases';}
else{timer=setInterval(()=>{el('phase').value=(Number(el('phase').value)+1)%32;update();},180);el('play').textContent='Pause';}};update();
</script></html>'''
options = ''.join(f'<option value="{angle}">{angle}°</option>' for angle in range(0, 360, 45))
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(html.replace('ANGLES', options).replace('DATA', json.dumps(data, separators=(',', ':'))))
print(args.output)
