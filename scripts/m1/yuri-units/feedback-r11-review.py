"""Build an offline motion review with embedded, fully decoded native recordings."""
import argparse
import base64
import hashlib
import html
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument('root', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--ffmpeg', type=Path, required=True)
a = p.parse_args()
root, output = a.root.resolve(), a.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
assert not output.exists()
media_dir = root / 'embedded-media-v1'
media_dir.mkdir(exist_ok=False)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
uri = lambda file, kind='image/png': 'data:' + kind + ';base64,' + base64.b64encode(file.read_bytes()).decode()
clips, images = [], []


def figure(file, label):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append({'source': str(file), 'sha256': sha(file), 'size': size, 'label': label})
    return f'<figure><figcaption>{html.escape(label)}</figcaption><img src="{uri(file)}" alt="{html.escape(label)}"></figure>'


def replay(directory, stem, label, poster=None, crop=None):
    source = directory / (stem + '.webm')
    report = json.loads((directory / 'report.json').read_text())
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES', directory
    if crop is None:
        crop = next((stage['videoCrop'] for stage in report.get('stages', [])
                     if stage['name'] == stem and 'videoCrop' in stage), [1018, 255 if stem.startswith('CAOS') else 147, 1400, 900])
    x, y, width, height = crop
    assert [width, height] == [1400, 900]
    target = media_dir / f'clip-{len(clips)}.mp4'
    subprocess.run([str(a.ffmpeg), '-nostdin', '-loglevel', 'error', '-i', str(source),
                    '-vf', f'crop={width}:{height}:{x}:{y},setsar=1', '-an', '-c:v', 'libx264',
                    '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)], check=True)
    decode = subprocess.run([str(a.ffmpeg), '-nostdin', '-hide_banner', '-i', str(target), '-f', 'null', '-'],
                            capture_output=True, text=True, check=True)
    assert '1400x900' in decode.stderr and 'Video: h264' in decode.stderr
    poster = poster or directory / (stem + '-detail.png')
    clips.append({'group': label, 'source': str(source), 'sourceSha256': sha(source), 'preview': str(target),
                  'sha256': sha(target), 'crop': crop, 'size': [1400, 900], 'fullyDecoded': True,
                  'nativeReport': str(directory / 'report.json'), 'resampled': False})
    return f'<section class="replay"><h3>{html.escape(label)}</h3><video controls playsinline preload="metadata" poster="{uri(poster)}" src="{uri(target, "video/mp4")}"></video></section>'


comparisons = []
for actor in ['CAOS', 'DISK']:
    comparisons.append('<section><h2>' + ('Chaos Drone / emission, expansion and fade' if actor == 'CAOS'
                                        else 'Floating Disc / native reference and new surface rotation') + '</h2><div class="pair">')
    for density, label in [(0, 'Original resources / project engine'), (4, 'R11 / 4x assets')]:
        directory = root / ('runtime-original-v1' if not density else f'runtime-{density}x-v2')
        comparisons.append(replay(directory, f'{actor}-motion-r11', f'{actor} / {label}'))
    comparisons.append('</div></section>')
low = ''.join(replay(root / 'runtime-2x-v2', f'{actor}-motion-r11', f'{actor} / R11 / 2x assets')
              for actor in ['CAOS', 'DISK'])
flight = replay(root / 'runtime-flight-4x-v1', 'DISK-native-flight-and-turns', 'DISK / eight flight bearings',
                root / 'runtime-flight-4x-v1/DISK-flight-0.png')
attack = replay(root / 'runtime-effects-4x-v1', 'DISK-native-feedback-correction', 'DISK / ring, ray and cleanup',
                root / 'runtime-effects-4x-v1/DISK-ring-live-frame.png')
before = replay(root / 'baseline-hd-v1', 'DISK-motion-r11', 'DISK / superseded R10 bearing crossfade')

phase_dir = root / 'runtime-4x-v2'
contact = Image.new('RGB', (1680, 600))
draw = ImageDraw.Draw(contact)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
for i, bearing in enumerate(range(0, 360, 45)):
    contact.paste(Image.open(phase_dir / f'DISK-phase-{bearing}.png'), (i % 4 * 420, i // 4 * 300))
    draw.text((i % 4 * 420 + 8, i // 4 * 300 + 8), f'Native bearing {bearing}', fill='white', font=font)
phase_contact = root / 'selected-phase-contact-v1.png'
assert not phase_contact.exists()
contact.save(phase_contact)
phase = figure(phase_contact, 'Eight captured phases / native drawing-buffer pixels / fixed silhouette')
source = figure(root / 'source-v1/cdgas-contact.png', 'Retail CDGAS source frames / original palette and sequence')
public = figure(root / 'public-reference-v1/contact.png', 'Public original gameplay / 20 browser-captured frames / 50 ms intervals')

page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yuri R11 motion review</title><style>
body{max-width:1680px;margin:28px auto;padding:0 24px;background:#171d20;color:#edf0f1;font:20px/1.5 system-ui}
h1{font-size:36px}h2{font-size:28px}h3{font-size:22px}a{color:#a3d9ff}section{margin:28px 0}figure{margin:20px 0}
figcaption{font-size:19px;margin-bottom:12px}img{display:block;max-width:100%;height:auto;cursor:zoom-in}
video{display:block;width:100%;background:#000}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.note{font-size:18px;color:#bbcbd0}.status{background:#293f4b;padding:18px}button{font:inherit;padding:8px 16px;cursor:pointer}
nav{display:flex;gap:18px;flex-wrap:wrap}details{padding:18px;background:#202a2f}dialog{max-width:96vw;max-height:95vh;background:#171d20;color:white}
dialog::backdrop{background:#000b}.pixels{overflow:auto;max-height:80vh;margin-top:14px}.pixels img{max-width:none}
@media(max-width:900px){.pair{grid-template-columns:1fr}body{padding:0 14px}}
</style><h1>Yuri R11 / smoke and disc motion</h1>
<p class="status">Technical verification is complete for the selected local Mac app. These revised visuals await user acceptance.</p>
<p>The Original comparisons use retail resources in the project engine. A freshly recorded Westwood executable run is unavailable on this Mac. Public original gameplay was also sampled frame by frame; its revision and tick rate are unverified.</p>
<nav><a href="#comparisons">Original / 4x</a><a href="#phases">Disc phases</a><a href="#flight">Flight / attack</a><a href="#low">2x</a><a href="#reference">Reference analysis</a></nav>
<p><button id="play">Play all comparisons</button> <button id="pause">Pause all videos</button></p>
<div id="comparisons">''' + ''.join(comparisons) + '''</div>
<p class="note">All videos are embedded, muted native recordings. Fixed 1400 × 900 crops retain source drawing-buffer pixels without enlargement or sharpening. Independent runs can differ in simulation timing; playback alignment is approximate.</p>
<section id="phases"><h2>Stable outline and traveling surface landmarks</h2>''' + phase + '''
<p>Gold-plate seams, vents and red-collar markings move around the axis. The red belt retains its cone height, and alpha coverage retains the complete registered outline. Cabin seams follow the same conical longitude mapping. Owner remap follows the moving surface colors.</p>''' + before + '''</section>
<section id="flight"><h2>Native flight and attack lifecycle</h2><div class="pair">''' + flight + attack + '''</div></section>
<section id="low"><h2>2x assets / same drawing buffer</h2><div class="pair">''' + low + '''</div></section>
<section id="reference"><h2>Original motion evidence and practical limits</h2>''' + source + public + '''
<p><a href="https://www.youtube.com/watch?v=r9kVlfDfLOI&amp;t=2052">Public gameplay source / MasterofRoflness / 34:12</a>. Twenty displayed frames were captured from 2052.385 to 2053.335 seconds. The surface marks change bearing while the body remains complete; camera scrolling and vehicle travel are separate motions. This sample does not establish exact revolution duration.</p>
<p>Retail CDGAS contains 40 frames: narrow emission streams, expanding arcs, a dense ring and dissipation. R10 already advanced its native frame counter. R11 blends adjacent palette-resolved frames and adds small continuous cloud displacements while retaining native emission timing, footprint and lifetime.</p></section>
<details><summary>Validation, preserved assets and limitations</summary><p>Native deploy/undeploy, gas frame progression and cleanup, complete disc rotation, eight flight bearings, circumference sweep, outgoing ray and laser cleanup pass. Focused tests and entry type checking pass.</p>
<p>Disc motion is an approximate reconstruction from the accepted photograph. Its occluded rear surface reuses the visible front texture. The existing 32-tick spin cadence is retained. Exact Westwood cadence and texture equivalence remain unverified.</p>
<p>All 2,754 packaged resource files match the preceding R10 delivery. Original fallback, weapon rules and other accepted families are preserved. This correction adds no HD texture atlas. Main integration and Windows validation are not claimed. Continue feedback and acceptance in this execution conversation.</p></details>
<dialog id="viewer"><button id="close">Close original pixels</button><div class="pixels" id="pixels"></div></dialog>
<script>const videos=[...document.querySelectorAll('video')];
document.getElementById('play').onclick=()=>videos.forEach(v=>{v.currentTime=0;v.muted=true;v.play().catch(()=>{});});
document.getElementById('pause').onclick=()=>videos.forEach(v=>v.pause());
const viewer=document.getElementById('viewer'),pixels=document.getElementById('pixels');
document.querySelectorAll('figure img').forEach(img=>img.onclick=()=>{const full=new Image();full.src=img.src;full.alt=img.alt;pixels.replaceChildren(full);viewer.showModal();});
document.getElementById('close').onclick=()=>viewer.close();</script></html>'''
output.write_text(page)
manifest = media_dir / 'manifest.json'
manifest.write_text(json.dumps({'status': 'PASS_ENCODED_AND_FULLY_DECODED', 'clips': clips}, indent=2) + '\n')
receipt = {'status': 'BUILT_EMBEDDED_NATIVE_MEDIA', 'html': str(output), 'sha256': sha(output),
           'images': images, 'imageCount': len(images), 'embeddedVideos': len(clips), 'mediaManifest': str(manifest),
           'nativeReports': [clip['nativeReport'] for clip in clips], 'humanAcceptance': 'PENDING', 'uiValidation': 'PENDING'}
(root / 'review-receipt-v1.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'html': str(output), 'bytes': output.stat().st_size, 'videos': len(clips)}))
