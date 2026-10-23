"""Build a self-contained review of regenerated masters and actual runtime evidence."""
import base64
import json
from pathlib import Path
from PIL import Image

root = Path('.artifacts/4x-regeneration')
read = lambda path: json.loads(Path(path).read_text())
uri = lambda path: 'data:image/png;base64,' + base64.b64encode(Path(path).read_bytes()).decode()
audit = read(root / 'resource-audit-v1.json')
assert audit['status'] == 'PASS_NATIVE_CONTRACT_AND_2X_BYTES'
cases = ['runtime-yr-dry-4x-v1', 'runtime-ra2-dry-4x-v1', 'runtime-yr-snow-changed-4x-v2',
         'runtime-ra2-snow-changed-4x-v1', 'runtime-yr-changed-2x-v1', 'runtime-yr-changed-4x-v1']
reports = {name: read(root / name / 'report.json') for name in cases}
for name, report in reports.items():
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES', (name, report.get('failure'))
    assert not report['errors'] and not report['lowerDensityFamilies']
    assert report['worldAllocation']['total'] <= report['worldAllocation']['limit']

data = []
for row in read(root / 'comparison-index-v1.json'):
    panels = []
    for panel in row['panels']:
        high = Path(panel['fourX'])
        low = high.with_name(high.name.replace('-4x.png', '-2x.png'))
        panels.append({'frame': panel['frame'], 'low': uri(low), 'high': uri(high), 'size': Image.open(low).size})
    data.append({**row, 'panels': panels})
metrics = ''.join(f'<tr><td>{name.removeprefix("runtime-")}</td><td>{r["worldAllocation"]["total"]/2**20:.2f} MiB</td>'
                  f'<td>{r["worldAllocation"]["limit"]/2**20:.0f} MiB</td>'
                  f'<td>{r["live"]["p95FrameIntervalMs"]:.2f} ms</td><td>PASS</td></tr>' for name, r in reports.items())
pressure = reports['runtime-yr-dry-4x-v1']['pressure']
pressure_rows = ''.join(f'<tr><td>{p["extraMiB"]} MiB</td><td>{p["synchronizedRenderMedianMs"]:.2f} ms</td>'
                        f'<td>{p["synchronizedRenderP95Ms"]:.2f} ms</td><td>{p["glError"]}</td>'
                        f'<td>{p["contextLost"]}</td></tr>' for p in pressure)
screens = []
for folder, names in [('runtime-yr-dry-4x-v1', ['E1-deployed', 'GGI-deployed', 'TANY', 'DLPH', 'GAPILE', 'NARADR', 'NADEPT', 'NANRCT', 'NAMISL']),
                      ('runtime-yr-snow-changed-4x-v2', ['GGI-deployed', 'TANY', 'GAPILE', 'GAYARD']),
                      ('runtime-ra2-dry-4x-v1', ['NAPSIS']),
                      ('runtime-yr-changed-2x-v1', ['GGI-deployed', 'TANY'])]:
    for name in names:
        path = root / folder / (name + '-detail.png')
        screens.append(f'<figure><figcaption>{folder.removeprefix("runtime-")} / {name}</figcaption>'
                      f'<img src="{uri(path)}" width="640" height="420" alt="{name} direct output crop"></figure>')
