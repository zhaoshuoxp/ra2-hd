"""Create a self-contained changed-building review from real native buffers."""
import base64
import html
import json
import sys
from pathlib import Path

output = Path(sys.argv[1])
assert not output.exists()
reports = [Path(p) for p in sys.argv[2:]]
parts = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Task C Mutator building electricity</title>
<style>body{background:#18251f;color:#f2f5ee;font:22px/1.5 system-ui;margin:32px auto;max-width:1500px;padding:0 24px}h1{font-size:38px}h2{font-size:30px}figure{margin:28px 0}img,video{max-width:100%;height:auto}a{color:#9be1c0}figcaption{margin:12px 0}code{font-size:20px}</style>
<h1>Task C · Mutator building electricity</h1>
<p>Technical verification passed; final visual acceptance remains pending. Review the building's opening, charged, released and closed states. Current combined-main UI, loading optimization and accepted peer artwork remain preserved.</p>
<p>The corrected c2 family carries the original charged purple/white contours through the raised opening and release frames. Electrical cores retain their fixed colors as the building changes owner color. The closed endpoint, native geometry and game timing remain unchanged.</p>''']


def embed(file, caption, video=False):
    encoded = base64.b64encode(file.read_bytes()).decode()
    content = (f'<video controls preload="none" src="data:video/webm;base64,{encoded}"></video>' if video else
               f'<img src="data:image/png;base64,{encoded}">')
    parts.append(f'<figure><figcaption>{html.escape(caption)}</figcaption>{content}</figure>')


embed(Path('.artifacts/yuri-buildings/mutator-arc-v1/electricity-audit-v4.png'),
      'Before / corrected exports: opening F7, raised release H0 and closed H30. Original 2X sprite buffers.')
for file in reports:
    report = json.loads(file.read_text())
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    density = report['options']['selected']
    parts.append(f'<h2>Native {density}X · {"snow" if report["snow"] else "temperate"} · {html.escape(report["selectedColor"])}</h2>')
    parts.append('<p>Controlled legal placement and one-time charge preset; native orders and state controllers; trainer off. '
                 'Images retain the actual 1,000 × 1,000 pixel crops from the 4K drawing buffer. Clips retain native game timing and full resolution.</p>')
    for phase in ['charged', 'fired', 'closed']:
        embed(file.parent / f'YAGNTC-native-{phase}-detail.png', f'Mutator building · native {phase}')
    for clip in report['clips']:
        embed(Path(clip), Path(clip).name, video=True)
parts.append('<p>Open the adjacent Launch-Isolated-Review.command to test the complete application. Keep both sibling resource folders beside it. '
             'This changed-item review preserves the previous complete C review and does not request another decision on unchanged artwork.</p></html>')
output.write_text('\n'.join(parts))
print(output.resolve(), output.stat().st_size)
