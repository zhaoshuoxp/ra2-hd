"""Embed copied native R6/R7 stills and live oil-motion clips for offline review."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image


root = Path('.artifacts/m2-3/feedback-r7-v1')
output = Path(sys.argv[1])
assert not output.exists()
output.mkdir()
media = []
style = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.3 R7 Loading and Oil Motion Review</title><style>
body{margin:0;padding:30px;background:#181b20;color:#e7edf6;font:20px/1.5 system-ui,sans-serif}
h1{font-size:36px}h2{font-size:28px}p{max-width:1100px}a{color:#a9d0ff}nav{margin:24px 0}
.samples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
figure{margin:0;min-width:0;border:1px solid #586577;background:#242932}
figcaption{padding:12px}.pan{overflow:auto;max-height:980px}
img,video{display:block;max-width:none;width:auto;height:auto}
@media(max-width:1000px){.samples{grid-template-columns:1fr}}
</style>'''


def embed(file, label, page):
    data = file.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    video = file.suffix == '.webm'
    size = [720, 640] if video else list(Image.open(file).size)
    media.append(dict(page=page, source=str(file.resolve()), label=label,
                      type='video' if video else 'image', bytes=len(data), sha256=digest, dimensions=size))
    encoded = base64.b64encode(data).decode()
    element = (f'<video controls loop muted preload="metadata" width="720" height="640" src="data:video/webm;base64,{encoded}"></video>'
               if video else f'<img alt="{html.escape(label)}" src="data:image/png;base64,{encoded}">')
    return f'<figure><figcaption>{html.escape(label)}</figcaption><div class="pan">{element}</div></figure>'


pages = []


def page(name, title, description, samples):
    filename = name+'.html'
    text = style+f'<h1>{html.escape(title)}</h1><nav><a href="Review.html">Review index</a></nav>'
    text += f'<p>{html.escape(description)}</p><div class="samples">'
    text += ''.join(embed(file, label, filename) for file, label in samples)+'</div>'
    (output/filename).write_text(text+'\n')
    pages.append(dict(file=filename, title=title))


before = root/'baseline-oil-yr-4x'
after = root/'native-oil-yr-4x'
page('oil-4x', 'Oil pump motion | Yuri\'s Revenge 4X',
     'The live clips use native animation timing and a 720x640 crop of the actual 3840x2160 framebuffer. '
     'R7 replaces palette-index material displacement with crisp authored poses and bounded rigid beam rotation; '
     'fixed supports retain a stable canonical material. The body, flag, original masks, ownership data and timing are preserved. '
     'Clips run independently and are not synchronized pixel comparisons. Play the videos to inspect the walking beam and connecting rods.',
     [(before/'oil-normal-motion.webm', 'R6 before | normal native motion'),
      (after/'oil-normal-motion.webm', 'R7 after | normal native motion'),
      (before/'oil-damaged-motion.webm', 'R6 before | damaged native motion'),
      (after/'oil-damaged-motion.webm', 'R7 after | damaged native motion'),
      (before/'CAOILD-hd-detail.png', 'R6 before | normal'),
      (after/'CAOILD-hd-detail.png', 'R7 after | normal'),
      (after/'CAOILD-player-detail.png', 'R7 | controlled player ownership'),
      (after/'CAOILD-damaged-detail.png', 'R7 | native damaged state'),
      (after/'CAOILD-enemy-damaged-detail.png', 'R7 | enemy ownership, damaged')])
second = root/'native-oil-ra2-2x'
old_second = Path('.artifacts/m2-3/feedback-r6-v1/native-selected-ra2-14-2x')
page('oil-2x', 'Oil pump motion | Red Alert 2 2X',
     'The same complete oil family is registered independently at 2X on mp14t2.map. '
     'Both editions and both densities have copied native normal, damage and ownership checks. '
     'R6 pictures are retained historical captures; R7 motion clips are new copied-app evidence.',
     [(second/'oil-normal-motion.webm', 'R7 | normal native motion, RA2 2X'),
      (second/'oil-damaged-motion.webm', 'R7 | damaged native motion, RA2 2X'),
      (old_second/'CAOILD-hd-detail.png', 'R6 before | RA2 2X'),
      (second/'CAOILD-hd-detail.png', 'R7 after | RA2 2X'),
      (second/'CAOILD-player-detail.png', 'R7 | player ownership, RA2 2X'),
      (second/'CAOILD-damaged-detail.png', 'R7 | damaged, RA2 2X')])
page('map-loading', 'Hell Hills | native map loading',
     'The shipped map is hillbtwn.map in Yuri\'s Revenge, using the URBAN theater. '
     'Retail CALA14/CALA15 use Foundation=3X3. The old lowercase-only delimiter produced a nonfinite height, '
     'then an empty health-bar geometry merge failed during game initialization. R7 recognizes either delimiter case '
     'and keeps the declared 3x3 footprint. Loading succeeds at 4X, 2X and Original. '
     'This shared compatibility correction does not produce new URBAN artwork or establish a full-match playthrough.',
     [(root/'baseline-hillbtwn-4x-v2/setup-failure.png', 'R6 before | native loading error'),
      (root/'native-hillbtwn-4x/running-map.png', 'R7 after | running match, HD 4X'),
      (root/'native-hillbtwn-2x/running-map.png', 'R7 after | running match, HD 2X'),
      (root/'native-hillbtwn-original/running-map.png', 'R7 after | running match, Original')])
text = style+'<h1>M2.3 R7 Loading and Oil Motion Review</h1>'
text += '<p>Hell Hills loading compatibility and clearer oil pump animation. The user-reported repaired R6 airport, local lights and bridge contacts retain their exact resource bytes. All images and videos are embedded; no network is needed.</p><nav>'
text += '<br>'.join(f'<a href="{row["file"]}">{html.escape(row["title"])}</a>' for row in pages)+'</nav>'
text += '<p>Pictures and clips retain their captured dimensions. Scroll inside panels when needed. R7 user visual/gameplay acceptance remains pending. The 61-name checklist still describes selectable TEMPERATE coverage; other theaters retain previous artwork and fallback.</p>'
text += embed(after/'CAOILD-hd-detail.png', 'R7 copied native oil scene | YR 4X', 'Review.html')
(output/'Review.html').write_text(text+'\n')
manifest = dict(schema='m2-3-embedded-native-motion-review-v1', status='PASS_EXACT_EMBEDDED_NATIVE_IMAGE_AND_VIDEO_BYTES',
                entry='Review.html', pages=pages, media=media, networkRequired=False)
(output/'review-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps(dict(output=str(output), pages=len(pages)+1, images=sum(row['type']=='image' for row in media),
                     videos=sum(row['type']=='video' for row in media))))
