"""Build one self-contained review of changed grass and accepted-art native contexts."""
import base64
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import tempfile

from PIL import Image
from newurban_batch94_io import ROOT, assemble, crop, native, pin, read, write

export = read(ROOT / 'export-and-preservation-v5.json')
reports = {density: read(ROOT / f'native-{density}x-v{2 if density == 4 else 1}/report.json') for density in [2, 4]}
assert all(r['status'] == 'PASS_SELECTED_NATIVE_CASES' for r in reports.values())
assert all(len(r['sourcePaths']) == 111 for r in reports.values())
sources = {source['member']: source for source in read(ROOT / 'source.json')['sources']}
folder = ROOT / 'review-v1'
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
    return '<img class="' + css + '" loading="lazy" decoding="async" alt="' + html.escape(title, quote=True) \
        + '" src="data:image/png;base64,' + base64.b64encode(data).decode() + '">'


def source_comparison(name):
    source = sources[name]
    original, _ = assemble([(i, native(source, i)) for i in source['images'] if i['nativeOffset'] > 0])
    file = folder / (name + '-original.png')
    original.save(file)
    parts = ['<div class="variants">']
    parts.append('<figure data-density="original"><figcaption>Original source / inspection</figcaption>'
                 + embedded(file, name + ' / original source', 'asset original') + '</figure>')
    for density in [2, 4]:
        file = ROOT / 'registered-assemblies-v1' / f'{name}-{density}x.png'
        parts.append(f'<figure data-density="{density}"><figcaption>{density}X registered artwork</figcaption>'
                     + embedded(file, f'{name} / selected {density}X') + '</figure>')
    parts.append('</div>')
    return ''.join(parts)


