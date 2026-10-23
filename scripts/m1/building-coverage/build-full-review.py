"""Embed the shipped atlas pixels and native geometry in an offline player."""
import base64
import io
import json
import sys
from pathlib import Path
from PIL import Image
from production_common import ROOT, row_for, resting, sha

out = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'full-review-v1')
out.mkdir(exist_ok=False)
catalog = json.loads(Path('desktop/soviet-building-coverage.json').read_text())
assets, families = {}, []


def embed(path):
    digest = sha(path)
    if digest not in assets:
        assets[digest] = 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()
    return digest


def png(image):
    stream = io.BytesIO()
    image.save(stream, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()


for key, definition in catalog.items():
    row = row_for(definition['family'], definition['theater'])
    family = json.loads((Path('.local') / definition['familyPath']).read_text())
    members = []
    for index, binding in enumerate(family['members']):
        directory = Path('.local/hd-packs') / binding['packId'] / binding['revision']
        manifest = json.loads((directory / 'manifest.json').read_text())
        variant = next(v for v in manifest['variants'] if v['density'] == definition['density'])
        members.append({'name': row['members'][index]['source']['member'], 'roles': row['members'][index]['roles'],
                        'logical': manifest['logical'], 'frames': variant['frames'],
                        'pages': [{'id': p['id'], 'image': embed(directory / p['base'])} for p in variant['pages']]})
    families.append({'key': key, 'id': definition['family'], 'theater': definition['theater'], 'density': definition['density'],
                     'canvas': row['members'][0]['canvas'], 'members': members, 'animations': row['animations'],
                     'original': png(resting(row)), 'originalDamaged': png(resting(row, True)),
                     'familySha256': definition['familyHash']})
html = '''<!doctype html><meta charset="utf-8"><title>Soviet Buildings — Complete Family Review</title>
<style>body{margin:24px;background:#171c20;color:#e5e9ec;font:18px system-ui}h1{font-size:30px}button,select,input{font:inherit;margin:5px;padding:7px}section{background:#26342c;padding:20px;margin-top:18px;overflow:auto}.pair{display:flex;gap:28px;align-items:end;min-height:290px}.pair>div{text-align:center}canvas,img{display:block}label{white-space:nowrap}p{max-width:1050px;line-height:1.5}.muted{color:#b5c3bf}#info{font-size:15px}a{color:#96d6ff}</style>
<h1>Soviet buildings — complete family review</h1>
<p>Original and Yuri's Revenge coverage additions. Select a building and environment, then play or step through its animations. The artwork direction is accepted; this complete-family visual/gameplay review is pending.</p>
<label>Building <select id="family"></select></label><label>State <select id="state"></select></label>
<label>Size <select id="scale"><option value="1">Native gameplay size</option><option value="3">3× inspection</option></select></label>
<button id="play">Pause</button><button id="back">Previous</button><button id="next">Next</button><label><input id="reverse" type="checkbox">Reverse</label><input id="frame" type="range" min="0" value="0"><span id="counter"></span>
<section><div class="pair"><div><p>Original resting pose</p><img id="original"></div><div><p>HD animation</p><canvas id="hd"></canvas></div></div></section>
<p class="muted">The original image is a static normal/damaged reference. The HD player uses the exact resource atlas pixels and original frame placement. The game supplies terrain, native shadows, team colors, lighting and independent sentry/flak turrets. Those are also checked in the Mac review app. Snow shipyard and Tesla Coil reuse verified identical accepted art.</p>
<p id="info"></p><script>
const DATA=__DATA__, ASSETS=__ASSETS__, $=id=>document.getElementById(id), cache=new Map();
let selected, states=[], playing=true, cursor=0, last=0, serial=0;
const load=key=>{if(!cache.has(key))cache.set(key,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=ASSETS[key]}));return cache.get(key)};
for(const f of DATA){const o=document.createElement('option');o.value=f.key;o.textContent=f.id+' / '+f.theater;$('family').append(o)}
function setup(){selected=DATA.find(f=>f.key===$('family').value);states=[{name:'Normal / working',kind:'normal'},{name:'Damaged / working',kind:'damaged'}];
if(selected.id==='NABNKR')states.push({name:'Occupied',kind:'occupied'},{name:'Damaged occupied',kind:'occupiedDamage'});
const build=selected.members.findIndex(m=>m.roles.includes('BUILDUP'));if(build>=0)states.push({name:'Construction / reverse to sell',kind:'construction',member:build});
for(const [i,m]of selected.members.entries())states.push({name:'All native slots: '+m.name,kind:'member',member:i});
$('state').innerHTML='';states.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;$('state').append(o)});cursor=0;render()}
async function render(){const token=++serial,f=selected,s=states[Number($('state').value)||0],d=f.density,c=$('hd'),ctx=c.getContext('2d');
const damage=['damaged','occupiedDamage'].includes(s.kind), raw=s.kind==='member'||s.kind==='construction';
const max=raw?f.members[s.member].frames.length:Math.max(1,...f.animations.filter((a,i,all)=>['IDLE','ACTIVE'].includes(a.type)||(a.type==='SUPER'&&i===all.findIndex(x=>x.type==='SUPER'))).map(a=>{const p=damage?(a.damaged||a.normal):a.normal;return p.loopEnd-p.loopStart+1}));
cursor=(cursor+max)%max;$('frame').max=max-1;$('frame').value=cursor;$('counter').textContent=`${cursor+1} / ${max}`;
await Promise.all(f.members.flatMap(m=>m.pages.map(p=>load(p.image))));if(token!==serial)return;
c.width=f.canvas[0]*d;c.height=f.canvas[1]*d;const scale=Number($('scale').value);c.style.width=f.canvas[0]*scale+'px';c.style.height=f.canvas[1]*scale+'px';
$('original').src=damage?f.originalDamaged:f.original;$('original').style.width=f.canvas[0]*scale+'px';$('original').style.height=f.canvas[1]*scale+'px';
async function draw(i,n,offset={x:0,y:0}){const m=f.members[i],a=m.frames[n],logical=m.logical.frames[n];if(!a||logical.empty)return;const page=m.pages.find(p=>p.id===a.page),im=await load(page.image);const [x,y,w,h]=a.sampleRect;
ctx.drawImage(im,x,y,w,h,(logical.trimOrigin[0]+offset.x)*d,(logical.trimOrigin[1]+offset.y)*d,w,h)}
if(raw)await draw(s.member,cursor);else{
for(const role of ['bib','body'])for(let i=0;i<f.members.length;i++)if(f.members[i].roles.includes(role)){let n=damage?1:0;if(f.id==='NAWALL')n=damage?21:5;if(f.id==='NABNKR'&&s.kind.startsWith('occupied'))n=s.kind==='occupiedDamage'?3:2;await draw(i,n)}
for(const a of f.animations.filter((a,i,all)=>['IDLE','ACTIVE'].includes(a.type)||(a.type==='SUPER'&&i===all.findIndex(x=>x.type==='SUPER')))){if(f.id==='NAREFN'&&a.type==='ACTIVE')continue;const i=f.members.findIndex(m=>m.name===a.member),p=damage?(a.damaged||a.normal):a.normal;if(i>=0)await draw(i,p.loopStart+cursor%Math.max(1,p.loopEnd-p.loopStart+1),a.offset)}}
$('info').textContent=`${f.id}: ${f.members.reduce((n,m)=>n+m.frames.length,0)} authored native slots, ${f.density}× detail. Family identity ${f.familySha256}.`}
$('family').onchange=setup;$('state').onchange=()=>{cursor=0;render()};$('scale').onchange=render;$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play'};
for(const [id,delta]of [['back',-1],['next',1]])$(id).onclick=()=>{playing=false;$('play').textContent='Play';cursor+=delta;render()};$('frame').oninput=()=>{playing=false;$('play').textContent='Play';cursor=Number($('frame').value);render()};
function tick(time){if(playing&&time-last>133){last=time;cursor+=$('reverse').checked?-1:1;render()}requestAnimationFrame(tick)}setup();requestAnimationFrame(tick);
</script>'''
html = html.replace('__DATA__', json.dumps(families, separators=(',', ':'))).replace('__ASSETS__', json.dumps(assets, separators=(',', ':')))
target = out / 'Soviet-Buildings-Complete-Review.html'
target.write_text(html)
(out / 'receipt.json').write_text(json.dumps({'review': str(target), 'sha256': sha(target), 'families': len(families),
    'uniqueEmbeddedAtlasPages': len(assets), 'status': 'FINAL_VISUAL_GAMEPLAY_ACCEPTANCE_PENDING'}, indent=2) + '\n')
print(target, target.stat().st_size)
