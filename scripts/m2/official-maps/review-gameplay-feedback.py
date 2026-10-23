"""Embed actual copied-app R5/R6 captures for the three reusable gameplay fixes."""
import argparse
import base64
import hashlib
import html
import json
import re
from pathlib import Path

from PIL import Image


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('evidence', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert not args.output.exists(), 'Keep historical reviews immutable'
args.output.mkdir()
root = args.evidence.resolve()
sections = []
images = []


def picture(directory, file, label):
    source = root/directory/file
    data = source.read_bytes()
    with Image.open(source) as im:
        size = list(im.size)
    images.append(dict(source=str(source), sha256=hashlib.sha256(data).hexdigest(), size=size, label=label))
    return ('<figure><figcaption>'+html.escape(label)+f' | {size[0]} x {size[1]} captured pixels</figcaption>'
        '<div class="pan"><img loading="lazy" alt="'+html.escape(label, quote=True)+'" src="data:image/png;base64,'
        +base64.b64encode(data).decode()+'"></div></figure>')


def section(identity, title, note, samples):
    sections.append((identity, title, '<section id="'+identity+'"><h2>'+html.escape(title)+'</h2><p>'+html.escape(note)
        +'</p><div class="samples">'+''.join(picture(*sample) for sample in samples)+'</div></section>'))


before = 'baseline-grinder-4x'
final = 'native-selected-yr-grinder-4x'
second = 'native-selected-ra2-14-2x'
for name, title in [('CAAIRP','Airport'),('CAOILD','Oil derrick')]:
    section(name, title+' component alignment',
        'Copied native matches: Yuri\'s Revenge, xgrinder.map, 4X. The R5 and R6 captures use the same placement and camera. '
        'Animation phase and tick can differ between runs. R6 uses one coherent model with native masks, timing and owner data.',
        [(before,name+'-hd-detail.png','R5 before | YR 4X'),(final,name+'-hd-detail.png','R6 after | YR 4X'),
         (final,name+'-player-detail.png','R6 controlled player ownership | YR 4X'),
         (final,name+'-damaged-detail.png','R6 native damaged state | YR 4X'),
         (final,name+'-enemy-damaged-detail.png','R6 enemy ownership, damaged | YR 4X'),
         (second,name+'-hd-detail.png','R6 second-map reuse | RA2 mp14t2.map 2X'),
         (second,name+'-damaged-detail.png','R6 damaged second-map control | RA2 2X')])
section('lamps','Local lamp colors',
    'Retail INBLULMP LightGreenTint=0,01 previously became the numeric fallback 1. '
    'R6 reads 0.01, preserving the intended blue lamp and the accepted alpha-preserving lamp strength shader. '
    'The RA2 map-specific yellow tint remains 0.35, 0.2, 0.02.',
    [(before,'INBLULMP-hd-detail.png','R5 green defect | YR 4X'),
     (final,'INBLULMP-hd-detail.png','R6 corrected blue tint | YR 4X'),
     (second,'INYELWLAMP-hd-detail.png','R6 map override control | RA2 2X')])
bridge_before = 'baseline-grinder-bridges-4x-v2'
section('high','High concrete bridge contacts',
    'Native xgrinder.map bridge, YR 4X. Compare shared deck material and water-bearing bridge approach regions. '
    'Demolition removes native bridge objects; the repair hut and engineer restore the bridge through native behavior.',
    [(bridge_before,'high-bridge-standing-detail.png','R5 standing deck'),
     (final,'high-bridge-standing-detail.png','R6 standing deck'),
     (bridge_before,'high-bridge-demolished-framebuffer.png','R5 demolished | full framebuffer'),
     (final,'high-bridge-demolished-framebuffer.png','R6 demolished | full framebuffer'),
     (final,'high-bridge-approach-detail.png','R6 deck-to-road contact and repair hut'),
     (final,'high-bridge-pier-water-detail.png','R6 demolished pier-to-water contact'),
     (final,'high-bridge-damaged-detail.png','R6 damaged deck'),
     (final,'high-bridge-repaired-framebuffer.png','R6 after native engineer repair | full framebuffer')])
section('low','Low concrete bridge contacts',
    'R5 before is YR XMP03T4.map 4X; R6 after is the RA2 MP03T4.map 4X edition control. '
    'The edition and animation/light context are labeled explicitly. These native scenes exercise the same reusable concrete bridge family.',
    [('baseline-yr-town-4x','low-bridge-standing-detail.png','R5 standing | YR 4X'),
     ('native-selected-ra2-town-4x','low-bridge-standing-detail.png','R6 standing | RA2 4X'),
     ('baseline-yr-town-4x','low-bridge-demolished-framebuffer.png','R5 demolished | YR 4X full framebuffer'),
     ('native-selected-ra2-town-4x','low-bridge-demolished-framebuffer.png','R6 demolished | RA2 4X full framebuffer'),
     ('native-selected-ra2-town-4x','low-bridge-approach-detail.png','R6 bridge approach | RA2 4X'),
     ('native-selected-ra2-town-4x','low-bridge-pier-water-detail.png','R6 water contact | RA2 4X'),
     ('native-selected-yr-town-2x','low-bridge-standing-detail.png','R6 density and edition control | YR 2X')])
header = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.3 R6 Gameplay Feedback Review</title><style>
body{margin:0;background:#17191d;color:#e8ebf1;font:20px/1.5 system-ui,sans-serif;padding:32px}
h1{font-size:36px;margin:0 0 16px}h2{font-size:28px}p{max-width:1100px}a{color:#9bc8ff}
section{border-top:1px solid #566070;margin-top:44px;padding-top:20px}
.samples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
figure{margin:0;min-width:0;background:#242830;border:1px solid #515969}
figcaption{padding:12px;font-size:19px}.pan{overflow:auto;max-height:980px}
img{display:block;max-width:none;width:auto;height:auto;image-rendering:auto}
@media(max-width:1000px){.samples{grid-template-columns:1fr}body{padding:20px}}
</style><h1>M2.3 R6 Gameplay Feedback Review</h1>
<p>Shared resource corrections for airport/oil animations, concrete bridge road/water contacts and widespread green local lights.
All pictures are embedded PNGs from copied native Mac matches. Scroll inside each picture to inspect the captured size; no network or separate image link is needed.</p>
<p>Controlled native state checks and structural coverage are complete for the recorded cases. This is not a full-match playthrough of all 61 maps.
R6 user visual/gameplay acceptance remains pending. Prior R5 resources, applications, archives and acceptance records are preserved.</p>
'''
pages = []
all_encoded = []
for identity, title, content in sections:
    file = args.output/(identity+'.html')
    document = header+'<nav><a href="Review.html">Overview</a></nav>'+content+'</html>\n'
    file.write_text(document)
    all_encoded.extend(re.findall(r'src="data:image/png;base64,([^"]+)"',file.read_text()))
    assert not re.search(r'(?:src|href)="(?:https?:|file:|/)',document)
    pages.append(dict(file=file.name,title=title,bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
navigation = '<nav>'+' | '.join('<a href="'+p['file']+'">'+html.escape(p['title'])+'</a>' for p in pages)+'</nav>'
file = args.output/'Review.html'
file.write_text(header+navigation+picture(final,'CAAIRP-hd-detail.png','R6 native preview | YR 4X')+'</html>\n')
all_encoded.extend(re.findall(r'src="data:image/png;base64,([^"]+)"',file.read_text()))
encoded = all_encoded
assert len(encoded)==len(images)
for value,row in zip(encoded,images):
    assert hashlib.sha256(base64.b64decode(value)).hexdigest()==row['sha256']
manifest = dict(schema='m2-3-r6-embedded-native-review-v1',status='PASS_ALL_EMBEDDED_NATIVE_PNG_BYTES',
    entry='Review.html',pages=pages,pictures=images,htmlSha256=hashlib.sha256(file.read_bytes()).hexdigest())
(args.output/'review-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(status=manifest['status'],pictures=len(images),pages=len(pages)+1,
    bytes=sum(p.stat().st_size for p in args.output.glob('*.html')))))
