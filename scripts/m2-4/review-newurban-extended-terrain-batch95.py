"""Create a self-contained, native-scale review of reused terrain in its new context."""
import base64
import hashlib
import html
import re
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
from newurban_batch95_io import ROOT, pin, read, write

export = read(ROOT / 'export-and-preservation-v4.json')
reports = {d: read(ROOT / f'native-{d}x-v1/report.json') for d in [2, 4]}
assert all(r['status'] == 'PASS_SELECTED_NATIVE_CASES' and not r['errors'] for r in reports.values())
assert all(len(r['sourcePaths']) == 36 for r in reports.values())
folder = ROOT / 'review-v3'
folder.mkdir(exist_ok=False)
images = []


def embedded(file, title, css='asset'):
    file = Path(file)
    data = file.read_bytes()
    with Image.open(file) as im:
        im.verify()
    with Image.open(file) as im:
        size = list(im.size)
    images.append(dict(**pin(file), title=title, size=size))
    return ('<img class="' + css + '" loading="lazy" decoding="async" alt="'
            + html.escape(title, quote=True) + '" src="data:image/png;base64,'
            + base64.b64encode(data).decode() + '">')


def comparison(name):
    parts = ['<div class="variants">']
    for density, label in [(1, 'Original / enlarged reference'), (2, '2X / actual pixels'), (4, '4X / actual pixels')]:
        css = 'asset original' if density == 1 else 'asset'
        view = 'original' if density == 1 else str(density)
        file = ROOT / 'registered-assemblies-v3' / f'{name}-{density}x.png'
        parts.append(f'<figure data-density="{view}"><figcaption>{label}</figcaption>'
                     + embedded(file, f'{name} / {label}', css) + '</figure>')
    return ''.join(parts) + '</div>'


