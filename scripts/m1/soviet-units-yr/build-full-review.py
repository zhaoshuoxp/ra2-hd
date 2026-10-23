"""Embed native frame pairs, action recordings and the complete coverage ledger."""
import base64
import hashlib
import html
import json
import io
from PIL import Image, ImageChops
from pathlib import Path

root = Path('.artifacts/m1-7-yr')
config = json.loads((root / 'full-review-inputs.json').read_text())
work = json.loads((root / 'production-shp-v2/worklist.json').read_text())
coverage = json.loads(Path('docs/m1-7-yr-coverage.json').read_text())
media, evidence = {}, []
def uri(path, kind='image/png'):
    data = path.read_bytes()
    evidence.append(dict(path=str(path), bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    return f'data:{kind};base64,' + base64.b64encode(data).decode()

for identity in ['BORIS','CCOMAND','PTROOP']:
    sweep = root / config[identity]['sweep']
    result = json.loads((sweep / 'result.json').read_text())
    assert result['status'].startswith('PASS_')
    member = work['families'][identity]['members'][0]
    sequences = {}
    for slot in member['slots']:
        for state in slot['sequenceMembership'] or [dict(action='NativeExtra',facing=0,phase=slot['frame'])]:
            sequences.setdefault(state['action'],{}).setdefault(str(state['facing']),[]).append(slot['frame'])
    images, backgrounds = {}, {}
    for owner in [0,1]:
        base_path=sweep/f'owner-{owner}-000-original.png'
        base=Image.open(base_path).convert('RGB')
        backgrounds[str(owner)]=uri(base_path)
        images[str(owner)]={}
        for frame in range(member['requiredSlots']):
            images[str(owner)][str(frame)]={}
            for role in ['original','hd']:
                source=sweep/f'owner-{owner}-{frame:03d}-{role}.png'
                pixels=Image.open(source).convert('RGB')
                box=ImageChops.difference(base,pixels).getbbox()
                record=dict(rect=box,src=None)
                restored=base.copy()
                if box:
                    patch=pixels.crop(box);buffer=io.BytesIO();patch.save(buffer,format='PNG',optimize=True)
                    record['src']='data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()
                    restored.paste(patch,box[:2])
                assert restored.tobytes()==pixels.tobytes(),str(source)
                evidence.append(dict(path=str(source),bytes=source.stat().st_size,sha256=hashlib.sha256(source.read_bytes()).hexdigest(),losslessPixelReconstruction=True))
                images[str(owner)][str(frame)][role]=record
    media[identity] = dict(sequences=sequences,images=images,backgrounds=backgrounds,count=member['requiredSlots'])

videos=[]
for identity in ['BORIS','CCOMAND','PTROOP','SCHP']:
    directory=root/config[identity]['actions'];result=json.loads((directory/'result.json').read_text())
    assert result['status'].startswith('PASS_')
    videos.append(f'<details><summary>{identity} — recorded native actions</summary><p>{html.escape(result["disclosure"])}</p><video controls preload="none" src="{uri(directory/"native-actions.webm","video/webm")}"></video></details>')
chopper=root/config['SCHP']['actions']
contacts=''.join(f'<details><summary>SCHP {mode} — both owners and eight headings (inspection contact)</summary><img class="contact" src="{uri(chopper/(mode+"-contact.png"))}"></details>' for mode in ['flight','deployed'])
contacts += f'<details><summary>BPLN — both owners and eight headings (native-size contact)</summary><img class="contact" src="{uri(root/"native-bpln-v1/contact.png")}"></details>'
rows=''.join('<tr>'+''.join(f'<td>{html.escape(str(f.get(k,"")))}</td>' for k in ['id','status','runtimeValidation'])+'</tr>' for f in coverage['families'])
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>YR Soviet units — complete-family review</title>
<style>body{font:18px/1.5 system-ui;margin:32px auto;padding:0 24px;max-width:1440px;background:#20262b;color:#eee}h1{font-size:32px}h2{font-size:25px}button,select,input{font:inherit;margin:6px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #596167;text-align:left}details{padding:12px;margin:12px 0;background:#303a40}summary{cursor:pointer;font-weight:600}video,.contact{max-width:100%;height:auto}canvas{background:#303a40;margin:8px}#pair{display:flex;flex-wrap:wrap;gap:18px}label{display:inline-block}.note{color:#becbd0}p{max-width:1100px}</style>
<h1>Yuri's Revenge Soviet units — complete-family review</h1>
<p>Four additions: Boris with strike aircraft, Siege Chopper with deployment and rotors, Chrono Commando and Psi Commando. The representative artwork is accepted; this page supports final complete-family review.</p>
<p class="note">All media is embedded. Open this file directly. No server or network connection is used. SQD/SQDG intentionally retain Original. Theater reuse, including snow, requires matching source data. Windows and campaigns are outside this evidence.</p>
<h2>Native-size infantry motion</h2><p>Paused native-renderer captures: 1,072 frame slots × two owners, with identical original/HD geometry and native shadows. Playback here is a review control, not a recording of naturally executed actions. The 1× view preserves the captured 1080p framebuffer pixels.</p>
<label>Unit <select id="unit"></select></label><label>Action <select id="action"></select></label><label>Direction <select id="facing"></select></label><label>Owner <select id="owner"><option value="0">Red</option><option value="1">Blue</option></select></label><label>View <select id="scale"><option value="1">Native 1×</option><option value="2">Inspection 2×</option><option value="4">Inspection 4×</option></select></label>
<p><button id="play">Pause</button><label>Preview FPS <input id="fps" type="number" min="1" max="30" value="6"></label><input id="phase" type="range" min="0" step="1" value="0"><span id="readout"></span></p>
<div id="pair"><div>Original<br><canvas id="original" width="180" height="180"></canvas></div><div>HD candidate<br><canvas id="hd" width="180" height="180"></canvas></div></div>
<h2>Native production and action recordings</h2><p>Legal prerequisite buildings and targets were placed as controlled fixtures. Production, spy infiltration, movement, weapons and special abilities then ran through native game orders. These tests do not claim a natural match played to victory.</p>__VIDEOS____CONTACTS__
<h2>All 28 Soviet roster entries</h2><table><thead><tr><th>Unit</th><th>Coverage</th><th>Runtime evidence</th></tr></thead><tbody>__ROWS__</tbody></table>
<script>const data=__DATA__;const $=id=>document.getElementById(id);let phase=0,paused=false,last=0,token=0;
$('unit').innerHTML=Object.keys(data).map(k=>`<option>${k}</option>`).join('');
function frames(){return data[$('unit').value].sequences[$('action').value][$('facing').value];}
function phases(){phase=0;$('phase').max=frames().length-1;$('phase').value=0;draw();}
function facings(){$('facing').innerHTML=Object.keys(data[$('unit').value].sequences[$('action').value]).map(k=>`<option>${k}</option>`).join('');phases();}
function units(){$('action').innerHTML=Object.keys(data[$('unit').value].sequences).map(k=>`<option>${k}</option>`).join('');facings();}
async function draw(){const serial=++token,list=frames(),frame=list[phase%list.length],scale=+$('scale').value;$('phase').value=phase%list.length;$('readout').textContent=`Frame ${frame} · ${phase%list.length+1}/${list.length}`;
const unit=data[$('unit').value],owner=$('owner').value,sources=unit.images[owner][frame];
const background=await loadImage(unit.backgrounds[owner]);
await Promise.all(['original','hd'].map(async role=>{const patch=sources[role],im=patch.src?await loadImage(patch.src):null;if(serial!==token)return;const c=$(role);c.style.width=180*scale+'px';c.style.height=180*scale+'px';const ctx=c.getContext('2d');ctx.drawImage(background,0,0);if(im)ctx.drawImage(im,patch.rect[0],patch.rect[1]);}));window.__motionReady=true;window.__drawnFrame={unit:$('unit').value,owner,frame,scale};}
const imageCache=new Map();function loadImage(src){if(!imageCache.has(src))imageCache.set(src,new Promise((resolve,reject)=>{const im=new Image;im.onload=()=>resolve(im);im.onerror=reject;im.src=src;}));return imageCache.get(src);}

$('unit').onchange=units;$('action').onchange=facings;$('facing').onchange=phases;$('owner').onchange=draw;$('scale').onchange=draw;$('phase').oninput=()=>{phase=+$('phase').value;draw();};$('play').onclick=()=>{paused=!paused;$('play').textContent=paused?'Play':'Pause';};units();
function tick(t){if(!paused&&t-last>1000/Math.max(1,+$('fps').value)){phase=(phase+1)%frames().length;last=t;draw();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.__reviewSummary={units:Object.keys(data),slots:Object.values(data).reduce((n,v)=>n+v.count,0),owners:2};
</script></html>'''
for key,value in {'__VIDEOS__':''.join(videos),'__CONTACTS__':contacts,'__ROWS__':rows,'__DATA__':json.dumps(media,separators=(',',':'))}.items():page=page.replace(key,value)
out=root/'YR-Soviet-Units-Full-Review-v1.html';assert not out.exists();out.write_text(page)
(root/'full-review-media-v1.json').write_text(json.dumps(dict(status='EMBEDDED_RUNTIME_REVIEW_PENDING_BROWSER_CHECK',files=evidence,htmlSha256=hashlib.sha256(out.read_bytes()).hexdigest()),indent=2)+'\n')
print(out, out.stat().st_size)
