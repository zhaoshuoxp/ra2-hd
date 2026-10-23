"""Create a self-contained review from the selected density/clarity evidence."""
import base64
import json
from pathlib import Path

root = Path('.artifacts/unified-density')
cases = {
    'YR temperate / 2x': 'options-runtime-2x-v4',
    'YR temperate / 4x': 'options-runtime-4x-v2',
    'YR snow / 2x': 'options-runtime-2x-v3',
    'RA2 snow / 2x': 'options-runtime-ra2-2x-v1',
    'RA2 temperate / 4x': 'options-runtime-ra2-4x-v1',
}
reports = {name: json.loads((root / folder / 'report.json').read_text()) for name, folder in cases.items()}
for report in reports.values():
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES', report.get('failure')
    assert not report['errors']
    assert report['worldAllocation']['total'] <= report['worldAllocation']['limit']
    for row in report['audit']:
        if row.get('vxlPages'):
            assert row['vxlActive']
            assert all(p['nearest'] and not p['mipmaps'] for p in row['vxlPages'])
            assert all(v == 1 for v in row['coverage'])
            assert not any(row['shadowMasks'])
        elif row.get('coverage') is not None:
            assert row['coverage'] == 1

low = {r['name']: r for r in reports['RA2 snow / 2x']['audit'] if r.get('vxlPages')}
high = {r['name']: r for r in reports['RA2 temperate / 4x']['audit'] if r.get('vxlPages')}
geometry = []
for name in low.keys() & high.keys():
    for a, b in zip(low[name]['vxlPages'], high[name]['vxlPages'], strict=True):
        assert a['logicalSize'] == b['logicalSize'] and a['offset'] == b['offset'], name
        assert a['frame'] == [v / 2 for v in b['frame']], name
        assert a['pageSize'] == [v / 2 for v in b['pageSize']], name
    assert low[name]['source']['gpuBytes'] < high[name]['source']['gpuBytes'], name
    geometry.append(name)
assert len(geometry) >= 15
assert reports['RA2 snow / 2x']['preferenceChangeDeferred']
assert all(size == [160, 144] for size in reports['RA2 snow / 2x']['special']['rhinoPages'])
assert all(size == [320, 288] for size in reports['RA2 temperate / 4x']['special']['rhinoPages'])

rows = []
for name, report in reports.items():
    live = report.get('live', {})
    interval = f'{live["p95FrameIntervalMs"]:.2f} ms' if live else 'Not sampled'
    rows.append(f'<tr><td>{name}</td><td>{report["worldAllocation"]["total"]/1048576:.2f} MiB</td>'
                f'<td>{report["worldAllocation"]["limit"]/1048576:.0f} MiB</td>'
                f'<td>{interval}</td><td>PASS</td></tr>')

def image(folder, file, width, height):
    encoded = base64.b64encode((root / folder / file).read_bytes()).decode()
    return f'<img width="{width}" height="{height}" src="data:image/png;base64,{encoded}" alt="{file}">'

panels = []
for name in ['APOC', 'HARV', 'HYD', 'ZEP', 'E2']:
    report = reports['YR temperate / 4x']
    pair = [p for p in report['comparisons'] if p['name'] == name]
    assert len(pair) == 2 and pair[0]['tick'] == pair[1]['tick'] and pair[0]['buffer'] == pair[1]['buffer'] == [3840, 2160]
    panels.append(f'<h3>{name} / same simulation tick {pair[0]["tick"]}</h3><div class="pair">'
                  f'<figure><figcaption>Previous expanded footprint / 4x</figcaption>{image(cases["YR temperate / 4x"], name + "-legacy-expanded.png", 420, 300)}</figure>'
                  f'<figure><figcaption>Actual screen footprint / 4x</figcaption>{image(cases["YR temperate / 4x"], name + "-actual-footprint.png", 420, 300)}</figure>'
                  f'<figure><figcaption>Actual screen footprint / 2x, separate run</figcaption>{image(cases["YR temperate / 2x"], name + "-actual-footprint.png", 420, 300)}</figure></div>')

