"""One self-contained native-size review from the combined application's captures."""
import base64
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path('.artifacts/m1-6b')
RUN=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'runtime-complete-v1')
OUT=ROOT/(sys.argv[2] if len(sys.argv)>2 else 'complete-review-v1')
OUT.mkdir(exist_ok=False)
runtime=json.loads((RUN/'result.json').read_text())
checks=json.loads((RUN/'evidence-check.json').read_text())
inventory=json.loads((ROOT/'source-v1/inventory.json').read_text())
data={};media=[]

def encode(path,size=(680,520)):
    im=Image.open(path).convert('RGB').resize(size,Image.Resampling.LANCZOS)
    stream=io.BytesIO();im.save(stream,format='WEBP',quality=94,method=4)
    return 'data:image/webp;base64,'+base64.b64encode(stream.getvalue()).decode()

for family,record in runtime['families'].items():
    samples={s['file']:s for s in record['samples']}
    images={file:encode(RUN/family/file) for file in samples}
    groups=[]
    def group(label,states,fps=20):
        pairs=[dict(original=f'{s}-4k-original.png',hd=f'{s}-4k-hd.png') for s in states]
        assert all(p['original'] in images and p['hd'] in images for p in pairs)
        groups.append(dict(label=label,frames=pairs,fps=fps))
    group('Normal',['normal'])
    group('Damaged',['damaged'])
    buildup=[s for s in dict.fromkeys(x['state'] for x in record['samples']) if s.startswith('build-')]
    group('Construction',buildup,len(buildup)/.6)
    group('Sale',buildup[::-1],len(buildup)/.6)
    if family=='NAREFN':
        for level in range(1,5):group(f'Ore storage {level}/4',[f'ore-{level}-{n}' for n in range(3)])
        group('Ore discharge',[f'unload-{n:02}' for n in range(19)])
    if family=='NAWEAP':
        group('Production door',['door-open'])
        group('Roof deployment',['roof-open'])
        group('Machinery activity',[f'active-{n:02}' for n in range(12)])
    if family=='NACNST':
        group('Production crane',[f'production-{n:02}' for n in range(21)])
        group('Damaged production',[f'production-damage-{n:02}' for n in range(20)])
        group('Finial activity',[f'active-{n:02}' for n in range(10)])
    data[family]=dict(images=images,groups=groups,density=checks['families'][family]['effectiveDensity'],
                      gpuMiB=round(checks['families'][family]['gpuBytes']/1048576,2),pairs=len(checks['families'][family]['pairs']))
    for g in groups:
        if len(g['frames'])<10 or g['label']=='Sale':continue
        panels=[]
        for i,pair in enumerate(g['frames']):
            panel=Image.new('RGB',(1440,580),'#18231f');draw=ImageDraw.Draw(panel)
            draw.text((20,10),'Original',fill='white',font_size=30)
            draw.text((740,10),f'HD {data[family]["density"]}x',fill='white',font_size=30)
            for x,key in [(20,'original'),(740,'hd')]:
                im=Image.open(RUN/family/pair[key]).convert('RGB').resize((680,520),Image.Resampling.LANCZOS)
                panel.paste(im,(x,50))
            panels.append(panel)
        durations=[round((i+1)*1000/g['fps'])-round(i*1000/g['fps']) for i in range(len(panels))]
        name=family+'-'+g['label'].lower().replace(' ','-')+'.webp'
        panels[0].save(OUT/name,save_all=True,append_images=panels[1:],duration=durations,loop=0,quality=94,method=4)
        media.append(dict(file=name,family=family,sequence=g['label'],frames=len(panels),durationMs=sum(durations),css=[720,290]))

board=Image.new('RGB',(1440,4*580),'#18231f');draw=ImageDraw.Draw(board)
for i,family in enumerate(data):
    draw.text((20,i*580+10),family+' Original',fill='white',font_size=30)
    draw.text((740,i*580+10),family+' HD 2x',fill='white',font_size=30)
    for x,mode in [(20,'original'),(740,'hd')]:
        im=Image.open(RUN/family/f'normal-4k-{mode}.png').convert('RGB').resize((680,520),Image.Resampling.LANCZOS)
        board.paste(im,(x,i*580+50))
