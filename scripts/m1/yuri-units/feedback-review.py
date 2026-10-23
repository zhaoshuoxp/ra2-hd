"""Embed verified correction captures and replay previews in one offline review."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('runtime', type=Path)
p.add_argument('media', type=Path)
p.add_argument('package_receipt', type=Path)
p.add_argument('--flight', type=Path)
p.add_argument('--revision', type=int, default=1)
a = p.parse_args()
runtime = json.loads((a.runtime / 'report.json').read_text())
assert runtime['status'] == 'PASS_SELECTED_NATIVE_CASES'
media = json.loads(a.media.read_text())
assert media['status'] == 'PASS_ENCODED_AND_FULLY_DECODED'
package = json.loads(a.package_receipt.read_text())
out = Path(package['folder']) / 'Review'
out.mkdir(exist_ok=True)


def data(file, mime):
    return f'data:{mime};base64,' + base64.b64encode(file.read_bytes()).decode()


groups = {
    'DISK': ('Complete rotating disc and circumference laser',
             'Eight native turret bearings are captured directly after rendering. The native DiskLaser presentation sweeps the circumference before emitting the outgoing ray; native damage and cooldown timing are preserved.',
             ['DISK-ring-live-frame.png', 'DISK-ray-live-frame.png'] + [f'DISK-spin-{h}.png' for h in range(0, 360, 45)]),
    'TELE': ('Live purple magnetic ribbon',
             'A native magnetic lift order creates a persistent ribbon following the elevated victim. Interruption releases the target and removes the beam.',
             ['TELE-live-purple-ribbon-detail.png', 'TELE-released-clean-detail.png']),
    'MIND': ('Selected Mastermind control arc',
             'The controller natively captures the enemy. Select the controller to show its control arc; deselection hides it under the original visibility rule.',
             ['MIND-selected-native-control-arc-detail.png']),
    'YURIPR': ('Selected Yuri Prime control arc',
               'The selected Yuri Prime controller shows the native arc to its controlled victim. The unrelated historical PsiWave exception remains open.',
               ['YURIPR-selected-native-control-arc-detail.png']),
    'CAOS': ('Chaos gas centered on the caster',
             'AreaFire resolves at the live caster. The nearby enemy becomes berserk; the distant witness remains unaffected. Detonation coordinates match the caster, independently of the ordered enemy.',
             ['CAOS-caster-centered-native-gas-detail.png']),
}
if a.flight:
    flight = json.loads((a.flight / 'report.json').read_text())
    assert flight['status'] == 'PASS_SELECTED_NATIVE_CASES' and len(flight['flightFrames']) == 8
    groups['DISK'][2].extend(str(a.flight.resolve() / file) for file in flight['flightFrames'])
sections = []
for name, (title, description, images) in groups.items():
    assert runtime['corrections'][name]['status'] == 'PASS_SELECTED_NATIVE_CASE'
    clip = next(c for c in media['clips'] if Path(c['source']).stem == name + '-native-feedback-correction')
    pictures = ''.join(f'<figure><img src="{data(a.runtime / image, "image/png")}" alt="{html.escape(Path(image).stem)}">'
                       f'<figcaption>{html.escape(Path(image).stem)}</figcaption></figure>' for image in images)
    extra = ''
    if name == 'DISK' and a.flight:
        flight_clip = next(c for c in media['clips'] if Path(c['source']).stem == 'DISK-native-flight-and-turns')
        extra = '<p>Additional native flight and turns across eight body bearings:</p>' \
            + f'<video controls muted playsinline preload="metadata" src="{data(Path(flight_clip["preview"]), "video/mp4")}"></video>'
    sections.append(f'<section><h2>{name}: {title}</h2><p>{description}</p>'
                    f'<video controls muted playsinline preload="metadata" src="{data(Path(clip["preview"]), "video/mp4")}"></video>'
                    f'{extra}<div class="captures">{pictures}</div></section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Yuri R2 native effects review</title>
<style>body{font:18px system-ui;background:#151b20;color:#edf0f2;margin:30px auto;max-width:1200px;padding:0 22px}h1{font-size:34px}h2{font-size:26px}
p{line-height:1.5}section{border-top:1px solid #607080;margin:35px 0;padding-top:15px}video{display:block;width:100%;background:#000;margin:20px 0}
.captures{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:18px}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{font-size:16px;margin:6px 0 15px}
button{font:inherit;padding:10px 16px}.detail .captures{display:block}.detail img{width:auto;max-width:100%}</style>
<h1>Yuri R2 — native effects corrections</h1><p>Verified in the copied macOS Apple Silicon R2 app, using its own sibling resources and isolated profile. Native legal fixtures followed by native orders; this is focused correction evidence, not a natural-match production claim.</p>
<p>All accepted artwork is preserved. Cleaner MIND, Lasher and Gattling mother-art samples are a separate pending style review and are not installed.</p>
<p>Recordings originate at 3840 × 2160 with unchanged logical camera geometry. Embedded H.264 previews are at most 1920 pixels wide; original full-resolution WebM recordings are preserved. Captures are direct drawing-buffer crops.</p>
<button id="detail">Switch captures to 1:1 detail</button>__SECTIONS__
<p>Known prior exceptions remain: DISK refinery money payment and YURIPR PsiWave caster destruction. Windows is not tested. No main integration or remote publication.</p>
<script>detail.onclick=()=>{document.body.classList.toggle('detail');detail.textContent=document.body.classList.contains('detail')?'Switch captures to gallery':'Switch captures to 1:1 detail'}</script></html>'''
output = out / f'Yuri-Units-Feedback-R2-Review-v{a.revision}.html'
assert not output.exists(), 'Preserve completed review versions'
output.write_text(page.replace('__SECTIONS__', ''.join(sections)), encoding='utf-8')
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
receipt = {'status': 'BUILT_OFFLINE_EMBEDDED_CORRECTION_REVIEW', 'html': str(output.resolve()),
           'sha256': sha(output), 'runtimeReport': str((a.runtime / 'report.json').resolve()),
           'runtimeSourceHead': package['runtimeSourceHead'], 'mediaManifest': str(a.media.resolve()),
           'nativeFamilies': list(groups), 'embeddedVideos': 6 if a.flight else 5,
           'embeddedImages': sum(len(group[2]) for group in groups.values()),
           'acceptedArtPreserved': True, 'newStyleSamplesInstalled': False}
receipt_file = out / ('feedback-review.json' if a.revision == 1 else f'feedback-review-v{a.revision}.json')
assert not receipt_file.exists(), 'Preserve completed review receipts'
receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
