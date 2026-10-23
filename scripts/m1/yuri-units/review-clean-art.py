"""Build an offline style gate without installing or replacing accepted assets."""
import base64
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from authored_slots import isolated_cells

ROOT = Path.cwd()
OUT = ROOT / '.artifacts/yuri-units/feedback-r2/art-samples'
FAMILIES = {'MIND': 'mind', 'LTNK': 'ltnk', 'YTNK': 'ytnk'}
p = argparse.ArgumentParser()
p.add_argument('--revision', type=int, default=1)
a = p.parse_args()


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def uri(file):
    return 'data:image/png;base64,' + base64.b64encode(file.read_bytes()).decode()


entries = []
for name, member in FAMILIES.items():
    master = ROOT / f'.artifacts/yuri-units/vxl-production-v1/masters/{name}-{member}-DUMMY01'
    selection = json.loads((master / 'selection.json').read_text())
    accepted, candidate = master / 'authored-v1.png', OUT / f'{name}-clean-v1.png'
    assert digest(accepted) == selection['selectedArtSha256']
    cells = {label: isolated_cells(Image.open(file), 4, 2, occupied=8)
             for label, file in [('Accepted', accepted), ('Clean sample', candidate)]}
    frames = []
    for frame, index in zip(selection['frames'], selection.get('authoredCellOrder', range(8)), strict=True):
        sx, sy, ex, ey = frame['sourceBounds']
        logical = [round((ex - sx) / frame['ratio'] * 2) / 2, round((ey - sy) / frame['ratio'] * 2) / 2]
        views = {}
        for label, subjects in cells.items():
            subject, bounds = subjects[index]
            size = [round(value * 4) for value in logical]
            scale = min(size[0] / subject.width, size[1] / subject.height)
            resized = subject.convert('RGBa').resize((round(subject.width * scale), round(subject.height * scale)),
                                                     Image.Resampling.LANCZOS).convert('RGBA')
            sprite = Image.new('RGBA', size)
            sprite.alpha_composite(resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2))
            file = OUT / f'{name}-{frame["heading"]}-{label.split()[0].lower()}-v{a.revision}.png'
            sprite.save(file)
            views[label] = uri(file)
        frames.append({'heading': frame['heading'], 'logical': logical, 'views': views})
    entries.append({'name': name, 'scope': 'Complete vehicle' if name == 'MIND' else 'Chassis only; turret and barrel are separate accepted components',
                    'accepted': str(accepted), 'acceptedSha256': digest(accepted), 'sample': str(candidate),
                    'sampleSha256': digest(candidate), 'promptSha256': digest(OUT / f'{name}-prompt.txt'),
                    'frames': frames, 'sheets': {'Accepted': uri(accepted), 'Clean sample': uri(candidate)}})

html = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Yuri clean mother-art style review</title>
<style>body{font:18px system-ui;background:#171d20;color:#eee;margin:32px}h1{font-size:32px}h2{font-size:25px}
button{font:inherit;padding:10px 16px;margin:8px}section{margin:32px 0;border-top:1px solid #617077}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}
figure{margin:0;background:#47594d;padding:18px;min-height:140px}figcaption{color:#fff;font-size:17px}.pair{display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-around;min-height:120px}.view{text-align:center}.view span{display:block;font-size:16px;margin:10px 0}.pair img{flex-shrink:0}.detail .grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,620px),1fr))}.sheets{display:flex;gap:20px}.sheets img{width:48%;object-fit:contain}small{display:block;margin-top:15px;color:#bfccd2}</style>
<h1>Cleaner Yuri vehicle mother-art samples</h1><p>Style review pending. Accepted game resources are preserved. These samples are not installed.</p>
<p>Compare reduced wear, smoother seams and clearer panels at the same registered logical size. Sample extraction uses the existing 4x export fit; no camera or game geometry is changed.</p>
<button id="scale">Switch to 4x detail</button><main id="content"></main><script>
const entries=__ENTRIES__;let detail=false;function draw(){content.replaceChildren();for(const e of entries){const s=document.createElement('section');
const h=document.createElement('h2');h.textContent=e.name+' — '+e.scope;s.append(h);const g=document.createElement('div');g.className='grid';
for(const f of e.frames){const fig=document.createElement('figure'),cap=document.createElement('figcaption');cap.textContent=f.heading+'° / Accepted → Clean sample';fig.append(cap);const p=document.createElement('div');p.className='pair';
for(const [label,src] of Object.entries(f.views)){const im=new Image(),view=document.createElement('div'),caption=document.createElement('span');view.className='view';caption.textContent=label;im.src=src;im.alt=e.name+' '+f.heading+' '+label;im.style.width=f.logical[0]*(detail?4:1)+'px';im.style.height=f.logical[1]*(detail?4:1)+'px';view.append(caption,im);p.append(view)}fig.append(p);g.append(fig)}s.append(g);
const sheet=document.createElement('details'),sum=document.createElement('summary');sum.textContent='Full accepted and sample mother sheets';sheet.append(sum);const row=document.createElement('div');row.className='sheets';for(const [label,src] of Object.entries(e.sheets)){const im=new Image();im.src=src;im.alt=label;row.append(im)}sheet.append(row);s.append(sheet);content.append(s)}}
scale.onclick=()=>{detail=!detail;document.body.classList.toggle('detail',detail);scale.textContent=detail?'Switch to logical size':'Switch to 4x detail';draw()};draw();</script></html>'''
output = OUT / f'Yuri-Clean-Art-Review-v{a.revision}.html'
assert not output.exists(), 'Preserve prior style reviews'
output.write_text(html.replace('__ENTRIES__', json.dumps(entries)), encoding='utf-8')
receipt = {'status': 'STYLE_REVIEW_PENDING', 'activation': 'NOT_INSTALLED', 'review': str(output),
           'reviewSha256': digest(output), 'families': [{k: v for k, v in entry.items() if k not in ['sheets', 'frames']} for entry in entries]}
receipt_file = OUT / ('receipt.json' if a.revision == 1 else f'receipt-v{a.revision}.json')
assert not receipt_file.exists(), 'Preserve prior style receipts'
receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'review': str(output), 'status': receipt['status']}))
