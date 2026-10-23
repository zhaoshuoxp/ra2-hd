"""Assemble a portable native-size review from actual-app captures, without profiles."""
import json
import shutil
import sys
from pathlib import Path

root = Path('.artifacts/soviet-remaining')
runtime = root / (sys.argv[1] if len(sys.argv) > 1 else 'runtime-complete-v2')
out = root / (sys.argv[2] if len(sys.argv) > 2 else 'complete-review-v1')
out.mkdir(exist_ok=True)
report = json.loads((runtime / 'result.json').read_text())
assert report['status'] == 'PASS_NATIVE_CONTROLLER_RENDER_REVIEW'
names = {
    'NAHAND': 'Soviet Barracks', 'NAREFN': 'Ore Refinery', 'NAWEAP': 'War Factory', 'NACNST': 'Construction Yard',
    'NARADR': 'Radar Tower', 'NADEPT': 'Service Depot', 'NAYARD': 'Naval Shipyard',
    'NATECH': 'Battle Lab', 'NANRCT': 'Nuclear Reactor', 'NACLON': 'Cloning Vats',
    'NAPSIS': 'Psychic Sensor', 'NALASR': 'Sentry Gun', 'NAFLAK': 'Flak Cannon',
    'TESLA': 'Tesla Coil', 'NAIRON': 'Iron Curtain Device', 'NAMISL': 'Nuclear Missile Silo', 'NAWALL': 'Soviet Wall',
}
families = []
owner_root = runtime if len(sys.argv) > 1 else root / 'runtime-owners-wall-v1'
for name, f in report['families'].items():
    directory = out / 'media' / name
    directory.mkdir(parents=True, exist_ok=True)
    files = [p for p in (runtime / name).glob('*.webp')]
    for p in files:
        shutil.copyfile(p, directory / p.name)
    owners = []
    for p in sorted((owner_root / name).glob('owner-*.webp')):
        shutil.copyfile(p, directory / p.name)
        owners.append(p.name)
    families.append(dict(id=name, name=names[name], sequences=f['sequences'], owners=owners, status=f['status']))
