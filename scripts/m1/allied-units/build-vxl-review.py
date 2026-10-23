"""Pair authored component buffers with native captures at the same logical size."""
import argparse
import base64
import io
import json
from pathlib import Path
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('identity')
p.add_argument('worklist', type=Path)
p.add_argument('references', type=Path)
p.add_argument('review', type=Path)
a = p.parse_args()
boards = [b for b in json.loads(a.worklist.read_text())['boards'] if b['family'] == a.identity]
rows = []
for board in boards:
    for frame in board['frames']:
        authored = a.review / f"{board['id']}-{frame['heading']}.png"
        image = Image.open(authored)
        native = Image.open(a.references / frame['source']).crop(frame['sourceBounds'])
        stream = io.BytesIO()
        native.save(stream, format='PNG')
        rows.append({'part': board['id'], 'heading': frame['heading'],
                     'width': image.width / 2, 'height': image.height / 2,
                     'original': base64.b64encode(stream.getvalue()).decode(),
                     'authored': base64.b64encode(authored.read_bytes()).decode()})
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Native component review</title>
<style>body{font:20px system-ui;background:#253830;color:#eef4f0;margin:28px}select{font:inherit}main{display:flex;gap:60px;margin:32px 0}figure{margin:0}img{background:#47584d}figcaption{margin-top:12px}</style>
<h1></h1><label>Component and heading <select id="part"></select></label>
<label>Scale <select id="scale"><option value="1">Native 1x</option><option value="2">2x inspection</option></select></label>
<main><figure><img id="original"><figcaption>Original capture</figcaption></figure><figure><img id="authored"><figcaption>Authored 2x resource</figcaption></figure></main>
<p>Components are isolated here. Native pivots, assembly, animation and occlusion are checked in the game.</p>
<script>const data=__DATA__;document.querySelector('h1').textContent=__IDENTITY__+' native component review';
const part=document.querySelector('#part'),scale=document.querySelector('#scale');
data.forEach((row,i)=>part.add(new Option(row.part+' / '+row.heading+' degrees',i)));
function draw(){const row=data[Number(part.value)];for(const id of ['original','authored']){const img=document.getElementById(id);img.src='data:image/png;base64,'+row[id];img.style.width=row.width*Number(scale.value)+'px';img.style.height=row.height*Number(scale.value)+'px';}}
part.onchange=draw;scale.onchange=draw;draw();</script></html>'''
document = document.replace('__DATA__', json.dumps(rows)).replace('__IDENTITY__', json.dumps(a.identity))
out = a.review / 'Native-Component-Review.html'
with out.open('x') as file:
    file.write(document)
print(out)
