"""Build a self-contained review from the final packaged native captures."""
import base64
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / '.artifacts/helicopter-mount-r5'
BEFORE = ROOT / '.artifacts/helicopter-rotors-r2/native-motion-4x'
CURRENT = EVIDENCE / 'native-final-4x'
LOWER = EVIDENCE / 'native-final-ra2-2x'
PACKAGE = Path(json.loads((EVIDENCE / 'package-final/package-receipt.json').read_text())['folder'])


def media(path, label, video=False):
    mime = 'video/webm' if video else 'image/png'
    data = base64.b64encode(path.read_bytes()).decode('ascii')
    tag = (f'<video controls preload="metadata" src="data:{mime};base64,{data}"></video>'
           if video else f'<img alt="{html.escape(label)}" src="data:{mime};base64,{data}">')
    return f'<figure>{tag}<figcaption>{html.escape(label)}</figcaption></figure>'


parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Helicopter mounts — native review</title><style>
body{font:20px/1.5 system-ui,sans-serif;background:#171c22;color:#e8edf2;max-width:1280px;margin:32px auto;padding:0 24px}
h1{font-size:36px}h2{font-size:27px;margin-top:36px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
figure{margin:0;background:#242c35;padding:12px;border-radius:8px}img,video{display:block;width:100%;height:auto}
figcaption{padding-top:10px}code{font-size:.9em;color:#bce6ff}@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style><h1>Helicopter mounts: final native captures</h1>
<p>Runtime <code>e748dc8</code>, macOS Apple Silicon. All media is embedded for offline review.
Screenshots are unmodified native crops. Videos retain the full 3840 × 2160 drawing buffer.</p>
<p>The fuselage depth surface previously obscured parts of the rotor disks. It now follows native body height
bounds while preserving the same screen projection and artwork. Stationary bearings connect both Allied hubs
to the airframe. The Soviet main hub is aligned with its axis and raised six native units.</p>
<p>Before/after pairs use matching heading and 4× density from independent native fixtures.
Flight elevation, rotor phase and shadow position are not synchronized. The before images come from the last
delivered V2 package; the rejected interim rear-height images are not used as the baseline.</p>''']
for name, heading in [('SHAD', 90), ('SHAD', 135), ('SHAD', 45), ('SCHP', 135)]:
    parts.append(f'<h2>{name} — heading {heading}°</h2><div class="grid">')
    filename = f'{name}-flight-{heading}.png'
    parts.append(media(BEFORE / filename, 'Before — delivered V2, 4×'))
    parts.append(media(CURRENT / filename, 'After — current package, 4×'))
    parts.append('</div>')
parts.append('<h2>Opposite side — current 4×</h2><div class="grid">')
for name in ['SHAD', 'SCHP']:
    parts.append(media(CURRENT / f'{name}-flight-315.png', f'{name} — heading 315°, 4×'))
parts.append('</div><h2>RA2 — current 2×</h2><div class="grid">')
for heading in [90, 135]:
    parts.append(media(LOWER / f'SHAD-flight-{heading}.png', f'SHAD — heading {heading}°, 2×'))
parts.append('</div><h2>Native rotor motion and landing</h2>')
for directory, name, label in [(CURRENT, 'SHAD', 'YR Allied — 4×'),
                               (CURRENT, 'SCHP', 'YR Soviet — 4×'),
                               (LOWER, 'SHAD', 'RA2 Allied — 2×')]:
    parts.append(media(directory / f'{name}-flight-and-landing.webm', label, video=True))
parts.append('''<h2>Bounded verification</h2><p>26 focused tests and entry type checking pass.
The packaged runtime passed 32 YR 4× orientation/state samples and 8 RA2 2× samples, with three native
flight/landing recordings. Checks include full body UV coverage, bounded depth, rotor plane alignment,
bearing contact and stationary bearings during blade motion. No reported GL or runtime errors.</p>
<p>All 16 helicopter atlas files remain byte-identical; 2,752 resource files are unchanged and only the
three selected metadata manifests differ from the prior delivery. Existing family exceptions are retained.
Technical validation does not replace user visual acceptance. Windows was not run for this correction.</p>
</html>''')
output = PACKAGE / 'HELICOPTER-MOUNT-REVIEW.html'
output.write_text('\n'.join(parts))
print(output)
