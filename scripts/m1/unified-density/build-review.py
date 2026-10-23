"""Build a self-contained review from final package evidence, without modifying images."""
import base64
import html
import json
from pathlib import Path

root = Path('.artifacts/unified-density')
cases = ['ra2-temperate', 'ra2-snow', 'yr-temperate', 'yr-snow']
reports = {key: json.loads((root / ('final-' + key) / 'report.json').read_text()) for key in cases}
pressure = json.loads((root / 'final-pressure-4k-v2/report.json').read_text())
parking = json.loads((root / 'final-aircraft-parking/report.json').read_text())
for report in [*reports.values(), pressure, parking]:
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES', report.get('failure')
    assert not report['errors']
    assert report['worldAllocation']['total'] <= report['worldAllocation']['limit']

rows = []
for key, report in reports.items():
    live = report['live']
    rows.append(f'<tr><td>{key}</td><td>{report["worldAllocation"]["total"] / 1048576:.2f} MiB</td>'
                f'<td>{live["medianFrameIntervalMs"]:.2f} ms</td><td>{live["p95FrameIntervalMs"]:.2f} ms</td><td>PASS</td></tr>')
measurements = ''.join(f'<tr><td>{m["extraMiB"]} MiB</td><td>{m["synchronizedRenderMedianMs"]:.2f} ms</td>'
                       f'<td>{m["synchronizedRenderP95Ms"]:.2f} ms</td><td>{m["glError"]}</td></tr>'
                       for m in pressure['measurements'])
panels = []
for key, names in [('yr-temperate', ['GAAIRC', 'NASAM', 'NAIRON', 'NAYARD', 'SPY', 'ADOG']),
                   ('yr-snow', ['GAAIRC', 'NAWEAP', 'GAPOWR', 'NAYARD']),
                   ('aircraft-parking', ['four-parked-aircraft'])]:
    for name in names:
        file = root / ('final-' + key) / (name + '-detail.png')
        encoded = base64.b64encode(file.read_bytes()).decode()
        panels.append(f'<figure><figcaption>{html.escape(key + " / " + name)}</figcaption>'
                      f'<img width="640" height="420" src="data:image/png;base64,{encoded}" alt="{name}"></figure>')

exceptions = {
    'Allied units': ['E1', 'GGI', 'JUMPJET', 'CLEG', 'SNIPE', 'TANY', 'GHOST', 'DLPH'],
    'Allied buildings': ['GAPILE', 'GACSPH', 'GACNST', 'GAWEAP', 'GATECH', 'GAREFN', 'GAYARD', 'GTGCAN'],
    'Soviet buildings': ['NARADR', 'NADEPT', 'NATECH', 'NANRCT', 'NACLON', 'NAPSIS', 'NAMISL', 'NAWALL'],
}
exception_rows = ''.join(f'<tr><td>{group}</td><td>{", ".join(names)}</td></tr>' for group, names in exceptions.items())
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>RA2 HD — 4x density review</title>
<style>body{{background:#18201d;color:#eef2ef;font:18px/1.5 system-ui;margin:32px auto;max-width:1380px;padding:0 24px}}
h1{{font-size:34px}}h2{{font-size:26px;margin-top:32px}}table{{border-collapse:collapse;width:100%}}td,th{{text-align:left;border-bottom:1px solid #536359;padding:10px}}
.gallery{{display:flex;flex-wrap:wrap;gap:24px}}figure{{margin:0}}figcaption{{padding:10px 0}}img{{display:block;max-width:100%;height:auto}}code{{font-size:16px}}</style>
<h1>Allied and Soviet 4x atlas density</h1>
<p>Technical checks passed on Apple M2 / 24 GB unified memory. Visual review remains open. Genuine master re-exports preserve native geometry and accepted artwork corrections. No 2x artwork is simply enlarged to claim new detail.</p>
<h2>Final package: 4K live checks</h2><p>Bounded legal fixtures; frame intervals include display scheduling. These are not unrestricted battle benchmarks.</p>
<table><tr><th>Case</th><th>HD allocation</th><th>Median interval</th><th>95th percentile</th><th>Result</th></tr>{''.join(rows)}</table>
<h2>Expanded pressure check</h2><p>{pressure['fixture']['units']} units and {pressure['fixture']['buildings']} buildings. Actual HD allocation: {pressure['worldAllocation']['total']/1048576:.2f} MiB; shared limit: 768 MiB. Additional storage below is a residency probe. Times include paused rendering plus GPU completion, not live FPS or GPU-only time.</p>
<table><tr><th>Extra texture storage</th><th>Median render</th><th>95th percentile</th><th>GL errors</th></tr>{measurements}</table>
<h2>Complete 2x exceptions</h2><p>At least one required master lacks genuine 4x sampling. GTGCAN is limited by its 315-degree turret master. Each entire accepted family remains unchanged.</p>
<table><tr><th>Group</th><th>Families</th></tr>{exception_rows}</table>
<p>Existing Original exceptions SQD/SQDG and guarded YURIPR remain. CARRIER retains its previously accepted 4x artwork, including modest enlargement in some headings; this work claims no newly recovered detail there. Windows was not run.</p>
<h2>Direct 4K runtime crops</h2><p>640 × 420 output-pixel crops, displayed at their captured size on a wide screen. No enlargement, sharpening, or image edits. The aircraft image follows four native landings at the 4x airfield.</p>
<div class="gallery">{''.join(panels)}</div>
<h2>Soviet shadow check</h2><p>The accepted shared fix already covers Soviet vehicles. Forty-eight instances from six Soviet families had explicitly disabled ground-only legacy masks. A same-frame HARV probe matched forced mask removal exactly and reproduced the legacy defect when that mask was restored.</p>
</html>'''
(root / 'Unified-4X-Review.html').write_text(page)
summary = {'status': 'PASS_BOUNDED_TECHNICAL_CHECKS_VISUAL_REVIEW_PENDING', 'cases': {
    k: {'allocation': r['worldAllocation'], 'live': r['live']} for k, r in reports.items()},
    'pressure': {'allocation': pressure['worldAllocation'], 'measurements': pressure['measurements']},
    'exceptions2x': exceptions, 'parking': parking['status'], 'windows': 'NOT_RUN'}
(root / 'final-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(root / 'Unified-4X-Review.html')