options = image(cases['YR temperate / 4x'], 'options-4x.png', 1920, 1080)
buildings = ''.join(f'<figure><figcaption>{name} / 4x</figcaption>{image(cases["RA2 temperate / 4x"], name + "-detail.png", 640, 420)}</figure>'
                    for name in ['GAAIRC', 'NASAM', 'NALASR', 'NAYARD'])
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>RA2 HD density options and Soviet clarity</title>
<style>body{{font:18px/1.5 system-ui;background:#18201d;color:#eef2ef;max-width:1400px;margin:30px auto;padding:0 24px}}
h1{{font-size:34px}}h2{{font-size:28px}}h3{{font-size:22px}}table{{border-collapse:collapse;width:100%}}
th,td{{padding:10px;text-align:left;border-bottom:1px solid #526358}}.pair,.gallery{{display:flex;flex-wrap:wrap;gap:20px}}
figure{{margin:0}}figcaption{{padding:8px 0}}img{{display:block;max-width:100%;height:auto}}</style>
<h1>2x / 4x options and Soviet filtering audit</h1>
<p>Bounded technical validation passed on Apple M2 / 24 GB unified memory. Final visual review remains pending. Existing accepted artwork and shadow fixes are preserved.</p>
<h2>Saved game option</h2><p>Options → HD atlas detail. Default: 4x. Older preferences migrate to 4x. A selected 2x value survives reload. Changes during a match apply next match; new demand loads retain the current match's captured density and budget.</p>{options}
<p>2x prefers accepted native 2x variants; 4x-only resources are validated and reduced before pooling or upload. No 2x resource is enlarged to claim 4x detail. The 24 complete-family 2x exceptions from the previous review remain unchanged. Output resolution and native world geometry stay independent.</p>
<h2>Actual accounted HD texture storage</h2><p>Exact packaged app, isolated profiles, controlled legal fixtures at native 4K output. Counts are texture allocation accounting, not physical VRAM counters. Live intervals include display scheduling and are not GPU-only timings. The matched YR temperate roster drops from 519.79 to 188.39 MiB (63.8%). Windows: NOT_RUN.</p>
<table><tr><th>Case</th><th>Allocation</th><th>Shared cap</th><th>Live p95 interval</th><th>Result</th></tr>{''.join(rows)}</table>
<h2>Complete Soviet path audit</h2><p>The shared VXL renderer previously imposed a roughly four-texel edge footprint on Soviet vehicles and their child/rotor parts. Conscript HD had the equivalent native-pixel-width floor. Both now use a one-texel minimum with screen derivatives determining normal antialiasing. Other Soviet SHP units, Rhino, and building turrets already used this setting. Nearest textures and disabled mipmaps are retained.</p>
<p>The YR roster covers all 28 accepted Soviet roots, including E2 and HTNK, plus preserved RA2 YURI artwork and Allied controls. SQD/SQDG stays user-selected Original; RA2 YURIPR stays guarded Original; APACHE is an orphan registry entry. All rendered HD VXL layers have minimum footprint 1 and explicitly disabled legacy ground shadow masks. Fifteen shared VXL families, including Allied aircraft/naval representatives, verify identical logical sizes and offsets across 2x/4x. Rhino uploads 160×144 at 2x and 320×288 at 4x; NASAM/NALASR turrets upload 160×180 versus 320×360.</p>
<h2>Direct same-frame filtering comparisons</h2><p>Each old/new 4x pair is captured at the same tick and 3840×2160 drawing buffer. Only footprint uniforms change; artwork, geometry and the simulation tick are fixed. Crops are 420×300 output pixels, with no enlargement, sharpening, or image edits. The 2x column comes from a separate run and is not a same-tick comparison. Neighboring units keep the corrected production setting.</p>{''.join(panels)}
<h2>Building and turret crops</h2><div class="gallery">{buildings}</div>
<p>Failed fixture diagnostics are retained separately. They concerned object-type setup and the expected Original squid status; none is presented as passing evidence. Previous full acceptance tasks were not replayed.</p></html>'''
(root / 'Density-Options-Soviet-Clarity-Review.html').write_text(page)
summary = {'status': 'PASS_BOUNDED_TECHNICAL_CHECKS_VISUAL_REVIEW_PENDING',
           'cases': {name: {'path': cases[name], 'allocation': r['worldAllocation'], 'options': r['options'], 'live': r.get('live')}
                     for name, r in reports.items()},
           'geometryInvariantFamilies': sorted(geometry), 'windows': 'NOT_RUN', 'artworkChanges': False}
(root / 'options-final-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(root / 'Density-Options-Soviet-Clarity-Review.html')
