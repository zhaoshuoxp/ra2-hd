"""Build the self-contained R3 native-game review with matched art comparisons."""
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
accepted = root / 'runtime-accepted-4x-v1'
candidate = root / 'runtime-candidate-4x-v1'
low = root / 'runtime-candidate-2x-v1'
effects = root / 'runtime-effects-4x-v2'
media = json.loads(a.media.read_text())
clips = {c['group']: c for c in media['clips']}
reports = {label: json.loads((folder / 'report.json').read_text()) for label, folder in
           [('accepted', accepted), ('candidate', candidate), ('2x', low), ('effects', effects)]}
assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' for report in reports.values())


def image(file, label, width=None):
    style = ' style="width:' + str(width) + 'px"' if width else ''
    return '<figure><figcaption>' + html.escape(label) + '</figcaption><img' + style + ' src="' + uri(file) + '" alt="' + html.escape(label) + '"></figure>'


def clip(group, poster):
    c = clips[group]
    return '<video controls playsinline preload="metadata" poster="' + uri(poster) + '" src="' + uri(Path(c['preview']), 'video/mp4') + '"></video>'


def crop(file, name):
    destination = root / 'review-crops-v1' / name
    destination.parent.mkdir(exist_ok=True)
    Image.open(file).crop((180, 120, 460, 320)).save(destination)
    return destination


sections = []
for name, title in [('MIND', 'Mastermind'), ('LTNK', 'Lasher tank'), ('YTNK', 'Gattling tank')]:
    old, new = reports['accepted']['families'][name], reports['candidate']['families'][name]
    assert old['binding']['position'] == new['binding']['position']
    assert old['binding']['bodyHeading'] == new['binding']['bodyHeading'] == 0
    assert old['binding']['density'] == new['binding']['density'] == 4
    oldpng, newpng = accepted / f'{name}-idle-comparison-detail.png', candidate / f'{name}-idle-comparison-detail.png'
    before = crop(oldpng, name + '-accepted.png')
    after = crop(newpng, name + '-candidate.png')
    pair = '<div class="comparison">' + image(before, 'Accepted R2 / 4x texture') + image(after, 'Clean candidate / 4x texture') + '</div>'
    pair += '<p class="note">Matched native position, heading, camera and lighting. These are direct drawing-buffer crops at 1:1; no sharpening or enlargement.</p>'
    pair += '<div class="videos"><div><h3>Accepted native actions</h3>' + clip('accepted-' + name, oldpng) + '</div><div><h3>Candidate native actions</h3>' + clip('candidate-' + name, newpng) + '</div></div>'
    views = '<details><summary>All eight native headings, candidate 2x capture and full game context</summary><div class="bearings">'
    for frame in new['nativeFrames']:
        view = crop(candidate / frame['file'], name + '-' + str(frame['heading']) + '.png')
        views += image(view, str(frame['heading']) + ' degrees / live native movement')
    views += '</div><h3>2x candidate texture / same drawing-buffer scale</h3>'
    views += image(crop(low / f'{name}-idle-comparison-detail.png', name + '-2x.png'), name + ' / 2x admitted in game')
    views += '<h3>Actual game context</h3><div class="comparison">' + image(accepted / f'{name}-idle-comparison.png', 'Accepted R2') + image(candidate / f'{name}-idle-comparison.png', 'R3 candidate') + '</div></details>'
    sections.append('<section id="' + name + '"><h2>' + name + ' / ' + title + '</h2>' + pair + views + '</section>')

fx_sections = []
for name, title, file in [('MIND', 'Control from the visible vehicle roof', 'MIND-selected-native-control-arc-detail.png'),
                          ('YURIPR', 'Control from the bald crown', 'YURIPR-selected-native-control-arc-detail.png'),
                          ('TELE', 'Broad violet field follows the lifted victim', 'TELE-live-purple-ribbon-detail.png')]:
    result = reports['effects']['corrections'][name]
    assert result['actualDensity'] == 4
    fx_sections.append('<section id="fx-' + name + '"><h2>' + name + ' / ' + title + '</h2>' + image(effects / file, title)
                       + clip('effects-' + name, effects / file) + '<p class="note">Native orders and gameplay; the source recording is 3840 × 2160. The embedded video uses a fixed 1400 × 900 crop without enlargement. Selection hides control arcs; interrupted lift removes its field.</p></section>')

