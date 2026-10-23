"""Create a self-contained, native-frame comparison for the complete family."""
import base64
import json
from pathlib import Path

root = Path('.artifacts/lunar-infantry')
pack = Path('.local/hd-packs/lunar-infantry-authored/1')
out = root/'production-review-v1'
out.mkdir(exist_ok=False)
manifest = json.loads((pack/'manifest.json').read_text())
source = json.loads((root/'source-v1/lunr.shp.json').read_text())
source['frames'] = source['frames'][:435]
def embed(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()
pages = {p[role]: embed(pack/p[role]) for v in manifest['variants'] for p in v['pages'] for role in ['base', 'data']}
payload = json.dumps(dict(manifest=manifest, source=source, pages=pages))
html = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lunar Infantry complete animation review</title>
<style>body{font:18px system-ui;background:#20282b;color:#eee;max-width:1100px;margin:auto;padding:24px}
h1{font-size:30px}button,select,input{font:inherit}label{display:inline-block;margin:8px 16px 8px 0}
.views{display:flex;flex-wrap:wrap;gap:28px}canvas{background:#495447;max-width:100%}
small{display:block;margin:12px 0}#native{image-rendering:pixelated}a{color:#afd5ff}</style>
<h1>Lunar Infantry: complete native animation</h1>
<p>435 native slots at 2X and 4X. Original camera size, registration, timing and shadows remain in the game.
This viewer isolates the visible sprite. The model and cameo direction are user approved; complete animation acceptance is pending.</p>
<label>Action <select id="action"></select></label><label>Direction <select id="direction"></select></label>
<label>Density <select id="density"><option>4</option><option>2</option></select></label>
<label>Owner <select id="owner"><option value="red">Red</option><option value="blue">Blue</option><option value="green">Green</option><option value="purple">Purple</option></select></label>
<button id="play">Pause</button><label>Frame <input id="frame" type="range" min="0" max="434" value="0"><output id="number">0</output></label>
<div class="views"><div><h2>Original</h2><canvas id="native" width="376" height="464"></canvas></div>
<div><h2>HD at 4X display</h2><canvas id="hd" width="376" height="464"></canvas></div></div>
<small>The native logical canvas is 94 × 116. Changing density changes source resolution, not display size.</small>
<h2>Cameo</h2><img width="240" height="192" src="CAMEO"><p>Normal and veteran entries share this new art; the game supplies the standard rank overlay.</p>
<script>const data=PAYLOAD;
const actions={Ready:[0,1,1,8],Walk:[8,6,6,8],Idle1:[56,15,0,1],Idle2:[71,15,0,1],
Prone:[86,6,6,8],Die1:[134,15,0,1],Die2:[149,15,0,1],FireUp:[164,6,6,8],
FireProne:[212,6,6,8],Down:[260,2,2,8],Up:[276,2,2,8],Fly:[292,6,6,8],
Tumble:[340,15,0,1],NativeExtra:[355,15,0,1],FireFly:[370,6,6,8],Paradrop:[418,1,0,1],Cheer:[419,8,0,1],ExtraStand:[427,8,0,1]};
const el=id=>document.getElementById(id), images={};
for(const [name,uri] of Object.entries(data.pages)){const i=new Image();i.src=uri;images[name]=i;}
for(const name of Object.keys(actions))el('action').add(new Option(name,name));
['Back','Back-left','Left','Front-left','Front','Front-right','Right','Back-right'].forEach((n,i)=>el('direction').add(new Option(n,i)));
let running=true,phase=0;
const colors={red:[1,.06,.03],blue:[.12,.35,1],green:[.08,.9,.22],purple:[.75,.1,1]};
function draw(){
 const n=+el('frame').value,s=data.source.frames[n],v=data.manifest.variants.find(v=>v.density===+el('density').value),
 f=v.frames[n],p=v.pages.find(p=>p.id===f.page),d=v.density,c=colors[el('owner').value];
 el('number').value=n;
 const native=document.createElement('canvas');native.width=94;native.height=116;
 const nc=native.getContext('2d'),ni=nc.createImageData(s.width,s.height);
 s.pixels.forEach((index,i)=>{const rgb=data.source.palette[index];ni.data.set([...rgb,index?255:0],i*4);
 if(index>=16&&index<=31){for(let k=0;k<3;k++)ni.data[i*4+k]=rgb[0]*c[k];}});
 nc.putImageData(ni,s.x,s.y);const dest=el('native').getContext('2d');dest.imageSmoothingEnabled=false;dest.clearRect(0,0,376,464);dest.drawImage(native,0,0,376,464);
 const temp=document.createElement('canvas'),[x,y,w,h]=f.sampleRect;temp.width=w;temp.height=h;
 const tc=temp.getContext('2d',{willReadFrequently:true});tc.drawImage(images[p.data],x,y,w,h,0,0,w,h);
 const mask=tc.getImageData(0,0,w,h).data;tc.clearRect(0,0,w,h);tc.drawImage(images[p.base],x,y,w,h,0,0,w,h);
 const pixels=tc.getImageData(0,0,w,h);
 for(let i=0;i<mask.length;i+=4)if(mask[i]){const value=data.source.palette[16+mask[i+1]][0];for(let k=0;k<3;k++)pixels.data[i+k]=value*c[k];}
 tc.putImageData(pixels,0,0);const hc=el('hd').getContext('2d');hc.clearRect(0,0,376,464);hc.drawImage(temp,s.x*4,s.y*4,w*4/d,h*4/d);
}
el('play').onclick=()=>{running=!running;el('play').textContent=running?'Pause':'Play';};
el('frame').oninput=()=>{running=false;el('play').textContent='Play';draw();};
for(const id of ['action','direction','density','owner'])el(id).onchange=()=>{phase=0;tick();};
function tick(){const [start,count,stride,dirs]=actions[el('action').value];
 if(running){el('frame').value=start+(+el('direction').value%dirs)*stride+phase++%count;}draw();}
Promise.all(Object.values(images).map(i=>i.decode())).then(()=>{window.reviewReady=true;tick();setInterval(()=>{if(running)tick();},130);});
</script></html>"""
html = html.replace('PAYLOAD', payload).replace('CAMEO', embed(root/'cameo-exports-v1/lunricon-4x.png'))
(out/'Lunar-Infantry-Full-Review.html').write_text(html)
print(out/'Lunar-Infantry-Full-Review.html')
