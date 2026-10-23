"""Build an offline native-size animation comparison from complete authored slots."""
import argparse
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('identity')
parser.add_argument('worklist', type=Path)
parser.add_argument('export', type=Path)
args = parser.parse_args()
work = json.loads(args.worklist.read_text())['families'][args.identity]
manifest = json.loads((args.export / 'manifest.json').read_text())
source = json.loads(Path(manifest['sourceFile']).read_text())
member = next(m for m in work['members'] if m['sourceMember'] == source['member'])
assert manifest['status'] == 'COMPLETE_AUTHORED_SLOT_EXPORT_RUNTIME_PENDING'
frames, groups = [], {}
palette = np.array(source['palette'], dtype=np.uint8)
for slot, item in zip(member['slots'], manifest['frames'], strict=True):
    n = slot['frame']
    assert n == item['frame']
    native = source['frames'][n]
    indices = np.array(native['pixels'], dtype=np.uint8).reshape(native['height'], native['width'])
    rgba = np.zeros((*indices.shape, 4), dtype=np.uint8)
    rgba[..., :3] = palette[indices, :3]
    rgba[..., 3] = (indices != 0) * 255
    canvas = Image.new('RGBA', tuple(source['canvas']))
    canvas.alpha_composite(Image.fromarray(rgba), (native['x'], native['y']))
    stream = io.BytesIO()
    canvas.save(stream, format='PNG')
    frames.append([base64.b64encode(stream.getvalue()).decode(),
                   base64.b64encode(Path(item['path']).read_bytes()).decode()])
    for use in slot['sequenceMembership']:
        key = f"{use['action']} / facing {use['facing']}"
        groups.setdefault(key, []).append((use['phase'], n))
sequences = {key: [n for _, n in sorted(values)] for key, values in groups.items()}
data = json.dumps({'identity': args.identity, 'canvas': source['canvas'], 'frames': frames, 'sequences': sequences})
html = '''<!doctype html><meta charset="utf-8"><title>Native slot animation review</title>
<style>body{font:20px system-ui;background:#253830;color:#eef4f0;margin:28px}select,button,input{font:inherit}main{display:flex;gap:60px;margin:32px 0}figure{margin:0}img{image-rendering:auto;background:#47584d}figcaption{margin-top:12px}small{display:block;margin-top:24px}</style>
<h1></h1><label>Native action <select id="action"></select></label> <button id="toggle">Pause</button>
<label>Scale <select id="scale"><option value="1">Native 1x</option><option value="2">2x inspection</option></select></label>
<main><figure><img id="original"><figcaption>Original</figcaption></figure><figure><img id="authored"><figcaption>Authored 2x resource</figcaption></figure></main>
<p id="frame"></p><small>Offline authored-slot review. Native camera, game timing, shadows and runtime bindings require in-game verification. Playback here uses a fixed preview rate.</small>
<script>const data=DATA;document.querySelector('h1').textContent=data.identity+' native slot review';
const action=document.querySelector('#action'),scale=document.querySelector('#scale');
Object.keys(data.sequences).forEach(key=>action.add(new Option(key,key)));let cursor=0,playing=true;
function draw(){const seq=data.sequences[action.value],n=seq[cursor%seq.length];['original','authored'].forEach((id,i)=>{const img=document.getElementById(id);img.src='data:image/png;base64,'+data.frames[n][i];img.width=data.canvas[0]*Number(scale.value);img.height=data.canvas[1]*Number(scale.value)});document.querySelector('#frame').textContent='Native frame '+n+' | phase '+(cursor%seq.length);}
action.onchange=()=>{cursor=0;draw()};scale.onchange=draw;document.querySelector('#toggle').onclick=event=>{playing=!playing;event.target.textContent=playing?'Pause':'Play'};draw();setInterval(()=>{if(playing){cursor++;draw()}},125);</script>'''.replace('DATA', data)
path = args.export / 'Native-Slot-Review.html'
path.write_text(html)
print(path)