full = uri(root / 'runtime-yr-dry-4x-v1/GACSPH.png')
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>True 4x regeneration review</title>
<style>body{font:18px/1.5 system-ui;background:#1c2822;color:#f2f4ef;max-width:1600px;margin:28px auto;padding:0 24px}
h1{font-size:36px}h2{font-size:28px}button,select{font:inherit;padding:8px;background:#e9f1eb;color:#12251b;border:0;border-radius:5px}
label{display:inline-block;margin:8px 16px 8px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:9px;border-bottom:1px solid #52665a}
.pair,.gallery{display:flex;gap:20px;flex-wrap:wrap}figure{margin:12px 0}figcaption{padding:6px}img{display:block;max-width:100%;height:auto}
.scroll{overflow:auto}.pair img{max-width:none}.notice{padding:16px;background:#30483b}a{color:#bce1d1}</style>
<h1>True 4x regeneration: accepted 2x appearance retained</h1>
<p class="notice">Technical checks passed; final human visual acceptance remains pending. All 24 previous density exceptions now have authored 4x resources. Accepted 2x atlas files are byte identical. These are new detailed masters and full-resolution re-exports, not enlarged 2x RGB.</p>
<p>Eight Allied SHP families, eight Allied buildings and eight Soviet buildings; both theaters for buildings. 140 member manifests / 5,895 native slots. GI/GGI deployment size, bulky GGI, Tanya's ponytail and pale appearance, dolphin axis, mechanical animation and all accepted shadow/filtering fixes are retained. SQD/SQDG and guarded YURIPR remain their accepted Original exceptions.</p>
<h2>Native-coordinate atlas comparison</h2><p>Select any member and sampled native frame. The 2x and 4x images use the same native canvas, origin, frame order and geometry. This atlas viewer is separate from in-game rendering. At common 4x size, only the accepted 2x preview is enlarged for comparison; its saved atlas is unchanged. Water rings can gain continuous coverage and small material details may differ after regeneration; assess pose and identity here.</p>
<label>Member <select id="member"></select></label><label>Native frame <select id="frame"></select></label>
<label>Display <select id="scale"><option value="1">Common 2x canvas</option><option value="2">Common 4x canvas</option><option value="native">Actual saved pixel sizes</option></select></label>
<div class="scroll"><div class="pair"><figure><figcaption>Accepted 2x</figcaption><img id="low" alt="Accepted 2x native canvas"></figure><figure><figcaption>Authored 4x</figcaption><img id="high" alt="Authored 4x native canvas"></figure></div></div>
<h2>Actual isolated package / Apple M2, 24 GB</h2><p>3840×2160 output; controlled legal mixed-roster fixtures with unchanged rules and camera. Accounted HD texture storage is not a physical VRAM reading. Live p95 includes display scheduling. The matched changed-family pair provides a fair memory comparison; full-roster cases additionally cover accepted Soviet and Allied resources. The 2x option retains its 256 MiB cap; default 4x uses 1,280 MiB. Windows and other GPU configurations were not tested.</p>
<table><tr><th>Case</th><th>Accounted HD storage</th><th>Cap</th><th>Live p95 interval</th><th>Status</th></tr>METRICS</table>
<h2>Full 4x scene plus extra texture residency</h2><p>GPU completion is synchronized after each paused render. These measurements are not GPU-only times or a sustained battle FPS benchmark. The complete roster remained at 4x without allocation fallback. No GL errors or context loss occurred after adding 512 MiB of texture storage.</p>
<table><tr><th>Extra storage</th><th>Median render</th><th>p95 render</th><th>GL error</th><th>Context lost</th></tr>PRESSURE</table>
<h2>Direct game output crops</h2><p>640×420 output pixels, without enlargement, sharpening or image edits. Crops emphasize local detail and may omit part of a large building. Full-frame capture below confirms the complete Chronosphere foundation.</p><div class="gallery">SCREENS</div>
<details><summary>Full native 4K Chronosphere capture</summary><img src="FULL" alt="Complete in-game Chronosphere frame"></details>
<p>Incremental checks cover actual density bindings, native construction frames, GI/GGI deployment, one-texel minimum filtering and disabled invisible ground shadow masks. Prior complete acceptance was reused. Early failed budget and empty-frame diagnostics are retained separately and are not acceptance evidence. Continue review and fixes in the current execution conversation.</p>
<script>const rows=DATA;const member=document.querySelector('#member'),frame=document.querySelector('#frame'),scale=document.querySelector('#scale');
rows.forEach((r,i)=>{const o=new Option(r.pack+' / '+r.member,i);member.add(o)});
function render(){const p=rows[member.value].panels[frame.value],n=scale.value;for(const id of ['low','high']){const img=document.querySelector('#'+id);img.src=p[id];img.style.width=(p.size[0]*(n==='native'?(id==='high'?2:1):Number(n)))+'px';img.style.height='auto'}}
function select(){frame.replaceChildren();rows[member.value].panels.forEach((p,i)=>frame.add(new Option(p.frame,i)));render()}
member.onchange=select;frame.onchange=render;scale.onchange=render;select();</script></html>'''
# Delimit placeholders before insertion; percent signs cannot occur in base64 PNG data.
values = {'METRICS': metrics, 'PRESSURE': pressure_rows, 'SCREENS': ''.join(screens),
          'FULL': full, 'DATA': json.dumps(data, separators=(',', ':'))}
for key in values:
    html = html.replace(key, '%%' + key + '%%')
for key, value in values.items():
    html = html.replace('%%' + key + '%%', value)
(root / 'True-4X-Regeneration-Review.html').write_text(html)
summary = {'status': 'PASS_BOUNDED_TECHNICAL_CHECKS_VISUAL_REVIEW_PENDING', 'familiesRegenerated': 24,
           'memberManifests': len(audit['manifests']), 'nativeSlots': sum(r['frames'] for r in audit['manifests']),
           'accepted2xBytes': 'PRESERVED', 'cases': {name: {key: r[key] for key in ['worldAllocation', 'live', 'gpu', 'options']}
                                                 for name, r in reports.items()},
           'pressure': pressure, 'windows': 'NOT_RUN', 'artAcceptance': 'PENDING_USER_REVIEW'}
(root / 'regeneration-summary-v1.json').write_text(json.dumps(summary, indent=2) + '\n')
print(root / 'True-4X-Regeneration-Review.html')
