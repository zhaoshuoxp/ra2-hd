"""Create an embedded review of changed context at original display scale."""
import base64
import hashlib
import html
from io import BytesIO
import re
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
from newurban_batch96_io import ROOT, SOURCES, assemble, native, pin, read, write

export = read(ROOT / 'export-v2.json')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
reports = {d: read(ROOT / f'native-{d}x-v1/report.json') for d in [2, 4]}
assert all(r['status'] == 'PASS_SELECTED_NATIVE_CASES' and not r['errors'] for r in reports.values())
assert all(len(r['sourcePaths']) == 21 for r in reports.values())
folder = ROOT / 'review-v2'
folder.mkdir(exist_ok=False)
images, encoded_cache = [], {}


def embed(file, title, css='asset'):
    file = Path(file)
    data = file.read_bytes()
    with Image.open(file) as picture:
        picture.verify()
    with Image.open(file) as picture:
        size = list(picture.size)
    if str(file) not in encoded_cache:
        source = Image.open(file).convert('RGBA')
        buffer = BytesIO()
        source.save(buffer, format='WEBP', lossless=True, method=6, exact=True)
        payload = buffer.getvalue()
        decoded = Image.open(BytesIO(payload)).convert('RGBA')
        assert source.size == decoded.size and source.tobytes() == decoded.tobytes()
        encoded_cache[str(file)] = payload, hashlib.sha256(source.tobytes()).hexdigest()
    payload, pixel_sha = encoded_cache[str(file)]
    images.append(dict(**pin(file), title=title, size=size, embeddedMime='image/webp',
        embeddedBytes=len(payload), embeddedSha256=hashlib.sha256(payload).hexdigest(),
        decodedRgbaSha256=pixel_sha, decodedPixelsExact=True, imageRescaled=False))
    return ('<img class="' + css + '" loading="lazy" decoding="async" alt="' + html.escape(title, quote=True)
            + '" src="data:image/webp;base64,' + base64.b64encode(payload).decode() + '">')


def compare(name):
    source = SOURCES[name]
    original, _ = assemble([(f, native(source, f)) for f in source['images'] if f['nativeOffset'] > 0])
    file = folder / f'{name}-original.png'
    original.save(file)
    parts = ['<div class="variants">']
    for density, label in [('original', 'Original / enlarged source reference'), ('2', '2X / actual pixels'), ('4', '4X / actual pixels')]:
        picture = file if density == 'original' else ROOT / f'authored-v6/{name}-{density}x-whole.png'
        parts.append(f'<figure data-density="{density}"><figcaption>{label}</figcaption><div class="viewer">'
            + embed(picture, name + ' / ' + label, 'asset original' if density == 'original' else 'asset') + '</div></figure>')
    return ''.join(parts) + '</div>'


