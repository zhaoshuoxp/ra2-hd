"""Self-contained synchronized resource animations and native runtime clips."""
import base64
import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path
from PIL import Image
from atlas import Member, read, write

sys.path.insert(0,'scripts/m1/allied-buildings')
from production_common import row_for, decode

root = Path('.artifacts/allied-corrections')
out = root / (sys.argv[1] if len(sys.argv)>1 else 'review-r1'); out.mkdir(exist_ok=False)
feedback = '--feedback' in sys.argv
base = '79f2af5' if feedback else 'ee35fcf'
before = read(root/'feedback-r2/before-buildings.json') if feedback else json.loads(subprocess.check_output(['git','show',base+':desktop/allied-building-coverage.json']))
after = read('desktop/allied-building-coverage.json')
units_before = read(root/'feedback-r2/before-units.json') if feedback else json.loads(subprocess.check_output(['git','show',base+':desktop/allied-unit-contracts.json']))
units_after = read('desktop/allied-unit-contracts.json')
groups = []
image_data,image_ids,media_nodes=[],{},[]

def encoded(image):
    stream = io.BytesIO(); image.save(stream,format='PNG')
    data=stream.getvalue();digest=hashlib.sha256(data).hexdigest()
    if digest not in image_ids:
        image_ids[digest]=len(image_data)
        image_data.append('data:image/png;base64,'+base64.b64encode(data).decode())
    return image_ids[digest]

def family(catalog,key):
    f = read(Path('.local') / catalog[key]['familyPath'])
    return {m['member']:Member(Path('.local/hd-packs')/m['packId']/m['revision']) for m in f['members']}

for name in (('ATESLA',) if feedback else ('GAAIRC','ATESLA')):
    for theater in ('TEMPERATE','SNOW'):
        row = row_for(name,theater); key=name.lower()+'-'+theater.lower()
        previous,current=family(before,key),family(after,key)
        for density in (2,4):
            for damaged in (False,True):
                streams=[[],[],[]]
                for n in range(8):
                    images=[Image.new('RGBA',tuple(row['members'][0]['canvas']))]
                    images += [Image.new('RGBA',tuple(v*density for v in row['members'][0]['canvas'])) for _ in range(2)]
                    for member in row['members']:
                        source=member['source']['member'];roles=member['roles']
                        if 'BUILDUP' in roles:continue
                        if name=='ATESLA' and source==row['members'][2]['source']['member']:continue
                        if 'body' in roles or 'bib' in roles:slot=int(damaged)
                        else:
                            count=member['visibleFrames']//2
                            # Prism loops eight of nine declared ACTIVE frames.
                            cycle=8 if name=='ATESLA' else count
                            slot=n%cycle+(count if damaged else 0)
                        images[0].alpha_composite(decode(row,member,slot))
                        images[1].alpha_composite(previous[source].frame(density,slot))
                        images[2].alpha_composite(current[source].frame(density,slot))
                    for stream,image in zip(streams,images,strict=True):stream.append(encoded(image))
                groups.append(dict(title=f'{name} · {theater} · {density}x · '+('damaged' if damaged else 'normal'),
                                   period=1000/(3.6666666667 if name=='GAAIRC' else 3.3333333333),
                                   density=density,streams=streams,width=row['members'][0]['canvas'][0],height=row['members'][0]['canvas'][1]))
                if name=='ATESLA':
                    streams=[[],[],[]]
                    for n in range(10):
                        images=[Image.new('RGBA',tuple(row['members'][0]['canvas']))]
                        images += [Image.new('RGBA',tuple(v*density for v in row['members'][0]['canvas'])) for _ in range(2)]
                        for member in (row['members'][0],row['members'][2]):
                            source=member['source']['member']
                            slot=int(damaged) if 'body' in member['roles'] else n+(10 if damaged else 0)
                            images[0].alpha_composite(decode(row,member,slot))
                            images[1].alpha_composite(previous[source].frame(density,slot))
                            images[2].alpha_composite(current[source].frame(density,slot))
                        for stream,image in zip(streams,images,strict=True):stream.append(encoded(image))
                    groups.append(dict(title=f'ATESLA charge · {theater} · {density}x · '+('damaged' if damaged else 'normal'),
                                       period=200,density=density,streams=streams,width=row['members'][0]['canvas'][0],height=row['members'][0]['canvas'][1]))

