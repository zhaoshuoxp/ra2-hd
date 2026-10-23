"""Build a local screenshot review from accepted actual-match evidence."""
import json
from pathlib import Path

root = Path('.artifacts/m1-1/hd-gameplay-v1')
cases = [
    ('game-4x-pages', 'HD 4x / Yellow'), ('game-original', 'Original / Yellow'),
    ('game-4x-red', 'HD 4x / Red'), ('game-4x-blue-v3', 'HD 4x / Blue'),
    ('game-fallback-2x', 'Complete 2x fallback / Yellow'),
]
phases = [('initial', 'Standing'), ('selected-movement', 'Movement'),
          ('selected-fire', 'Firing'), ('selected-cheer', 'Cheer'),
          ('combat-prone', 'Prone combat'), ('combat-final', 'After combat'),
          ('occlusion-1', 'Behind construction yard')]
data = []
for name, label in cases:
    report = json.loads((root / name / 'result.json').read_text())
    assert report['status'] == 'PASS_BOUNDED_GAMEPLAY', name
    frames = [{'src': f'{name}/{key}.png', 'label': label, 'key': key}
              for key, label in phases if (root / name / f'{key}.png').is_file()]
    data.append({'label': label, 'frames': frames})
html = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.1 Conscript / Actual match review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#12191e;color:#e6eef2;font:18px/1.5 system-ui}
header,main{max-width:1340px;margin:auto;padding:20px 30px}h1{font-size:30px;margin:0 0 8px}
p{margin:8px 0}a{color:#9cd9ff}label{display:inline-flex;gap:10px;align-items:center;margin:8px 20px 8px 0}
select{font:inherit;color:inherit;background:#243440;border:1px solid #71828d;padding:8px;border-radius:6px;max-width:100%}
.frame{overflow:auto;background:#080d10;border:1px solid #405563}img{display:block;width:1280px;max-width:100%;height:auto}
.detail img{max-width:none;width:2560px}small{font-size:16px;color:#afc4cf}main{padding-top:0}
@media(max-width:600px){header,main{padding:16px}label{display:flex;flex-wrap:wrap}h1{font-size:25px}}
</style>
<header><h1>Conscript · Actual match review</h1>
<p>Accepted artwork in offline skirmish. Original camera, unit size, shadows and selection.</p>
<p><a href="http://127.0.0.1:4000/?conscript-hd=4" target="_blank" rel="noopener">Open local HD game</a>
 · <a href="acceptance.json">Validation record</a></p>
<label>Case <select id="case"></select></label><label>Moment <select id="phase"></select></label>
<label>View <select id="view"><option value="native">Game size / fit window</option><option value="detail">Screenshot pixels / scroll</option></select></label>
<p><small>These are actual match captures, not synchronized comparison frames. Game canvas: 1280 × 960;
 screenshot: 2560 × 1920 at screen scale 2. The game renderer remains at pixel ratio 1.
 Enlarging the screenshot does not add rendered detail.</small></p></header>
<main><p id="caption"></p><div class="frame" id="frame"><img id="shot" alt="Actual Conscript match capture"></div>
<p><small>Bounded macOS checks passed. Final user gameplay review is pending. Windows and sustained performance remain untested.</small></p></main>
<script>
const cases=__DATA__,choose=document.querySelector('#case'),phase=document.querySelector('#phase');
cases.forEach((c,i)=>choose.add(new Option(c.label,i)));
function show(){const c=cases[choose.value],f=c.frames[phase.selectedIndex];
 document.querySelector('#shot').src=f.src;document.querySelector('#caption').textContent=c.label+' · '+f.label;}
function changeCase(){const key=phase.value;phase.replaceChildren();
 cases[choose.value].frames.forEach(f=>phase.add(new Option(f.label,f.key)));
 if([...phase.options].some(o=>o.value===key))phase.value=key;show();}
choose.onchange=changeCase;phase.onchange=show;document.querySelector('#view').onchange=e=>{
 document.querySelector('#frame').classList.toggle('detail',e.target.value==='detail');};changeCase();
</script></html>'''.replace('__DATA__', json.dumps(data))
(root / 'review.html').write_text(html)
print(root / 'review.html')