body = ['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban terrain / Batch 96</title><style>
:root{color-scheme:dark;font:18px/1.5 system-ui,sans-serif;background:#101820;color:#e7eef2}
body{margin:0;padding:28px;max-width:1500px;margin-inline:auto}h1{font-size:36px;line-height:1.2;margin:0 0 14px}h2{font-size:27px;margin:32px 0 14px}
p{max-width:1150px}.note{background:#20323d;padding:16px 20px;border-left:4px solid #caa755;border-radius:6px}.small{font-size:16px;color:#bacbd5}
nav{position:sticky;top:0;background:#101820ed;padding:12px 0;z-index:2;display:flex;gap:10px;flex-wrap:wrap}button,a{font:inherit;color:#bce4f5}
button{border:1px solid #63818e;background:#20343e;border-radius:7px;padding:8px 15px;cursor:pointer}button[aria-pressed=true]{background:#365b6c;border-color:#bce4f5}
figure{margin:0;min-width:0}figcaption{font-size:17px;color:#bfd0da;margin:9px 0}.viewer{overflow:auto;border:1px solid #304650;border-radius:7px;background:#172027}
.native,.asset{display:block;max-width:none;height:auto}.fit .native{max-width:100%}.original{image-rendering:pixelated;zoom:4}.variants{display:flex;flex-wrap:wrap;gap:18px}
body[data-view="original"] [data-density="2"],body[data-view="original"] [data-density="4"],body[data-view="2"] [data-density="original"],body[data-view="2"] [data-density="4"],body[data-view="4"] [data-density="original"],body[data-view="4"] [data-density="2"]{display:none}
details{border-top:1px solid #36505b;padding:12px 0}summary{cursor:pointer;font-weight:650}.tag{display:inline-block;margin-right:16px;color:#b9dec9}code{font-size:16px;overflow-wrap:anywhere}
table{border-collapse:collapse;font-size:17px}th,td{padding:9px 15px;border-bottom:1px solid #38515d;text-align:left}.overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.overview figure{border:1px solid #36505b;border-radius:7px;padding:9px;background:#172027}.overview img{max-width:100%;height:auto;margin:auto;max-height:190px;object-fit:contain}footer{margin:35px 0;color:#b6c7d0}
</style><body data-view="4"><h1>M2.4 / NewUrban terrain / Batch 96</h1>
<p><span class="tag">Mac 2X / 4X technical pass</span><span class="tag">21 complete source members</span><span class="tag">New visual review pending</span></p>
<div class="note"><strong>Review the four wide-road slope connections, circular pavers and grass contacts, stone base and timber support together.</strong>
<p>Accepted dirt-track, parking, narrow-road and surface artwork is reused. Only its new placement, projection or surrounding material needs context review. Earlier accepted actors, buildings and animation do not require another review.</p>
<p>The statue above the new stone base remains a separate open building source. Sixteen non-terrain source gaps and final milestone acceptance remain open.</p></div>
<nav><button data-view="original">Original</button><button data-view="2">2X</button><button data-view="4" aria-pressed="true">4X</button><button data-view="all">Compare all</button><button id="fit" aria-pressed="false">Fit native views</button><a href="#overview">Overview</a><a href="#changed">Changed context</a><a href="#native">Actual game</a><a href="#reused">Accepted reuse</a><a href="#evidence">Evidence</a></nav>
<h2 id="overview">21 members / quick overview</h2><p>Cards fit their previews. Detailed assets and game captures below retain their actual pixels. Original source references enlarge by 4X for comparison; game controls keep their captured display scale.</p><div class="overview">''']
for row in sorted(export['records'], key=lambda r: r['member']):
    name = row['member']
    body.append('<figure><figcaption>' + name + '</figcaption>'
        + embed(ROOT / f'authored-v6/{name}-4x-whole.png', name + ' / 4X overview') + '</figure>')
body.append('</div><h2 id="changed">New geometry, materials and structures</h2><p>Continuous road paint meets the same accepted straight-road ports. The stone base and timber support use two new native-guided masters; surrounding paving and grass reuse accepted HD detail. Original RGB is not enlarged into HD detail.</p>')
changed = ['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn', 'libbas01.ubn', 'cliffa07.ubn',
    'rough04.ubn', 'rough05.ubn', 'rough09.ubn', 'rough10.ubn', 'droads43.ubn', 'droads46.ubn',
    'grfix05.ubn', 'grfix06.ubn', 'gbfix03.ubn']
for name in changed:
    body.append('<details' + (' open' if name.startswith('prslpe') or name in ['libbas01.ubn', 'cliffa07.ubn'] else '')
        + '><summary>' + name + '</summary>' + compare(name) + '</details>')

body.append('''<h2 id="native">Actual packaged Mac game / unchanged official maps</h2>
<p>Downtown, Manhattan, Rush Hour and Turf War form the minimum four-map source cover. Each new source path is checked at both densities. Captures use the same original map coordinates and no image rescaling. Reveal and stopped AI are controlled inspection fixtures. Only this batch's new terrain belongs to its visual approval.</p>''')
preferred = ['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn', 'libbas01.ubn', 'cliffa07.ubn',
    'rough05.ubn', 'droads43.ubn', 'droads46.ubn', 'grfix06.ubn', 'gbfix03.ubn', 'rough01.ubn', 'droads49.ubn']
originals = reports[4]['originalCaptures'] + reports[4]['originalArchitectureCaptures']
for name in preferred:
    body.append('<details><summary>' + name + ' / original map context</summary>')
    if name == 'libbas01.ubn':
        body.append('<p class="small">Review the new star-shaped stone base. CASANF18, the statue body above it, is one of the 13 remaining building sources and is outside this batch.</p>')
    for density in [2, 4]:
        map_row, capture = next((m, c) for m in reports[density]['maps'] for c in m['captures'] if c['member'] == name)
        title = f'{map_row["mapId"]} / {name} / actual Mac {density}X / camera tile {capture["tile"][:2]}'
        body.append(f'<figure data-density="{density}"><figcaption>' + html.escape(title) + '</figcaption><div class="viewer">'
            + embed(ROOT / f'native-{density}x-v1' / capture['file'], title, 'native') + '</div></figure>')
    original = next((c for c in originals if c['member'] == name), None)
    if original:
        title = name + ' / actual Original control / same camera'
        body.append('<figure data-density="original"><figcaption>' + title + '</figcaption><div class="viewer">'
            + embed(ROOT / 'native-4x-v1' / original['file'], title, 'native') + '</div></figure>')
    else:
        body.append('<p data-density="original" class="small">The complete original source appears in its asset comparison. Native Original controls are captured on Downtown and Manhattan.</p>')
    body.append('</details>')

body.append('<h2 id="reused">Accepted artwork reuse / source reference</h2><p>The following complete structures reuse accepted artwork. Inspect the new grass, canvas or orientation when useful; their accepted material direction does not need another approval.</p>')
for row in sorted(export['records'], key=lambda r: r['member']):
    if row['member'] not in changed:
        body.append('<details><summary>' + row['member'] + '</summary>' + compare(row['member']) + '</details>')
world = {d: max(m['allocation']['total'] for m in reports[d]['maps']) for d in [2, 4]}
body.append('<h2 id="evidence">Coverage and evidence</h2><table><tr><th>Check</th><th>Result</th></tr>'
    + '<tr><td>New source paths</td><td>21 per density / 42 total / four-map minimum cover</td></tr>'
    + '<tr><td>Native source slots</td><td>207 authored positive-pointer slots + 40 unused Original compatibility slots</td></tr>'
    + '<tr><td>Inherited artwork</td><td>98 groups / 196 complete atlas files / all 3,890 density crops and guards exact</td></tr>'
    + f'<tr><td>World peak</td><td>2X {world[2]:,} / 4X {world[4]:,} bytes / fixed 512 / 1280 MiB budgets</td></tr>'
    + '<tr><td>Prepared CPU peak</td><td>2X 45,156,556 / 4X 108,112,788 bytes / fixed 128 MiB budget</td></tr>'
    + '<tr><td>Checks</td><td>4 tests / 341 assertions / entry typecheck / isolated build pass</td></tr>'
    + '<tr><td>Lifecycle</td><td>Original, exit/reentry, Desert switch and NewUrban reload pass</td></tr>'
    + '<tr><td>Original map identity</td><td>8 directory entries / 8 files / 8 streams / 9 overlapping mode variants / 8 selectable maps</td></tr>'
    + '<tr><td>Remaining NewUrban gaps</td><td>13 buildings / 2 infantry / 1 overlay / 22 conditional dependency groups</td></tr>'
    + '<tr><td>Windows / main integration</td><td>NOT_RUN / NOT_PERFORMED</td></tr></table>')
body.append('<details><summary>Specific remaining source members</summary><p><code>'
    + html.escape(', '.join(sorted(r['member'] for r in inventory['remainingGaps']))) + '</code></p></details>')
body.append('<details><summary>Source, resource and production provenance</summary><p class="small">Runtime source <code>'
    + read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'] + '</code><br>Terrain <code>'
    + export['candidate']['revision'] + ' / ' + export['candidate']['sha256']
    + '</code><br>Original archives and maps remain unchanged. All target terrain, ramp and depth data remains authoritative. Two built-in generated masters are retained with prompts and hashes; their measured source content exceeds 4X. Accepted surfaces supply every other material. Failed prototypes and strict loader rejection remain recorded. The timber edge uses the existing bounded extra-contour contract; its native main block and guard remain exact. Prepared actor dependencies are unchanged. No budget is increased and no expected source is hidden.</p></details>')
body.append('''<footer>Desktop delivery contains this embedded page, metadata and the complete resource hash ledger. No per-batch Mac game or resource copy is created. Final independent milestone delivery, remaining source coverage and M2.4 acceptance are still open.</footer>
<script>
for (const button of document.querySelectorAll('button[data-view]')) button.addEventListener('click', () => {
  document.body.dataset.view = button.dataset.view;
  for (const other of document.querySelectorAll('button[data-view]')) other.setAttribute('aria-pressed', String(other === button));
});
document.getElementById('fit').addEventListener('click', event => {
  document.body.classList.toggle('fit');
  event.currentTarget.setAttribute('aria-pressed', String(document.body.classList.contains('fit')));
});
</script></body></html>''')
file = folder / 'M2.4-NewUrban-Final-Terrain-Batch96-Embedded.html'
with file.open('x') as stream:
    stream.write(''.join(body))
page = file.read_text()
payloads = re.findall(r'src="data:image/webp;base64,([^"]+)"', page)
assert len(payloads) == len(images)
for payload, expected in zip(payloads, images, strict=True):
    data = base64.b64decode(payload, validate=True)
    assert len(data) == expected['embeddedBytes'] and hashlib.sha256(data).hexdigest() == expected['embeddedSha256']
script, = re.findall(r'<script>(.*?)</script>', page, re.S)
with tempfile.TemporaryDirectory(prefix='m2-4-batch96-review-') as temp:
    control = Path(temp) / 'controls.js'; control.write_text(script)
    subprocess.run(['node', '--check', str(control)], check=True)
write(folder / 'review-metadata-v1.json', dict(status='PASS_EMBEDDED_LOSSLESS_IMAGES_EXACT_DECODED_PIXELS_HASHES_DIMENSIONS_AND_CONTROLS',
    html=pin(file), images=images, candidate=export['candidate'], newCompleteSourceMembers=21,
    nativeReports=[pin(ROOT / f'native-{d}x-v1/report.json') for d in [2, 4]],
    runtimeSourceCommit=read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'],
    browserInteractive='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', visual='PENDING_NEW_CONTEXT_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(html=pin(file), embeddedImages=len(images)))
