"""Embed the bounded feedback evidence without external requests or image processing."""
import base64
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/allied-units')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows = []

def entry(title, note, images, clips):
    row = {'title': title, 'note': note, 'images': [], 'clips': []}
    for label, relative in images:
        p = root / relative
        row['images'].append({'label': label, 'path': str(p), 'sha256': sha(p),
                              'data': base64.b64encode(p.read_bytes()).decode()})
    for label, relative in clips:
        p = root / relative
        row['clips'].append({'label': label, 'path': str(p), 'sha256': sha(p),
                             'data': base64.b64encode(p.read_bytes()).decode()})
    rows.append(row)

entry('Tank clarity and shadow contact',
      'Same logical camera and native screenshot pixels. The new Allied VXL families use 4x atlases and the accepted Rhino sampling footprint. Source alpha and Soviet artwork are unchanged.',
      [('Before: 2x atlas, four-texel minimum', 'quality-probe-v1/MTNK-filter-4.png'),
       ('After: 4x atlas, Rhino sampling footprint', 'feedback-quality-v1/MTNK-filter-1.png')],
      [('Allied / Soviet movement at 4K', 'feedback-quality-v1/clarity-motion.webm')])
entry('Dolphin direction',
      'Clockwise source bearings now follow native movement and attack directions. Native animation phases and targeting are unchanged.',
      [('Native attack, corrected facing', 'feedback-naval-v1/DLPH-attack-detail.png')],
      [('Move and attack at 4K', 'feedback-naval-v1/DLPH-native-actions.webm')])
entry('Complete Allied naval hulls',
      'Registered hull pixels stay above the water surface, using the accepted Soviet naval depth recovery. Child-aircraft launch / return and transport unloading use native orders.',
      [(id, f'feedback-naval-v1/{id}-ready-detail.png') for id in ['DEST', 'CARRIER', 'AEGIS', 'LCRF']],
      [(id + ' native actions at 4K', f'feedback-naval-v1/{id}-native-actions.webm') for id in ['DEST', 'CARRIER', 'AEGIS', 'LCRF']])
entry('Visible parked aircraft',
      'ORCA and BEAG remain visible after actual descent ends. Four occupied parking slots are shown in RA2 snow; YR sorties, return and reload were also checked. Normal depth testing stays enabled.',
      [('Four parked aircraft, RA2 snow', 'feedback-parking-v1/four-parked-aircraft-detail.png')],
      [('ORCA sortie and completed landing', 'feedback-air-v1/ORCA-native-actions.webm'),
       ('BEAG sortie and completed landing', 'feedback-air-v1/BEAG-native-actions.webm'),
       ('Four native landings, RA2 snow', 'feedback-parking-v1/four-native-landings.webm')])
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Allied Units — Feedback Corrections</title>
<style>body{font:20px/1.45 system-ui;background:#17251e;color:#ecf4ed;margin:32px}h1{font-size:34px}h2{font-size:26px}p{max-width:1080px}button{font:inherit;padding:9px 14px;margin:5px;border:1px solid #7c9d84;border-radius:6px;background:#294536;color:white;cursor:pointer}.images{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0}img{display:block;max-width:100%;height:auto}figcaption{padding:8px 0;font-size:18px}.media{overflow:auto;max-width:100%;background:#0b1510}video{display:block;max-width:100%;max-height:850px}video.actual{max-width:none;max-height:none}article{border-top:1px solid #57765e;padding:24px 0;margin-top:24px}.status{color:#bbd3c1}nav{margin:14px 0}small{color:#b5c8bb}</style>
<h1>Allied units: feedback corrections</h1><p>Incremental review of the five reported issues. Accepted buildings, Soviet resources and the prior review are retained. Final visual acceptance remains with the user.</p><p class="status">Actual copied Mac package · RA2 snow / YR temperate · 3840×2160 capture · no screenshot sharpening</p>
<div id="content"></div><script>
const rows=__ROWS__; let activeUrl;
for(const row of rows){const a=document.createElement('article'),h=document.createElement('h2'),p=document.createElement('p'),images=document.createElement('div'),nav=document.createElement('nav'),media=document.createElement('div');h.textContent=row.title;p.textContent=row.note;images.className='images';media.className='media';
for(const item of row.images){const f=document.createElement('figure'),img=new Image(),c=document.createElement('figcaption');img.src='data:image/png;base64,'+item.data;img.alt=item.label;c.textContent=item.label;f.append(img,c);images.append(f)}
for(const clip of row.clips){const b=document.createElement('button');b.textContent=clip.label;b.onclick=()=>{document.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();v.remove()});if(activeUrl)URL.revokeObjectURL(activeUrl);const binary=atob(clip.data),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);activeUrl=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));const v=document.createElement('video');v.controls=true;v.preload='metadata';v.src=activeUrl;media.replaceChildren(v);};nav.append(b)}
const zoom=document.createElement('button');zoom.textContent='Toggle video fit / 1:1 pixels';zoom.onclick=()=>media.querySelector('video')?.classList.toggle('actual');a.append(h,p,images,nav,zoom,media);content.append(a)}
</script></html>'''
output = root / 'Allied-Units-Feedback-Review.html'
with output.open('x') as f:
    f.write(html.replace('__ROWS__', json.dumps(rows)))
receipt = {'status': 'FEEDBACK_REVIEW_FINAL_USER_ACCEPTANCE_PENDING', 'html': str(output),
           'sha256': sha(output), 'sections': [{**r, 'images': [{k:v for k,v in x.items() if k!='data'} for x in r['images']],
           'clips': [{k:v for k,v in x.items() if k!='data'} for x in r['clips']]} for r in rows]}
(root / 'feedback-review-v1.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(output, output.stat().st_size)