source = read('.artifacts/allied-units/source-v2/ra2/gi.shp.json')
def gi_member(catalog):
    f=read(Path('.local')/catalog['shp']['E1']['familyPath']);m=f['members'][0]
    return Member(Path('.local/hd-packs')/m['packId']/m['revision'])
gi_before,gi_after=gi_member(units_before),gi_member(units_after)
facings = [(f'facing {f}',315+f*6) for f in range(8)] if feedback else [('failing side',327),('opposite side',351),('neighbor control',321)]
for density in (2,4):
    for facing,start in facings:
        streams=[[],[],[]]
        idle=292+(start-315)//6
        slots=[idle,*range(start,start+6),idle]
        for n in slots:
            frame=source['frames'][n];indices=Image.frombytes('P',(frame['width'],frame['height']),bytes(frame['pixels']))
            palette=source['palette']['colors'] if isinstance(source['palette'],dict) else source['palette']
            indices.putpalette([v for color in palette for v in color]);native=indices.convert('RGBA');native.putalpha(Image.frombytes('L',indices.size,bytes(frame['pixels'])).point(lambda v:255 if v else 0))
            canvas=Image.new('RGBA',tuple(source['canvas']));canvas.paste(native,(frame['x'],frame['y']))
            streams[0].append(encoded(canvas));streams[1].append(encoded(gi_before.frame(density,n)));streams[2].append(encoded(gi_after.frame(density,n)))
        groups.append(dict(title=f'E1 deployed · {facing} · {density}x',period=120,density=density,streams=streams,width=78,height=66))

clips=[];screens=[];statuses={}
folders = ('packaged-yr-4x-final','packaged-yr-4x-gi-r8','feedback-yr-4x','feedback-ra2-2x','feedback-yr-4x-gi-full-r2','feedback-ra2-2x-gi-control','feedback-yr-snow-4x','feedback-ra2-snow-2x') if feedback else ('before-native-v2','packaged-yr-4x-v2','packaged-ra2-2x','packaged-yr-4x-final','packaged-yr-snow-4x','packaged-ra2-snow-2x','packaged-yr-4x-gi-r8','packaged-ra2-2x-gi-r8')
for folder in folders:
    directory=root/folder
    if not (directory/'report.json').exists():continue
    report=read(directory/'report.json');statuses[folder]=report['status']
    if folder in ('packaged-yr-4x-v2','packaged-ra2-2x'):statuses[folder]+=' (world evidence reused; sidebar superseded)'
    for filename in ('GAAIRC-native-cycle.webm','ATESLA-native-cycle.webm','ATESLA-native-charge.webm','GI-native-facing-sweep.webm','sidebar-category-switching.webm'):
        if folder in ('packaged-yr-4x-v2','packaged-ra2-2x'):continue
        if filename=='GI-native-facing-sweep.webm' and folder in ('packaged-yr-4x-final','packaged-ra2-snow-2x'):continue
        # Dry world evidence remains valid after the final UI-only fix. Its old
        # sidebar trace is superseded; final-app sidebar evidence is separate.
        if filename=='sidebar-category-switching.webm' and folder in ('packaged-yr-4x-v2','packaged-ra2-2x'):continue
        if filename=='GI-native-facing-sweep.webm' and folder=='packaged-yr-snow-4x':continue
        if filename=='sidebar-category-switching.webm' and folder=='packaged-yr-snow-4x':continue
        if feedback and folder=='packaged-yr-4x-final' and filename not in ('GAAIRC-native-cycle.webm','ATESLA-native-cycle.webm','ATESLA-native-charge.webm'):continue
        if feedback and folder=='packaged-yr-4x-gi-r8' and filename not in ('GI-native-facing-sweep.webm','sidebar-category-switching.webm'):continue
        file=directory/filename
        if file.exists():
            element='offline-clip-'+str(len(clips))
            media_nodes.append('<script type="application/octet-stream" id="'+element+'">'+base64.b64encode(file.read_bytes()).decode()+'</script>')
            clips.append(dict(title=folder+' / '+filename,element=element))
    for filename in ('GAAIRC-matched-original.png','GAAIRC-matched-hd.png','ATESLA-matched-original.png','ATESLA-matched-hd.png','GI-fire--3_3-detail.png','GI-fire-3_-3-detail.png','sidebar-final-infantry.png','sidebar-hd-off.png'):
        if folder in ('packaged-yr-4x-v2','packaged-ra2-2x'):continue
        if filename.startswith('GI-') and folder in ('packaged-yr-4x-final','packaged-ra2-snow-2x'):continue
        if filename.startswith('sidebar') and folder in ('packaged-yr-4x-v2','packaged-ra2-2x'):continue
        file=directory/filename
        if file.exists():
            preview=Image.open(file).convert('RGB');preview.thumbnail((1920,1080),Image.Resampling.LANCZOS)
            screens.append(dict(title=folder+' / '+filename,src=encoded(preview)))

