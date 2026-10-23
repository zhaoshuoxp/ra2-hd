"""Embed matched native recordings of the Yuri Prime deploy correction."""
import argparse
import base64
import hashlib
import html
import json
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('root', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--ffmpeg', type=Path, required=True)
a = p.parse_args()
root, output = a.root.resolve(), a.output.resolve()
assert not output.exists()
output.parent.mkdir(parents=True, exist_ok=True)
media = root / 'embedded-media-v1'
media.mkdir(exist_ok=False)
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
uri = lambda file, kind: 'data:' + kind + ';base64,' + base64.b64encode(file.read_bytes()).decode()
clips = []


def replay(directory, name, phase, label, baseline=False):
    report = json.loads((directory / 'report.json').read_text())
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
    case = next(c for c in report['abilities'] if c['name'] == name and c['phase'] == phase)
    stem = name + '-' + phase
    source = directory / (stem + '-deploy.webm')
    crop = case.get('videoCrop')
    if baseline:
        comparison = json.loads((root / 'runtime-4-v2/report.json').read_text())
        new = next(c for c in comparison['abilities'] if c['name'] == name and c['phase'] == phase)
        assert case['before']['actor']['tile'] == new['before']['actor']['tile']
        assert case['canvas'] == new['canvas']
        assert not any(s['name'].endswith('PsiWave') for s in case['after']['shots'])
        crop = new['videoCrop']
    else:
        assert any(s['name'].endswith('PsiWave') for s in case['after']['shots'])
        assert case['after']['target']['destroyed'] and not case['after']['actor']['destroyed']
    assert crop[2:] == [1400, 900]
    x, y, width, height = crop
    target = media / f'clip-{len(clips)}.mp4'
    subprocess.run([str(a.ffmpeg), '-nostdin', '-loglevel', 'error', '-i', str(source),
                    '-vf', f'crop={width}:{height}:{x}:{y},setsar=1', '-an', '-c:v', 'libx264',
                    '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)], check=True)
    decode = subprocess.run([str(a.ffmpeg), '-nostdin', '-hide_banner', '-i', str(target), '-f', 'null', '-'],
                            capture_output=True, text=True, check=True)
    assert '1400x900' in decode.stderr and 'Video: h264' in decode.stderr
    poster = directory / (stem + '-before-deploy-detail.png')
    clips.append({'group': label, 'source': str(source), 'sourceSha256': sha(source),
                  'preview': str(target), 'sha256': sha(target), 'size': [1400, 900],
                  'crop': crop, 'fullyDecoded': True, 'resampled': False,
                  'nativeReport': str(directory / 'report.json'),
                  'diagnosticBaseline': baseline})
    return (f'<section><h3>{html.escape(label)}</h3><video controls playsinline preload="metadata" '
            f'poster="{uri(poster, "image/png")}" src="{uri(target, "video/mp4")}"></video></section>')


comparison = replay(root / 'baseline-r11-v3', 'YURIPR', 'after-control', 'R11 / cancelled before pulse', True)
comparison += replay(root / 'runtime-4-v2', 'YURIPR', 'after-control', 'R12 / pulse after native cooldown')
density = replay(root / 'runtime-original-v2', 'YURIPR', 'after-control', 'Original graphics / repaired gameplay')
density += replay(root / 'runtime-2-v2', 'YURIPR', 'after-control', '2x assets / repaired gameplay')
clone = replay(root / 'runtime-4-v2', 'YURI', 'after-control', 'Yuri clone / same deploy lifecycle')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yuri R12 ability review</title><style>
body{max-width:1680px;margin:28px auto;padding:0 24px;background:#171d20;color:#edf0f1;font:20px/1.5 system-ui}
h1{font-size:36px}h2{font-size:28px}h3{font-size:22px}section{margin:28px 0}
video{display:block;width:100%;background:#000}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.status{background:#293f4b;padding:18px}.note{font-size:18px;color:#bbcbd0}button{font:inherit;padding:8px 16px;cursor:pointer}
@media(max-width:900px){.pair{grid-template-columns:1fr}body{padding:0 14px}}
</style><h1>Yuri R12 / deploy ability</h1>
<p class="status">Yuri Prime now completes a requested pulse while waiting for the native mind-control cooldown. Auto-undeploy starts after the one-shot weapon fires.</p>
<p>R11 reproduced the failure: mind control left 199 cooldown ticks, while Yuri Prime undeployed after 75 ticks. No SuperPsiWave shot occurred. R12 preserves weapon cooldown, damage, pulse art and the 75-tick post-shot undeploy delay.</p>
<p><button id="play">Play comparisons</button> <button id="pause">Pause videos</button></p>
<h2>Immediately deploy after mind control</h2><div class="pair">''' + comparison + '''</div>
<p class="note">Videos retain native 1400 × 900 drawing-buffer pixels, without sharpening or enlargement. Runs are independent; playback and tick alignment are approximate. The R11 recording is a diagnostic failure reproduction.</p>
<h2>Graphics options</h2><div class="pair">''' + density + '''</div>
<h2>Normal Yuri clone</h2>''' + clone + '''
<p>Selected native Mac tests pass idle casting, deploy during mind-control cooldown, pulse damage, caster survival and automatic undeploy. Yuri Prime also passes repeated casting, explicit cancellation and renewed mind control. Controlled legal fixtures and native player orders were used; no gameplay rules or camera geometry were edited.</p>
<p>All accepted resource files, Chaos Drone smoke and Floating Disc rotation remain preserved. This review covers Yuri's Revenge. Historical RA2 Yuri Prime caster-destruction evidence is outside this correction. Main integration and Windows execution are not claimed. Keep feedback and acceptance in this execution conversation.</p>
<p class="note">Embedded media bytes and static HTML are verified separately from browser playback. Interactive local review playback remains unverified after the earlier browser URL-policy block.</p>
<script>const videos=[...document.querySelectorAll('video')];
document.getElementById('play').onclick=()=>videos.forEach(v=>{v.currentTime=0;v.muted=true;v.play().catch(()=>{});});
document.getElementById('pause').onclick=()=>videos.forEach(v=>v.pause());</script></html>'''
output.write_text(page)
manifest = media / 'manifest.json'
manifest.write_text(json.dumps({'status': 'PASS_ENCODED_AND_FULLY_DECODED', 'clips': clips}, indent=2) + '\n')
receipt = {'status': 'BUILT_EMBEDDED_NATIVE_MEDIA', 'html': str(output), 'sha256': sha(output),
           'images': [], 'imageCount': 0, 'embeddedVideos': len(clips), 'mediaManifest': str(manifest),
           'nativeReports': [clip['nativeReport'] for clip in clips], 'humanAcceptance': 'PENDING',
           'uiValidation': 'UNVERIFIED_PRIOR_BROWSER_URL_POLICY_BLOCK'}
(root / 'review-receipt-v1.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'html': str(output), 'bytes': output.stat().st_size, 'videos': len(clips)}))
