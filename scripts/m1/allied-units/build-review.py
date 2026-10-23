"""Export full-density representative comparisons and a self-contained offline review."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path('.artifacts/allied-units')
out = root / (sys.argv[1] if len(sys.argv) > 1 else 'review-v1')
out.mkdir(exist_ok=False)
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
ledger = json.loads((root / 'coverage-ledger-v1.json').read_text())
shp = {r['id']: r for r in json.loads((root / 'references-v1/selection.json').read_text())}
vxl = {r['id']: r for r in json.loads((root / 'vehicle-references-v1/vehicle-selection.json').read_text())}
vxl.update({r['id']: r for r in json.loads((root / 'vehicle-references-dest-v2/vehicle-selection.json').read_text())})
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def embed(p):
    return 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()

def bbox(im):
    return im.getchannel('A').point(lambda a: 255 if a > 64 else 0).getbbox()

entries = []
for p in sorted((root / 'art-v1').glob('*.png')):
    identity = p.stem
    if only and identity not in only:
        continue
    if identity not in shp and identity not in vxl:
        continue
    is_shp = identity in shp
    meta = (shp if is_shp else vxl)[identity]
    selected = next((root / rev / p.name for rev in ('art-v3', 'art-v2', 'art-v1')
                     if (root / rev / p.name).exists()), p)
    master = Image.open(selected).convert('RGBA')
    if master.getchannel('A').getextrema()[0] != 0:
        raise ValueError(f'{identity}: missing generated transparency')
    count = len(meta['cells'])
    columns, rows = (3, 2) if is_shp else (2, 2 if count > 2 else 1)
    entry = {'id': identity, 'raw': str(selected), 'rawSha256': sha(selected),
             'status': 'REPRESENTATIVE_ONLY_NOT_RUNTIME', 'samples': []}
    tiles = []
    originals = []
    native_bounds = []
    for i, cell in enumerate(meta['cells']):
        x, y = i % columns, i // columns
        crop = [round(x*master.width/columns),round(y*master.height/rows),
                round((x+1)*master.width/columns),round((y+1)*master.height/rows)]
        # Corrected masters retain all alpha; irregular bounds avoid crossing cell cuts.
        overrides = {'GGI': {3: (0, 800, 382, 1120), 4: (382, 650, 837, 1140),
                             5: (837, 850, 1280, 1160)},
                     'TANY': {3: (0, 780, 465, 1140), 4: (410, 895, 916, 1180),
                              5: (935, 650, 1280, 1230)}}
        if selected.parent.name == 'art-v3' and i in overrides.get(identity, {}):
            crop = overrides[identity][i]
        tile = master.crop(crop)
        bb = bbox(tile)
        if not bb:
            raise ValueError(f'{identity}/{i}: empty authored cell')
        tiles.append(tile.crop(bb))
        if is_shp:
            original = Image.open(root/'references-v1'/cell['original']).convert('RGBA')
            source = json.loads((root/'source-v2'/meta['edition']/(meta['member']+'.json')).read_text())
            frame = source['frames'][cell['nativeFrame']]
            indices = np.asarray(frame['pixels']).reshape(frame['height'],frame['width'])
            # Body registration excludes the indexed ground patch; it never clips authored RGB.
            body = Image.fromarray(((indices != 0) & (indices != 12)).astype('uint8')*255)
            b = body.getbbox()
            nb = [b[0]+frame['x'],b[1]+frame['y'],b[2]+frame['x'],b[3]+frame['y']]
        else:
            directory = 'runtime-references-v4' if identity == 'DEST' else 'runtime-references-v3'
            original = Image.open(root/directory/cell['source']).convert('RGBA')
            a = np.asarray(original).copy()
            mask = np.max(np.abs(a[:,:,:3].astype(int)-np.array([72,88,78])),axis=2)>8
            a[:,:,3] = mask.astype('uint8')*255
            original=Image.fromarray(a)
            nb=bbox(original)
        originals.append(original)
        native_bounds.append(nb)
    # Infantry action cells share the ready-pose scale: muzzle flashes cannot resize the body.
    first=native_bounds[0]
    fixed_scale=(first[3]-first[1])/tiles[0].height if is_shp else min((first[2]-first[0])/tiles[0].width,(first[3]-first[1])/tiles[0].height)
    (out/identity).mkdir()
    for i,(tile,original,nb,cell) in enumerate(zip(tiles,originals,native_bounds,meta['cells'])):
        # VXL source crops are output pixels; divide by the measured renderer ratio.
        if is_shp:
            ratio=1.0
            scale=fixed_scale
            if identity in ('E1', 'GGI') and cell['state'].startswith('Deployed'):
                scale=min((nb[2]-nb[0])/tile.width, (nb[3]-nb[1])/tile.height)
        else:
            directory='runtime-references-v4' if identity=='DEST' else 'runtime-references-v3'
            capture=json.loads((root/directory/'result.json').read_text())
            view=next(v for u in capture['units'] if u['name']==identity for v in u['views'] if v['heading']==cell['heading'])
            ratio=view['ratio']
            scale=min((nb[2]-nb[0])/tile.width,(nb[3]-nb[1])/tile.height)
        density=2
        size=(round(original.width/ratio*density),round(original.height/ratio*density))
        candidate=Image.new('RGBA',size)
        display=tile.convert('RGBa').resize((max(1,round(tile.width*scale/ratio*density)),
                    max(1,round(tile.height*scale/ratio*density))),Image.Resampling.LANCZOS).convert('RGBA')
        x=round((nb[0]+nb[2])/2/ratio*density-display.width/2)
        y=round(nb[3]/ratio*density-display.height)
        if x<0 or y<0 or x+display.width>size[0] or y+display.height>size[1]:
            raise ValueError(f'{identity}/{i}: authored art exceeds native canvas')
        candidate.alpha_composite(display,(x,y))
        old=original.resize(size,Image.Resampling.NEAREST)
        # Remove only common empty canvas from both images; positions remain matched.
        b1,b2=bbox(candidate),bbox(old)
        common=(max(0,min(b1[0],b2[0])-12),max(0,min(b1[1],b2[1])-12),
                min(size[0],max(b1[2],b2[2])+12),min(size[1],max(b1[3],b2[3])+12))
        candidate=candidate.crop(common); old=old.crop(common)
        new_path=out/identity/f'{i}-hd.png'; old_path=out/identity/f'{i}-original.png'
        candidate.save(new_path); old.save(old_path)
        label=f'{cell["state"]} / frame {cell["nativeFrame"]}' if is_shp else f'{cell["role"]} / yaw {cell["heading"]}'
        entry['samples'].append({'label':label,'hd':str(new_path),'original':str(old_path),
            'hdSha256':sha(new_path),'originalSha256':sha(old_path),'size':list(candidate.size),
            'density':density,'uniformScale':scale,'runtimeRatio':ratio,'registration':('native deployed bounds' if identity in ('E1', 'GGI') and cell['state'].startswith('Deployed') else 'fixed ready scale') if is_shp else 'provisional native component bounds'})
    entries.append(entry)

names={'E1':'GI','GGI':'Guardian GI','ENGINEER':'Engineer','JUMPJET':'Rocketeer','CLEG':'Chrono Legionnaire',
       'SPY':'Spy','SNIPE':'Sniper','TANY':'Tanya','ADOG':'Attack Dog','GHOST':'SEAL','MTNK':'Grizzly',
       'FV':'IFV','SREF':'Prism Tank','MGTK':'Mirage Tank','TNKD':'Tank Destroyer','CMIN':'Chrono Miner',
       'CMON':'Chrono Miner unload','AMCV':'Mobile Construction Vehicle','ROBO':'Robot Tank',
       'BFRT':'Battle Fortress','ORCA':'Harrier','BEAG':'Black Eagle','SHAD':'Nighthawk',
       'CARRIER':'Aircraft Carrier','HORNET':'Carrier Hornet','DEST':'Destroyer','ASW':'Destroyer Osprey',
       'AEGIS':'Aegis Cruiser','LCRF':'Amphibious Transport','DLPH':'Dolphin'}
infantry=['E1','GGI','GHOST','JUMPJET','CLEG','SPY','SNIPE','TANY','ADOG']
ground=['MTNK','FV','SREF','MGTK','TNKD','CMIN','CMON','AMCV','ROBO','BFRT']
airnaval=['ORCA','BEAG','SHAD','CARRIER','HORNET','DEST','ASW','AEGIS','LCRF','DLPH']
parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
'''<title>Allied Units B — Representative Review</title><style>
*{box-sizing:border-box}body{margin:0;background:#17201e;color:#eef3ef;font:18px/1.5 system-ui,sans-serif}main{max-width:1380px;margin:auto;padding:32px}h1{font-size:36px}h2{font-size:28px;margin-top:42px}h3{font-size:23px}p{max-width:1000px}a{color:#a5d8ee}.notice{border-left:4px solid #dfbf70;padding:12px 20px;background:#26342e}nav{display:flex;flex-wrap:wrap;gap:10px}button,select{font:inherit;padding:8px 12px;background:#34463e;color:white;border:1px solid #748d7d;border-radius:5px}article{margin:24px 0;padding:22px;border:1px solid #64786c;border-radius:10px;background:#202c27}.samples{display:flex;flex-wrap:wrap;gap:20px}.sample{padding:12px;background:#3e5145;border-radius:6px;min-width:180px}figure{margin:0;display:inline-flex;vertical-align:top;align-items:center;justify-content:center;flex-direction:column;min-width:76px;min-height:100px;padding:6px}figcaption{font-size:15px}.sample p{font-size:16px;margin:4px 0 12px}.image{object-fit:contain;image-rendering:auto}.inspect .image{width:calc(var(--w)*2px)!important;height:calc(var(--h)*2px)!important}details{margin:18px 0}details img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #64786c;text-align:left}small{color:#cedbd0}footer{margin:32px 0} </style><main>
<h1>Allied Units B — Representative Review</h1><p class="notice">Direction decision only. 30 distinct Allied roots across RA2 (25) and Yuri’s Revenge (30). New raster artwork is not yet a complete animation, runtime pack or accepted gameplay delivery. Original artwork and all accepted A/Soviet selections remain active and preserved.</p>
<p>Compare at native logical size first. Every candidate below retains its exported 2x pixel buffer. Inspection enlargement is a separate view. Infantry poses share one ready-pose scale; source ground shadows are shown only in Original. Native shadows will be retained during integration.</p>
<nav><a href="#infantry">Infantry / animals</a><a href="#ground">Ground vehicles</a><a href="#airnaval">Air / naval</a><a href="#reuse">Accepted reuse</a></nav>
<p><button id="scale" onclick="document.body.classList.toggle('inspect');this.textContent=document.body.classList.contains('inspect')?'Return to native size':'Enlarge for inspection (2×)'">Enlarge for inspection (2×)</button></p>''']
byid={e['id']:e for e in entries}
for group,label,ids in [('infantry','Infantry / animals',infantry),('ground','Ground vehicles',ground),('airnaval','Air / naval',airnaval)]:
    parts.append(f'<h2 id="{group}">{label}</h2>')
    for identity in ids:
        if only and identity not in only:
            continue
        if identity not in byid:
            parts.append(f'<article><h3>{identity} — Pending representative</h3></article>');continue
        e=byid[identity]
        parts.append(f'<article id="{identity}"><h3>{names.get(identity,identity)} <small>{identity}</small></h3><div class="samples">')
        for sample in e['samples']:
            w,h=[n/2 for n in sample['size']]
            parts.append(f'<div class="sample"><p>{html.escape(sample["label"])}</p>')
            for key,caption in [('original','Original'),('hd','Candidate · 2x buffer')]:
                parts.append(f'<figure><img class="image" alt="{identity} {html.escape(sample["label"])} {key}" src="{embed(Path(sample[key]))}" style="--w:{w};--h:{h};width:{w}px;height:{h}px"><figcaption>{caption}</figcaption></figure>')
            parts.append('</div>')
        parts.append(f'</div><details><summary>High-resolution master (inspection only)</summary><img alt="{identity} master" src="{embed(Path(e["raw"]))}"></details></article>')
parts.append('''<h2 id="reuse">Accepted artwork reuse</h2><p>ENGINEER shares the accepted SENGINEER source; CCOMAND, PTROOP and CIVAN match accepted Soviet/YR source members. Their artwork is not submitted for renewed approval. Edition gates, sequence mapping and shared allocation still require the bounded integration checks.</p>
<h2>Review boundary and next work</h2><p>One grouped direction decision may name exceptions. After approval, complete required headings, actions, IFV loadouts, child actors, native transforms/remap, shared 256 MiB residency and four edition/theater smoke cases. This page contains authored representative poses, not action recordings or interpolated animation. No complete-family activation or final Mac delivery is claimed.</p>
<p>The Destroyer reference was recaptured after a viewport crop failure. Its previous empty reference is rejected and retained. Current references use the accepted Task A app (runtime de0548b); they are Original-only fixture renders, not new HD runtime evidence.</p><footer>Local only · Task B · Source baseline 3b1bec1 · No server or network required</footer></main></html>''')
page=out/'Allied-Units-Representative-Review.html'
content = '\n'.join(parts)
if only:
    content = content.replace('Direction decision only.', 'Authorized corrections to E1, GGI and TANY; other representative directions are approved.')
    content = content.replace('Infantry poses share one ready-pose scale;', 'Infantry poses share ready-pose scale except GI/GGI deployed emplacements aligned to native bounds;')
page.write_text(content)
receipt={'schemaVersion':1,'status':'AUTHORIZED_CORRECTIONS_PRODUCTION_IN_PROGRESS' if only else 'GROUPED_REPRESENTATIVE_REVIEW_PENDING','tool':'built-in image_gen',
         'completeNewRuntimeFamilies':0,'entries':entries,'html':str(page),'htmlSha256':sha(page),
         'missingRepresentatives':[i for i in infantry+ground+airnaval if i not in byid and (not only or i in only)]}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'entries':len(entries),'samples':sum(len(e['samples']) for e in entries),'html':str(page),'missing':receipt['missingRepresentatives']}))