body = ['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban extended terrain / Batch 95</title><style>
:root{color-scheme:dark;font:17px/1.5 system-ui,sans-serif;background:#101820;color:#e7eef2}
body{margin:0;padding:28px;max-width:1500px;margin-inline:auto}h1{font-size:34px;line-height:1.2;margin:0 0 14px}
h2{font-size:25px;margin:30px 0 14px}h3{font-size:20px}p{max-width:1100px}.note{background:#20323d;padding:16px 20px;border-left:4px solid #caa755;border-radius:6px}
nav{position:sticky;top:0;background:#101820ed;padding:12px 0;z-index:2;display:flex;gap:10px;flex-wrap:wrap}
button,a{font:inherit;color:#bce4f5}button{border:1px solid #63818e;background:#20343e;border-radius:7px;padding:8px 15px;cursor:pointer}
button[aria-pressed=true]{background:#365b6c;border-color:#bce4f5}figure{margin:0;min-width:0}figcaption{font-size:16px;color:#bfd0da;margin:8px 0}
.viewer,.variants{overflow:auto;border:1px solid #304650;border-radius:7px;background:#172027}.native,.asset{display:block;max-width:none;height:auto}.fit .native{max-width:100%}
.variants{display:flex;gap:14px;padding:12px}.variants figure{flex:0 0 auto}.original{image-rendering:pixelated;zoom:4}
body[data-view="2"] [data-density="4"],body[data-view="4"] [data-density="2"]{display:none}body[data-view="2"] .original{zoom:2}
details{border-top:1px solid #36505b;padding:10px 0}summary{cursor:pointer;font-weight:650}.small{font-size:15px;color:#b6c7d0}
.tag{display:inline-block;margin-right:12px;color:#b9dec9}code{font-size:15px;overflow-wrap:anywhere}table{border-collapse:collapse;font-size:16px}
th,td{padding:9px 15px;border-bottom:1px solid #38515d;text-align:left}.overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:12px}
.overview figure{border:1px solid #36505b;border-radius:7px;padding:8px;background:#172027}.overview img{max-width:100%;height:auto;margin:auto;max-height:190px;object-fit:contain}footer{margin:35px 0;color:#b6c7d0}
</style><body data-view="4">
<h1>M2.4 / NewUrban extended terrain / Batch 95</h1>
<p><span class="tag">Mac 2X / 4X technical pass</span><span class="tag">36 complete source members</span><span class="tag">Visual context review pending</span></p>
<div class="note"><strong>Review the new cliff-to-ground contacts, two bounded cliff caps, four low-rock ground adaptations, field and road curve.</strong>
<p>Accepted Temperate cliffs, Desert rocks and Urban field/road structures are reused. This review concerns their NewUrban registration and surrounding material. Earlier accepted buildings, actors, roads and animations do not need another art review.</p>
<p><strong>Wide-road slopes <code>prslpe01–04.ubn</code> remain Original and missing HD. They are outside this approval.</strong> Background scenes may contain those original slopes and other open source members. M2.4 is incomplete.</p></div>
<nav><button data-view="2">2X</button><button data-view="4" aria-pressed="true">4X</button><button data-view="all">Compare all</button><button id="fit" aria-pressed="false">Fit native views</button><a href="#overview">Quick overview</a><a href="#adapted">Material / cap adapters</a><a href="#native">Actual game</a><a href="#all">All members</a><a href="#remaining">Remaining work</a></nav>
<h2 id="overview">All 36 members / quick overview</h2><p>Overview images fit their cards. The comparisons below retain actual source pixels; native game screenshots start at 100% display pixels.</p><div class="overview">''']
for row in sorted(export['records'], key=lambda r: r['member']):
    body.append('<figure><figcaption>' + html.escape(row['member']) + '</figcaption>'
                + embedded(ROOT / 'registered-assemblies-v3' / f'{row["member"]}-4x.png', row['member'] + ' / 4X overview')
                + '</figure>')
body.append('</div><h2 id="adapted">Material and cap adapters</h2><p>All visible RGB detail comes from accepted HD resources. The two caps use target-local canvas/coverage; four low-rock contours retain the accepted illuminated and shaded rock faces while replacing surrounding sand with accepted NewUrban grass. No native RGB enlargement or new generated noise is selected.</p>')
adapted = ['cliffx21.ubn', 'cliffx22.ubn', 'cliffx33.ubn', 'cliffx34.ubn', 'cliffx39.ubn', 'cliffx40.ubn',
           'baseb01.ubn', 'droadc09.ubn', 'wclifx10.ubn']
for name in adapted:
    row = next(r for r in export['records'] if r['member'] == name)
    body.append('<details open><summary>' + name + ' / accepted ' + row['donorTheater'].title()
                + ' structure</summary>' + comparison(name) + '</details>')
body.append('''<h2 id="native">Actual packaged Mac application</h2>
<p>Three unchanged official maps cover every new source path. Both densities use the same native map coordinates. Screenshots are unscaled; use Fit native views for an overview. Reveal and stopped AI are controlled inspection fixtures. Only the new terrain contacts and bounded adapters belong to this approval.</p>''')
preferred = ['cliffx21.ubn', 'cliffx33.ubn', 'cliffx37.ubn', 'baseb01.ubn',
             'droadc09.ubn', 'wclifx10.ubn']
for name in preferred:
    body.append('<details><summary>' + name + ' / native map context</summary>')
    if name == 'wclifx10.ubn':
        body.append('<p class="small">This official map stamps subtile 0 only. One placement is within ordinary camera bounds; the second lies beyond the original camera clamp. The full source facade appears in the static family comparison, not as a claimed visible native facade. Original placement and camera bounds are preserved.</p>')
    for density in [2, 4]:
        match, = [(m, c) for m in reports[density]['maps'] for c in m['captures'] if c['member'] == name]
        map_row, capture = match
        title = f'{map_row["mapId"]} / {name} / actual Mac {density}X / original camera tile {capture["tile"][:2]}'
        body.append(f'<figure data-density="{density}"><figcaption>' + html.escape(title)
                    + '</figcaption><div class="viewer">'
                    + embedded(ROOT / f'native-{density}x-v1' / capture['file'], title, 'native') + '</div></figure>')
    original = next((c for c in reports[4]['originalCaptures'] if c['member'] == name), None)
    if original:
        title = name + ' / actual Original control / same camera'
        body.append('<details><summary>Actual Original control</summary><div class="viewer">'
                    + embedded(ROOT / 'native-4x-v1' / original['file'], title, 'native') + '</div></details>')
    body.append('</details>')
body.append('<h2 id="all">Other complete accepted structures / source reference</h2><p>These structures reuse accepted Temperate details. Inspect their NewUrban grass contact when needed; accepted rock artwork does not require a repeated material-direction review.</p>')
for row in sorted(export['records'], key=lambda r: r['member']):
    name = row['member']
    if name in adapted:
        continue
    body.append('<details><summary>' + name + '</summary><p class="small">Original maps: '
                + html.escape(', '.join(row['maps'])) + '</p>' + comparison(name) + '</details>')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
world = {d: max(m['allocation']['total'] for m in reports[d]['maps']) for d in [2, 4]}
prepared = max(m['allocation']['prepared']['peakBytes'] for r in reports.values() for m in r['maps'])
body.append('<h2 id="remaining">Remaining work and evidence</h2><p>All eight NewUrban catalog entries, independent map files/streams and selectable maps remain. Nine overlapping original mode variants remain recorded. This batch closes 36 source gaps. NewUrban has 37 authored gaps: 21 terrain, 13 buildings, two infantry and one overlay, plus 22 conditional dependency groups. Four unresolved wide-road slopes remain included in the terrain count.</p>')
body.append('<table><tr><th>Check</th><th>Result</th></tr>'
            + '<tr><td>New original source paths</td><td>36 per density / 72 total / three-map minimum cover</td></tr>'
            + f'<tr><td>World peak</td><td>2X {world[2]:,} / 4X {world[4]:,} bytes / unchanged budgets</td></tr>'
            + f'<tr><td>Prepared CPU peak</td><td>{prepared:,} bytes / unchanged 128 MiB limit</td></tr>'
            + '<tr><td>Prior sample and filter guards</td><td>3,588 exact density slots / 92 prior groups</td></tr>'
            + '<tr><td>New slots</td><td>266 authored + 36 unused Original compatibility density slots</td></tr>'
            + '<tr><td>Lifecycle and fallback</td><td>Original, exit/reentry and Desert switch pass</td></tr>'
            + '<tr><td>Focused checks</td><td>4 tests / 392 assertions / entry typecheck and isolated build pass</td></tr>'
            + '<tr><td>Windows / main integration</td><td>NOT_RUN / NOT_PERFORMED</td></tr></table>')
body.append('<details><summary>Specific remaining source members</summary><p><code>'
            + html.escape(', '.join(sorted(r['member'] for r in inventory['remainingGaps']))) + '</code></p></details>')
body.append('<details><summary>Source and resource provenance</summary><p class="small">Runtime source <code>'
            + read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'] + '</code><br>Terrain <code>'
            + export['candidate']['revision'] + ' / ' + export['candidate']['sha256']
            + '</code><br>All original source hashes, geometry, heights, terrain/ramp rules, native depth and indices remain authoritative. Prior crops and filtering guards remain exact after lossless atlas packing. Failed/intermediate attempts and their findings remain retained. No budget is raised and no source is hidden for coverage credit. One internal validation host reuses the isolated task resource root. Desktop delivery contains HTML, metadata and the hash ledger only.</p></details>')
body.append('''<footer>Review this batch together. Previously accepted artwork remains accepted; final M2.4 coverage, independent application delivery, local-main integration and Windows validation remain open.</footer>
<script>
for (const button of document.querySelectorAll('button[data-view]')) {
  button.addEventListener('click', () => {
    document.body.dataset.view = button.dataset.view;
    for (const other of document.querySelectorAll('button[data-view]'))
      other.setAttribute('aria-pressed', String(other === button));
  });
}
document.getElementById('fit').addEventListener('click', event => {
  document.body.classList.toggle('fit');
  event.currentTarget.setAttribute('aria-pressed', String(document.body.classList.contains('fit')));
});
</script></body></html>''')
file = folder / 'M2.4-NewUrban-Extended-Terrain-Batch95-Embedded.html'
with file.open('x') as stream:
    stream.write(''.join(body))
page = file.read_text()
encoded = re.findall(r'src="data:image/png;base64,([^"]+)"', page)
assert len(encoded) == len(images)
for data, expected in zip(encoded, images, strict=True):
    payload = base64.b64decode(data, validate=True)
    assert hashlib.sha256(payload).hexdigest() == expected['sha256'] and len(payload) == expected['bytes']
script, = re.findall(r'<script>(.*?)</script>', page, re.S)
with tempfile.TemporaryDirectory(prefix='m2-4-batch95-review-') as temp:
    js = Path(temp) / 'controls.js'
    js.write_text(script)
    subprocess.run(['node', '--check', str(js)], check=True)
write(folder / 'review-metadata-v1.json', dict(status='PASS_EMBEDDED_PNG_HASHES_DIMENSIONS_AND_CONTROL_SYNTAX',
    html=pin(file), images=images, candidate=export['candidate'], newCompleteSourceMembers=36,
    priorGuardedDensitySamplesExact=3588, nativeReports=[pin(ROOT / f'native-{d}x-v1/report.json') for d in [2, 4]],
    runtimeSourceCommit=read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'],
    browserInteractive='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', visual='PENDING_NEW_CONTEXT_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(html=pin(file), embeddedImages=len(images)))
