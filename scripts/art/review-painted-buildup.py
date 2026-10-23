"""Export complete painted construction comparisons with embedded frame controls."""
import argparse
import base64
import io
import json
from pathlib import Path
from importlib.machinery import SourceFileLoader

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from buildup import native_indices, read, unpack

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("predecessor", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--before-label", default="R20")
parser.add_argument("--candidate-label", default="Painted HD candidate")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring, previous = read(args.authoring), read(args.predecessor)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 24)


def linearize(a):
    return np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)


def render(base, data, palette):
    weight = data[..., :1] / 255
    color = linearize(base[..., :3] / 255) * (1 - weight)
    color += linearize(palette[16 + np.minimum(data[..., 1], 15)] / 255) * weight
    color = np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)
    rgba = base.copy()
    rgba[..., :3] = np.clip(np.floor(color * 255 + .5), 0, 255)
    return Image.fromarray(rgba)


def uri(image):
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", lossless=True)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode()


payload = []
for r in authoring["families"]:
    if r["key"] not in authoring["hdRepaintProgress"]["registeredCandidateKeys"]:
        continue
    old = next(f for f in previous["families"] if f["key"] == r["key"])
    roots = [Path(".local/hd-packs") / f["newMember"]["packId"] / f["newMember"]["revision"] for f in (old, r)]
    manifests = [read(root / "manifest.json") for root in roots]
    raw, palette = read(r["nativeSource"]), np.array(r["palette"], np.uint8)
    item = {"key": r["key"], "frames": r["frames"], "densities": {}}
    for density in (2, 4):
        frames = []
        for phase in range(r["frames"]):
            indices = native_indices(raw, phase)
            original = np.dstack((palette[indices], (indices > 0).astype(np.uint8) * 255))
            original[indices == 0] = 0
            views = [Image.fromarray(original).resize(tuple(v * density for v in raw["canvas"]), Image.Resampling.NEAREST)]
            for root, manifest in zip(roots, manifests):
                record = (old,r)[len(views)-1]
                overlay = record.get('componentRig',{}).get('terminalCompletionOverlay')
                idle_overlay=record.get('componentRig',{}).get('retainedIdleCompletion')
                if idle_overlay and phase==idle_overlay['frame']:
                    from retained_idle import display
                    from painted_rig import encode_owner
                    from painted_motion import reduce_material
                    completed=display(record)
                    turret=record.get('componentRig',{}).get('retainedTurretReference')
                    if turret:
                        from buildup import sha
                        from painted_rig import over, project_rgba
                        assert sha(turret['image'])==turret['sha256']
                        dx,dy=turret['origin']
                        layer=project_rgba(Image.open(turret['image']),[[.25,0,dx],[0,.25,dy]],raw['canvas'])
                        completed=over(layer,completed)
                    pair=encode_owner(completed,palette)
                    if density==2:pair=reduce_material(pair,palette)
                    views.append(render(*pair,palette))
                elif overlay and phase==overlay['frame']:
                    helper = SourceFileLoader('terminal_author','scripts/art/author-terminal-alignment.py').load_module()
                    from painted_rig import encode_owner
                    from painted_motion import reduce_material
                    pair = encode_owner(helper.terminal_display(record),palette)
                    if density==2:
                        pair=reduce_material(pair,palette)
                    views.append(render(*pair,palette))
                else:
                    views.append(render(unpack(root, manifest, density, phase),
                                        unpack(root, manifest, density, phase, "data"), palette))
            display_scale = 4 if raw["canvas"][0] < 120 else 2
            display = [im.resize(tuple(v * display_scale for v in raw["canvas"]), Image.Resampling.LANCZOS) for im in views]
            width, height = display[0].size
            cell_width = max(350, width)
            combined = Image.new("RGB", (cell_width * 3, height + 56), "#34483d")
            draw = ImageDraw.Draw(combined)
            for column, (im, label) in enumerate(zip(display, ("Original", args.before_label, args.candidate_label))):
                combined.paste(im, (cell_width * column + (cell_width - width) // 2, 56), im)
                draw.text((cell_width * column + 12, 12), f"{label} / {phase:02}", font=font, fill="white")
            if density == 4:
                frames.append(combined)
                combined.save(args.output / f"{r['key']}-{phase:02}.png")
            item["densities"].setdefault(str(density), []).append([uri(im) for im in display])
        if density == 4:
            frames[0].save(args.output / f"{r['key']}-complete.webp", save_all=True, append_images=frames[1:],
                           duration=[128] * (len(frames) - 1) + [1000], loop=0, lossless=True)
    payload.append(item)
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Painted HD construction review</title>
<style>body{font:20px system-ui;background:#18231e;color:#eee;margin:24px}h1{font-size:32px}button,select,input{font:inherit;padding:8px;margin:6px}.views{display:flex;gap:12px;flex-wrap:wrap}figure{flex:1;margin:0;min-width:300px}img{width:100%;background:#34483d}figcaption{font-size:24px;margin:10px}p{max-width:1100px;line-height:1.5}</style>
<h1>Painted HD construction review</h1><p>Every intermediate neutral surface uses painted HD RGB. Original determines component order and registration. R20 is retained for comparison. Completed and non-construction artwork is preserved. Complete-sequence visual acceptance remains pending.</p>
<select id="family"></select><select id="density"><option>4</option><option>2</option></select><select id="backdrop" aria-label="Cutout inspection background"><option value="terrain">Terrain background</option><option value="dark">Dark background</option><option value="light">Light background</option><option value="checker">Checkerboard</option></select><button id="play">Play</button><button id="prev">Previous</button><button id="next">Next</button><button id="reverse">Build</button><input id="phase" type="range" min="0" value="0"><span id="label"></span>
<div class="views"><figure><figcaption>Original</figcaption><img id="original"></figure><figure><figcaption>R20</figcaption><img id="before"></figure><figure><figcaption>Painted HD candidate</figcaption><img id="candidate"></figure></div>
<script>const families=__PAINTED_FRAMES_PAYLOAD__;const $=id=>document.getElementById(id);let selected=families[0],phase=0,playing=false,reverse=false,last=0;families.forEach((f,i)=>{const o=new Option(f.key,i);$('family').add(o)});
function render(){['original','before','candidate'].forEach((id,i)=>$(id).src=selected.densities[$('density').value][phase][i]);$('phase').max=selected.frames-1;$('phase').value=phase;$('label').textContent=`Phase ${phase} / ${selected.frames-1}`;}
$('backdrop').onchange=()=>{const mode=$('backdrop').value;['original','before','candidate'].forEach(id=>{const image=$(id);image.style.background=mode==='checker'?'repeating-conic-gradient(#eee 0% 25%, #666 0% 50%)':({terrain:'#34483d',dark:'#101010',light:'#f3f3f3'}[mode]);image.style.backgroundSize=mode==='checker'?'24px 24px':''})};
$('family').onchange=()=>{selected=families[+$('family').value];phase=0;render()};$('density').onchange=render;$('phase').oninput=()=>{phase=+$('phase').value;playing=false;$('play').textContent='Play';render()};$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play'};$('prev').onclick=()=>{phase=(phase+selected.frames-1)%selected.frames;render()};$('next').onclick=()=>{phase=(phase+1)%selected.frames;render()};$('reverse').onclick=()=>{reverse=!reverse;$('reverse').textContent=reverse?'Unbuild':'Build'};
function tick(t){if(playing&&t-last>128){phase=(phase+(reverse?-1:1)+selected.frames)%selected.frames;last=t;render()}requestAnimationFrame(tick)}render();requestAnimationFrame(tick);</script></html>'''
html = html.replace("R20 is retained for comparison.", f"{args.before_label} is retained for comparison.", 1)
html = html.replace("<figcaption>R20</figcaption>", f"<figcaption>{args.before_label}</figcaption>", 1)
html = html.replace("<figcaption>Painted HD candidate</figcaption>", f"<figcaption>{args.candidate_label}</figcaption>", 1)
(args.output / "Painted-HD-Buildup-Review.html").write_text(html.replace("__PAINTED_FRAMES_PAYLOAD__", json.dumps(payload, separators=(",", ":")), 1))
write_labels = {"before": args.before_label, "candidate": args.candidate_label}
(args.output / "comparison-labels.json").write_text(json.dumps(write_labels, indent=2) + "\n")
print(len(payload), "complete embedded sequence reviews")
