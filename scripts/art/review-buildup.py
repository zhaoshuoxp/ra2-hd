"""Create standalone same-phase Original/baseline/candidate animation reviews."""
import argparse
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
report = json.loads(args.authoring.read_text())
args.output.mkdir(parents=True, exist_ok=False)
root = args.authoring.parent


def encode(im):
    stream = io.BytesIO()
    im.save(stream, format="PNG")
    return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()


families = {}
for family in report["families"]:
    raw = json.loads(Path(family["nativeSource"]).read_text())
    w, h = raw["canvas"]
    key = family["key"]
    item = {"key": key, "identity": family["identity"], "theater": family["theater"],
            "size": [w, h], "count": family["frames"], "densities": {}}
    for density in (2, 4):
        sequences = [[], [], []]
        for n in range(family["frames"]):
            folder = Path(family.get("exportsPath", root / "frames" / key))
            original = Image.open(folder / f"{n:02}-original.png").convert("RGBA")
            before = Image.open(folder / f"{n:02}-{density}x-before.png").convert("RGBA")
            repaired = Image.open(folder / f"{n:02}-{density}x-base.png").convert("RGBA")
            if family.get("ownerRgbNormalized"):
                rgba = np.array(repaired)
                data = np.array(Image.open(folder / f"{n:02}-{density}x-data.png").convert("RGBA"))
                owners = data[..., 0] == 255
                palette = np.array(family["palette"], np.uint8)
                rgba[..., :3][owners] = palette[16 + data[..., 1][owners]]
                repaired = Image.fromarray(rgba)
            candidate = Image.new("RGBA", (w * density, h * density))
            native = raw["frames"][n]
            candidate.paste(repaired, (native["x"] * density, native["y"] * density))
            for i, image in enumerate((original, before, candidate)):
                # Equal 2x logical review output; full 4x exports remain in the
                # authoring/pack closure, rather than bloating offline playback.
                sequences[i].append(encode(image.resize((w * 2, h * 2), Image.Resampling.LANCZOS)))
        item["densities"][str(density)] = sequences
    families.setdefault(family["identity"], []).append(item)
    preview_scale = 2 if w < 180 else 1
    preview_w, preview_h = w * preview_scale, h * preview_scale
    cell_w, cell_h = max(180, preview_w), preview_h + 25
    columns = 5
    sheet = Image.new("RGB", (cell_w * columns, cell_h * 3 * ((family["frames"] + columns - 1) // columns)), "#34483d")
    draw = ImageDraw.Draw(sheet)
    for n in range(family["frames"]):
        seq = item["densities"]["4"]
        for i, label in enumerate(("Original", "748d099", "Candidate")):
            im = Image.open(io.BytesIO(base64.b64decode(seq[i][n].split(",")[1]))).resize(
                (preview_w, preview_h), Image.Resampling.LANCZOS)
            x, y = n % columns * cell_w, (n // columns * 3 + i) * cell_h
            sheet.paste(im, (x + (cell_w - preview_w) // 2, y + 25), im)
            draw.text((x + 5, y + 3), f"{label} / {n:02}", fill="white", font_size=16)
    sheet.save(args.output / f"{key}-contact.png")

html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Native buildup art review</title><style>
body{font:18px system-ui;background:#18231e;color:#eee;margin:24px}h1{font-size:30px}button,select,input{font:inherit;margin:6px;padding:6px}
.views{display:flex;gap:16px;flex-wrap:wrap}.views figure{margin:0;flex:1;min-width:260px}.views img{width:100%;background:#34483d}
figcaption{font-size:20px;margin:8px 0}.toolbar{position:sticky;top:0;background:#18231e;padding:8px 0}a{color:#b4e9ce}p{max-width:1000px;line-height:1.5}
</style><h1>Native buildup art review</h1><p>Same native phase, canvas and owner reference. Intermediate geometry follows the original MK frame; accepted HD material is transferred onto those surfaces. Construction-only surfaces use native source color. Completed HD terminal frames and all other members are retained. Final visual acceptance is pending.</p>
<div class="toolbar"><select id="family"></select><select id="density"><option value="4">4X export</option><option value="2">2X export</option></select>
<button id="play">Play</button><button id="prev">Previous</button><button id="next">Next</button><select id="speed"><option value="1">Native cadence</option><option value="0.25">Quarter speed</option></select><button id="direction">Build</button>
<input id="phase" type="range" min="0" value="0"><span id="label"></span></div>
<div class="views"><figure><figcaption>Original</figcaption><img id="original"></figure><figure><figcaption>748d099 HD</figcaption><img id="before"></figure><figure><figcaption>Repaired candidate</figcaption><img id="candidate"></figure></div>
<p>Review: first frame continuity; pad and wall order; roof, tower and crane phase; component attachment; end-to-idle transition. The reverse control previews the same native UNBUILD sequence. Native game captures and checks are delivered separately. This page makes no Windows, performance or physical-input acceptance claim.</p>
<script>const families=PAYLOAD;let selected=families[0],phase=0,playing=false,reverse=false,last=0,acc=0;
const $=id=>document.getElementById(id);families.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=f.key;$('family').append(o)});
const images=new Map();families.forEach(f=>Object.values(f.densities).forEach(rows=>rows.flat().forEach(uri=>{const i=new Image();i.src=uri;images.set(uri,i)})));
function render(){const rows=selected.densities[$('density').value];['original','before','candidate'].forEach((id,i)=>$(id).src=rows[i][phase]);$('phase').max=selected.count-1;$('phase').value=phase;$('label').textContent=`Phase ${phase} / ${selected.count-1}`;}
$('family').onchange=()=>{selected=families[+$('family').value];phase=0;acc=0;render()};$('density').onchange=render;
$('phase').oninput=()=>{phase=+$('phase').value;playing=false;$('play').textContent='Play';render()};$('play').onclick=()=>{playing=!playing;acc=0;$('play').textContent=playing?'Pause':'Play'};
$('prev').onclick=()=>{phase=(phase+selected.count-1)%selected.count;render()};$('next').onclick=()=>{phase=(phase+1)%selected.count;render()};
$('direction').onclick=()=>{reverse=!reverse;$('direction').textContent=reverse?'Unbuild':'Build'};
function tick(time){const dt=Math.min(100,time-last);last=time;if(playing){acc+=dt*+$('speed').value;const interval=800/selected.count;if(acc>=interval){const steps=Math.floor(acc/interval);acc-=steps*interval;phase=(phase+(reverse?-steps:steps)+selected.count*10)%selected.count;render()}}requestAnimationFrame(tick)}render();requestAnimationFrame(tick);
</script></html>'''
for identity, items in families.items():
    (args.output / f"{identity}-Buildup-Review.html").write_text(html.replace("PAYLOAD", json.dumps(items, separators=(",", ":"))))
links = "".join(f'<li><a href="{name}-Buildup-Review.html">{name}: complete same-phase playback</a></li>' for name in sorted(families))
(args.output / "Buildup-Art-Review.html").write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Buildup art review</title><style>body{font:20px system-ui;margin:32px;line-height:1.6}</style><h1>Original-guided buildup repair</h1><p>' + str(len(families)) + ' building identities; independent 2X/4X selected theater sequence reviews. Open any HTML directly. All playback images are embedded; no server is needed. Visual acceptance is pending.</p><ul>' + links + '</ul></html>')
print(len(families), "standalone family reviews; all phases and both densities embedded")
