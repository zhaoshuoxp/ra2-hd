"""Add embedded animation previews, native videos and GPU sheets to offline reviews."""
import argparse
import base64
import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("review", type=Path)
parser.add_argument("matrix", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring = {f["key"]: f for f in json.loads(args.authoring.read_text())["families"]}
matrix = json.loads(args.matrix.read_text())
assert matrix["status"] in ("PASS_COMPLETE_NATIVE_MATRIX", "PASS_SUPPORTED_NATIVE_MATRIX_WITH_EXPLICIT_THEATER_BLOCKERS")
sessions = []
for entry in matrix["entries"]:
    file = Path(entry["output"]) / "report.json"
    assert hashlib.sha256(file.read_bytes()).hexdigest() == entry["reportSha256"]
    report = json.loads(file.read_text())
    assert report["status"] == "PASS_SELECTED_NATIVE_CASES"
    sessions.append((entry, report))
media_receipts, previews, links = [], {}, []
font = ImageFont.load_default(size=22)


def uri(file, mime):
    data = file.read_bytes()
    media_receipts.append({"source": str(file), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "mime": mime})
    return f"data:{mime};base64," + base64.b64encode(data).decode()


def animation(item, density):
    sequences = item["densities"][str(density)]
    width, height = item["size"][0] * 2, item["size"][1] * 2
    cell = max(250, width)
    frames = []
    for phase in range(item["count"]):
        image = Image.new("RGB", (cell * 3, height + 82), "#34483d")
        draw = ImageDraw.Draw(image)
        draw.text((12, 8), f"{item['key']} / {density}X / phase {phase:02} / quarter speed", font=font, fill="white")
        for column, label in enumerate(("Original", "Before 748d099", "Candidate")):
            draw.text((column * cell + 12, 42), label, font=font, fill="white")
            data = base64.b64decode(sequences[column][phase].split(",")[1])
            rgba = Image.open(io.BytesIO(data)).convert("RGBA")
            image.paste(rgba, (column * cell + (cell - width) // 2, 82), rgba)
        frames.append(image)
    output = args.output / f"{item['key']}-{density}x-preview.webp"
    # Every labeled phase survives lossless encoding. The final hold belongs to
    # this comparison preview; the recorded game videos retain native cadence.
    durations = [round(3200 / item["count"])] * item["count"]
    durations[-1] += 800
    frames[0].save(output, save_all=True, append_images=frames[1:], duration=durations,
                   loop=0, lossless=True, method=3)
    with Image.open(output) as check:
        assert check.n_frames == item["count"]
    return uri(output, "image/webp")


section = '''<section><h2>Recorded game motion</h2><p id="native-label"></p>
<div class="views"><figure><figcaption>Native construction</figcaption><video id="native-build" controls playsinline muted preload="metadata" style="width:100%"></video></figure>
<figure><figcaption>Native reverse: sale or Slave Miner undeploy</figcaption><video id="native-sale" controls playsinline muted preload="metadata" style="width:100%"></video></figure></div>
<details><summary>Every GPU phase: HD row followed by Original row</summary><img id="native-sheet" style="width:100%;max-width:1280px"></details>
<p>Recorded in the verified copied Mac app using controlled legal fixtures. These clips establish native artwork binding and motion; visual acceptance is pending. Windows execution remains unverified.</p></section>'''
for file in sorted(args.review.glob("*-Buildup-Review.html")):
    html = file.read_text()
    match = re.search(r"const families=(.*?);let selected=", html, re.S)
    assert match
    items = json.loads(match.group(1))
    evidence = {}
    identity = items[0]["identity"]
    previews[identity] = []
    for item in items:
        selected = authoring[item["key"]]
        evidence[item["key"]] = {}
        card = {"key": item["key"], "densities": {}}
        for density in (2, 4):
            preferred = "ra2" if selected["side"] in ("legacy", "soviet", "power") and "ra2" in selected.get("editions", ["ra2"]) else "yr"
            matched = [(e, r) for e, r in sessions if e["density"] == density
                and e["edition"] == preferred and e["theater"] == item["theater"]
                and r["cases"].get(identity, {}).get("expectedMemberSha256") == selected["newMember"]["sha256"]]
            if not matched:
                assert item["theater"] in matrix.get("excludedTheaters", [])
                evidence[item["key"]][str(density)] = {"blocked": True,
                    "label": f"{preferred.upper()} / {item['theater']} / {density}X: native capture unavailable because the original TMP decoder prevents map loading. Complete source-guided phase images remain available above.",
                    "build": "", "sale": "", "sheet": ""}
                card["densities"][str(density)] = animation(item, density)
                continue
            entry, report = matched[0]
            case = report["cases"][identity]
            evidence[item["key"]][str(density)] = {
                "label": f"{preferred.upper()} / {item['theater']} / {density}X / verified native member",
                "build": uri(Path(case["buildClip"]), "video/webm"),
                "sale": uri(Path(case["saleClip"]), "video/webm"),
                "sheet": uri(Path(case["nativeSheet"]), "image/png"),
            }
            card["densities"][str(density)] = animation(item, density)
        previews[identity].append(card)
    html = html.replace("<script>const families=", section + "<script>const families=", 1)
    html = html.replace("Native game captures and checks are delivered separately.", "Native game videos and all-phase GPU captures are embedded below.")
    hook = '''<script>const evidence=EVIDENCE;const phaseRender=render;let mediaKey='';
render=function(){phaseRender();const key=selected.key+'/'+$('density').value;if(key===mediaKey)return;mediaKey=key;
const record=evidence[selected.key][$('density').value];$('native-label').textContent=record.label;
for(const kind of ['build','sale']){const video=$('native-'+kind);video.pause();video.src=record[kind];video.load()}
for(const kind of ['build','sale'])$('native-'+kind).parentElement.style.display=record.blocked?'none':'';
$('native-sheet').parentElement.style.display=record.blocked?'none':'';$('native-sheet').src=record.sheet;};render();</script>'''
    html = html.replace("</html>", hook.replace("EVIDENCE", json.dumps(evidence, separators=(",", ":"))) + "</html>")
    (args.output / file.name).write_text(html)
    links.append(f'<article><h2>{identity}</h2><select class="sequence" data-family="{identity}"></select><select class="density" data-family="{identity}"><option value="4">4X</option><option value="2">2X</option></select><img class="preview" id="preview-{identity}" alt="Original / previous HD / candidate animation"><p><a href="{file.name}">Open complete frames, native videos and GPU phase sheets</a></p></article>')
    print(identity, "EMBEDDED_FRAMES_VIDEOS_SHEETS_AND_PREVIEWS", flush=True)
index = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Embedded buildup animation review</title>
<style>body{font:20px system-ui;margin:28px;background:#18231e;color:#eee;line-height:1.5}h1{font-size:34px}h2{font-size:28px}select{font:inherit;margin:8px;padding:6px}a{color:#b4e9ce}.preview{display:block;width:100%;max-width:1600px}article{margin:36px 0}p{max-width:1100px}</style>
<h1>Embedded buildup animation review</h1><p>IDENTITY_COUNT building identities, SEQUENCE_COUNT sequences, both densities. The previews align every native phase at quarter speed, followed by a short completed-frame hold. Each complete review page embeds its images and available recorded native videos and GPU phase sheets. Two New Urban sequences have complete frame images but no native footage because the baseline TMP decoder prevents map loading. Open locally; no server or external media is required. Visual acceptance is pending.</p>
CARDS<script>const previews=PAYLOAD;for(const [identity,items] of Object.entries(previews)){
const sequence=document.querySelector(`.sequence[data-family="${identity}"]`),density=document.querySelector(`.density[data-family="${identity}"]`),image=document.getElementById('preview-'+identity);
items.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.key;sequence.append(option)});
function update(){image.src=items[+sequence.value].densities[density.value]}sequence.onchange=update;density.onchange=update;update();}</script></html>'''
(args.output / "Buildup-Art-Review.html").write_text(index.replace("CARDS", "".join(links)).replace("PAYLOAD", json.dumps(previews, separators=(",", ":")))
    .replace("IDENTITY_COUNT", str(len(previews))).replace("SEQUENCE_COUNT", str(len(authoring))))
(args.output / "embedded-media.json").write_text(json.dumps({"status": "GENERATED_EMBEDDED_REVIEW", "pages": len(previews),
    "sequences": len(authoring), "densityVariants": len(authoring) * 2, "media": media_receipts}, indent=2) + "\n")
print("COMPLETE_EMBEDDED_REVIEW", len(authoring), "sequences", flush=True)
