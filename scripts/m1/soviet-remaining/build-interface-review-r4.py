"""Portable native-size cursor and targeting review from the delivered app."""
import json
import shutil
from pathlib import Path
root=Path('.artifacts/soviet-remaining');out=root/'complete-review-r4';out.mkdir(exist_ok=True)
source=root/'runtime-ranges-r4-final'
for name in ['ranges','cursors']:shutil.copytree(source/name,out/name,dirs_exist_ok=True)
shutil.copyfile(root/'feedback-r4/retail-cursors.png',out/'cursors/retail-reference.png')
report=json.loads((out/'cursors/result.json').read_text())
data=json.dumps(report['frames'])
style='body{background:#152019;color:#e8efe9;font:18px/1.5 system-ui;margin:28px auto;max-width:1180px;padding:0 24px}h1{font-size:32px}h2{font-size:25px}a{color:#b6e4c6}section{padding:20px;border:1px solid #46624e;margin:24px 0}button{font:inherit;padding:8px 14px;background:#263b2e;color:inherit;border:1px solid #739780;margin-right:10px}figure{margin:12px 0}.pair{display:flex;gap:50px;align-items:center;flex-wrap:wrap}.cursor{width:55px;height:43px;image-rendering:auto}.zoom .cursor{width:220px;height:172px}.original{image-rendering:pixelated}.views{overflow:auto;display:flex;gap:24px}.views figure{flex:none}.views img{max-width:none}.fit .views{display:block}.fit .views img{max-width:100%;height:auto!important}'
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R4 Target Cursor Review</title><style>'''+style+'''</style><h1>Target cursors</h1><p><a href="Soviet-Buildings-Review.html">Building animations</a> · <a href="Range-Markers-Review.html">Targeting rings</a> · <a href="Validation-Dashboard.html">Validation</a></p><p>47 complete animation frames from the R4 app. Native display size: 55 × 43; HD sampling: 4×. The original (27, 21) hotspot, frame counts and native animation runner are unchanged. The existing HD option controls all four families. Other cursors remain Original.</p><p>Vector redrawing retains the retail nuclear symbol, red rings, blue clock and gray storm. These new drawings await visual acceptance.</p><button id="zoom">Inspect at 4×</button><main></main><script>
const frames=__DATA__;
for(const name of ['nuke','iron','chrono','storm']){
 const list=frames.filter(f=>f.name===name),s=document.createElement('section');let n=0,timer;
 s.innerHTML=`<h2>${name}</h2><button class="play">Play</button><button class="step">Next frame</button><span></span><div class="pair"><figure><figcaption>Original · native resource</figcaption><img class="cursor original"></figure><figure><figcaption>HD · authored vectors</figcaption><img class="cursor hd"></figure></div>`;
 const show=()=>{const f=list[n];s.querySelector('span').textContent=`${n+1} / ${list.length} · native index ${f.frame}`;s.querySelector('.original').src='cursors/'+f.variants[0].file;s.querySelector('.hd').src='cursors/'+f.variants[1].file;};
 s.querySelector('.step').onclick=()=>{n=(n+1)%list.length;show()};
 s.querySelector('.play').onclick=e=>{if(timer){clearInterval(timer);timer=undefined;e.target.textContent='Play'}else{timer=setInterval(()=>{n=(n+1)%list.length;show()},1000/22.5);e.target.textContent='Pause'}};
 document.querySelector('main').append(s);show();
}
document.querySelector('#zoom').onclick=e=>{document.body.classList.toggle('zoom');e.target.textContent=document.body.classList.contains('zoom')?'Show native size':'Inspect at 4×'};
</script><p>Preview playback is a frame inspection aid; game timing remains owned by the native pointer animation runner.</p><h2>Decoded retail reference</h2><img src="cursors/retail-reference.png" style="max-width:100%" alt="Retail nuclear, iron, chrono and storm cursor samples"></html>'''.replace('__DATA__',data)
(out/'Target-Cursors-Review.html').write_text(page)
ranges=json.loads((out/'ranges/result.json').read_text());sections=[]
for name in ['TESLA','NALASR','NukeSpecial','IronCurtainSpecial']:
    rows=[r for r in ranges['samples'] if r['name']==name]
    note='Accepted construction range appearance is retained.' if name in ['TESLA','NALASR'] else 'Three concentric aim rings; no green tile fill. Effect rules are unchanged.'
    views=''.join(f'<figure><figcaption>{r["mode"]}</figcaption><img src="ranges/{r["file"]}" style="width:{r["logical"][0]}px;height:{r["logical"][1]}px" alt="{name}"></figure>' for r in rows)
    sections.append(f'<section><h2>{name}</h2><p>{note}</p><div class="views">{views}</div></section>')
(out/'Range-Markers-Review.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R4 Targeting Rings</title><style>'+style+'</style><h1>Targeting rings</h1><p><a href="Target-Cursors-Review.html">HD cursors</a> · <a href="Soviet-Buildings-Review.html">Building animations</a> · <a href="Validation-Dashboard.html">Validation</a></p><p>Actual final R4 app captures. The decoded retail Iron Curtain cursor uses red concentric circles; the nuclear cursor uses a yellow radiation symbol. The new ground rings adopt those colors. Ground rings are an aim guide, not a claim of pixel-exact retail executable behavior. Iron Curtain keeps its native nine-tile square effect; nuclear damage keeps its ten-tile outer radius.</p><button onclick="document.body.classList.toggle(\'fit\')">Toggle fit / native size</button>'+''.join(sections)+'</html>')
p=out/'Soviet-Buildings-Review.html';s=p.read_text().replace('<a href="Validation-Dashboard.html">Validation dashboard</a>','<a href="Target-Cursors-Review.html">HD cursors</a><a href="Range-Markers-Review.html">Targeting rings</a><a href="Validation-Dashboard.html">Validation dashboard</a>');p.write_text(s)
print('47 HD cursor frames and eight actual-app range captures added')
