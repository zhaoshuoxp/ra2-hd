"""Embed selected contract previews and bounded runtime evidence in one HTML."""
import base64
import html
import io
import json
from pathlib import Path
from PIL import Image
from production_common import ROOT, row_for, raw_for, resting, sha

OUT = ROOT/'final-review-v1'
OUT.mkdir(exist_ok=False)
catalog = json.loads(Path('desktop/allied-building-coverage.json').read_text())
exports = {sha(p):p.parent for p in ROOT.glob('*-exports-v*/*/candidate-review.json')}
colors = '#34483d'
records = []


def uri(image, fmt='PNG'):
    if isinstance(image,Path):
        data=image.read_bytes(); mime='image/gif' if image.suffix=='.gif' else 'image/png'
    else:
        buffer=io.BytesIO();image.save(buffer,format=fmt);data=buffer.getvalue();mime='image/png'
    return f'data:{mime};base64,'+base64.b64encode(data).decode()


def frame(row,folder,member,n):
    source=raw_for(member['source']['sha256'])['frames'][n]
    im=Image.new('RGBA',tuple(v*2 for v in member['canvas']))
    p=folder/f"{member['source']['member'][:-4]}-{n:03}-2x.png"
    if not source['empty']:im.alpha_composite(Image.open(p).convert('RGBA'),(source['x']*2,source['y']*2))
    return im


