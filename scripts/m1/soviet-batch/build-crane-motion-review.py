"""Validate all paired crane frames and build a synchronized local motion review."""
import base64
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path('.artifacts/m1-6b')
RUN=ROOT/'runtime-crane-motion-v2'
OUT=ROOT/'crane-motion-review-v1'
OUT.mkdir(exist_ok=False)
report=json.loads((RUN/'result.json').read_text())
assert report['status']=='PASS_CONSOLIDATED_REPRESENTATIVE_RENDER'
assert not report['errors'] and not report['consoleErrors'] and report['cleanup']['released']
samples=report['families']['NACNST']['samples']
assert len(samples)==42
first=next(s for s in samples if s['state']=='motion-00' and s['density']==1)
xs,ys=zip(*first['points']);center=((min(xs)+max(xs))/2,(min(ys)+max(ys))/2)
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
frames=[];pairs=[];contact=Image.new('RGB',(4*720,6*310),'#17232a')
for n in range(21):
    original=next(s for s in samples if s['state']==f'motion-{n:02}' and s['density']==1)
    hd=next(s for s in samples if s['state']==f'motion-{n:02}' and s['density']==4)
    for key in ['tick','logical','camera','points','parts','animationSpeed']:assert original[key]==hd[key],(n,key)
    assert all(m['type']!='HdSpriteMaterial' and m['identity']is None for m in original['materials'])
    assert all(m['type']=='HdSpriteMaterial' and 'REPRESENTATIVE_ONLY' in m['identity'] for m in hd['materials'])
    assert [m['shadowMap']for m in original['materials']]==[m['shadowMap']for m in hd['materials']]
    aa=np.array(Image.open(RUN/'NACNST'/original['file']));bb=np.array(Image.open(RUN/'NACNST'/hd['file']));diff=np.any(aa!=bb,axis=2)
    sx=hd['buffer'][0]/hd['logical'][0];sy=hd['buffer'][1]/hd['logical'][1];px,py=zip(*hd['points'])
    outside=diff.copy();outside[max(0,int((min(py)-4)*sy)):int((max(py)+4)*sy)+1,max(0,int((min(px)-4)*sx)):int((max(px)+4)*sx)+1]=False
    assert not outside.any() and diff.sum()>100
    pair=Image.new('RGB',(720,310),'#17232a');draw=ImageDraw.Draw(pair);data=[]
    for col,s in enumerate([original,hd]):
        x,y=center
        im=Image.open(RUN/'NACNST'/s['file']).crop((round((x-170)*sx),round((y-130)*sy),round((x+170)*sx),round((y+130)*sy)))
        file=OUT/f'{n:02}-{"original"if col==0 else"hd"}.png';im.save(file)
        data.append('data:image/png;base64,'+base64.b64encode(file.read_bytes()).decode())
        pair.paste(im.resize((340,260),Image.Resampling.LANCZOS),(10+350*col,42))
        draw.text((10+350*col,10),f'{"Original"if col==0 else"HD motion candidate"} - frame {n}',font=font,fill='white')
    frames.append(pair);contact.paste(pair,(n%4*720,n//4*310));pairs.append({'frame':n,'changedPixels':int(diff.sum()),'outsideBuildingPixels':int(outside.sum()),'images':data})
fps=200/60*first['animationSpeed'];duration=round(1000/fps)
for name,ms in [('native',duration),('slow',duration*4)]:
    frames[0].save(OUT/f'production-{name}.webp',save_all=True,append_images=frames[1:],duration=ms,loop=0,lossless=True)
contact.save(OUT/'all-frame-comparison.png')
frames[6].save(OUT/'poster.png')
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>M1.6b HD crane production motion</title>
<style>body{background:#17232a;color:#eef2ec;font:18px/1.5 system-ui;margin:24px;max-width:1040px}h1{font-size:29px}h2{font-size:23px}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}figure img{width:340px;height:260px;display:block}figcaption{font-size:19px}button,select,input{font:inherit}button,select{padding:8px 14px}label{display:inline-block;margin:10px 16px 10px 0}input{width:300px;max-width:80vw}p{max-width:940px}.note{color:#cad4d0}.controls{margin:20px 0}a{color:#a6d7ff}</style>
<h1>Construction Yard: HD production motion review</h1>
<p>21-frame normal production cycle, captured in the accepted Mac renderer. Original and HD are synchronized at native gameplay size, with the same tick, camera, native geometry and indexed shadows. View at 100% browser zoom.</p>
<section><figure><img id="original" width="340" height="260"><figcaption>Original</figcaption></figure><figure><img id="hd" width="340" height="260"><figcaption>HD motion candidate</figcaption></figure></section>
<div class="controls"><button id="play">Pause</button> <label>Speed <select id="speed"><option value="1">Native speed</option><option value="0.25">Quarter speed</option></select></label><br><label>Frame <input id="frame" type="range" min="0" max="20" step="1" value="0"></label><output id="counter">0 / 20</output> <button id="previous">Previous</button> <button id="next">Next</button></div>
<h2>Decision scope</h2><p>Judge arm completeness, reach toward the doorway, grabber motion, door opening and workpiece movement. The building reuses one fixed authored plate. The articulated 2D parts approximate the original 3D foreshortening; this is a motion candidate for visual review, not a certified complete family. No ordinary-game override is enabled. Damaged production, buildup/sale and final gameplay validation remain separate work.</p>
<p>Native rate: FPS_VALUE frames/second; one cycle: CYCLE_VALUE seconds. The surrounding scene is deliberately frozen so differences belong to the selected building. HD 4x sampling uses the unchanged 900-high presentation, with a 2160-high drawing buffer; this does not claim a physical 4K display.</p>
<p class="note">All 21 paired frames pass material-identity, geometry, shadow-binding and outside-region checks. NAHAND, NAREFN and NAWEAP representative approvals remain intact. Please keep the crane decision and any corrections in this task.</p>
<p><a href="../review-v2/review.html">Consolidated four-family representative review</a> · <a href="production-native.webp">Native-speed loop</a> · <a href="production-slow.webp">Quarter-speed loop</a></p>
<script>
const frames=FRAME_DATA, fps=FPS_DATA;const original=document.querySelector('#original'),hd=document.querySelector('#hd'),slider=document.querySelector('#frame'),counter=document.querySelector('#counter'),button=document.querySelector('#play'),speed=document.querySelector('#speed');
let index=0,playing=true,last=performance.now(),acc=0;
const cached=frames.flatMap(f=>f.map(src=>{const im=new Image();im.src=src;return im}));
function show(n){index=(n+frames.length)%frames.length;original.src=frames[index][0];hd.src=frames[index][1];slider.value=index;counter.value=index+' / 20';}
function pause(){playing=false;button.textContent='Play';acc=0;}
button.onclick=()=>{playing=!playing;button.textContent=playing?'Pause':'Play';acc=0;last=performance.now()};
slider.oninput=()=>{pause();show(Number(slider.value))};
document.querySelector('#previous').onclick=()=>{pause();show(index-1)};document.querySelector('#next').onclick=()=>{pause();show(index+1)};
speed.onchange=()=>{acc=0;last=performance.now()};
function tick(now){if(playing){acc+=Math.min(100,now-last)*Number(speed.value);while(acc>=1000/fps){show(index+1);acc-=1000/fps}}last=now;requestAnimationFrame(tick)}
show(0);requestAnimationFrame(tick);window.__motionReview={frames:21,fps,ready:()=>cached.every(im=>im.complete&&im.naturalWidth>0)};
</script></html>'''
html=html.replace('FPS_VALUE',str(round(fps,3))).replace('CYCLE_VALUE',str(round(21/fps,3))).replace('FRAME_DATA',json.dumps([p['images']for p in pairs])).replace('FPS_DATA',str(fps))
(OUT/'review.html').write_text(html)
receipt={'status':'PASS_21_PAIRED_MOTION_FRAMES','visualDecision':'PENDING_USER','familyComplete':False,'fps':fps,'nativeFrameCount':21,'cycleSeconds':21/fps,'textureCleanup':report['cleanup'],'sourceApp':report['sourceApp'],'pairs':[{k:v for k,v in p.items()if k!='images'}for p in pairs]}
(OUT/'validation.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(OUT/'review.html',receipt['status'])