data = json.dumps(families, separators=(',', ':'))
template = r'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Soviet Buildings — Complete Material and Animation Review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#152019;color:#e8efe9;font:18px/1.5 system-ui,sans-serif}header,main{max-width:1180px;margin:auto;padding:28px}h1{font-size:32px;margin:0 0 12px}h2{font-size:25px;margin:0}p{margin:10px 0}a{color:#b6e4c6}button,select,input{font:inherit}button,select{padding:8px 12px;background:#263b2e;color:inherit;border:1px solid #739780;border-radius:6px}button{cursor:pointer}button:focus,select:focus{outline:3px solid #edd778}.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.family{border:1px solid #46624e;border-radius:10px;padding:20px;margin:24px 0;background:#1a2a20}.pair{display:flex;flex-wrap:wrap;gap:16px;overflow:auto}.view{margin:0;flex:none}.view img{display:block;width:420px;height:360px;max-width:none;background:#111;object-fit:contain}.view figcaption{font-size:17px;margin:5px 0}.motion-note{min-height:28px;color:#c1d4c6}.tag{font-size:16px;color:#bdd8c6}.status{padding:14px;background:#263b2e;border-left:4px solid #d9bd66}nav{display:flex;gap:14px;flex-wrap:wrap}table{border-collapse:collapse;width:100%;font-size:17px}td,th{text-align:left;padding:10px;border-bottom:1px solid #46624e}.zoom2 .view img{width:840px;height:720px}.small{font-size:16px;color:#bed0c3}.hidden{display:none!important}
</style>
<header><h1>Soviet Buildings</h1><p>Complete material and animation review · temperate · Mac review app R1</p>
<div class="status">Representative artwork and proportion corrections: accepted.<br>Complete-family visual and gameplay acceptance: awaiting your review.</div>
<p>At 1×, each picture occupies 420 × 360 logical pixels, preserving the game's 900-high reference presentation. 2× enlarges the review only. Still images use the actual app's highest sampling preset; motion samples use its 1080p preset. The measured drawing buffers are recorded in the validation report.</p>
<div class="controls"><button id="zoom">View at 2×</button><button id="stop">Pause all motions</button><a href="Validation-Dashboard.html">Validation dashboard</a></div>
<p class="small">These are actual-app render fixtures. Animation controls use the unchanged native controller and timing; the scene placement is a review fixture. Natural queues, legal placement and repair/sale have a separate report. Defense combat and full superweapon gameplay remain part of your final acceptance.</p>
<nav id="nav"></nav></header><main id="families"></main>
<script>
const data=__DATA__, running=[];
const label=s=>s.name.replaceAll('-',' ').replaceAll('_',' ');
for(const f of data){
 const link=document.createElement('a');link.href='#'+f.id;link.textContent=f.name;document.querySelector('#nav').append(link);
 const section=document.createElement('section');section.className='family';section.id=f.id;
 section.innerHTML=`<h2>${f.name}</h2><div class="tag">${f.id} · complete HD family · original geometry and shadows retained</div><div class="controls"><select aria-label="${f.name} state"><option value="normal">Normal</option><option value="damaged">Damaged</option></select><button class="play">Play</button><button class="prev">Previous frame</button><button class="next">Next frame</button><label>Speed <select class="speed"><option value="1">1× native</option><option value="0.5">½× slow</option><option value="0.25">¼× slow</option></select></label></div><div class="motion-note"></div><div class="pair"><figure class="view original"><figcaption>Original · same state and camera</figcaption><img loading="lazy" alt="Original ${f.name}"></figure><figure class="view"><figcaption class="hd-title">HD · same state and camera</figcaption><img class="hd" loading="lazy" alt="HD ${f.name}"></figure></div><p class="small">Wall frames 32–47 are retained authored ruin slots; native gameplay selects normal and damaged connection sets.</p>`;
 if(f.id!=='NAWALL')section.querySelector('p.small').remove();
 if(f.owners.length){const details=document.createElement('details');details.innerHTML='<summary>Owner-color samples</summary><div class="pair">'+f.owners.map(file=>`<figure class="view"><figcaption>${file.replace('owner-','').replace('.webp','')} owner</figcaption><img loading="lazy" src="media/${f.id}/${file}" alt="${f.name} owner color"></figure>`).join('')+'</div>';section.append(details)}
 document.querySelector('#families').append(section);
 const select=section.querySelector('select'), play=section.querySelector('.play'), note=section.querySelector('.motion-note'), hd=section.querySelector('img.hd'), original=section.querySelector('.original'), orig=original.querySelector('img'), speed=section.querySelector('.speed');
 f.sequences.forEach((s,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=label(s);select.append(o)});
 let index=0, timer=null, on=false;
 const source=file=>`media/${f.id}/${file}`;
 function stop(){on=false;clearTimeout(timer);timer=null;play.textContent='Play'}
 function sequence(){return f.sequences[Number(select.value)]}
 function draw(){
  if(['normal','damaged'].includes(select.value)){original.classList.remove('hidden');orig.src=source(`${select.value}-4k-original.webp`);hd.src=source(`${select.value}-4k-hd.webp`);note.textContent='Matched frozen frame · same native geometry, camera and shadow textures';section.querySelector('.hd-title').textContent='HD · same state and camera';return}
  const s=sequence();original.classList.add('hidden');hd.src=source(s.files[index]);section.querySelector('.hd-title').textContent='HD · native controller animation';note.textContent=`${label(s)} · frame ${index+1}/${s.files.length} · native index ${s.frames[index]} · ${(s.rate*s.speed).toFixed(2)} frames/s at captured game speed`;
 }
 function advance(){if(!on)return;const s=sequence();index=(index+1)%s.files.length;draw();timer=setTimeout(advance,1000/(s.rate*s.speed*Number(speed.value)))}
 select.onchange=()=>{stop();index=0;draw()};
 play.onclick=()=>{if(on){stop();return}if(['normal','damaged'].includes(select.value)){if(!f.sequences.length)return;select.value='0';index=0}on=true;play.textContent='Pause';draw();timer=setTimeout(advance,1000/(sequence().rate*sequence().speed*Number(speed.value)))};
 for(const [cls,step] of [['prev',-1],['next',1]])section.querySelector('.'+cls).onclick=()=>{stop();if(['normal','damaged'].includes(select.value))select.value='0';index=(index+step+sequence().files.length)%sequence().files.length;draw()};
 running.push(stop);draw();
}
document.querySelector('#zoom').onclick=e=>{document.body.classList.toggle('zoom2');e.target.textContent=document.body.classList.contains('zoom2')?'View at 1×':'View at 2×'};
document.querySelector('#stop').onclick=()=>running.forEach(fn=>fn());
window.__reviewSummary={families:data.length,motionFrames:data.reduce((n,f)=>n+f.sequences.reduce((a,s)=>a+s.files.length,0),0)};
</script></html>'''
if len(sys.argv) > 1:
    template = template.replace('Mac review app R1', 'Mac review app R2 · animation and gameplay corrections')
    template = template.replace('Representative artwork and proportion corrections: accepted.', 'Static models: accepted. Construction now uses rigid parts rising behind fixed ground and socket planes. NAPSIS scan sockets and TESLA electric-only layers are corrected; NAPOWR is unchanged.')
if len(sys.argv) > 3 and sys.argv[3] == 'R3':
    template = template.replace('Mac review app R2 · animation and gameplay corrections', 'Mac review app R3 · fixed sockets, complete cranes and owner colors')
    template = template.replace('Static models: accepted. Construction now uses rigid parts rising behind fixed ground and socket planes. NAPSIS scan sockets and TESLA electric-only layers are corrected; NAPOWR is unchanged.', 'Static models and R2 construction motion: accepted. R3 corrects fixed-mast antenna rotation, electric visibility, complete crane parts and owner colors. Motion samples use the blue owner palette from the first frame. NAPOWR remains unchanged.')
if len(sys.argv) > 3 and sys.argv[3] == 'R4':
    template = template.replace('Mac review app R2 · animation and gameplay corrections', 'Mac review app R4 · targeting and silo closure')
    template = template.replace('Static models: accepted. Construction now uses rigid parts rising behind fixed ground and socket planes. NAPSIS scan sockets and TESLA electric-only layers are corrected; NAPOWR is unchanged.', 'R3 corrections: accepted. R4 changes only post-launch silo closure, targeting rings and four target cursor families. Other building resources are byte-identical to accepted R3.')
(out / 'Soviet-Buildings-Review.html').write_text(template.replace('__DATA__', data))
print(out, len(families), sum(len(s['files']) for f in families for s in f['sequences']))