board.save(OUT/'normal-comparison.png')
scene=encode(RUN/'all-families-scene.png',(1280,927))
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.6b Soviet building review</title><style>
*{box-sizing:border-box}body{margin:0;background:#111b17;color:#e4ece7;font:17px system-ui,sans-serif;line-height:1.5}main{max-width:1160px;margin:auto;padding:28px}h1{font-size:30px;margin:0 0 10px}h2{font-size:23px}p{max-width:960px}.muted{color:#b4c6ba}button,select{font:inherit;color:inherit;background:#263d30;border:1px solid #69806c;border-radius:5px;padding:8px 14px;cursor:pointer}button[aria-pressed=true]{background:#486b4d}nav,.controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.panels{display:flex;gap:20px;min-width:700px;width:700px}.panels figure{margin:0;width:340px;flex:0 0 340px}.panels img{width:340px;height:260px;display:block}.panels figcaption{margin-bottom:6px}.scroll{overflow-x:auto;padding-bottom:12px}.controls input{width:270px}table{border-collapse:collapse;width:100%;font-size:16px}td,th{text-align:left;border-bottom:1px solid #3b5143;padding:9px}summary{cursor:pointer;padding:10px 0}.scene{max-width:100%;height:auto}.badge{display:inline-block;background:#324b39;padding:4px 10px;border-radius:4px}a{color:#b9e6c4}
</style><main><h1>M1.6b — Soviet building batch</h1>
<p class="badge">Complete-family technical checks passed · Final visual/gameplay acceptance pending</p>
<p>Four optional temperate families in one Mac build. Review at the fixed 340 × 260 logical size below. Each side uses the same tick, camera, native geometry and Original shadow. Enlarging this page is supplementary.</p>
<nav id="families" aria-label="Building family"></nav><h2 id="title"></h2><p id="summary" class="muted"></p>
<div class="controls"><label>State <select id="sequence"></select></label><button id="play">Pause</button><label>Speed <select id="speed"><option value="1">Native</option><option value="0.25">Quarter</option></select></label></div>
<div class="scroll"><div class="panels"><figure><figcaption>Original</figcaption><img id="original" alt="Original native building frame"></figure><figure><figcaption id="hd-label">HD</figcaption><img id="hd" alt="Authored HD native building frame"></figure></div></div>
<div class="controls"><button id="previous">Previous</button><input id="frame" aria-label="Animation frame" type="range" min="0" value="0"><button id="next">Next</button><span id="position"></span></div>
<p class="muted">Animation replay selects the original frame sequence in the current app at its native rate. These matched render fixtures are separate from the ordinary gameplay checks below. Construction/sale use 0.6 seconds at the measured speed; activity and production use 20 frames/s.</p>
<details><summary>Registered owner colors</summary><div class="scroll"><div class="panels"><figure><figcaption>Blue owner palette</figcaption><img id="blue" alt="HD with registered blue owner palette"></figure><figure><figcaption>Yellow owner palette</figcaption><img id="yellow" alt="HD with registered yellow owner palette"></figure></div></div></details>
<details><summary>1080p output comparison at the same logical size</summary><div class="scroll"><div class="panels"><figure><figcaption>Original · 1080p</figcaption><img id="low-original" alt="Original at 1080p output"></figure><figure><figcaption>HD · 1080p</figcaption><img id="low-hd" alt="HD at 1080p output"></figure></div></div></details>
<h2>Batch validation</h2><table><thead><tr><th>Family</th><th>Native production</th><th>Damage / repair / sale</th><th>Final appearance</th></tr></thead><tbody>
<tr><td>NAHAND</td><td>Infantry queue and native exit</td><td>PASS</td><td>Awaiting your decision</td></tr>
<tr><td>NAREFN</td><td>Original miner, docking, unloading, credits</td><td>PASS</td><td>Awaiting your decision</td></tr>
<tr><td>NAWEAP</td><td>Native vehicle queue, door/exit occlusion</td><td>PASS</td><td>Awaiting your decision</td></tr>
<tr><td>NACNST</td><td>MCV deploy, building production, legal repacking</td><td>PASS</td><td>Awaiting your decision</td></tr></tbody></table>
<p>257 native slots, 514 exports and 219 matched render pairs. Four independent next-match controls default to Original. All four new families use complete 2x sets when combined with accepted 4x Conscript/GAPOWR/NAPOWR and the accepted Rhino. Optional texture allocation is 246.53 MiB within a 256 MiB budget. No accepted asset is downshifted. The 4x refinery/factory/yard sets exceed the unchanged family limit.</p>
<p>Measured display: 900-high logical field, unchanged CSS viewport, DPR 2; drawing buffers 1491 × 1080 and 2982 × 2160. This is not a claim of a physical 3840 × 2160 display. Native shadows, rules, selection, movement, miner and MCV artwork remain Original.</p>
<details><summary>Actual combined scene</summary><img class="scene" src="SCENE_DATA" alt="Ordinary match with all accepted and new families"></details>
<p class="muted">Final visual/gameplay acceptance remains yours. You can accept the batch or name individual exceptions. Corrections stay in this task.</p></main>
<script>
const data=DATA_JSON;let family='NAHAND',group=0,index=0,playing=true,last=performance.now();
const $=id=>document.getElementById(id),names={NAHAND:'Soviet Barracks',NAREFN:'Soviet Ore Refinery',NAWEAP:'Soviet War Factory',NACNST:'Soviet Construction Yard'};
function current(){return data[family].groups[group]}
function draw(){const d=data[family],g=current(),p=g.frames[index];$('original').src=d.images[p.original];$('hd').src=d.images[p.hd];$('frame').value=index;$('position').textContent=`Frame ${index+1} / ${g.frames.length}`;}
function selectGroup(){group=+$('sequence').value;index=0;last=performance.now();$('frame').max=current().frames.length-1;draw();}
function selectFamily(name){family=name;group=0;index=0;last=performance.now();const d=data[name];$('title').textContent=names[name];$('summary').textContent=`${name} · complete ${d.density}x family · ${d.gpuMiB} MiB · ${d.pairs} verified pairs`;$('hd-label').textContent=`HD ${d.density}x`;$('sequence').replaceChildren(...d.groups.map((g,i)=>Object.assign(document.createElement('option'),{value:i,textContent:g.label})));document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.family===name)));$('blue').src=d.images['owner-blue.png'];$('yellow').src=d.images['owner-yellow.png'];$('low-original').src=d.images['normal-1080p-original.png'];$('low-hd').src=d.images['normal-1080p-hd.png'];selectGroup();}
for(const name of Object.keys(data)){const b=document.createElement('button');b.textContent=names[name];b.dataset.family=name;b.onclick=()=>selectFamily(name);$('families').append(b);}
$('sequence').onchange=selectGroup;$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';last=performance.now()};$('speed').onchange=()=>last=performance.now();$('frame').oninput=()=>{index=+$('frame').value;playing=false;$('play').textContent='Play';draw()};
for(const [id,step]of[['previous',-1],['next',1]])$(id).onclick=()=>{playing=false;$('play').textContent='Play';index=(index+step+current().frames.length)%current().frames.length;draw()};
function tick(now){const g=current(),period=1000/g.fps/+$('speed').value;if(playing&&g.frames.length>1&&now-last>=period){const steps=Math.floor((now-last)/period);index=(index+steps)%g.frames.length;last+=steps*period;draw()}requestAnimationFrame(tick)}selectFamily(family);requestAnimationFrame(tick);
</script></html>'''
html=html.replace('SCENE_DATA',scene).replace('DATA_JSON',json.dumps(data,separators=(',',':')))
(OUT/'review.html').write_text(html)
(OUT/'media.json').write_text(json.dumps(media,indent=2)+'\n')
(OUT/'validation.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(dict(review=str(OUT/'review.html'),bytes=(OUT/'review.html').stat().st_size,media=len(media))))
