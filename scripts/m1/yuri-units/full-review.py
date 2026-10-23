"""Create a portable, offline native-size art review from immutable complete exports."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
p.add_argument('--runtime', nargs='*', default=[])
p.add_argument('--embedded-media', type=Path)
p.add_argument('--visual-acceptance', type=Path)
p.add_argument('--clarity-report', type=Path)
a = p.parse_args()
root = Path('.artifacts/yuri-units')
work = json.loads((root / 'shp-production-v2/worklist.json').read_text())
voxel = json.loads((root / 'vxl-production-v1/worklist.json').read_text())
encode = lambda b: 'data:image/png;base64,' + base64.b64encode(b).decode()
embed = lambda path: encode(Path(path).read_bytes())
rows = []
for identity, stem in [('INIT', 'export-init-complete-{d}x-v1'), ('BRUTE', 'export-brute-complete-{d}x-v1'),
                       ('YURIPR', 'export-yurix-complete-{d}x-v1'), ('VIRUS', 'virus-authored-{d}x-r1'),
                       ('SLAV', 'slav-authored-{d}x-r1')]:
    family = work['families'][identity]['members'][0]
    source = json.loads(Path(family['sourceFile']).read_text())
    manifests = {d: json.loads((root / stem.format(d=d) / 'manifest.json').read_text()) for d in (2, 4)}
    frames = {str(f['frame']): {'2': embed(f['path'])} for f in manifests[2]['frames']}
    for f in manifests[4]['frames']:
        frames[str(f['frame'])]['4'] = embed(f['path'])
        native = source['frames'][f['frame']]
        pixels = np.asarray(native['pixels'], dtype=np.uint8).reshape(native['height'], native['width'])
        tile = np.asarray(source['palette'], dtype=np.uint8)[pixels]
        alpha = np.where(pixels == 0, 0, 255).astype(np.uint8)
        tile = Image.fromarray(np.dstack([tile, alpha]))
        image = Image.new('RGBA', tuple(source['canvas']))
        image.alpha_composite(tile, (native['x'], native['y']))
        png = io.BytesIO(); image.save(png, format='PNG')
        frames[str(f['frame'])]['original'] = encode(png.getvalue())
    sequences = {}
    for slot in family['slots']:
        for membership in slot['sequenceMembership']:
            key = f"{membership['action']} / facing {membership['facing']}"
            sequences.setdefault(key, []).append((membership['phase'], slot['frame']))
    sequences = {k: [n for _, n in sorted(v)] for k, v in sequences.items()}
    rows.append({'id': identity, 'kind': 'SHP', 'size': source['canvas'], 'sequences': sequences, 'frames': frames,
                 'note': 'Exact native slot order, trim, canvas and indexed ground coverage. Playback is an art review; runtime evidence is separate.'})

for board in voxel['boards']:
    family = board['family']
    manifest = json.loads((root / f'staged-packs/yuri-{family.lower()}-vxl/r1-4x/manifest.json').read_text())
    part = next(part for part in manifest['parts'] if part['key'] == board['part'])
    frames = {}
    for f, packed in zip(board['frames'], part['frames']):
        name = f"{board['id']}-{f['heading']}.png"
        original = Path(voxel['references']) / f['source']
        native = Image.open(original).crop(f['sourceBounds'])
        buffer = io.BytesIO(); native.save(buffer, format='PNG')
        frames[str(f['heading'])] = {'2': embed(root / f'{family.lower()}-vxl-review-2x-r1' / name),
            '4': embed(root / f'{family.lower()}-vxl-review-4x-r1' / name), 'original': encode(buffer.getvalue()),
            'originalSize': [native.width / f['ratio'], native.height / f['ratio']], 'size': packed['logicalSize']}
    rows.append({'id': board['id'], 'kind': 'VXL component', 'size': part['frames'][0]['logicalSize'],
                 'frames': frames, 'sequences': {'Eight independent native headings': list(map(str, range(0, 360, 45)))},
                 'note': 'Independent authored component bearings. Original is cropped from the native part capture at its recorded logical scale; assembled depth, HVA and movement are judged in gameplay clips.'})

runtime = []
media = json.loads(a.embedded_media.read_text()) if a.embedded_media else None
media_by_source = {clip['source']: clip for clip in media['clips']} if media else {}
for directory in a.runtime:
    folder = Path(directory)
    report = json.loads((folder / 'report.json').read_text())
    runtime.append({'name': folder.name, 'status': report['status'], 'report': str((folder / 'report.json').resolve()),
        'sourceRunStatus': report.get('sourceRunStatus', report['status']),
        'excludedSourceCases': list(report.get('excludedSourceCases', {})),
        'screenshots': [{'name': image.stem, 'data': embed(image)} for image in sorted(folder.glob('*-detail.png'))]
            + [{'name': image.stem, 'data': embed(image)} for image in sorted(folder.glob('mixed-native-bindings.png'))],
        'clips': [os.path.relpath(Path(clip).resolve(), a.output.parent.resolve()) for clip in report.get('clips', [])],
        'exceptions': report.get('caseFailures', [])})
    runtime[-1]['embeddedClips'] = []
    for clip in report.get('clips', []) if media else []:
        preview = media_by_source[str(Path(clip).resolve())]
        runtime[-1]['embeddedClips'].append({'name': Path(clip).stem,
            'src': 'data:video/mp4;base64,' + base64.b64encode(Path(preview['preview']).read_bytes()).decode(),
            'disclosure': preview['disclosure'],
            'original': os.path.relpath(Path(clip).resolve(), a.output.parent.resolve())})
template = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Yuri Units Full Review</title>
<style>body{font:19px system-ui;background:#27332e;color:#eee;margin:30px}h1{font-size:34px}h2{font-size:26px}button,select{font:inherit;padding:6px;margin:4px}section{padding:20px;margin:20px 0;border:1px solid #718477;border-radius:8px}.pair{display:flex;align-items:center;gap:40px;min-height:160px;background:#48584e;padding:20px;overflow:auto}.label{font-size:16px}img{object-fit:contain}video{max-width:100%;width:1000px}a{color:#9dd2ff}.controls{position:sticky;top:0;background:#27332e;padding:10px;z-index:2}.evidence img{max-width:100%}</style>
<h1>Yuri Units Full Review</h1><p>Yuri’s Revenge: 19 roots, 14 new root families, 5 accepted source-identical reuses, and 2 required children. Full batch human acceptance is pending. Review native silhouettes and poses before enlarged detail.</p>
<p>YURIPR PsiWave remains an upstream gameplay exception. Disc flight and power drain are verified; refinery drain acquires briefly but money payment remains failed in the baseline gameplay path. PCV/YACNST and SMIN/YAREFN retain the Original building baseline; Task C joint HD validation remains separate. RA2 receives no Yuri’s Revenge hero or vehicle override.</p>
<div class="controls"><label>Buffer density <select id="density"><option value="4">4x</option><option value="2">2x</option></select></label><button id="detail">Native logical size</button><button id="pause">Pause playback</button></div><main id="cards"></main><h2>Copied Mac runtime evidence</h2><div id="evidence"></div>
<script>const rows=__ROWS__,runtime=__RUNTIME__;let enlarged=false,playing=true,phase=0;const cards=[];
for(const row of rows){const section=document.createElement('section'),title=document.createElement('h2'),note=document.createElement('p'),select=document.createElement('select'),pair=document.createElement('div'),old=new Image(),hd=new Image(),label=document.createElement('p');title.textContent=row.id+' · '+row.kind;note.textContent=row.note;pair.className='pair';for(const name of Object.keys(row.sequences)){const option=document.createElement('option');option.textContent=name;select.append(option)}old.alt='Original';hd.alt='HD';pair.append(old,hd);section.append(title,note,select,pair,label);cards.push({row,select,old,hd,label});cardsElement().append(section)}
function cardsElement(){return document.getElementById('cards')}
function draw(){for(const c of cards){const sequence=c.row.sequences[c.select.value],key=sequence[phase%sequence.length],frame=c.row.frames[key];if(!frame)continue;c.old.src=frame.original;c.hd.src=frame[density.value];const size=frame.size||c.row.size,scale=enlarged?Number(density.value):1;c.hd.style.width=size[0]*scale+'px';c.hd.style.height=size[1]*scale+'px';if(c.row.kind==='SHP'){c.old.style.width=size[0]*scale+'px';c.old.style.height=size[1]*scale+'px';c.old.style.imageRendering='pixelated'}else{c.old.style.width=frame.originalSize[0]*scale+'px';c.old.style.height=frame.originalSize[1]*scale+'px';c.old.style.imageRendering='pixelated'}c.label.textContent='Original | HD · native slot/heading '+key+' · '+(enlarged?'density detail':'native logical size')}}
detail.onclick=()=>{enlarged=!enlarged;detail.textContent=enlarged?'Density detail':'Native logical size';draw()};pause.onclick=()=>{playing=!playing;pause.textContent=playing?'Pause playback':'Resume playback'};density.onchange=draw;for(const c of cards)c.select.onchange=()=>{phase=0;draw()};setInterval(()=>{if(playing){phase++;draw()}},180);draw();
for(const r of runtime){const section=document.createElement('section');section.className='evidence';const h=document.createElement('h2');h.textContent=r.name+' · '+r.status;section.append(h);const scope=document.createElement('p');scope.textContent='Source run: '+r.sourceRunStatus+(r.excludedSourceCases.length?' · source cases with recorded failures: '+r.excludedSourceCases.join(', '):'');section.append(scope);const link=document.createElement('a');link.href=r.name+'/report.json';link.textContent='Open scoped native evidence report';section.append(link);for(const screenshot of r.screenshots){const p=document.createElement('p'),i=new Image();p.textContent=screenshot.name;i.src=screenshot.data;section.append(p,i)}for(const clip of r.clips){const v=document.createElement('video');v.controls=true;v.preload='none';v.src=clip;section.append(v)}document.getElementById('evidence').append(section)}
</script></html>'''
if media:
    template = template.replace('<main id="cards">',
        '<p><a href="#replays">Embedded gameplay replays</a> · <a href="#cards">Complete artwork</a> · '
        '<a href="#evidence">Native screenshots and reports</a></p><h2 id="replays">Embedded gameplay replays</h2>'
        '<p>Every replay below is stored inside this HTML file. Playback previews are at most 1920 pixels wide; '
        'original native recordings and 4K pixel crops are preserved. Failed Disc payment remains an explicit exception.</p>'
        '<div id="videos"></div><h2>Complete artwork</h2><main id="cards">')
    template = template.replace('for(const clip of r.clips){', 'for(const clip of r.embeddedClips.length?[]:r.clips){')
    gallery = '''for(const r of runtime){for(const c of r.embeddedClips){const section=document.createElement('section'),h=document.createElement('h2'),v=document.createElement('video'),p=document.createElement('p'),link=document.createElement('a');h.textContent=c.name+' · '+r.name;p.textContent=c.disclosure+' Source run: '+r.sourceRunStatus+(r.excludedSourceCases.length?' · recorded exceptions: '+r.excludedSourceCases.join(', '):'');v.controls=true;v.preload='none';v.playsInline=true;v.src=c.src;link.href=c.original;link.textContent='Original native recording (optional companion file)';section.append(h,p,v,link);document.getElementById('videos').append(section)}}'''
    template = template.replace('</script>', gallery + '\n</script>')
if a.visual_acceptance:
    acceptance = json.loads(a.visual_acceptance.read_text())
    assert acceptance['status'] == 'FULL_BATCH_VISUAL_ACCEPTED_WITH_SEPARATE_CLARITY_FEEDBACK'
    template = template.replace('Full batch human acceptance is pending.',
        'Full batch visual acceptance was received on 2026-10-01. The separate mother-art clarity concern remains open; no artwork or game geometry was changed.')
if a.clarity_report:
    report = json.loads(a.clarity_report.read_text())
    template = template.replace('<h2 id="replays">',
        '<p><a href="' + os.path.relpath(report['html'], a.output.parent.resolve())
        + '">Mother-art clarity comparison and diagnosis</a></p><h2 id="replays">')
a.output.parent.mkdir(parents=True, exist_ok=True)
assert not a.output.exists(), 'Preserve previous review versions'
a.output.write_text(template.replace('__ROWS__', json.dumps(rows)).replace('__RUNTIME__', json.dumps(runtime)))
runtime_receipt = [{**group, 'embeddedClips': [{k: v for k, v in clip.items() if k != 'src'}
    for clip in group['embeddedClips']]} for group in runtime]
receipt = {'status': 'FULL_BATCH_VISUAL_ACCEPTED_WITH_SEPARATE_CLARITY_FEEDBACK' if a.visual_acceptance
           else 'FULL_ART_REVIEW_HUMAN_ACCEPTANCE_PENDING', 'html': str(a.output.resolve()),
           'sha256': hashlib.sha256(a.output.read_bytes()).hexdigest(), 'bytes': a.output.stat().st_size,
           'shpFrames': sum(len(r['frames']) for r in rows if r['kind'] == 'SHP'),
           'vxlHeadings': sum(len(r['frames']) for r in rows if r['kind'] != 'SHP'), 'runtime': runtime_receipt,
           'embeddedVideoCount': sum(len(r['embeddedClips']) for r in runtime),
           'embeddedMediaManifest': str(a.embedded_media.resolve()) if media else None,
           'visualAcceptanceReceipt': str(a.visual_acceptance.resolve()) if a.visual_acceptance else None}
a.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k != 'runtime'}))
