"""Embed only the affected helicopter evidence in an offline review."""

import base64
import html
import json
from pathlib import Path
import sys

root = Path(".artifacts/helicopter-rotors-r2")
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


before = Path(".artifacts/helicopter-belly-r1/native-4x-v2")
for heading in [135, 315]:
    images.append(embed(before / f"SHAD-flight-{heading}.png", "img", f"Previous SHAD / {heading} degrees"))
    images.append(embed(root / "native-phase-4x-v2" / f"SHAD-{heading}-0.png", "img", f"Corrected SHAD / 4x / {heading} degrees / phase 0"))
for heading in [135, 315]:
    images.append(embed(root / "native-phase-4x-v2" / f"SHAD-{heading}-180.png", "img", f"Corrected SHAD / 4x / {heading} degrees / phase 180"))
for folder, title in [("native-motion-4x", "YR / 4x"), ("native-motion-ra2-2x", "RA2 / 2x")]:
    report = json.loads((root / folder / "report.json").read_text())
    assert report["status"] == "PASS_SELECTED_NATIVE_CASES", folder
    for sample in report["samples"]:
        if sample["state"] == "ground" and sample["direction"] in [135, 315]:
            images.append(embed(root / folder / sample["file"], "img", f'{title} / {sample["name"]} / ground / {sample["direction"]} degrees'))
    for clip in report["clips"]:
        clips.append(embed(Path(clip), "video", f"{title} / {Path(clip).stem}"))

output.write_text("""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Allied tandem rotor correction</title>
<style>body{font:20px system-ui;background:#18221d;color:#ecf2ed;margin:32px auto;padding:0 24px;max-width:1260px}
h1{font-size:34px}p{line-height:1.5}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
figure{margin:0}img,video{display:block;width:100%;height:auto;background:#334339}figcaption{padding:10px 0}
@media(max-width:720px){.grid{grid-template-columns:1fr}}</style>
<h1>Allied tandem rotor correction</h1><p>SHAD has two horizontal tandem rotors. Both now spin around local Z, and two normalized painted-hub anchors attach their visible centers to the native axes. Rotor artwork, the complete belly, owner masks, logical image dimensions, camera, rules, shadows, sampling and rotor speed are preserved. SCHP keeps its accepted main/vertical-tail rotor configuration.</p>
<p>Previous and corrected views use the same native headings and output density, with separate legal fixtures; terrain and rotor phase differ. These are targeted native package checks, not a replacement for prior full acceptance. SCHP is the unchanged Soviet control. Native measurements cover four bearings and six spin phases: both planes remain horizontal and both painted hubs stay on their native axes. Videos include native flight, rotor motion and landing.</p>
<div class="grid">""" + "".join(images + clips) + "</div></html>\n")
print(json.dumps({"review": str(output), "images": len(images), "clips": len(clips), "bytes": output.stat().st_size}))