body = ['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban accepted-resource reuse / Batch 94</title><style>
:root{color-scheme:dark;font:17px/1.5 system-ui,sans-serif;background:#101820;color:#e7eef2}body{margin:0;padding:28px;max-width:1500px;margin-inline:auto}
h1{font-size:34px;line-height:1.2;margin:0 0 14px}h2{font-size:25px;margin:30px 0 14px}h3{font-size:20px}p{max-width:1050px}.note{background:#202f38;padding:16px 20px;border-left:4px solid #caa755;border-radius:6px}
nav{position:sticky;top:0;background:#101820ed;padding:12px 0;z-index:2;display:flex;gap:10px;flex-wrap:wrap}button,a{font:inherit;color:#bce4f5}button{border:1px solid #63818e;background:#20343e;border-radius:7px;padding:8px 15px;cursor:pointer}
button[aria-pressed=true]{background:#365b6c;border-color:#bce4f5}figure{margin:0;min-width:0}figcaption{font-size:16px;color:#bfd0da;margin:8px 0}.viewer,.variants{overflow:auto;border:1px solid #304650;border-radius:7px;background:#172027}
.native{display:block;max-width:none;height:auto}.fit .native{max-width:100%}.variants{display:flex;gap:14px;padding:12px}.asset{display:block;max-width:none;height:auto}.original{image-rendering:pixelated;zoom:4}.variants figure{flex:0 0 auto}
body[data-view="2"] [data-density="4"],body[data-view="4"] [data-density="2"]{display:none}body[data-view="2"] .original{zoom:2}
details{border-top:1px solid #36505b;padding:10px 0}summary{cursor:pointer;font-weight:650}.small{font-size:15px;color:#b6c7d0}.tag{display:inline-block;margin-right:10px;color:#b9dec9}code{font-size:15px;overflow-wrap:anywhere}table{border-collapse:collapse;font-size:16px}th,td{padding:9px 15px;border-bottom:1px solid #38515d;text-align:left}footer{margin:35px 0;color:#b6c7d0}
</style><body data-view="4">
<h1>M2.4 / NewUrban accepted-resource reuse / Batch 94</h1>
<p><span class="tag">Mac 2X / 4X technical pass</span><span class="tag">Visual review pending</span><span class="tag">111 complete source members</span></p>
<div class="note"><strong>Review the nine changed grass contacts and the actual road, parking and coast connections below.</strong>
<p>Most artwork directly reuses accepted Urban resources. Accepted buildings, units, animations and earlier terrain do not require another art review. The four wide-road slopes <code>prslpe01–04.ubn</code> remain Original and missing; they are excluded from this approval. M2.4 is incomplete.</p></div>
<nav><button data-view="2">2X</button><button data-view="4" aria-pressed="true">4X</button><button data-view="all">Compare all</button><button id="fit" aria-pressed="false">Fit native views</button><a href="#grass">Changed grass</a><a href="#native">Actual game</a><a href="#catalog">All reused members</a><a href="#remaining">Remaining work</a></nav>
<h2 id="grass">Nine changed grass contacts</h2>
<p>The original NewUrban grass is warmer and brighter. Existing accepted grass material replaces only the grass region at its painted HD boundary; paving, road structure and source geometry remain authoritative. These are source assemblies, not gameplay placements. Original is enlarged with nearest-neighbor sampling only for comparison.</p>''']
grass = [row['member'] for row in export['records'] if row['targetSet'] in [80, 87, 103]]
assert len(grass) == 9
for name in sorted(grass):
    row = next(row for row in export['records'] if row['member'] == name)
    body.append('<details open><summary>' + html.escape(name) + '</summary>' + source_comparison(name) + '</details>')

body.append('''<h2 id="native">Actual packaged Mac game</h2><p>Views retain the same original map coordinates at both densities. Native screenshots start at 100% pixel size; use the fit button for an overview. Original reference views show the same camera location. Background objects are context, not new review items. Any wide-road slopes in the background still use Original.</p>''')
preferred = ['droadc02.ubn', 'drslpe01.ubn', 'drslpe06.ubn', 'rough03.ubn', 'pave06.ubn',
             'grfix01.ubn', 'pavefx05.ubn', 'pshore01.ubn', 'gbfix01.ubn']
for name in preferred:
    body.append('<details><summary>' + html.escape(name) + ' / native map context</summary>')
    for density in [2, 4]:
        matches = [(m, c) for m in reports[density]['maps'] for c in m['captures'] if c['member'] == name]
        assert len(matches) == 1, name
        map_row, capture = matches[0]
        file = ROOT / f'native-{density}x-v{2 if density == 4 else 1}' / capture['file']
        title = f'{map_row["mapId"]} / {name} / actual Mac {density}X / same original camera'
        body.append(f'<figure data-density="{density}"><figcaption>' + html.escape(title) + '</figcaption><div class="viewer">'
                    + embedded(file, title, 'native') + '</div></figure>')
    originals = [c for c in reports[4]['originalCaptures'] if c['member'] == name]
    if originals:
        file = ROOT / 'native-4x-v2' / originals[0]['file']
        title = f'{name} / actual Original / same original camera'
        body.append('<details><summary>Actual Original control</summary><div class="viewer">'
                    + embedded(file, title, 'native') + '</div></details>')
    body.append('</details>')

body.append('''<h2 id="catalog">All 111 complete reused source members</h2><p>Unchanged accepted artwork is shown for coverage and binding reference. Each member includes every native subtile at 2X and 4X; unused native compatibility slots retain their indices and are not claimed as new HD detail. Grass members already appear above.</p>''')
for row in sorted(export['records'], key=lambda r: (r['targetSet'], r['member'])):
    if row['member'] in grass:
        continue
    body.append('<details><summary>' + html.escape(row['member']) + ' / accepted Urban reuse</summary>'
                + '<p class="small">Original maps: ' + html.escape(', '.join(row['maps'])) + '</p>'
                + source_comparison(row['member']) + '</details>')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
world = {density: max(m['allocation']['total'] for m in report['maps']) for density, report in reports.items()}
prepared = max(m['allocation']['prepared']['peakBytes'] for report in reports.values() for m in report['maps'])
body.append('<h2 id="remaining">Remaining work and validation</h2><p>NewUrban retains all eight original map entries, eight independent files/streams, nine overlapping original mode variants and eight selectable maps. Remaining authored gaps: 73 (57 terrain, 13 buildings, two infantry, one overlay), plus 22 conditional dependency groups. All four unresolved wide-road slopes are included in the terrain count.</p>')
body.append('<table><tr><th>Check</th><th>Result</th></tr>'
            + f'<tr><td>Original source paths</td><td>111 at each density / five-map minimum cover</td></tr><tr><td>World peak</td><td>2X {world[2]:,} / 4X {world[4]:,} bytes</td></tr>'
            + f'<tr><td>Prepared CPU peak</td><td>{prepared:,} bytes / unchanged 128 MiB limit</td></tr>'
            + '<tr><td>Prior samples and filter guards</td><td>2,372 byte-exact density samples</td></tr><tr><td>Fallback and lifecycle</td><td>Original, exit/reentry, cross-theater release pass</td></tr>'
            + '<tr><td>Focused tests / entry typecheck</td><td>7 tests / 773 assertions / pass</td></tr><tr><td>Windows / main integration</td><td>NOT_RUN / NOT_PERFORMED</td></tr></table>')
body.append('<details><summary>Specific remaining source members</summary><p><code>'
            + html.escape(', '.join(sorted(row['member'] for row in inventory['remainingGaps']))) + '</code></p></details>')
body.append('<details><summary>Source and resource provenance</summary><p class="small">Mac runtime source: <code>'
            + read(ROOT / 'active-stage-v2.json')['runtimeSourceHead'] + '</code><br>Selected terrain: <code>'
            + export['candidate']['revision'] + ' / ' + export['candidate']['sha256']
            + '</code><br>One internal Mac host and isolated resource root; this review creates no game or resource copy. Failed attempts and the original donor/target sources remain retained. The compact manifest changes no texture bytes. Full native reports and the complete resource ledger identify exact dependencies.</p></details>')
body.append('''<footer>Visual feedback applies only to the changed grass and new native connections. Existing artwork acceptance is inherited. Final M2.4 coverage, independent milestone packaging and integration remain open.</footer>
<script>
for(const button of document.querySelectorAll('button[data-view]'))button.addEventListener('click',()=>{document.body.dataset.view=button.dataset.view;for(const other of document.querySelectorAll('button[data-view]'))other.setAttribute('aria-pressed',String(other===button))});
document.getElementById('fit').addEventListener('click',event=>{document.body.classList.toggle('fit');event.currentTarget.setAttribute('aria-pressed',String(document.body.classList.contains('fit')))});
</script></body></html>''')
file = folder / 'M2.4-NewUrban-Secondary-Terrain-Batch94-Embedded.html'
with file.open('x') as stream:
    stream.write(''.join(body))
page = file.read_text()
encoded = re.findall(r'src="data:image/png;base64,([^"]+)"', page)
assert len(encoded) == len(images)
for data, expected in zip(encoded, images, strict=True):
    payload = base64.b64decode(data, validate=True)
    assert hashlib.sha256(payload).hexdigest() == expected['sha256'] and len(payload) == expected['bytes']
script, = re.findall(r'<script>(.*?)</script>', page, re.S)
with tempfile.TemporaryDirectory(prefix='m2-4-batch94-review-') as temp:
    js = Path(temp) / 'controls.js'
    js.write_text(script)
    subprocess.run(['node', '--check', str(js)], check=True)
write(folder / 'review-metadata-v1.json', dict(status='PASS_ALL_EMBEDDED_PNG_HASHES_DIMENSIONS_AND_CONTROL_SYNTAX',
    html=pin(file), images=images, candidate=export['candidate'], runtimeSourceCommit=read(ROOT / 'active-stage-v2.json')['runtimeSourceHead'],
    newCompleteSourceMembers=111, changedGrassMembers=grass, priorDensitySamplesAndGuardsExact=2372,
    nativeReports=[pin(ROOT / f'native-{d}x-v{2 if d == 4 else 1}/report.json') for d in [2, 4]],
    browserInteractive='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', visual='PENDING_USER_CHANGED_CONTEXT_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(html=pin(file), embeddedImages=len(images), changedGrassMembers=len(grass)))
