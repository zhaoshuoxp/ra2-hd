"""One self-contained review for the five user-requested proportion corrections."""
import base64
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path('.artifacts/soviet-remaining')
OLD = ROOT / 'review-exports-v3'
NEW = ROOT / 'review-exports-v4'
OUT = ROOT / 'proportion-review-v2'
OUT.mkdir(exist_ok=False)
REPORT = json.loads((NEW / 'report.json').read_text())
NOTES = {
    'NANRCT': 'Right cooling tower: broader lower flare, radial legs and foundation, following the left tower. The first correction remained too narrow and is retained below.',
    'NARADR': 'Right side of the masonry base and red support spread outward; source-canvas proportions restored.',
    'NAPSIS': 'Right concrete buttress and red support spread outward; corrected stationary hut reused across antenna poses.',
    'TESLA': 'Taller upper coil relative to the red supports; wider, separated red base supports; source width and height restored.',
    'NAIRON': 'Upper sphere/dome raised and given more vertical height; source-canvas proportions restored.',
}
def uri(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
data = []
for name, note in NOTES.items():
    f = REPORT['families'][name]
    sequence = f['sequences'][0]
    data.append(dict(id=name, name=f['name'], note=note, size=f['size'], fps=sequence['fps'],
                     coverage=sequence['coverage'], master=uri(Path(f['master'])),
                     normal=[uri(OLD/name/'normal-original.png'), uri(OLD/name/'normal-hd.png'), uri(NEW/name/'normal-hd.png')],
                     frames=[dict(source=frame['sourceFrame'], images=[uri(NEW/name/frame['original']), uri(OLD/name/frame['hd']), uri(NEW/name/frame['hd'])]) for frame in sequence['frames']],
                     rejected=uri(ROOT/'art-v2/NANRCT/normal-raw.png') if name=='NANRCT' else None))
accepted = [name for name in REPORT['families'] if name not in NOTES]
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Soviet Building Proportion Corrections</title>
<style>
:root{font:18px/1.5 system-ui;color:#eef3ed;background:#19261f;color-scheme:dark}body{margin:0}header,main{max-width:1420px;margin:auto;padding:24px}h1{font-size:32px}h2{font-size:25px}p{max-width:1150px}.muted{color:#bed0c3;font-size:16px}.toolbar,.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.toolbar{position:sticky;top:0;z-index:2;background:#19261ff5;padding:14px;border-block:1px solid #617967}button,select,input{font:inherit}button,select{color:inherit;background:#304638;padding:8px 12px;border:1px solid #718474;border-radius:5px;cursor:pointer}.card{padding:22px;margin:22px 0;background:#24372c;border:1px solid #4c6555;border-radius:9px;scroll-margin-top:150px}.images{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-end;gap:22px;padding:20px 6px;background:#34483d}.cell{flex:0 0 auto;text-align:center}.cell span{display:block;margin-bottom:12px}.cell img{display:block;max-width:none}.controls{margin:14px 0}.seek{width:100%}.master{max-width:100%;max-height:800px;display:block;margin:auto;background:#34483d}details{margin-top:18px}summary{cursor:pointer}.badge{background:#70561f;padding:5px 10px;border-radius:5px}.accepted{padding:16px;border-left:4px solid #88bb90;background:#254431}.frame{font-variant-numeric:tabular-nums}
</style><header><h1>Five Soviet Building Proportion Corrections</h1><span class="badge">CORRECTED CANDIDATES · REVIEW PENDING</span>
<p>Compare the original, the previous delivered candidate and the correction at the same source-canvas dimensions. Use 1× native sprite pixels, 2× detail, representative motion or frame stepping. Full masters are available below each comparison.</p>
<p class="accepted">The other eight materials and representative motions are accepted and preserved byte-for-byte: ACCEPTED.</p>
<p class="muted">This is a material/representative-motion correction review. Complete damage, buildup, special states and playable integration remain pending. No application, installed pack, logical footprint or camera change is part of this correction.</p></header>
<main><div class="toolbar"><label>View <select id="scale"><option value="1">1× native sprite pixels</option><option value="2">2× detail</option></select></label><button id="normal">Show materials</button><button id="motion">Show motions</button><button id="play">Play all</button><label>Speed <select id="speed"><option value="1">Source base rate</option><option value="0.25">¼× slow</option><option value="6">6× capture rate</option></select></label><label>Background <select id="background"><option value="#34483d">Green</option><option value="#141916">Dark</option><option value="#c9c6b8">Light</option></select></label><span>5 corrections · 82 representative frames</span></div><div id="cards"></div></main>
<script>const data=DATA;const players=[];let scale=1,speed=1;
for(const f of data){const card=document.createElement('article');card.className='card';card.dataset.family=f.id;card.innerHTML=`<h2>${f.name} (${f.id})</h2><p>${f.note}</p><div class="controls"><select class="mode"><option value="normal">Normal material</option><option value="motion">Representative motion</option></select><button class="play">Play</button><button class="prev">←</button><button class="next">→</button><span class="frame"></span></div><div class="images">${['Original','Previous delivered','Corrected'].map(label=>`<div class="cell"><span>${label}</span><img alt="${f.id} ${label}"></div>`).join('')}</div><input class="seek" type="range" min="0" value="0"><p class="muted">${f.coverage}</p><details><summary>Full corrected material</summary><img class="master" src="${f.master}" loading="lazy" alt="${f.id} corrected master"></details>${f.rejected?`<details><summary>Retained first correction — rejected narrow right base</summary><img class="master" src="${f.rejected}" loading="lazy" alt="Retained rejected correction"></details>`:''}`;document.querySelector('#cards').append(card);const p={f,card,mode:'normal',index:0,playing:false,time:0};players.push(p);const q=s=>card.querySelector(s);p.draw=()=>{const frame=f.frames[p.index],images=p.mode==='normal'?f.normal:frame.images;card.querySelectorAll('.cell img').forEach((img,i)=>{img.src=images[i];img.style.width=f.size[0]*scale+'px';img.style.height=f.size[1]*scale+'px'});q('.mode').value=p.mode;q('.frame').textContent=p.mode==='normal'?'Native-size material':`${p.index+1}/${f.frames.length} · Source frame ${frame.source}`;q('.seek').max=f.frames.length-1;q('.seek').value=p.index;q('.seek').disabled=p.mode==='normal';q('.play').textContent=p.playing?'Pause':'Play'};q('.mode').onchange=e=>{p.mode=e.target.value;p.index=0;p.draw()};q('.play').onclick=()=>{p.playing=!p.playing;if(p.playing)p.mode='motion';p.draw()};const step=d=>{p.mode='motion';p.playing=false;p.index=(p.index+d+f.frames.length)%f.frames.length;p.draw()};q('.next').onclick=()=>step(1);q('.prev').onclick=()=>step(-1);q('.seek').oninput=e=>{p.mode='motion';p.playing=false;p.index=Number(e.target.value);p.draw()};p.draw();}
document.querySelector('#scale').onchange=e=>{scale=Number(e.target.value);players.forEach(p=>p.draw())};document.querySelector('#speed').onchange=e=>{speed=Number(e.target.value)};for(const mode of ['normal','motion'])document.getElementById(mode).onclick=()=>{players.forEach(p=>{p.mode=mode;p.index=0;p.time=0;p.draw()})};document.querySelector('#play').onclick=e=>{const play=players.some(p=>!p.playing);for(const p of players){p.playing=play;if(play)p.mode='motion';p.draw()}e.target.textContent=play?'Pause all':'Play all'};document.querySelector('#background').onchange=e=>{for(const el of document.querySelectorAll('.images,.master'))el.style.background=e.target.value;for(const el of document.querySelectorAll('.cell span'))el.style.color=e.target.value==='#c9c6b8'?'#25382d':'#edf3ed'};
let previous=performance.now();function tick(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;for(const p of players){if(!p.playing||p.mode==='normal')continue;p.time+=dt*speed*p.f.fps;if(p.time>=1){const n=Math.floor(p.time);p.time-=n;p.index=(p.index+n)%p.f.frames.length;p.draw()}}requestAnimationFrame(tick)}requestAnimationFrame(tick);window.__corrections={players,data};
</script></html>'''
page = OUT/'review.html'
page.write_text(html.replace('ACCEPTED', ', '.join(accepted)).replace('DATA', json.dumps(data,separators=(',',':'))))
(OUT/'receipt.json').write_text(json.dumps(dict(status='FIVE_PROPORTION_CORRECTIONS_PENDING_USER',corrected=list(NOTES),accepted=accepted,representativeFrames=82,exportReport=str(NEW/'report.json'),dashboard=dict(path=str(page),bytes=page.stat().st_size,sha256=digest(page)),runtimeActivation=False),indent=2)+'\n')
print(page, page.stat().st_size)
