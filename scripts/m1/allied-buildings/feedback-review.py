"""Self-contained changed-item review with synchronized full-density frames."""
import base64
import io
import json
from pathlib import Path
from PIL import Image
from production_common import ROOT, row_for, raw_for, decode, sha

OUT = ROOT / 'feedback-review-v1'
OUT.mkdir(exist_ok=False)
old_versions = {'GTGCAN': 'mask-exports-v2', 'GAPILL': 'mask-exports-v2', 'GAAIRC': 'full-exports-v2',
                'GACSPH': 'full-exports-v4', 'GAWEAT': 'full-exports-v3'}
notes = {
    'GTGCAN': 'The moving carriage now joins along the curved socket. The stationary base and accepted eight-direction turret remain unchanged.',
    'GAPILL': 'The selected runtime frames already contain 2x authored detail. The previous review downsampled them into a 1x indexed GIF. This viewer retains the original 2x RGBA pixels; no resource repaint or pack change.',
    'GAAIRC': 'The early radar assembly is aligned to the later tower axis. Pad expansion is independent. AMRADR shares this complete image family.',
    'GACSPH': 'Native electrical white cores and the full blue ramp are restored for charging and discharge. Construction artwork is unchanged.',
    'GAWEAT': 'Construction uses silver-white unpowered cores without electrical overlays. Blue protective shells close over them. Charged states retain the native electrical arcs and powered cores.',
}


def uri(image):
    if isinstance(image, Path):
        data = image.read_bytes()
    else:
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        data = buffer.getvalue()
    return 'data:image/png;base64,' + base64.b64encode(data).decode()


def frame(row, folder, member, n):
    f = raw_for(member['source']['sha256'])['frames'][n]
    image = Image.new('RGBA', tuple(v * 2 for v in member['canvas']))
    if not f['empty']:
        exported = Image.open(folder / f"{member['source']['member'][:-4]}-{n:03}-2x.png").convert('RGBA')
        image.alpha_composite(exported, (f['x'] * 2, f['y'] * 2))
    return image


widgets = []


def widget(identity, theater, member, indices, title):
    row = row_for(identity, theater)
    name = identity + ('-SNOW' if theater == 'SNOW' else '')
    old = ROOT / old_versions[identity] / name
    new = old if identity == 'GAPILL' else ROOT / 'feedback-exports-v1' / name
    width, height = member['canvas']
    columns = []
    for label, folder in [('Original', None), ('Previous review', old), ('Corrected HD', new)]:
        frames = []
        for n in indices:
            image = decode(row, member, n).resize((width * 2, height * 2), Image.Resampling.NEAREST) if folder is None else frame(row, folder, member, n)
            if identity == 'GAPILL' and folder == old and label == 'Previous review':
                gif = Image.open(old / 'construction.gif')
                gif.seek(n)
                image = gif.convert('RGBA').resize((width * 2, height * 2), Image.Resampling.LANCZOS)
            frames.append(uri(image))
        columns.append({'label': label, 'frames': frames})
    index = len(widgets)
    widgets.append({'width': width, 'height': height, 'indices': indices, 'columns': columns})
    return f'''<section class="animation" data-widget="{index}"><h3>{title}</h3>
<div class="controls"><button class="play">Pause</button><label>Frame <input class="scrub" type="range" min="0" max="{len(indices)-1}" value="0"></label>
<output>0</output><label>View <select><option value="1">Native size</option><option value="2">2x inspection</option></select></label></div>
<div class="strip">{''.join(f'<figure><figcaption>{c["label"]}</figcaption><canvas width="{width*2}" height="{height*2}" style="width:{width}px;height:{height}px"></canvas></figure>' for c in columns)}</div></section>'''


cards = []
for identity in old_versions:
    body = ''
    for theater in ('TEMPERATE', 'SNOW'):
        row = row_for(identity, theater)
        if identity != 'GACSPH':
            member = next(m for m in row['members'] if 'BUILDUP' in m['roles'])
            body += widget(identity, theater, member, list(range(member['visibleFrames'])), f'{theater.title()} construction')
        if identity in ('GACSPH', 'GAWEAT'):
            for member in row['members'][2:5]:
                animation = next(a for a in row['animations'] if a['member'] == member['source']['member'])
                normal = animation['normal']
                indices = list(range(normal['start'], normal['loopEnd'] + 1))
                body += widget(identity, theater, member, indices, f'{theater.title()} {animation["name"]} — charge / ready / discharge')
    cards.append(f'<article id="{identity}"><h2>{identity}</h2><p>{notes[identity]}</p>{body}</article>')
