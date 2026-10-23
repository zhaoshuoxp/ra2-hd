"""Export authored SHP candidates for motion inspection; never activate runtime packs."""

import argparse
import base64
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("identity")
parser.add_argument("--worklist", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--allow-partial", action="store_true")
parser.add_argument(
    "--member", help="Review one member without claiming family completeness"
)
args = parser.parse_args()
root = Path(".artifacts/m1-7")
ledger = json.loads((root / "ledger.json").read_text())
family = ledger["families"][args.identity]
assert family["representativeAcceptance"] == "ACCEPTED"
work = json.loads(args.worklist.read_text())["families"][args.identity]
assert (
    args.member or len(work["members"]) == 1
), "Select the attached member explicitly."
member = next(
    m for m in work["members"] if not args.member or m["sourceMember"] == args.member
)
batches = [b for b in member["batches"] if b.get("selectedArt")]
assert batches
assert args.allow_partial or len(batches) == len(member["batches"])
for batch in batches:
    assert Path(batch["selectedArt"]).exists()
args.output.mkdir(parents=True, exist_ok=False)
source = json.loads(
    Path(
        member.get(
            "sourceFile", root / "source-v3" / (member["sourceMember"] + ".json")
        )
    ).read_text()
)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
frames = []
cv2.setRNGSeed(17)


def matte(tile):
    rgba = np.array(tile.convert("RGBA"))
    rgb = rgba[:, :, :3]
    if args.identity == "TERROR":
        color = rgb.astype(float)
        key = np.minimum(color[:, :, 0], color[:, :, 2]) - color[:, :, 1]
        if np.mean(key > 180) > 0.25:
            # Explicit flat-magenta extraction board; no source silhouette.
            coverage = np.clip(1 - key / 255, 0, 1)
            coverage[key > 180] = 0
            # Remove the known key color from antialiased boundary pixels.
            foreground = (
                color - (1 - coverage[:, :, None]) * np.array([255, 0, 255])
            ) / np.maximum(coverage[:, :, None], 0.01)
            rgba[:, :, :3] = np.clip(foreground, 0, 255).astype("uint8")
            rgba[:, :, 3] = (coverage * rgba[:, :, 3]).astype("uint8")
            rgba[rgba[:, :, 3] == 0] = 0
            return (
                Image.fromarray(rgba),
                "flat-magenta authored board; alpha extraction and key-color decontamination",
            )
    if (
        args.identity
        in [
            "SENGINEER",
            "FLAKT",
            "SHK",
            "IVAN",
            "YURI",
            "TERROR",
            "DESO",
            "CIVAN",
            "YURIPR",
            "SQD",
        ]
        and np.mean(rgba[:, :, 3] < 250) > 0.05
    ):
        # These infantry can release equipment or helmets. Keep substantial
        # disconnected authored components rather than only the body.
        count, labels, stats, _ = cv2.connectedComponentsWithStats(
            (rgba[:, :, 3] > 220).astype("uint8"), 8
        )
        areas = stats[1:, cv2.CC_STAT_AREA]
        assert len(areas) and areas.max() > 0
        keep = np.zeros(labels.shape, dtype="uint8")
        for component in range(1, count):
            x, y, w, h, area = stats[component]
            if (
                area >= max(8, areas.max() * 0.002)
                and x > 0
                and y > 0
                and x + w < tile.width
                and y + h < tile.height
            ):
                keep[labels == component] = 1
        region = cv2.dilate(keep, np.ones((3, 3), dtype="uint8"))
        effect_alpha = np.zeros(rgba.shape[:2], dtype="uint8")
        if args.identity == "DESO":
            # Authored radiation fragments have lower coverage than opaque armor.
            # Preserve their existing alpha rather than dropping them as matte.
            r, g, b = (rgb[:, :, i].astype(float) for i in range(3))
            effect = (g > 130) & (g > 1.8 * r) & (g > 1.8 * b)
            effect &= rgba[:, :, 3] > 64
            effect_alpha[effect] = rgba[:, :, 3][effect]
            region[effect] = 1
        if args.identity == "YURIPR":
            # Existing psychic hand fragments can be translucent and disconnected.
            r, g, b = (rgb[:, :, i].astype(float) for i in range(3))
            effect = (b > 140) & (b > 1.35 * r) & (b > 1.1 * g)
            effect &= rgba[:, :, 3] > 64
            effect_alpha[effect] = rgba[:, :, 3][effect]
            region[effect] = 1
        rgba[region == 0] = 0
        rgba[:, :, 3] = np.clip(
            (rgba[:, :, 3].astype(float) - 180) * 255 / 60, 0, 255
        ).astype("uint8")
        rgba[:, :, 3] = np.maximum(rgba[:, :, 3], effect_alpha)
        rgba[rgba[:, :, 3] == 0] = 0
        if args.identity == "DESO":
            r, g, b = (rgba[:, :, i].astype(float) for i in range(3))
            armor = (r > 80) & (r > 1.6 * g) & (r > 1.4 * b)
            assert (
                np.count_nonzero(armor & (rgba[:, :, 3] > 100)) > 1000
            ), "Missing authored DESO body; inspect crop before retaining isolated effects"
        if args.identity == "YURIPR":
            r, g, b = (rgba[:, :, i].astype(float) for i in range(3))
            armor = (r > 80) & (r > 1.6 * g) & (r > 1.4 * b)
            assert (
                np.count_nonzero(armor & (rgba[:, :, 3] > 100)) > 500
            ), "Missing authored YURIPR body; inspect crop before retaining isolated effects"
        return (
            Image.fromarray(rgba),
            "generated alpha; substantial interior body and detached-tool components; coverage ramp 180..240",
        )
    if np.mean(rgba[:, :, 3] < 250) > 0.05:
        # DRON and DOG cells contain one connected actor, no detached effects.
        # Some generated-alpha boards also contain disjoint border residue. Select
        # the authored component containing the red chassis; never use native masks.
        assert args.identity in [
            "DRON",
            "DOG",
        ], "Review alpha-component policy for this family."
        count, labels, stats, centers = cv2.connectedComponentsWithStats(
            (rgba[:, :, 3] > (230 if args.identity == "DOG" else 64)).astype("uint8"), 8
        )
        r, g, b = (rgb[:, :, i].astype(float) for i in range(3))
        red_core = (r > 90) & (r > 1.6 * g) & (r > 1.4 * b)
        scores = [
            (int(np.count_nonzero(red_core & (labels == i))), i)
            for i in range(1, count)
        ]
        score, component = max(scores)
        assert score > 0
        region = cv2.dilate(
            (labels == component).astype("uint8"), np.ones((3, 3), dtype="uint8")
        )
        rgba[region == 0] = 0
        # Opaque machinery was surrounded by low-alpha painted background residue.
        # Keep the high-coverage authored metal and reconstruct only its narrow edge.
        rgba[:, :, 3] = np.clip(
            (rgba[:, :, 3].astype(float) - 180) * 255 / 60, 0, 255
        ).astype("uint8")
        rgba[rgba[:, :, 3] == 0] = 0
        if args.identity == "DOG":
            background = np.array([72, 88, 78], dtype=float)
            color = rgba[:, :, :3].astype(float)
            level = color.mean(axis=2) / background.mean()
            matte_color = (
                np.max(abs(color - level[:, :, None] * background), axis=2) < 6
            )
            green_mat = (color[:, :, 1] > color[:, :, 0] + 3) & (
                color[:, :, 1] > color[:, :, 2] + 2
            )
            rgba[matte_color & green_mat] = 0
        return (
            Image.fromarray(rgba),
            "generated alpha; authored chassis component; opaque coverage ramp 180..240",
        )
    red, green, blue = (rgb[:, :, i].astype(float) for i in range(3))
    border = np.concatenate(
        [
            rgb[:8].reshape(-1, 3),
            rgb[-8:].reshape(-1, 3),
            rgb[:, :8].reshape(-1, 3),
            rgb[:, -8:].reshape(-1, 3),
        ]
    )
    bg = np.median(border, axis=0)
    delta = np.maximum(
        abs((red - green) - (bg[0] - bg[1])), abs((blue - green) - (bg[2] - bg[1]))
    )
    mask = np.full(red.shape, cv2.GC_PR_BGD, dtype="uint8")
    mask[delta > 13] = cv2.GC_PR_FGD
    seed = ((red > 90) & (red > 1.6 * green) & (red > 1.4 * blue)) | (
        (np.minimum(np.minimum(red, green), blue) > 125)
        & (abs(red - green) < 12)
        & (abs(blue - green) < 12)
    )
    # Neutral dark metal is foreground even when its chroma resembles the matte.
    seed |= np.max(rgb, axis=2) < min(bg) - 22
    mask[seed] = cv2.GC_FGD
    mask[:8] = mask[-8:] = cv2.GC_BGD
    mask[:, :8] = mask[:, -8:] = cv2.GC_BGD
    assert np.any(mask == cv2.GC_FGD), "No authored foreground seeds"
    cv2.grabCut(
        rgb, mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK
    )
    keep = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    if args.identity == "DOG":
        # Darkened green matte under pale paws can be grouped with the actor.
        # Remove only the matte's chromaticity; neutral fur and red collar remain.
        luminance = rgb.astype(float).mean(axis=2) / max(1, bg.mean())
        matte_color = np.max(abs(rgb - luminance[:, :, None] * bg), axis=2) < 6
        keep &= ~(matte_color & (green > red + 3) & (green > blue + 2))
    rgba[:, :, 3] = keep.astype("uint8") * 255
    rgba[~keep] = 0
    return (
        Image.fromarray(rgba),
        "GrabCut from authored colors and cell border only; no source silhouette",
    )


for batch in batches:
    board = Image.open(batch["selectedArt"]).convert("RGBA")
    if batch.get("alphaFrom"):
        # A material-only edit may return RGB. Restore the registered authored
        # alpha from the prior artwork, never from the native pixel silhouette.
        alpha_source = Image.open(batch["alphaFrom"]).convert("RGBA")
        assert alpha_source.size == board.size, "Authored alpha registration mismatch"
        board.putalpha(alpha_source.getchannel("A"))
    ratio = (board.width / 1536, board.height / 1024)
    for sample in batch["samples"]:
        fid = sample["frame"]
        f = source["frames"][fid]
        x, y, w, h = sample.get("authoredCell", sample["cell"])
        cell = board.crop(
            (
                round(x * ratio[0]),
                round(y * ratio[1]),
                round((x + w) * ratio[0]),
                round((y + h) * ratio[1]),
            )
        )
        # Explicit label-only rectangles permit raised hands above the default crop.
        for ex, ey, ew, eh in sample.get("labelExclusions", []):
            cell.paste(
                (0, 0, 0, 0),
                (
                    round(ex * ratio[0]),
                    round(ey * ratio[1]),
                    round((ex + ew) * ratio[0]),
                    round((ey + eh) * ratio[1]),
                ),
            )
        clean, method = matte(cell)
        bounds = clean.getbbox()
        assert (
            bounds
            and bounds[0] > 0
            and bounds[1] > 0
            and bounds[2] < cell.width
            and bounds[3] < cell.height
        ), f"Authored crop touches cell boundary: {batch['id']} frame {fid} {bounds}"
        detail = clean.crop(bounds)
        index = np.array(f["pixels"], dtype="uint8").reshape(f["height"], f["width"])
        source_rgba = np.zeros((f["height"], f["width"], 4), dtype="uint8")
        source_rgba[:, :, :3] = np.array(source["palette"], dtype="uint8")[index]
        source_rgba[:, :, 3] = (index != 0).astype("uint8") * 255
        original = Image.new("RGBA", tuple(source["canvas"]))
        original.alpha_composite(Image.fromarray(source_rgba), (f["x"], f["y"]))
        body_mask = index != 0
        if args.identity != "SQD":
            body_mask &= index != 12
        body_bounds = Image.fromarray(body_mask.astype("uint8") * 255).getbbox()
        assert body_bounds
        a, b, c, d = body_bounds
        scale = min((c - a) / detail.width, (d - b) / detail.height)
        registration = sample.get("registration")
        if registration:
            # Reviewed anatomical registration must not expand with muzzle effects.
            scale = registration["scale"]
            assert 0 < scale <= 1 and registration["reason"]
        density = 4
        sprite = (
            detail.convert("RGBa")
            .resize(
                (
                    max(1, round(detail.width * scale * density)),
                    max(1, round(detail.height * scale * density)),
                ),
                Image.Resampling.LANCZOS,
            )
            .convert("RGBA")
        )
        candidate = Image.new(
            "RGBA", (source["canvas"][0] * density, source["canvas"][1] * density)
        )
        patch = index == 12
        if args.identity == "SQD":
            # SQD has NoShadow=yes; black palette entries belong to its anatomy.
            patch[:] = False
        embedded_shadow = args.identity in [
            "SENGINEER",
            "DOG",
            "FLAKT",
            "SHK",
            "IVAN",
            "YURI",
            "TERROR",
            "DESO",
            "CIVAN",
            "YURIPR",
        ]
        if embedded_shadow:
            assert all(
                frame["empty"] for frame in source["frames"][member["requiredSlots"] :]
            )
        else:
            patch[b:d, a:c] = False
        native_shadow = np.zeros_like(source_rgba)
        native_shadow[:, :, 3] = patch.astype("uint8") * 255
        ground = Image.new("RGBA", original.size)
        ground.alpha_composite(Image.fromarray(native_shadow), (f["x"], f["y"]))
        candidate.alpha_composite(
            ground.resize(candidate.size, Image.Resampling.NEAREST)
        )
        anchor = (
            round((f["x"] + (a + c) / 2) * density - sprite.width / 2),
            round((f["y"] + d) * density - sprite.height),
        )
        if registration:
            anchor = (
                registration["leftAt4x"],
                registration["groundAt4x"] - sprite.height,
            )
        candidate.alpha_composite(sprite, anchor)
        paths = {}
        for role, im in [
            ("original", original),
            ("candidate", candidate),
            ("detail", detail),
            ("raw-cell", cell),
        ]:
            p = args.output / f"{fid:03d}-{role}.png"
            im.save(p)
            paths[role] = {"path": str(p), "sha256": sha(p)}
        frames.append(
            {
                "frame": fid,
                "batch": batch["id"],
                "sourceFrameSha256": f["sha256"],
                "matte": method,
                "authoredBounds": bounds,
                "scale": scale,
                "anchorAt4x": anchor,
                **({"registration": registration} if registration else {}),
                "nativeBodyBounds": body_bounds,
                "retainedNativeGroundPixels": int(patch.sum()),
                "shadowPolicy": (
                    "NoShadow=yes; black source anatomy is part of the authored body"
                    if args.identity == "SQD"
                    else (
                        "complete native embedded index-12 layer beneath authored body"
                        if embedded_shadow
                        else "native outer ground pixels and separate runtime shadow"
                    )
                ),
                "files": paths,
            }
        )
frames.sort(key=lambda f: f["frame"])
assert args.allow_partial or [f["frame"] for f in frames] == list(
    range(member["requiredSlots"])
)
report = {
    "status": (
        "PARTIAL_SLOT_CANDIDATE_ONLY"
        if args.allow_partial
        else "COMPLETE_SLOT_CANDIDATE_ONLY"
    ),
    "identity": args.identity,
    "sourceMember": member["sourceMember"],
    "sourceFile": member.get(
        "sourceFile", str(root / "source-v3" / (member["sourceMember"] + ".json"))
    ),
    "sourceSha256": member["sourceSha256"],
    "frames": frames,
    "provenance": member["batches"],
    "runtimeActivation": False,
    "limitations": [
        "Color-seeded matting requires inspection for lost metal edges or retained halos.",
        "Per-frame registration is provisional; body-size and limb continuity require review.",
        "No remap pack, runtime material, native action or final visual acceptance claim.",
    ],
}
(args.output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
payload = {
    str(f["frame"]): {
        role: "data:image/png;base64,"
        + base64.b64encode(Path(f["files"][role]["path"]).read_bytes()).decode()
        for role in ["original", "candidate"]
    }
    for f in frames
}
sequences = {}
selected = {f["frame"] for f in frames}
for slot in member["slots"]:
    if slot["frame"] not in selected:
        continue
    for state in slot["sequenceMembership"] or [
        {"action": "NativeExtra", "facing": 0, "phase": slot["frame"]}
    ]:
        sequences.setdefault(state["action"], {}).setdefault(
            str(state["facing"]), []
        ).append(slot["frame"])
page = """<!doctype html><html lang="en"><meta charset="utf-8"><title>Native-slot motion candidate</title>
<style>body{font:18px/1.5 system-ui;background:#20262b;color:#eee;margin:32px}select,button,input{font:inherit}canvas{background:#a5aaa0;margin:8px}section{display:flex;flex-wrap:wrap}h1{font-size:30px}</style>
<h1>__IDENTITY__ — __MEMBER__</h1><p>__COUNT__ authored positions in this export. __STATUS__. This is a source-sequence preview, not native gameplay or final visual acceptance. Playback timing is a review control.</p>
<p><label>Action <select id="action"></select></label><label>Facing <select id="facing"></select></label>
<label>Preview FPS <input id="fps" type="number" value="6" min="1" max="30"></label><button id="pause">Pause</button><label>Phase <input id="phase" type="range" min="0" value="0" step="1"></label><span id="frame"></span></p>
<section><div>Original<canvas id="original" width="360" height="300"></canvas></div><div>HD candidate<canvas id="candidate" width="360" height="300"></canvas></div></section>
<p>900-reference / 1080p apparent scale. Original shadow data is retained separately in runtime. This page never activates a pack.</p>
<script>const sources=__DATA__,sequences=__SEQUENCES__,images={};let phase=0,last=0,paused=false;
const action=document.querySelector('#action'),facing=document.querySelector('#facing');
action.innerHTML=Object.keys(sequences).map(n=>`<option>${n}</option>`).join('');
const phaseControl=document.querySelector('#phase');function phases(){phase=0;phaseControl.max=sequences[action.value][facing.value].length-1;phaseControl.value=0;}function faces(){facing.innerHTML=Object.keys(sequences[action.value]).map(n=>`<option>${n}</option>`).join('');phases();}faces();
let ready=Promise.all(Object.entries(sources).flatMap(([id,roles])=>Object.entries(roles).map(async([role,url])=>{let im=new Image;im.src=url;await im.decode();(images[id]??={})[role]=im;})));
function draw(){let list=sequences[action.value][facing.value],id=list[phase%list.length];phaseControl.value=phase%list.length;document.querySelector('#frame').textContent='Frame '+id;for(let role of ['original','candidate']){let c=document.getElementById(role),ctx=c.getContext('2d'),im=images[id][role],density=role==='candidate'?4:1;ctx.clearRect(0,0,360,300);ctx.drawImage(im,(360-im.width/density*1.2)/2,(300-im.height/density*1.2)/2,im.width/density*1.2,im.height/density*1.2);}}
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'Play':'Pause';};action.onchange=()=>{faces();draw();};facing.onchange=()=>{phases();draw();};phaseControl.oninput=()=>{phase=Number(phaseControl.value);draw();};
ready.then(()=>{window.__motionReady=true;draw();function tick(t){if(!paused&&t-last>1000/Number(document.querySelector('#fps').value)){phase++;last=t;draw();}requestAnimationFrame(tick);}requestAnimationFrame(tick);});</script></html>"""
for key, value in {
    "__IDENTITY__": args.identity,
    "__MEMBER__": member["sourceMember"],
    "__COUNT__": str(len(frames)),
    "__STATUS__": report["status"],
    "__DATA__": json.dumps(payload),
    "__SEQUENCES__": json.dumps(sequences),
}.items():
    page = page.replace(key, value)
(args.output / "review.html").write_text(page)
print("Exported", len(frames), "candidate frames; runtime activation disabled.")
