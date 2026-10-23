"""Embed selected family reviews and native action clips in one offline document."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('selection', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
selection = json.loads(args.selection.read_text())
assert not args.output.exists(), 'Review artifacts are immutable'
payload, receipts = [], []
for family in selection['families']:
    row = {key: family[key] for key in ('identity', 'group', 'status', 'notes')}
    row['reviews'], row['clips'] = [], []
    for role in ('reviews', 'clips'):
        for item in family.get(role, []):
            path = Path(item['path'])
            content = path.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            assert digest == item['sha256'], str(path)
            mime = 'text/html' if role == 'reviews' else 'video/webm'
            row[role].append({'label': item['label'], 'url': f'data:{mime};base64,'
                              + base64.b64encode(content).decode()})
            receipts.append({'identity': family['identity'], 'path': str(path), 'sha256': digest})
    payload.append(row)
data = json.dumps(payload).replace('<', '\\u003c')
document = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Allied units: consolidated review</title>
<style>
body{font:20px/1.5 system-ui;margin:0;background:#182922;color:#eef5ef}header,main{max-width:1280px;margin:auto;padding:28px}
h1{font-size:34px}h2{font-size:28px}button,select{font:inherit;padding:8px 12px;background:#e3ece4;color:#13251a;border:0;border-radius:5px}
nav{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}article{border-top:1px solid #708276;padding:22px 0}
iframe{display:block;width:100%;height:740px;border:1px solid #708276;margin-top:18px;background:#253830}
video{display:block;max-width:100%;max-height:800px;margin-top:18px}small{color:#bccfc0}p{max-width:1000px}
</style><header><h1>Allied units: consolidated review</h1><p>__SCOPE__</p>
<p>Native-size reviews retain the full exported buffers. Enlarged inspection is a separate control.
Authored animation previews use a fixed preview rate; native action clips record the actual game.</p>
<nav id="groups"></nav></header><main id="families"></main>
<script>
const rows=__DATA__,groups=[...new Set(rows.map(row=>row.group))];let activeUrls=[];
function show(group){
 activeUrls.forEach(url=>URL.revokeObjectURL(url));activeUrls=[];
 document.querySelector('#families').replaceChildren();
 for(const row of rows.filter(row=>row.group===group)){
  const article=document.createElement('article'),title=document.createElement('h2'),status=document.createElement('p'),notes=document.createElement('p'),nav=document.createElement('nav'),view=document.createElement('div');
  title.textContent=row.identity;status.textContent=row.status;notes.textContent=row.notes;
  for(const [role,items] of [['review',row.reviews],['clip',row.clips]])for(const item of items){
   const button=document.createElement('button');button.textContent=item.label;
   button.onclick=()=>{const media=document.createElement(role==='review'?'iframe':'video');
    const binary=atob(item.url.slice(item.url.indexOf(',')+1)),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:role==='review'?'text/html':'video/webm'}));activeUrls.push(url);media.src=url;
    if(role==='review'){media.title=row.identity+' '+item.label;media.setAttribute('sandbox','allow-scripts');}
    else{media.controls=true;media.preload='metadata';}view.replaceChildren(media);};nav.append(button);
  }
  article.append(title,status,notes,nav,view);document.querySelector('#families').append(article);
 }
}
for(const group of groups){const button=document.createElement('button');button.textContent=group;button.onclick=()=>show(group);document.querySelector('#groups').append(button);}
show(groups[0]);
</script></html>'''
document = document.replace('__SCOPE__', html.escape(selection['scope'])).replace('__DATA__', data)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(document)
args.output.with_suffix('.json').write_text(json.dumps({
    'status': 'CONSOLIDATED_REVIEW_BUILT_UI_CHECK_PENDING',
    'families': len(payload), 'embeddedInputs': receipts,
    'selectionSha256': hashlib.sha256(args.selection.read_bytes()).hexdigest(),
    'htmlSha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
}, indent=2) + '\n')
print(args.output)
