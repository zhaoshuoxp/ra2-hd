"""Add portable native-size range-marker captures to the combined R3 review."""
import json
import shutil
from pathlib import Path

root=Path('.artifacts/soviet-remaining')
source=root/'runtime-ranges-r3-verified/ranges'
out=root/'complete-review-r3'; media=out/'ranges';media.mkdir(parents=True,exist_ok=True)
report=json.loads((source/'result.json').read_text());assert report['status']=='PASS_NATIVE_RANGE_MARKERS'
for p in source.iterdir():shutil.copyfile(p,media/p.name)
names={'TESLA':'Tesla Coil placement','NALASR':'Sentry Gun placement','NukeSpecial':'Nuclear missile targeting','IronCurtainSpecial':'Iron Curtain targeting'}
notes={'TESLA':'Native attack range: 7 tiles.','NALASR':'Native attack range: 5.5 tiles.','NukeSpecial':'Detonating payload radius: 10 tiles.','IronCurtainSpecial':'The green footprint is the exact nine-tile effect area. The surrounding circle is an aiming guide.'}
rows=[]
for name,label in names.items():
 samples=[s for s in report['samples'] if s['name']==name]
 views=''.join(f'<figure><figcaption>{s["mode"]} sampling · unchanged display size</figcaption><img src="ranges/{s["file"]}" style="width:{s["logical"][0]}px;height:{s["logical"][1]}px" alt="{label}, {s["mode"]}"></figure>' for s in samples)
 rows.append(f'<section><h2>{label}</h2><p>{notes[name]}</p><div class="views">{views}</div></section>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>R3 Range Marker Review</title><style>body{background:#152019;color:#e8efe9;font:18px/1.5 system-ui;margin:28px auto;max-width:1180px;padding:0 24px}h1{font-size:32px}h2{font-size:25px}a{color:#b6e4c6}.views{overflow:auto;display:flex;gap:24px}figure{margin:0;flex:none}img{display:block;max-width:none}section{padding:20px;border:1px solid #46624e;margin:24px 0}figcaption{margin:10px 0}button{font:inherit;padding:10px;background:#263b2e;color:inherit;border:1px solid #739780}.fit .views{display:block}.fit figure{margin-bottom:20px}.fit img{max-width:100%;height:auto!important}</style>
<h1>Range markers</h1><p><a href="Soviet-Buildings-Review.html">Building animation review</a> · <a href="Validation-Dashboard.html">Validation dashboard</a></p>
<p>Actual R3 Mac app captures at native logical size. Scroll each panel to compare output presets, or fit the images to this page. Target movement, leaving the map and cancellation were checked separately. These interface captures do not launch a weapon.</p>
<button onclick="document.body.classList.toggle('fit');this.textContent=document.body.classList.contains('fit')?'Show native size':'Fit to page'">Fit to page</button>'''+''.join(rows)+'</html>'
(out/'Range-Markers-Review.html').write_text(page)
p=out/'Soviet-Buildings-Review.html';s=p.read_text().replace('<a href="Validation-Dashboard.html">Validation dashboard</a>', '<a href="Range-Markers-Review.html">Range markers</a><a href="Validation-Dashboard.html">Validation dashboard</a>');p.write_text(s)
print('Eight range captures added')
