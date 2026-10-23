"""Embed only the affected helicopter evidence in an offline review."""

import base64
import html
import json
from pathlib import Path
import sys

root = Path(".artifacts/helicopter-belly-r1")
output = Path(sys.argv[1])
images, clips = [], []


def embed(file, media, caption):
    encoded = base64.b64encode(file.read_bytes()).decode()
    mime = "image/png" if media == "img" else "video/webm"
    attributes = 'loading="eager"' if media == "img" else 'controls preload="metadata"'
    tag = f'<{media} {attributes} src="data:{mime};base64,{encoded}">'
    if media != "img":
        tag += f"</{media}>"
    return f"<figure>{tag}<figcaption>{html.escape(caption)}</figcaption></figure>"


for heading in [135, 225, 315]:
    images.append(embed(root / "baseline-v1" / f"SHAD-{heading}-baseline.png", "img", f"Previous SHAD / {heading} degrees"))
    images.append(embed(root / "native-4x-v2" / f"SHAD-flight-{heading}.png", "img", f"Corrected SHAD / 4x / {heading} degrees"))
for folder, title in [("native-4x-v2", "YR / 4x"), ("native-ra2-2x", "RA2 / 2x")]:
    report = json.loads((root / folder / "report.json").read_text())
    assert report["status"] == "PASS_SELECTED_NATIVE_CASES", folder
    for sample in report["samples"]:
        if sample["state"] == "ground" and sample["direction"] in [135, 315]:
            images.append(embed(root / folder / sample["file"], "img", f'{title} / {sample["name"]} / ground / {sample["direction"]} degrees'))
    for clip in report["clips"]:
        clips.append(embed(Path(clip), "video", f"{title} / {Path(clip).stem}"))

output.write_text("""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Helicopter belly correction</title>
<style>body{font:20px system-ui;background:#18221d;color:#ecf2ed;margin:32px auto;padding:0 24px;max-width:1260px}
h1{font-size:34px}p{line-height:1.5}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
figure{margin:0}img,video{display:block;width:100%;height:auto;background:#334339}figcaption{padding:10px 0}
@media(max-width:720px){.grid{grid-template-columns:1fr}}</style>
<h1>Helicopter belly correction</h1><p>SHAD's existing atlas is complete. Its shared actor envelope now includes registered component origin offsets. Atlas pixels, owner masks, pivots, native rules, shaders and sampling are unchanged. The earlier owner-color, rotor and superweapon corrections are user accepted.</p>
<p>Previous and corrected views use the same native headings and output density, with separate legal fixtures; terrain and rotor phase differ. These are targeted native package checks, not a replacement for prior full acceptance. SCHP is the unchanged Soviet control. Videos include native flight, rotor motion and landing.</p>
<div class="grid">""" + "".join(images + clips) + "</div></html>\n")
print(json.dumps({"review": str(output), "images": len(images), "clips": len(clips), "bytes": output.stat().st_size}))
