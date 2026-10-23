"""Build a self-contained review of corrected native scenes and owner-color actions."""
import argparse
import base64
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--original', type=Path, required=True)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--two', type=Path, required=True)
parser.add_argument('--four', type=Path, required=True)
parser.add_argument('--revision', default='R6')
parser.add_argument('--land-review', action='store_true')
parser.add_argument('--states-root', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
media = {}
assets = {}


def embed(file):
    data = file.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    media.setdefault(digest, dict(source=str(file.resolve()), sha256=digest, bytes=len(data)))
    mime = 'video/webm' if file.suffix == '.webm' else 'image/png'
    assets.setdefault(digest, f'data:{mime};base64,' + base64.b64encode(data).decode())
    return digest


roots = dict(original=args.original, baseline=args.baseline, two=args.two, four=args.four)
reports = {key: json.loads((root / 'report.json').read_text()) for key, root in roots.items()}
assert all(report['status'].startswith('PASS') for report in reports.values())
route = reports['four']['route']
assert all(report['route'] == route for report in reports.values())
scenes = [dict(name=target['name'], tile=target['tile'], images={key: embed(root / (target['name'] + '-framebuffer.png'))
           for key, root in roots.items()}) for target in route]
states_root = args.states_root or args.four
states_report = json.loads((states_root / 'report.json').read_text())
assert states_report['status'].startswith('PASS')
states = [dict(name=name.replace('-', ' ').title(), image=embed(states_root / (name + '-framebuffer.png')))
          for name in ['owner-neutral', 'owner-player', 'owner-enemy', 'owner-evacuated',
                       'bridge-damaged', 'bridge-demolished', 'bridge-repaired', 'ore-native-harvest']]
clips = [dict(name=Path(file).stem.replace('-', ' ').title(), video=embed(Path(file)))
         for file in states_report['clips']]
data = dict(scenes=scenes, states=states, clips=clips)
template = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>M2.2 R6 Feedback Review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#171b21;color:#edf0f5;font:19px/1.5 system-ui,sans-serif}
main{max-width:1560px;margin:auto;padding:24px}h1{font-size:32px;margin:0 0 12px}p{max-width:1100px}
button,select{font:inherit;background:#303947;color:inherit;border:1px solid #64758b;border-radius:5px;padding:7px 12px}
button[aria-pressed=true]{background:#375b82}nav{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:16px 0}
.scroll{overflow:auto;background:#080a0d;border:1px solid #475466}.scroll img{display:block;width:1241.37931px;max-width:none}
#detail{display:block;border:1px solid #64758b;margin:14px 0;max-width:100%;image-rendering:auto}
details{margin:12px 0;border:1px solid #475466;padding:10px}summary{cursor:pointer;font-size:22px}
details img,video{display:block;max-width:100%;height:auto;margin-top:12px}small{color:#c3cedd}
</style><main><h1>M2.2 R6 — Focused Feedback Review</h1>
<p>Concrete bridge continuity, road color and repair-hut visibility; subdued sea reflection without dark tile borders; stronger gold/gem facets; continuous translucent waterfall material. The willow tone and native shadow contour are corrected; other accepted artwork is preserved.</p>
<p>These are captures from independently copied Mac apps on the unchanged retail map. Click the scene to inspect exact framebuffer pixels. Original and R4 are reference captures; R6 2X and 4X are the corrected candidate.</p>
<nav><label>Scene <select id="scene"></select></label>
<button data-mode="original">Original</button><button data-mode="baseline">R4 4X</button>
<button data-mode="two">R6 2X</button><button data-mode="four">R6 4X</button><button id="fit">Fit view</button></nav>
<p id="caption"></p><div class="scroll"><img id="sceneImage" alt="Actual native map scene"></div>
__FOCUS_CONTROLS__
<small>Detail: exact pixels from the current capture; no sharpening or enlargement.</small><canvas id="detail" width="640" height="400"></canvas>
<h2>Occupier player color and native states</h2><p>Native garrison orders transfer the building to the occupying player. Original remap regions use that player's color; evacuation restores neutral ownership. This is a player color, not a fixed faction color.</p><div id="states"></div>
<h2>Native clips</h2><div id="clips"></div><p>Technical checks do not grant user visual acceptance. Windows performance and physical input remain deferred. This page embeds every image and video and needs no server or sibling files.</p>
</main>__MEDIA__<script>
const data=__DATA__;window.__reviewManifest={scenes:data.scenes.length,states:data.states.length,clips:data.clips.length};
const mediaSource=id=>document.getElementById('media-'+id).textContent;
let mode='four',index=0,fit=false,point=[190,380];const scene=document.getElementById('scene'),image=document.getElementById('sceneImage');
data.scenes.forEach((s,i)=>scene.add(new Option(s.name.replaceAll('-',' '),i)));
scene.value=String(data.scenes.findIndex(s=>s.name==='water-shore'));
function detail(){const c=document.getElementById('detail'),x=Math.max(0,Math.min(image.naturalWidth-c.width,point[0])),y=Math.max(0,Math.min(image.naturalHeight-c.height,point[1]));c.getContext('2d').drawImage(image,x,y,c.width,c.height,0,0,c.width,c.height);window.__detailRect=[x,y,c.width,c.height]}
function show(){index=Number(scene.value);const s=data.scenes[index];image.onload=detail;image.src=mediaSource(s.images[mode]);document.getElementById('caption').textContent=s.name+' · '+mode+' · retail tile '+s.tile.slice(0,2).join(', ');document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)))}
scene.onchange=show;document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;show()});
image.onclick=e=>{const r=image.getBoundingClientRect();point=[Math.round((e.clientX-r.left)*image.naturalWidth/r.width-320),Math.round((e.clientY-r.top)*image.naturalHeight/r.height-200)];detail()};
document.getElementById('fit').onclick=()=>{fit=!fit;image.style.width=fit?'100%':'1241.37931px'};
document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{scene.value=String(data.scenes.findIndex(s=>s.name==='reported-shore'));point=JSON.parse(b.dataset.focus);show()});
for(const [id,list,tag,key] of [['states',data.states,'img','image'],['clips',data.clips,'video','video']])for(const s of list){const d=document.createElement('details'),summary=document.createElement('summary'),m=document.createElement(tag);summary.textContent=s.name;m.src=mediaSource(s[key]);if(tag==='video'){m.controls=true;m.preload='none'}else m.alt=s.name;d.append(summary,m);document.getElementById(id).append(d)}show();
</script></html>'''
if args.land_review:
    template = template.replace('__FOCUS_CONTROLS__', '<nav><button data-focus="[40,0]">Willow ground</button><button data-focus="[640,520]">Shore ground</button><button data-focus="[170,360]">Bridge contacts</button></nav>')
    template = template.replace('Concrete bridge continuity, road color and repair-hut visibility; subdued sea reflection without dark tile borders; stronger gold/gem facets; continuous translucent waterfall material. The willow tone and native shadow contour are corrected; other accepted artwork is preserved.',
        'Whole-map land inspection: 27 overlapping native camera views cover all 10,151 playable tiles. Shore land follows the retail material guide to remove invented bright blocks and diagonal bevels. Concrete bridge contacts use continuous asphalt. The accepted R6 water, shallow transitions and enclosed islands remain exact; seven terrain groups and 97 environment families are preserved.')
    template = template.replace('Original and R4 are reference captures; R6 2X and 4X are the corrected candidate.',
        f'Original and R6 4X are reference captures; {args.revision} 2X and 4X are the corrected candidate.')
    template = template.replace('R4 4X', 'R6 4X').replace("s.name==='water-shore'", "s.name==='reported-shore'")
    template = template.replace('M2.2 R6 — Focused Feedback Review', f'M2.2 {args.revision} — Whole-map Land and Bridge Review')
else:
    template = template.replace('__FOCUS_CONTROLS__', '')
template = template.replace('M2.2 R6 Feedback Review', f'M2.2 {args.revision} Feedback Review')
if args.revision != 'R6':
    template = template.replace('R6 2X', f'{args.revision} 2X').replace('R6 4X</button><button id', f'{args.revision} 4X</button><button id')
html = template.replace('__DATA__', json.dumps(data, separators=(',', ':')))
html = html.replace('__MEDIA__', ''.join(f'<script type="text/plain" id="media-{key}">{value}</script>'
                                       for key, value in assets.items()))
file = args.output / f'M2.2-{args.revision}-Feedback-Offline.html'
file.write_text(html)
receipt = dict(schema='m2-2-feedback-review-v2', mediaEmbedding='DEDUPLICATED_INDIVIDUAL_NON_EXECUTABLE_BLOCKS',
               reviewSha256=hashlib.sha256(file.read_bytes()).hexdigest(),
               bytes=file.stat().st_size, media=list(media.values()), counts=dict(scenes=len(scenes), states=len(states), clips=len(clips)),
               nativeReports={key: dict(file=str((roots[key] / 'report.json').resolve()),
                   sha256=hashlib.sha256((roots[key] / 'report.json').read_bytes()).hexdigest()) for key in roots},
               requiresServer=False, requiresSiblingMedia=False, userAcceptance='PENDING')
receipt['nativeStatesReport'] = dict(file=str((states_root / 'report.json').resolve()),
    sha256=hashlib.sha256((states_root / 'report.json').read_bytes()).hexdigest())
(args.output / 'review.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ['reviewSha256', 'bytes', 'counts']}))
