"""Embed R7/R8 native oil motion, including intact player and enemy ownership."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image


root = Path('.artifacts/m2-3/feedback-r8-v1')
historical = Path('.artifacts/m2-3/feedback-r7-v1')
output = Path(sys.argv[1])
assert not output.exists()
output.mkdir()
media, pages = [], []
style = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.3 R8 Oil Stationary Tank Review</title><style>
body{margin:0;padding:30px;background:#181b20;color:#e7edf6;font:20px/1.5 system-ui,sans-serif}
h1{font-size:36px}h2{font-size:28px}p{max-width:1100px}a{color:#a9d0ff}nav{margin:24px 0}
.samples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
figure{margin:0;min-width:0;border:1px solid #586577;background:#242932}
figcaption{padding:12px}.pan{overflow:auto;max-height:980px}
img,video{display:block;max-width:none;width:auto;height:auto}
@media(max-width:1000px){.samples{grid-template-columns:1fr}}
</style>'''


def still(folder, name):
    detail = folder/(name+'-detail.png')
    return detail if detail.exists() else folder/(name+'.png')


def embed(file, label, page):
    data = file.read_bytes()
    video = file.suffix == '.webm'
    dimensions = [720, 640] if video else list(Image.open(file).size)
    row = dict(page=page, source=str(file.resolve()), label=label,
               type='video' if video else 'image', bytes=len(data),
               sha256=hashlib.sha256(data).hexdigest(), dimensions=dimensions)
    if video:
        report = json.loads((file.parent/'report.json').read_text())
        assert report['status'].startswith('PASS')
        capture = next(r for r in report['oilClips'] if Path(r['file']).name == file.name)
        assert capture['sourceBuffer'] == [3840, 2160]
        actor = capture.get('actor')
        if actor:
            row['nativeActor'] = actor
            assert actor['health'] == (35 if 'damaged' in file.name else 100)
        row['nativeFrames'] = len(capture['frames'])
        row['timing'] = capture['timing']
    media.append(row)
    encoded = base64.b64encode(data).decode()
    element = (f'<video controls loop muted preload="metadata" width="720" height="640" src="data:video/webm;base64,{encoded}"></video>'
               if video else f'<img alt="{html.escape(label)}" src="data:image/png;base64,{encoded}">')
    return f'<figure><figcaption>{html.escape(label)}</figcaption><div class="pan">{element}</div></figure>'


def page(name, title, description, samples):
    filename = name+'.html'
    text = style+f'<h1>{html.escape(title)}</h1><nav><a href="Review.html">Review index</a></nav>'
    text += f'<p>{html.escape(description)}</p><div class="samples">'
    text += ''.join(embed(file, label, filename) for file, label in samples)+'</div>'
    (output/filename).write_text(text+'\n')
    pages.append(dict(file=filename, title=title))


before4 = root/'baseline-r7-yr-4x-4k-v1'
after4 = root/'native-oil-yr-4x-v2'
before2 = historical/'native-oil-ra2-2x'
after2 = root/'native-oil-ra2-2x'
normal_states = [('oil-normal-motion', 'neutral, intact'),
                 ('oil-player-normal-motion', 'player owned, intact'),
                 ('oil-enemy-normal-motion', 'enemy owned, intact')]
samples = []
for clip, state in normal_states:
    samples.extend([(before4/(clip+'.webm'), f'R7 before | {state} | health 100%'),
                    (after4/(clip+'.webm'), f'R8 after | {state} | health 100%')])
samples += [(still(before4, 'CAOILD-hd'), 'R7 before | intact tank'),
            (still(after4, 'CAOILD-hd'), 'R8 after | intact tank'),
            (still(after4, 'CAOILD-player'), 'R8 after | player owned, intact'),
            (still(after4, 'CAOILD-enemy-normal'), 'R8 after | enemy owned, intact')]
page('intact-4x', "Intact oil animation | Yuri's Revenge 4X",
     'Play each clip to inspect the fixed tank behind the walking beam. All three intact ownership states '
     'have 100% native health. The neutral flag is yellow; the player is red and the enemy is blue. '
     'R8 uses one shared stationary material aligned with the body and an isolated moving beam. '
     'Clips retain native timing and run independently; they are not synchronized pixel comparisons.', samples)
samples = [(before2/'oil-normal-motion.webm', 'R7 before | neutral, intact | health 100%')]
samples += [(after2/(clip+'.webm'), f'R8 after | {state} | health 100%') for clip, state in normal_states]
samples += [(still(before2, 'CAOILD-hd'), 'R7 before | intact tank'),
            (still(after2, 'CAOILD-hd'), 'R8 after | intact tank'),
            (still(after2, 'CAOILD-player'), 'R8 after | player owned, intact'),
            (still(after2, 'CAOILD-enemy-normal'), 'R8 after | enemy owned, intact')]
page('intact-2x', 'Intact oil animation | Red Alert 2 2X',
     'The same complete oil family is registered separately at 2X. These new native player and enemy '
     'clips show the undamaged occupied animation explicitly. Native canvas geometry, masks, owner '
     'data, source identity and timing are preserved.', samples)
samples = []
for density, before, after in [(4, before4, after4), (2, before2, after2)]:
    samples += [(before/'oil-damaged-motion.webm', f'R7 before | player owned, damaged | {density}X'),
                (after/'oil-damaged-motion.webm', f'R8 after | player owned, damaged | health 35% | {density}X'),
                (after/'oil-enemy-damaged-motion.webm', f'R8 after | enemy owned, damaged | health 35% | {density}X'),
                (still(before, 'CAOILD-damaged'), f'R7 before | damaged | {density}X'),
                (still(after, 'CAOILD-damaged'), f'R8 after | player owned, damaged | {density}X'),
                (still(after, 'CAOILD-enemy-damaged'), f'R8 after | enemy owned, damaged | {density}X')]
page('damaged', 'Damaged oil animation | 2X and 4X',
     'The fixed tank remains registered in the native damaged state. Fire is the original game effect '
     'and may overlap the mechanism. Controlled ownership and damage are review fixtures applied after '
     'a real match starts; no map layout, rules or animation timing is edited.', samples)
text = style+'<h1>M2.3 R8 Oil Stationary Tank Review</h1>'
text += '<p>The tank behind the moving beam stays fixed and aligned. Intact neutral, player-owned and enemy-owned live animations are included at 2X and 4X. All pictures and videos are embedded; this folder works offline.</p><nav>'
text += '<br>'.join(f'<a href="{row["file"]}">{html.escape(row["title"])}</a>' for row in pages)+'</nav>'
text += '<p>Pictures and clips retain their captured dimensions; scroll inside panels if needed. Videos are 720x640 crops of the actual 3840x2160 framebuffer. Earlier airport, light, bridge-contact and Hell Hills loading repairs remain preserved. Visual and full-match user acceptance remain pending.</p>'
text += embed(after4/'oil-player-normal-motion.webm', 'R8 | intact player-owned live animation | health 100% | YR 4X', 'Review.html')
text += embed(still(after4, 'CAOILD-player'), 'R8 copied native oil | intact player ownership | YR 4X', 'Review.html')
(output/'Review.html').write_text(text+'\n')
manifest = dict(schema='m2-3-embedded-native-motion-review-v1',
                status='PASS_EXACT_EMBEDDED_NATIVE_IMAGE_AND_VIDEO_BYTES', entry='Review.html',
                pages=pages, media=media, networkRequired=False, userVisualAcceptance='PENDING_R8')
(output/'review-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps(dict(output=str(output), pages=len(pages)+1,
                     images=sum(r['type']=='image' for r in media), videos=sum(r['type']=='video' for r in media))))
