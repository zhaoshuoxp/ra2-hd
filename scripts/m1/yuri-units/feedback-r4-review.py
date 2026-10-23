"""Build the focused TELE review with an unchanged retail reference and native media."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('root', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--media', type=Path, required=True)
p.add_argument('--revision', type=int, default=1)
a = p.parse_args()
root = a.root.resolve()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
uri = lambda file, kind='image/png': 'data:' + kind + ';base64,' + base64.b64encode(file.read_bytes()).decode()
media = json.loads(a.media.read_text())
assert media['status'] == 'PASS_ENCODED_AND_FULLY_DECODED'
clips = {c['group']: c for c in media['clips']}
reports = {density: json.loads((root / f'runtime-tele-{density}x-v{a.revision}/report.json').read_text()) for density in [2, 4]}
assert all(r['status'] == 'PASS_SELECTED_NATIVE_CASES' for r in reports.values())
images = []


def image(file, label):
    with Image.open(file) as im:
        im.load()
        size = list(im.size)
    images.append({'source': str(file), 'sha256': sha(file), 'size': size, 'label': label})
    return '<figure><figcaption>' + html.escape(label) + '</figcaption><img src="' + uri(file) + '" alt="' + html.escape(label) + '"></figure>'


def clip(density, poster):
    file = Path(clips[f'TELE-{density}x']['preview'])
    return '<video controls playsinline preload="metadata" poster="' + uri(poster) + '" src="' + uri(file, 'video/mp4') + '"></video>'


reference = root / 'TELE-user-retail-reference.png'
old = root.parent / 'feedback-r3/runtime-effects-4x-v2/TELE-live-purple-ribbon-detail.png'
high = root / f'runtime-tele-4x-v{a.revision}/TELE-live-purple-ribbon-detail.png'
low = root / f'runtime-tele-2x-v{a.revision}/TELE-live-purple-ribbon-detail.png'
moving = root / f'runtime-tele-4x-v{a.revision}/TELE-moving-iridescent-field-detail.png'
release = root / f'runtime-tele-4x-v{a.revision}/TELE-released-clean-detail.png'
reference_section = image(reference, 'User-supplied original gameplay / unchanged 451 × 257 image')
current = image(high, 'R4 / 4x unit assets / native drawing-buffer crop') + clip(4, high)
comparison = '<div class="pair">' + image(old, 'R3 / superseded dark band and diagonal bars') + image(high, 'R4 / pale lavender band with fine mottling') + '</div>'
low_section = image(low, 'R4 / 2x unit assets / same 3840 × 2160 drawing buffer') + clip(2, low)
lifecycle = '<div class="pair">' + image(moving, 'Live lift / the endpoint follows the elevated victim') + image(release, 'Stop order / target released and field removed') + '</div>'
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TELE R4 original-reference review</title><style>
body{max-width:1600px;margin:26px auto;padding:0 24px;background:#171d20;color:#edf0f1;font:20px/1.5 system-ui}
h1{font-size:36px}h2{font-size:28px}a{color:#a3d9ff}nav{display:flex;flex-wrap:wrap;gap:22px}
section{margin:34px 0;padding-top:22px;border-top:1px solid #617077}figure{margin:20px 0}
figcaption{font-size:19px;margin-bottom:12px}img{display:block;max-width:100%;height:auto;cursor:zoom-in}
video{display:block;width:100%;max-width:1400px;background:#000;margin:20px 0}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.note{font-size:18px;color:#bbcbd0}.status{background:#293f4b;padding:18px}details{padding:18px;background:#202a2f}
button{font:inherit;padding:7px 15px;background:#314f60;color:white;border:1px solid #7992a1;cursor:pointer}
dialog{max-width:96vw;max-height:95vh;padding:18px;background:#171d20;color:white;border:1px solid #7992a1}
dialog::backdrop{background:#000b}.pixels{overflow:auto;max-height:80vh;margin-top:14px}.pixels img{max-width:none;cursor:default}
@media(max-width:900px){.pair{grid-template-columns:1fr}body{padding:0 15px}}
</style><h1>TELE / original-reference correction</h1>
<p class="status">All other R3 visuals are user accepted. Only this revised TELE field awaits visual review.</p>
<nav><a href="#reference">Original reference</a><a href="#current">Current native video</a><a href="#compare">R3 / R4</a><a href="#low">2x assets</a><a href="#release">Lift / release</a></nav>
<section id="reference"><h2>Original gameplay reference</h2>''' + reference_section + '''
<p>The reference shows a straight, filled pale lavender band with fine irregular pink, purple and white detail. Its interior raster width is approximately 10 pixels.</p></section>
<section id="current"><h2>R4 / actual copied-app gameplay</h2>''' + current + '''
<p class="note">Native attack, lift, pull and stop orders. The source recording is 3840 × 2160; the embedded H.264 video is a fixed crop without enlargement. The reference victim is a ship; this controlled runtime case uses a Rhino tank. The beam appearance is shared by native magnetic-lift targets.</p></section>
<section id="compare"><h2>Previous and revised field</h2>''' + comparison + '''
<p class="note">Independent native captures at the first lifted stage, with the same camera and fixture tiles. Simulation timing can differ. Click any image for its original pixels; no sharpening or image enlargement is baked into these captures.</p></section>
<section id="low"><h2>2x assets / same field width and texture scale</h2>''' + low_section + '''</section>
<section id="release"><h2>Live target tracking and cleanup</h2>''' + lifecycle + '''</section>
<details><summary>Validation and retained scope</summary><p>Both focused copied-app cases pass, with live lifted endpoints and cleanup after a native stop order. The videos are embedded in this standalone HTML and fully decoded before delivery.</p>
<p>Accepted MIND/LTNK/YTNK mothers and all installed resources are retained. MIND roof and Yuri crown control sources remain selected. Original gameplay rules, logical geometry and camera are preserved.</p>
<p>Retained exceptions: DISK refinery money payment and YURIPR PsiWave caster destruction. No main integration or Windows validation is claimed. The supplied still does not define animation timing; restrained moving shimmer is an implementation choice.</p></details>
<dialog id="viewer"><button id="close">Close original pixels</button><div class="pixels" id="pixels"></div></dialog>
<script>const viewer=document.getElementById('viewer'),pixels=document.getElementById('pixels');
document.querySelectorAll('figure img').forEach(image=>image.addEventListener('click',()=>{const full=new Image();full.src=image.src;full.alt=image.alt;pixels.replaceChildren(full);viewer.showModal();}));
document.getElementById('close').addEventListener('click',()=>viewer.close());</script></html>'''
a.output.parent.mkdir(parents=True, exist_ok=True)
assert not a.output.exists(), 'Preserve earlier review versions'
a.output.write_text(page)
receipt = {'status': 'BUILT_EMBEDDED_NATIVE_MEDIA', 'html': str(a.output.resolve()), 'sha256': sha(a.output),
           'images': images, 'imageCount': len(images), 'embeddedVideos': len(clips), 'mediaManifest': str(a.media.resolve()),
           'nativeReports': [str(root / f'runtime-tele-{d}x-v{a.revision}/report.json') for d in [2, 4]],
           'r3Acceptance': str(root / 'r3-user-acceptance-v1.json'), 'teleHumanAcceptance': 'PENDING',
           'uiValidation': 'NOT_RUN', 'mediaValidation': media['status'], 'integration_status': 'NOT_MERGED'}
receipt_path = root / f'review-receipt-v{a.revision}.json'
assert not receipt_path.exists()
receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'html': receipt['html'], 'bytes': a.output.stat().st_size, 'images': len(images), 'videos': len(clips)}))
