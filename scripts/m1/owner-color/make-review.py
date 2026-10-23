"""Build one offline review with embedded native screenshots and recordings."""
import base64
import html
import json
from pathlib import Path

root = Path('.artifacts/owner-remap-r1')
receipt = json.loads((root / 'package-final/package-receipt.json').read_text())
folder = Path(receipt['folder'])
world = root / 'runtime-final-yr'
inf = root / 'infantry-final-yr'
ra2 = root / 'infantry-final-ra2'
media = []


def encoded(file, mime):
    assert file.is_file(), file
    media.append(str(file))
    return f'data:{mime};base64,' + base64.b64encode(file.read_bytes()).decode()


def picture(directory, name, caption, group=None):
    file = directory / (name + '-detail.png')
    attrs = f' data-group="{html.escape(group)}"' if group else ''
    return f'<figure{attrs}><img loading="lazy" src="{encoded(file, "image/png")}" alt="{html.escape(caption)}"><figcaption>{html.escape(caption)}</figcaption></figure>'


def video(directory, name, caption):
    file = directory / (name + '.webm')
    return f'<figure><video controls muted loop preload="metadata" src="{encoded(file, "video/webm")}"></video><figcaption>{html.escape(caption)}</figcaption></figure>'


parts = ['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Owner color and rotor correction review</title><style>
body{margin:0;background:#17202b;color:#edf2f7;font:18px/1.5 system-ui,sans-serif}main{max-width:1540px;margin:auto;padding:32px}
h1{font-size:36px}h2{font-size:28px;margin-top:44px}p{max-width:1120px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:20px}
figure{margin:0;padding:14px;background:#253243;border-radius:8px}img,video{display:block;max-width:100%;height:auto;margin:auto}figcaption{padding:12px 0 2px}
select,button{font:inherit;padding:7px;background:#33475e;color:white;border:1px solid #64829f;border-radius:4px}label{margin-right:16px}table{border-collapse:collapse}th,td{text-align:left;padding:10px 18px;border-bottom:1px solid #536275}.hidden{display:none}.note{color:#bccadb}
</style><main><h1>Owner color and helicopter correction</h1>
<p>Native captures from the final signed macOS package, runtime commit <code>49b7a7b</code>. Buildings and units use blue and green owners. Accepted base artwork, geometry and shadow rendering remain unchanged.</p>
<p class="note">The complete selected 2x/4x inventory was scanned: 371 manifests and 23,831 frame entries. Native verification focuses on reported problems. Headings and the exact Tanya frame are controlled review poses; rotor motion, health damage and death clips use native game behavior. This does not repeat prior full acceptance.</p>
<h2>Super Weapons OFF</h2><table><tr><th>Faction</th><th>Battle lab</th><th>Advanced unit</th><th>Main powers</th></tr><tr><td>Allied</td><td>Available</td><td>Prism tank available</td><td>Chronosphere / Weather Storm unavailable</td></tr><tr><td>Soviet</td><td>Available</td><td>Apocalypse available</td><td>Iron Curtain / Nuclear Missile unavailable</td></tr></table>
<p>Both native edition runs pass. Retail production closure checks cover all 19 country/edition pairs, including Yuri. Normal prerequisites and auxiliary powers remain intact.</p>
<h2>Buildings: normal and damaged</h2><p>Blue and green owner panels; damaged concrete, rust, flames and lamps retain their material colors.</p><div class="grid">''']
for name in ['GAGAP','ATESLA','NAWEAP','NANRCT']:
    for state in ['normal','damaged']:
        for color in ['blue','green']:
            parts.append(picture(world,f'{name}-{state}-{color}',f'{name} / {state} / {color}'))
parts.append('''</div><h2>Vehicle and naval bearings</h2><p>Select a unit to inspect all eight blue bearings and its green owner view.</p><label>Unit <select id="unit">''')
for name in ['DEST','AEGIS','CARRIER','APOC','SCHP','DRED','SHAD']:
    parts.append(f'<option>{name}</option>')
parts.append('</select></label><div class="grid" id="bearings">')
for name in ['DEST','AEGIS','CARRIER','APOC','SCHP','DRED','SHAD']:
    for bearing in [0,45,90,135,180,225,270,315]:
        parts.append(picture(world,f'{name}-blue-{bearing}',f'{name} / blue / native direction {bearing}',name))
    parts.append(picture(world,f'{name}-green',f'{name} / green',name))
parts.append('''</div><h2>Helicopter motion</h2><p>Native move orders: both main and tail rotor joints spin on SHAD and the Soviet SCHP control. The recordings retain the original 3840 x 2160 drawing buffer.</p><div class="grid">''')
for name in ['SHAD','SCHP']:
    parts.append(video(world,f'{name}-native-rotors',f'{name} / native flight and spinning joints'))
parts.append('''</div><h2>Infantry death materials</h2><p>The exact Tanya frame below confirms blue clothing with unchanged skin and brown hair. The native clips show the unchanged death controllers; use slow playback to inspect the falling frames.</p><label>Clip speed <select id="speed"><option value="1">1x</option><option value=".25">0.25x</option></select></label><div class="grid" id="deaths">''')
parts.append(picture(inf,'TANY-controlled-death-frame153','YR / 4x / Tanya frame 153 / blue owner'))
parts.append(picture(ra2,'TANY-controlled-death-frame153','RA2 / 2x / snow / Tanya frame 153 / blue owner'))
for name in ['E1','GGI','TANY','E2']:
    parts.append(video(inf,f'{name}-native-death',f'{name} / native death animation / blue owner'))
parts.append('''</div><h2>Validation boundary</h2><p>Source hashes, mask/shade channels and native geometry are checked across the full selected inventory; fixed red materials are classified separately. Original SQD/YURIPR exceptions remain as previously accepted. The native runs report no JavaScript errors, WebGL errors or lost context. Prior gameplay/platform acceptance is preserved, and this correction awaits user testing.</p>
<script>
const unit=document.querySelector('#unit');function show(){document.querySelectorAll('#bearings figure').forEach(f=>f.classList.toggle('hidden',f.dataset.group!==unit.value))}unit.addEventListener('change',show);show();
document.querySelector('#speed').addEventListener('change',e=>document.querySelectorAll('#deaths video').forEach(v=>v.playbackRate=Number(e.target.value)));
</script></main></html>''')
review = folder / 'OWNER-COLOR-ROTOR-REVIEW.html'
with review.open('x') as f:
    f.write(''.join(parts))
(root / 'review-media.json').write_text(json.dumps({'review':str(review),'media':media,'count':len(media)},indent=2)+'\n')
print(json.dumps({'review':str(review),'bytes':review.stat().st_size,'embeddedMedia':len(media)}))