report_path = ROOT / 'feedback-smoke-v1/result.json'
report = json.loads(report_path.read_text())
assert report['status'] == 'PASS_PACKAGED_FEEDBACK_CASES'
captures = []
for file, label in [('native-ready-effects.png', 'Native countdown selected the ready electrical loops'),
                    ('native-chrono-complete.png', 'Native Chronosphere action teleported the target unit'),
                    ('native-weather-clouds.png', 'Native Lightning Storm action created visible storm clouds')]:
    image = ROOT / 'feedback-smoke-v1/yr-temperate' / file
    captures.append(f'<figure><figcaption>{label}</figcaption><img src="{uri(image)}" alt="{label}" style="width:min(100%,1100px)"></figure>')
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Allied Buildings — Corrections Review</title><style>
body{font:18px/1.5 system-ui;margin:24px;background:#17201c;color:#eef2ef}main{max-width:1400px;margin:auto}h1{font-size:34px}h2{font-size:28px}h3{font-size:21px}
article,section.evidence{background:#23322a;padding:22px;border-radius:12px;margin:22px 0}nav,.controls,.strip{display:flex;flex-wrap:wrap;gap:20px;align-items:center}
nav a{color:#bde6cb}figure{margin:10px 0;max-width:100%}figcaption{margin-bottom:8px}canvas{background:#34483d;max-width:100%;object-fit:contain}button,select,input{font:inherit}button,select{padding:6px 12px}
.animation{border-top:1px solid #547260;margin-top:24px}.strip{align-items:flex-start}output{min-width:90px}img{height:auto}p{max-width:1100px}
</style><main><h1>Allied Buildings — Corrections Review</h1>
<p>Only the four reported issues and their direct context are included. All comparisons use the same native canvas and synchronized frame. Corrected animations retain 2x RGBA pixels. Playback is slowed for inspection; in-game timing is unchanged. Pause and scrub to inspect alignment.</p>
<p>Technical checks passed for the affected temperate and snow families in the packaged application. Final visual acceptance remains open. Earlier full-roster and shared-behavior evidence is retained at its original build boundary.</p><nav>'''
html += ''.join(f'<a href="#{identity}">{identity}</a>' for identity in old_versions) + '</nav>' + ''.join(cards)
html += '<section class="evidence"><h2>Actual packaged effects</h2><p>Legal building placement and a one-time remaining-charge preset prepared the scene. No trainer modifiers were used. Native countdown selected opening and ready loops; native actions triggered teleportation and the lightning storm, followed by closure and effect cleanup.</p>' + ''.join(captures) + '</section>'
html += '<script type="application/json" id="frames">' + json.dumps(widgets, separators=(',', ':')) + '</script>'
html += '''<script>
const data=JSON.parse(document.querySelector('#frames').textContent);
window.reviewReady=Promise.all([...document.querySelectorAll('.animation')].map(async section=>{
 const model=data[Number(section.dataset.widget)],canvases=[...section.querySelectorAll('canvas')];
 const images=await Promise.all(model.columns.map(c=>Promise.all(c.frames.map(src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})))));
 let frame=0,playing=true,last=0;const slider=section.querySelector('input'),output=section.querySelector('output');
 function draw(){canvases.forEach((canvas,i)=>{const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(images[i][frame],0,0)});slider.value=frame;output.textContent=model.indices[frame]+' / '+model.indices.at(-1)}
 section.querySelector('button').onclick=e=>{playing=!playing;e.target.textContent=playing?'Pause':'Play'};
 slider.oninput=()=>{playing=false;section.querySelector('button').textContent='Play';frame=Number(slider.value);draw()};
 section.querySelector('select').onchange=e=>canvases.forEach(c=>{c.style.width=model.width*Number(e.target.value)+'px';c.style.height=model.height*Number(e.target.value)+'px'});
 function tick(now){if(playing&&now-last>160){frame=(frame+1)%model.indices.length;draw();last=now}requestAnimationFrame(tick)}draw();requestAnimationFrame(tick);
 return {frames:model.indices.length,density:2,columns:canvases.length};
}));
</script></main></html>'''
path = OUT / 'Allied-Buildings-Corrections.html'
path.write_text(html)
receipt = {'status': 'TECHNICAL_PASS_VISUAL_REVIEW_PENDING', 'htmlSha256': sha(path), 'widgets': len(widgets),
           'catalogSha256': sha(Path('desktop/allied-building-coverage.json')),
           'buildIdentitySha256': sha(ROOT / 'feedback-build-v1/identity.json'),
           'nativeEvidenceSha256': sha(report_path), 'resourceChanges': ['GTGCAN', 'GAAIRC', 'GACSPH', 'GAWEAT'],
           'reviewOnly': ['GAPILL'], 'reusedEvidence': ['final-smoke-v1/result.json', 'shared-smoke-v3/result.json']}
(OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(path, path.stat().st_size, len(widgets), 'animation groups')
