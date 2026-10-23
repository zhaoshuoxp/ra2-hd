"""Compare immutable authored detail at equal logical scale and record visual feedback."""
import argparse
import base64
import hashlib
import io
import json
import shutil
from pathlib import Path

from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
p.add_argument('--screenshot', type=Path, required=True, help='Preserved original review capture')
a = p.parse_args()
root = Path.cwd().resolve()
art = root / '.artifacts/yuri-units'
a.output.mkdir(parents=True, exist_ok=True)
assert not (a.output / 'report.json').exists(), 'Preserve completed clarity audits'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
encode = lambda data: 'data:image/png;base64,' + base64.b64encode(data).decode()
receipt = {
    'status': 'FULL_BATCH_VISUAL_ACCEPTED_WITH_SEPARATE_CLARITY_FEEDBACK', 'date': '2026-10-01',
    'userStatementEnglish': 'All visuals above pass. The review screenshot appears less clear than Soviet units; the mother-image style itself appears insufficiently high-definition.',
    'referencedUserAttachment': '/Users/Aone/Desktop/Unknown.png',
    'reviewCaptureSource': str(a.screenshot), 'reviewCaptureSha256': sha(a.screenshot),
    'scope': 'Full Task D batch artwork accepted. Separate mother-art clarity concern remains open; gameplay exceptions and integration status are unchanged.',
}
shutil.copy2(a.screenshot, a.output / 'referenced-review-capture.png')
(a.output / 'visual-acceptance.json').write_text(json.dumps(receipt, indent=2) + '\n')
work = json.loads((art / 'vxl-production-v1/worklist.json').read_text())
board = next(b for b in work['boards'] if b['id'] == 'MIND-mind-DUMMY01')
master = root / board['selectedArt']
assert sha(master) == board['selectedArtSha256']
rhino = root / '.local/hd-packs/rhino-authored/owner-r3'
rhino_contract = json.loads((rhino / 'manifest.json').read_text())
inputs = []
rows = []
for heading in [0, 45, 90]:
    yuri = art / f'mind-vxl-review-4x-r1/MIND-mind-DUMMY01-{heading}.png'
    soviet = rhino / f'body-{heading}.png'
    assert sha(soviet) == rhino_contract['parts'][f'body-{heading}']['sha256']
    cells = []
    for identity, path in [('MIND', yuri), ('HTNK hull', soviet)]:
        image = Image.open(path).convert('RGBA')
        # Crop transparent padding only. Each CSS pixel retains four source pixels.
        image = image.crop(image.getbbox())
        png = io.BytesIO(); image.save(png, format='PNG')
        cells.append(f'<td><p>{identity} · heading {heading}°</p><div class="native"><img src="{encode(png.getvalue())}" '
            f'width="{image.width / 4}" height="{image.height / 4}"></div><p>4x source pixels at 1:1</p>'
            f'<img src="{encode(png.getvalue())}" width="{image.width}" height="{image.height}"></td>')
        inputs.append({'identity': identity, 'heading': heading, 'path': str(path), 'sha256': sha(path),
            'croppedSourceSize': [image.width, image.height], 'logicalSize': [image.width / 4, image.height / 4]})
    rows.append('<tr>' + ''.join(cells) + '</tr>')
binding = art / 'runtime-bindings-yr-4x-v8/report.json'
loaded = json.loads(binding.read_text())
assert next(r for r in loaded['bindings'] if r['name'] == 'MIND')['vxlHd']
assert loaded['density'] == 4 and loaded['status'] == 'PASS_SELECTED_NATIVE_CASES'
# The binding harness asserts every new family's actual density before taking
# mixed-native-bindings. The end-of-run allocation table includes later eviction.
binding_harness = root / 'scripts/m1/yuri-units/desktop-bindings.mjs'
assert "assert.equal(report.allocations.families[name].density, density, name)" in binding_harness.read_text()
html = a.output / 'clarity-review.html'
html.write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Yuri Mother-art Clarity Audit</title>
<style>body{font:20px system-ui;margin:30px;background:#27332e;color:#eee}h1{font-size:34px}h2{font-size:28px}table{border-collapse:collapse}td{padding:24px;border:1px solid #829584;vertical-align:top;min-width:340px}.native{height:120px;display:flex;align-items:center}img{object-fit:contain}p{max-width:1100px}</style>
<h1>Mother-art clarity feedback</h1><p>Full Task D batch visuals were accepted on 2026-10-01. The user separately identified lower perceived clarity than Soviet artwork and attributed it to the mother-image style.</p>
<p>The MIND source uses mottled camouflage and broad worn highlights. Several small mechanical seams have weaker definition than the accepted HTNK reference. This is a qualitative art-style finding, not a measured ranking of every Yuri unit. Matching native directions below separates this concern from the original screenshot's different directions.</p>
<p>The packaged 4x audit confirms actual MIND HD binding and density 4. Existing renderer paths use the shared coverage filter. This evidence rules out a general absent-HD registration problem in that tested app; it does not make the artwork's small forms clearer.</p>
<h2>Same-heading component comparison</h2><p>Immutable 4x MIND full-unit export versus HTNK hull export; transparent padding is cropped. First image: four source pixels per logical CSS pixel. Second: source pixels at 1:1. These component comparisons are not a new assembled gameplay test. No sharpening or resampling was applied.</p><table>'''
        + ''.join(rows) + '</table><h2>Selected MIND mother image</h2><img style="max-width:100%" src="'
        + encode(master.read_bytes()) + '"><h2>Preserved original review capture</h2><img src="'
        + encode(a.screenshot.read_bytes()) + '"><p>Next art step, if selected: one matched MIND hull/turret sample with cleaner panel boundaries, distinct seams and controlled surface texture; preserve accepted silhouette, materials, bearings and native size before any batch re-authoring.</p></html>')
report = {'status': 'MOTHER_ART_STYLE_CLARITY_CONCERN_OPEN', 'html': str(html.resolve()),
    'sha256': sha(html), 'visualAcceptanceReceipt': str((a.output / 'visual-acceptance.json').resolve()),
    'master': {'path': str(master), 'sha256': sha(master)}, 'comparisonInputs': inputs,
    'packagedBindingEvidence': {'path': str(binding), 'sha256': sha(binding), 'actualHd': True, 'density': 4,
        'densityAssertionHarness': str(binding_harness), 'densityAssertionHarnessSha256': sha(binding_harness),
        'disclosure': 'Actual density asserted before binding capture; end-of-run idle eviction is a later state.'},
    'productionChanges': 'NONE', 'scope': 'Selected MIND qualitative style diagnosis; no blanket failing score for the entire accepted batch.'}
(a.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'html': str(html.resolve()), 'status': report['status']}))
