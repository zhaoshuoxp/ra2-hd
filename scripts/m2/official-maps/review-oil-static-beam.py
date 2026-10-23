"""Embed Original, pictured R8 and minimal R12 background cleanup recordings."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image

root = Path('.artifacts/m2-3/feedback-r12-v1')
previous = Path('.artifacts/m2-3/feedback-r9-v1')
output = Path(sys.argv[1])
assert not output.exists()
output.mkdir()
media, pages = [], []
style = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.3 R12 Oil Static Beam Removal Review</title><style>
body{margin:0;padding:28px;background:#181b20;color:#e7edf6;font:20px/1.5 system-ui,sans-serif}
h1{font-size:36px}h2{font-size:28px}p{max-width:1200px}a{color:#a9d0ff}nav{margin:22px 0}
.samples{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
figure{margin:0;min-width:0;border:1px solid #586577;background:#242932}
figcaption{padding:12px}.pan{overflow:auto;max-height:980px}img,video{display:block;max-width:none;width:auto;height:auto}
@media(max-width:1100px){.samples{grid-template-columns:1fr}}
</style>'''


def still(folder, name):
    return folder/(name+'-detail.png')


def embed(file, label, page):
    data = file.read_bytes(); video = file.suffix == '.webm'
    row = dict(page=page, source=str(file.resolve()), label=label, type='video' if video else 'image',
               bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), dimensions=[720, 640] if video else list(Image.open(file).size))
    if video:
        report = json.loads((file.parent/'report.json').read_text())
        assert report['status'].startswith('PASS')
        clip = next(c for c in report['oilClips'] if Path(c['file']).name == file.name)
        assert clip['sourceBuffer'] == [3840, 2160]
        row.update(nativeActor=clip['actor'], timing=clip['timing'],
                   activeFrames=sorted({f['frames'][0] for f in clip['frames']}))
        assert clip['actor']['health'] == (35 if 'damaged' in file.name else 100)
    media.append(row)
    encoded = base64.b64encode(data).decode()
    element = (f'<video controls loop muted preload="metadata" src="data:video/webm;base64,{encoded}"></video>'
               if video else f'<img alt="{html.escape(label)}" src="data:image/png;base64,{encoded}">')
    return f'<figure><figcaption>{html.escape(label)}</figcaption><div class="pan">{element}</div></figure>'


def page(name, title, description, samples):
    filename = name+'.html'
    text = style+f'<h1>{html.escape(title)}</h1><nav><a href="Review.html">Review index</a></nav>'
    text += f'<p>{html.escape(description)}</p><div class="samples">'
    text += ''.join(embed(file, label, filename) for file, label in samples)+'</div>'
    (output/filename).write_text(text+'\n')
    pages.append(dict(file=filename, title=title))


sets = {
    4: [('Original', previous/'original-yr-4k-v1'), ('R8 visual baseline', Path('.artifacts/m2-3/feedback-r8-v1/native-oil-yr-4x-v2')),
        ('R12 candidate', root/'native-oil-yr-4x')],
    2: [('Original', previous/'original-ra2-2x'), ('R8 visual baseline', Path('.artifacts/m2-3/feedback-r8-v1/native-oil-ra2-2x')),
        ('R12 candidate', root/'native-oil-ra2-2x')],
}
for density, sources in sets.items():
    samples = []
    for clip, state in [('oil-normal-motion', 'neutral, intact'), ('oil-player-normal-motion', 'player owned, intact'),
                        ('oil-enemy-normal-motion', 'enemy owned, intact')]:
        samples.extend((folder/(clip+'.webm'), f'{label} | {state} | health 100% | {density}X') for label, folder in sources)
    samples += [(still(folder, 'CAOILD-player'), f'{label} | intact player ownership | {density}X') for label, folder in sources]
    page(f'intact-{density}x', f'Intact oil | {density}X | Original / R8 / R12',
        'Original neutral oil does not pump; only its flag moves. Player/enemy ownership activates all 32 normal phases. '
        'Inspect the fixed tank, one walking beam, thin connecting rod and fixed motor bearing through the full cycle. '
        'These are independent native captures, not synchronized tick-by-tick comparisons.', samples)
samples = []
for density, sources in sets.items():
    for clip, state in [('oil-damaged-motion', 'player owned'), ('oil-enemy-damaged-motion', 'enemy owned')]:
        samples.extend((folder/(clip+'.webm'), f'{label} | damaged, {state} | health 35% | {density}X') for label, folder in sources)
    samples += [(still(folder, 'CAOILD-damaged'), f'{label} | damaged player ownership | {density}X') for label, folder in sources]
page('damaged', 'Damaged oil | 2X and 4X | Original / R8 / R12',
    'Damaged native playback loops through frames 33-63; frame 32 is the initial pose. Fire is the original game effect. '
    'R12 removes only the baked stationary walking beam. Moving beam and drive RGB retain the pictured R8 material. '
    'Body, flag, native geometry and animation timing remain exact. Visual acceptance remains pending.', samples)
text = style+'<h1>M2.3 R12 Oil Static Beam Removal Review</h1>'
text += '<p>Original and pictured R8 recordings accompany the minimal R12 background correction. Intact and damaged player/enemy ownership are included at 2X and 4X. Every picture and video is embedded; all navigation is local.</p><nav>'
text += '<br>'.join(f'<a href="{p["file"]}">{html.escape(p["title"])}</a>' for p in pages)+'</nav>'
text += '<p>Clips retain native timing and 720x640 framebuffer crops from actual 3840x2160 output. Pictures retain their captured dimensions; scroll inside panels. Airport, light, bridge-contact and Hell Hills loading repairs remain preserved. This is a review candidate; visual and full-match user acceptance remain pending.</p>'
after = root/'native-oil-yr-4x'
text += embed(after/'oil-player-normal-motion.webm', 'R12 | intact player-owned native animation | YR 4X', 'Review.html')
text += embed(still(after, 'CAOILD-player'), 'R12 | intact player-owned native rendering | YR 4X', 'Review.html')
(output/'Review.html').write_text(text+'\n')
manifest = dict(schema='m2-3-embedded-native-motion-review-v1', status='PASS_EXACT_EMBEDDED_NATIVE_IMAGE_AND_VIDEO_BYTES',
                entry='Review.html', pages=pages, media=media, networkRequired=False, userVisualAcceptance='PENDING_R12')
(output/'review-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps(dict(output=str(output), pages=len(pages)+1, images=sum(m['type']=='image' for m in media), videos=sum(m['type']=='video' for m in media))))