def scene(row,folder,damage=False,anim=None,n=None):
    canvas=tuple(v*2 for v in row['members'][0]['canvas']);im=Image.new('RGBA',canvas)
    layers=[]
    for role in ['bib','body']:
        for m in row['members']:
            if role in m['roles']:layers.append((m,(21 if damage else 5) if row['id']=='GAWALL' else int(damage)))
    types=['ACTIVE'] if anim else ['ACTIVE','IDLE']
    for a in row['animations']:
        if a['type'] in types and (not anim or a['member']!=anim['source']['member']):
            m=next(m for m in row['members'] if m['source']['member']==a['member'])
            props=a.get('damaged',a['normal']) if damage else a['normal'];layers.append((m,props['start']))
    if anim:layers.append((anim,n))
    elif not any(a['type'] in types for a in row['animations']):
        for a in row['animations']:
            if a['type']=='SUPER':layers.append((next(m for m in row['members'] if m['source']['member']==a['member']),int(damage)));break
    for m,index in layers:
        layer=frame(row,folder,m,index)
        im.alpha_composite(layer,((canvas[0]-layer.width)//2,(canvas[1]-layer.height)//2))
    return im


def figure(im,label,width):
    return f'<figure><figcaption>{html.escape(label)}</figcaption><img loading="lazy" src="{uri(im)}" style="width:{width}px" alt="{html.escape(label)}"></figure>'


cards=[]
for key,entry in catalog.items():
    if entry['theater']=='SNOW' and entry['family']!='GAPOWR':continue
    identity=entry['family'];row=row_for(identity,entry['theater'])
    family=json.loads((Path('.local')/entry['familyPath']).read_text());folder=exports[family['candidateSha256']]
    width=row['members'][0]['canvas'][0]
    normal=scene(row,folder);damage=scene(row,folder,True)
    body=figure(resting(row),'Original normal',width)+figure(normal,'Selected HD normal',width)
    body+=figure(resting(row,True),'Original damaged',width)+figure(damage,'Selected HD damaged',width)
    notes=[]
    if identity in ['GTGCAN','NASAM']:notes.append('These contract images show the SHP base only. The complete articulated turret and eight headings are shown in the native app capture below.')
    if identity=='GAPOWR':notes.append('Snow is the new scope. Accepted dry-theater Power Plant artwork is retained without a new approval request.')
    if identity=='GAAIRC':notes.append('AMRADR is a separate American rules identity with this exact complete shared image family.')
    if identity in ['GAREFN','GAGAP']:notes.append('Native declaration exception: '+('GAREFNL4' if identity=='GAREFN' else 'GAGAP_A')+' is absent from the retail source; resolved native members are fully covered.')
    if (folder/'construction.gif').exists():body+=figure(folder/'construction.gif','Construction / selling uses the native reverse route',width)
    animations=[]
    for member in row['members']:
        if not any(role in ['IDLE','PRODUCTION','SPECIAL','SUPER','ACTIVE'] for role in member['roles']):continue
        if identity not in ['GACNST','GAWEAP','GAYARD','GADEPT','GACSPH','GAWEAT','GAREFN','GASPYSAT','GAROBO','GAAIRC','ATESLA']:continue
        definitions=[a for a in row['animations'] if a['member']==member['source']['member']]
        indices=sorted(set(n for a in definitions for n in range(a['normal']['start'],a['normal']['loopEnd']+1)))
        indices=[n for n in indices if n<member['visibleFrames']]
        if len(indices)<2:continue
        frames=[]
        for n in indices:
            preview=scene(row,folder,anim=member,n=n).resize(tuple(v//2 for v in normal.size),Image.Resampling.LANCZOS)
            bg=Image.new('RGB',preview.size,colors);bg.paste(preview,(0,0),preview);frames.append(bg)
        gif=OUT/f'{identity}-{member["source"]["member"]}.gif'
        frames[0].save(gif,save_all=True,append_images=frames[1:],duration=140,loop=0)
        animations.append(figure(gif,member['source']['member']+' — contract motion',width))
    snow_key=identity.lower()+'-snow'
    if entry['theater']!='SNOW' and snow_key in catalog:
        se=catalog[snow_key];sf=json.loads((Path('.local')/se['familyPath']).read_text());sr=row_for(identity,'SNOW');sd=exports[sf['candidateSha256']]
        body+=figure(scene(sr,sd),'Selected snow normal',width)
    cards.append(f'<article id="{identity}"><h2>{identity}</h2><p>{" ".join(notes)}</p><div class="strip">{body}</div>'
        +(f'<details><summary>Functional sequences</summary><div class="strip">{"".join(animations)}</div></details>' if animations else '')+'</article>')
    records.append({'identity':identity,'selection':key,'familyHash':entry['familyHash'],'exports':str(folder),
        'normalPreviewSha256':__import__('hashlib').sha256(normal.tobytes()).hexdigest()})

smoke=json.loads((ROOT/'final-smoke-v1/result.json').read_text())
assert smoke['status']=='PASS_PACKAGED_COMBINED_CASES'
shared=json.loads((ROOT/'shared-smoke-v3/result.json').read_text())
assert shared['status']=='PASS_SHARED_BEHAVIOR'
runtime=[]
for c in smoke['cases']:
    runtime.append(f'<h3>{c["key"]} — {c["allocation"]["total"]/1048576:.1f} MiB / 256 MiB</h3>'+figure(ROOT/'final-smoke-v1'/c['key']/'combined.png','Final packaged application — combined scene',1000))
for name,label in [('hd-1080.png','HD at 1080p'),('original-1080.png','Original after HD Off and native match restart'),('owner-change.png','Native owner-color change'),('whole-family-fallback.png','Corrupt GAPILL family falls back; independent turrets remain HD')]:
    runtime.append(figure(ROOT/'shared-smoke-v3'/name,label,1000))
turn=[]
for heading in range(0,360,45):
    im=Image.open(ROOT/'shared-smoke-v3'/f'heading-{heading}.png').convert('RGB');im.thumbnail((1000,1000));turn.append(im)
turn[0].save(OUT/'native-turrets.gif',save_all=True,append_images=turn[1:],duration=400,loop=0)
runtime.append(figure(OUT/'native-turrets.gif','Complete GTGCAN and NASAM: native eight-heading sweep',1000))
heading='<h1>Allied Buildings — Final Combined Review</h1><p class="lead">21 rules identities · 39 new selected theater families · 186 verified coverage cells · RA2 and Yuri’s Revenge</p>'
intro='''<p>Representative art direction is approved. This is the final combined visual decision for Task A. Original and HD previews use the same logical pixel dimensions; 2x texture density does not enlarge the building. Native gameplay captures establish actual activation. Contract GIF timing is slowed for inspection and does not change game timing.</p><p>Accepted dry Allied Power Plant, Soviet buildings/units, UI/cameos and trainer remain reference-only. Shared fire, destruction, particles and shadows remain native. Two retail declarations, GAGAP_A and GAREFNL4, have no resolved source member and remain named exceptions. SQD and YURIPR keep their previously accepted Original exceptions. The packaged smoke is technical evidence; final user visual acceptance is pending.</p>'''
style='body{margin:0 auto;max-width:1320px;padding:32px;background:#17231e;color:#edf3ee;font:18px/1.5 system-ui}h1{font-size:36px}h2{font-size:28px;margin:0}h3{font-size:22px}.lead{font-size:22px}article{padding:24px;margin:24px 0;background:#23382d;border-radius:12px}.strip{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-end}figure{margin:10px 0}figcaption{max-width:420px;font-size:16px;color:#c4d3c9}img{display:block;max-width:100%;height:auto;background:#34483d}summary{cursor:pointer;padding:12px 0}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{color:#a1dcc0;margin-right:16px}details{margin-top:16px}'
document='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Allied Buildings Final Review</title><style>'+style+'</style>'+heading+intro+'<nav>'+''.join(f'<a href="#{r["identity"]}">{r["identity"]}</a>' for r in records)+'</nav>'+''.join(cards)+'<h2>Actual final application</h2><p>Four combined cases include unchanged E2/TTNK controls, native shadows, overlap, damage and factory production. Shared toggle, owner change, native heading sweep, whole-family corruption fallback, peer preservation and disposal passed once. The full 4K same-view file is retained with the evidence.</p>'+''.join(runtime)+'</html>'
file=OUT/'Allied-Buildings-Final-Review.html';file.write_text(document)
receipt={'status':'TECHNICAL_PASS_USER_VISUAL_ACCEPTANCE_PENDING','html':str(file.resolve()),'htmlSha256':sha(file),
    'runtimeBuild':str((ROOT/'final-build-v1/identity.json').resolve()),'runtimeSourceHead':json.loads((ROOT/'final-build-v1/identity.json').read_text())['head'],
    'selectedCatalogSha256':sha('desktop/allied-building-coverage.json'),'records':records,
    'coverageEvidence':'selected-coverage-v2.json','packagedEvidence':'final-smoke-v1/result.json','sharedEvidence':'shared-smoke-v3/result.json'}
(OUT/'review-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(file,len(document),len(records))