html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Allied Corrections · Isolated Review</title><style>
body{margin:0;background:#17221f;color:#eef5ef;font:18px system-ui,sans-serif;line-height:1.5}main{max-width:1400px;margin:auto;padding:28px}h1{font-size:32px}h2{font-size:25px}p{max-width:1100px}button,select,input{font:inherit;padding:8px;background:#2e4239;color:inherit;border:1px solid #5c7668;border-radius:6px}button{cursor:pointer}.row{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}.panel{flex:1;min-width:240px;background:#3f5048;padding:12px;border-radius:8px}.panel canvas{display:block;width:100%;height:360px;object-fit:contain}video,img{width:100%;max-height:720px;object-fit:contain}details{border-top:1px solid #587564;padding:12px 0}summary{cursor:pointer}small{color:#c2d1c8}code{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}td,th{text-align:left;border:1px solid #52665d;padding:9px}</style>
<main><h1>Allied animation and sidebar corrections</h1><p><strong>READY_FOR_REVIEW · NOT_MERGED</strong>. Isolated from Task C at base <code>ee35fcf</code>. Only the reported HQ/Prism animation, sidebar category flash and GI deployed firing defects are selected. Existing Original/2x/4x, native rules/geometry, accepted art and trainer remain preserved.</p>
<table><tr><th>Classification</th><th>Evidence scope</th></tr><tr><td>NEW_CONTENT</td><td>Four corrected functional building families, GI flash slots, coherent sidebar preparation and isolated Mac app</td></tr><tr><td>AFFECTED_SHARED_PATH</td><td>UI builder acquisition and sidebar publication; additive Allied catalog pins</td></tr><tr><td>REUSED_ACCEPTED_EVIDENCE</td><td>Task A/B general roster, construction, superweapons, masks/shadows, R2–R6, trainer and unchanged controls</td></tr></table>
<h2>Same-frame animation comparison</h2><p>All three columns advance the same source frame. Original uses native indexed pixels; Before and After use the selected full-density resources. GI inspection steps are 120 ms; the native clips preserve gameplay timing. These composites isolate artwork registration; actual lighting/depth and native state execution are shown in the clips below. HQ retains the accepted three scan views. GI retains distinct firing/recoil and muzzle art; corrected physical registration does not claim newly generated detail.</p>
<div class="row"><select id="group"></select><button id="play">Pause</button><button id="step">Next frame</button><label>Speed <select id="speed"><option value="1">Normal inspection speed</option><option value=".25">Quarter speed</option></select></label><span id="frame"></span></div>
<div class="row"><div class="panel">Original<canvas id="original"></canvas></div><div class="panel">Before<canvas id="before"></canvas></div><div class="panel">After · selected correction<canvas id="after"></canvas></div></div>
<h2>Per-fix status</h2><table><tr><th>Issue</th><th>Result</th></tr><tr><td>HQ / Prism functional animation</td><td>TECHNICAL_PASS · HUMAN_REVIEW_PENDING</td></tr><tr><td>Sidebar category publication</td><td>TECHNICAL_PASS · HUMAN_REVIEW_PENDING</td></tr><tr><td>E1 deployed firing registration</td><td>TECHNICAL_PASS · HUMAN_REVIEW_PENDING</td></tr></table><h2>Measured corrections</h2><p>HQ: scan-wide bounds moved/scaled its mounting ring; registration now follows the fixed ring anchor. Prism: native moving masks cut fragments out of a stationary painted crown; the complete solid normal/damaged crown now moves as the functional assembly while electrical emission remains separate. GI: muzzle/body support compressed the sandbag stance on 24 flash frames; horizontal registration is corrected with unchanged native vertical timing and distinct actions.</p>
<p>Sidebar: a requested visible page prepares before coherent publication; labels, tooltips and click actions stay with the displayed cards. Up to three visited pages retain budgeted leases. Warm acquisition is synchronous. Cold preparation is bounded by a 750 ms failure deadline; missing/corrupt/disabled/over-budget resources intentionally use Original. Local first-use timing is measured in the evidence, not hidden behind a fixed delay.</p>
<h2>Native action clips</h2><p>Controlled legal fixtures followed by native orders and animation clocks. Clips run independently; synchronized before/after source-frame inspection is above. Manual Original/HD toggles are separate screenshots, never spliced into the action clips.</p><div id="clips"></div>
<h2>Actual screenshots and results</h2><p>Embedded screenshots are inspection previews up to 1920 × 1080. Full 4K screenshots and the complete eight-facing GI trace remain in the worktree evidence folders. Native video bytes retain their captured resolution/timing.</p><pre id="statuses"></pre><div id="screens"></div>
<h2>Launch and review boundary</h2><p>Launch <code>Launch Allied Corrections.command</code> beside <code>RA2 HD Allied Corrections.app</code>. Keep <code>RA2-HD-Editions-Resources</code> beside the app. The app uses this folder's independent review profile. No Desktop archive, publication or main integration was performed. Review fixes in this same chat. Integration requires a separate instruction after Task C has a stable committed checkpoint, additive catalog reconciliation and targeted combined checks.</p><small>Offline self-contained page: no external fonts, media or requests. Windows and final human visual acceptance remain unverified.</small></main>
OFFLINE_DATA<script>
const groups=GROUPS,clips=CLIPS,screens=SCREENS,statuses=STATUSES;
const offlineImages=JSON.parse(document.getElementById('offline-images').textContent);
const select=document.querySelector('#group');groups.forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=g.title;select.append(o)});
let selected=0,frame=0,playing=true,last=0,loaded=[],epoch=0;
async function load(){const token=++epoch;selected=Number(select.value);frame=0;loaded=[];const g=groups[selected];const images=await Promise.all(g.streams.map(stream=>Promise.all(stream.map(src=>new Promise(resolve=>{const i=new Image;i.onload=()=>resolve(i);i.src=offlineImages[src]})))));if(epoch!==token)return;loaded=images;draw()}
function draw(){if(!loaded.length)return;const g=groups[selected];['original','before','after'].forEach((id,i)=>{const c=document.getElementById(id);c.width=g.width*4;c.height=g.height*4;const x=c.getContext('2d');x.imageSmoothingEnabled=i!==0;x.clearRect(0,0,c.width,c.height);x.drawImage(loaded[i][frame],0,0,c.width,c.height)});document.querySelector('#frame').textContent=`Frame ${frame+1} / ${g.streams[0].length}`}
select.onchange=load;document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play'};document.querySelector('#step').onclick=()=>{playing=false;document.querySelector('#play').textContent='Play';frame=(frame+1)%groups[selected].streams[0].length;draw()};
function tick(t){const period=groups[selected].period/Number(document.querySelector('#speed').value);if(playing&&loaded.length&&t-last>=period){frame=(frame+1)%groups[selected].streams[0].length;draw();last=t}requestAnimationFrame(tick)}load();requestAnimationFrame(tick);
function section(container,title,tag,source){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=title;d.append(s);const v=document.createElement(tag);if(tag==='video'){v.controls=true;v.preload='none';d.ontoggle=()=>{if(d.open&&!v.src)v.src='data:video/webm;base64,'+document.getElementById(source).textContent}}else{v.loading='lazy';v.alt=title;d.ontoggle=()=>{if(d.open&&!v.src)v.src=offlineImages[source]}}d.append(v);document.querySelector(container).append(d)}
clips.forEach(v=>section('#clips',v.title,'video',v.element));screens.forEach(v=>section('#screens',v.title,'img',v.src));document.querySelector('#statuses').textContent=JSON.stringify(statuses,null,2);
</script></html>'''
if feedback:
    html=html.replace('Four corrected functional building families, GI flash slots, coherent sidebar preparation and isolated Mac app', 'Rigid Prism projection in both theaters and densities; fixed GI fortress through all deployed attack phases')
    html=html.replace('UI builder acquisition and sidebar publication; additive Allied catalog pins', 'Additive Prism/GI selection pins only; HQ and sidebar production source preserved')
    html=html.replace('HQ retains the accepted three scan views.', 'Before is the Desktop version reviewed by the user (Prism r5 / GI r6); After selects r9. HQ retains its accepted correction and is not reopened.')
    html=html.replace('<tr><td>HQ / Prism functional animation</td><td>TECHNICAL_PASS · HUMAN_REVIEW_PENDING</td></tr>', '<tr><td>HQ</td><td>PRESERVED · user reports basically fixed</td></tr><tr><td>Prism rotation</td><td>r5 REJECTED; r9 TECHNICAL_PASS · HUMAN_REVIEW_PENDING</td></tr>')
    html=html.replace('Prism: native moving masks cut fragments out of a stationary painted crown; the complete solid normal/damaged crown now moves as the functional assembly while electrical emission remains separate.', 'Prism: r5 row deformation was rejected. Accepted metal/prism textures now cover rigid petals around a fixed axis, with changing face visibility and depth occlusion. The damaged rotor retains a fixed lean. Charge emission remains separate. The geometry is a scoped reconstruction from raster references, not a recovered original 3D model.')
    html=html.replace('GI: muzzle/body support compressed the sandbag stance on 24 flash frames; horizontal registration is corrected with unchanged native vertical timing and distinct actions.', 'GI: r6 still varied sandbag surfaces, leaked old edges and selected yellow bag highlights as muzzle light. All 48 attack slots now reuse the accepted per-facing idle fortress; previous bag pixels are cleared before composing distinct upper-body and muzzle actions. All idle, deployment, movement and other frames stay unchanged.')
    html=html.replace('No Desktop archive, publication or main integration was performed.', 'A new Desktop ZIP is authorized for testing; main integration remains NOT_MERGED. Historical before clips and unchanged HQ/sidebar evidence are explicitly reused.')
    statuses['feedback']='R9 TECHNICAL_REVIEW; human visual acceptance pending; old r5 Prism rejected / r6 GI partially improved'
for key,value in [('GROUPS',groups),('CLIPS',clips),('SCREENS',screens),('STATUSES',statuses)]:html=html.replace(key,json.dumps(value))
html=html.replace('OFFLINE_DATA','<script type="application/json" id="offline-images">'+json.dumps(image_data)+'</script>'+''.join(media_nodes))
(out/'Allied-Corrections-Review.html').write_text(html)
write(out/'review.json',dict(groups=len(groups),clips=len(clips),screens=len(screens),statuses=statuses,selfContained=True))
print(out/'Allied-Corrections-Review.html')