page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yuri R3 native-game review</title><style>
body{margin:28px auto;padding:0 28px;max-width:1380px;background:#171d20;color:#edf0f1;font:20px/1.5 system-ui}
h1{font-size:36px}
h2{font-size:29px}
h3{font-size:23px}
a{color:#a3d9ff}
section{margin:38px 0;padding-top:24px;border-top:1px solid #617077}
nav{display:flex;flex-wrap:wrap;gap:20px}
.comparison,.videos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
.comparison figure{background:#263532;text-align:center;padding:20px}
figure{margin:20px 0}
figcaption{font-size:19px;margin-bottom:14px}
img{display:block;max-width:100%;height:auto;margin:auto}
video{display:block;width:100%;margin:18px 0;background:#000}
.note{color:#bbcbd0;font-size:18px}
.bearings{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px}
details{background:#202a2f;padding:22px;margin:26px 0}
summary{cursor:pointer;font-size:22px}
.status{padding:18px;background:#293f4b}
button{font:inherit;background:#314f60;color:white;border:1px solid #7992a1;border-radius:4px;padding:8px 16px;cursor:pointer}
dialog{max-width:94vw;max-height:90vh;background:#111c22;color:white;border:1px solid #789}
dialog .native{overflow:auto;max-height:76vh}
dialog img{max-width:none;margin:0}
dialog button{margin-bottom:15px}
@media(max-width:820px){.comparison,.videos{grid-template-columns:1fr}body{padding:0 16px}}
</style><h1>Yuri R3: native-game corrections and cleaner vehicles</h1>
<p class="status">Technical native checks passed. New effect visuals and the three clean vehicle candidates await user review. Prior accepted artwork and resources are preserved.</p>
<nav><a href="#fx-MIND">Roof control</a><a href="#fx-YURIPR">Crown control</a><a href="#fx-TELE">Magnetic field</a><a href="#MIND">Mastermind</a><a href="#LTNK">Lasher</a><a href="#YTNK">Gattling</a></nav>
<p>All comparisons and videos come from immutable copied Mac apps and their sibling resources in isolated profiles. Controlled legal fixtures use native movement, turning and attack orders. The camera, logical unit geometry, rules and timings are unchanged.</p>
__EFFECTS__<h1>Clean vehicle candidates in the game</h1><p>Candidate 2x and 4x resources render all eight body headings, native shadows and attacks. Accepted independent Lasher/Gattling turrets and barrels are unchanged. Click an image to inspect its original buffer pixels.</p>__VEHICLES__
<p class="note">Known retained runtime exceptions: DISK refinery payment and YURIPR PsiWave caster destruction. macOS arm64 tested; Windows not run. Changes are isolated and not merged into main.</p>
<p class="note">Retail magnetic-field visual reference: <a href="https://www.mobygames.com/images/shots/l/55961-command-conquer-yuri-s-revenge-windows-screenshot-yuri-s-forces.jpg">original Yuri's Revenge game screenshot</a>. No reference image pixels are used in the assets.</p>
<dialog id="viewer"><button id="dismiss">Close full-resolution image</button><div class="native" id="fullViewport"></div></dialog>
<script>document.querySelectorAll('figure img').forEach(im=>{im.title='Click for original drawing-buffer pixels';im.style.cursor='zoom-in';im.onclick=()=>{const full=new Image();full.src=im.src;full.alt=im.alt;fullViewport.replaceChildren(full);viewer.showModal()}});dismiss.onclick=()=>viewer.close();document.querySelectorAll('video').forEach(v=>v.addEventListener('play',()=>document.querySelectorAll('video').forEach(other=>{if(other!==v)other.pause()})));</script></html>'''
assert not a.output.exists(), 'Preserve earlier reviews'
a.output.write_text(page.replace('__EFFECTS__', ''.join(fx_sections)).replace('__VEHICLES__', ''.join(sections)), encoding='utf-8')
receipt = {'status': 'R3_NATIVE_TECHNICAL_PASS_USER_VISUAL_PENDING', 'review': str(a.output.resolve()), 'reviewSha256': sha(a.output),
           'embeddedVideos': len(clips), 'nativeReports': {name: str(root / folder / 'report.json') for name, folder in
           [('accepted', 'runtime-accepted-4x-v1'), ('candidate', 'runtime-candidate-4x-v1'), ('2x', 'runtime-candidate-2x-v1'), ('effects', 'runtime-effects-4x-v2')]},
           'media': str(a.media.resolve()), 'matchedFamilies': ['MIND', 'LTNK', 'YTNK'], 'matchedIdleHeading': 0,
           'cameraChanged': False, 'reviewImagesSharpenedOrUpscaled': False, 'visualAcceptance': 'PENDING'}
receipt_file = root / f'review-receipt-v{a.revision}.json'
assert not receipt_file.exists(), 'Preserve completed review receipts'
receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'review': str(a.output), 'bytes': a.output.stat().st_size, 'videos': len(clips)}))
