"""Register authored component bearings to native pivots and package immutable resources."""

import argparse
import base64
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("identity")
p.add_argument("worklist", type=Path)
p.add_argument("revision")
p.add_argument("review", type=Path)
p.add_argument("--ownership-references", type=Path, required=True)
a = p.parse_args()
work = json.loads(a.worklist.read_text())
boards = [b for b in work["boards"] if b["family"] == a.identity]
assert boards and all(
    b.get("selectedArt") for b in boards
), "Incomplete authored family"
pack = Path(f".local/hd-packs/soviet-{a.identity.lower()}-vxl/{a.revision}")
pack.mkdir(parents=True, exist_ok=False)
a.review.mkdir(parents=True, exist_ok=False)
inv = json.loads(Path(".artifacts/m1-7/source-v4/inventory.json").read_text())
family = next(f for f in inv["families"] if f["id"] == a.identity)
members = set(family["members"])
for child in family["children"]:
    members.update(child["members"])
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {
    "schema": "unit-vxl-family-v1",
    "identity": a.identity,
    "theater": "TEMPERATE",
    "revision": a.revision,
    "density": 4,
    "sources": {n: inv["assets"][n]["sha256"] for n in sorted(members)},
    "parts": [],
    "acceptance": "REPRESENTATIVE_ACCEPTED_FULL_FAMILY_REVIEW_PENDING",
}
cv2.setRNGSeed(17)
review = []


def matte(tile):
    if tile.mode == "RGBA" and tile.getchannel("A").getextrema()[0] < 255:
        rgba = np.array(tile)
        rgba[rgba[:, :, 3] <= 1] = 0
        return Image.fromarray(rgba)
    rgb = np.array(tile.convert("RGB"))
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
    seed = (red > 90) & (red > 1.6 * green) & (red > 1.4 * blue)
    seed |= (
        (np.min(rgb, axis=2) > 125) & (abs(red - green) < 12) & (abs(blue - green) < 12)
    )
    seed |= np.max(rgb, axis=2) < min(bg) - 22
    mask[seed] = cv2.GC_FGD
    mask[:8] = mask[-8:] = cv2.GC_BGD
    mask[:, :8] = mask[:, -8:] = cv2.GC_BGD
    assert np.any(mask == cv2.GC_FGD)
    cv2.grabCut(
        rgb, mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK
    )
    keep = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    rgba = np.dstack([rgb, keep.astype("uint8") * 255])
    rgba[~keep] = 0
    return Image.fromarray(rgba)


actor_bounds = {}
actor_origins = {}
for board in boards:
    actor = board["identity"]
    for frame in board["frames"]:
        # The body section's native origin is the actor position in these captures.
        actor_origins.setdefault(
            (actor, frame["heading"]), frame["part"]["matrixWorld"][12:15]
        )
        sx, sy, ex, ey = frame["sourceBounds"]
        px, py = frame["pivot"]
        ratio = frame["ratio"]
        bounds = [
            (sx - px) / ratio,
            (sy - py) / ratio,
            (ex - px) / ratio + 0.25,
            (ey - py) / ratio + 0.25,
        ]
        old = actor_bounds.get(actor, bounds)
        actor_bounds[actor] = [
            min(old[0], bounds[0]),
            min(old[1], bounds[1]),
            max(old[2], bounds[2]),
            max(old[3], bounds[3]),
        ]

for board in boards:
    raw = Image.open(board["selectedArt"])
    cells = []
    for frame in board["frames"]:
        x, y, w, h = frame["cell"]
        crop = raw.crop(
            (
                round(x * raw.width / 2048),
                round(y * raw.height / 1024),
                round((x + w) * raw.width / 2048),
                round((y + h) * raw.height / 1024),
            )
        )
        clean = matte(crop)
        box = clean.getbbox()
        assert (
            box
            and box[0] > 0
            and box[1] > 0
            and box[2] < crop.width
            and box[3] < crop.height
        )
        detail = clean.crop(box)
        sx, sy, ex, ey = frame["sourceBounds"]
        ratio = frame["ratio"]
        size = [round((ex - sx) / ratio * 4), round((ey - sy) / ratio * 4)]
        factor = min(size[0] / detail.width, size[1] / detail.height)
        resized = (
            detail.convert("RGBa")
            .resize(
                (round(detail.width * factor), round(detail.height * factor)),
                Image.Resampling.LANCZOS,
            )
            .convert("RGBA")
        )
        sprite = Image.new("RGBA", size)
        sprite.alpha_composite(
            resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2)
        )
        rgba = np.array(sprite)
        red, green, blue = (rgba[:, :, i].astype(float) for i in range(3))
        owner = (
            (red > 1.55 * green) & (red > 1.4 * blue) & (red > 65) & (rgba[:, :, 3] > 0)
        )
        name = f"{board['identity']}-{frame['heading']}-{board['part']}"
        source_red = a.ownership_references / (name + ".png")
        source_blue = a.ownership_references / (name + "-owner-blue.png")
        red_control = np.array(Image.open(source_red).convert("RGB")).astype(int)
        blue_control = np.array(Image.open(source_blue).convert("RGB")).astype(int)
        support = (np.max(abs(red_control - blue_control), axis=2) > 5).astype(
            "uint8"
        ) * 255
        support = (
            Image.fromarray(support)
            .crop((sx, sy, ex, ey))
            .resize(size, Image.Resampling.NEAREST)
        )
        # A small source-space margin accommodates authored bevels without
        # turning fixed decorations (for example Kirov teeth) into owner paint.
        radius = max(1, round(3 * 4 / ratio))
        support = (
            cv2.dilate(
                np.array(support),
                np.ones((radius * 2 + 1, radius * 2 + 1), dtype="uint8"),
            )
            > 0
        )
        owner_regions = board.get("ownerRegions", {}).get(str(frame["heading"]), [])
        for region in owner_regions:
            x0, y0, x1, y1 = region["rect"]
            region_mask = np.zeros(owner.shape, dtype=bool)
            region_mask[
                round(y0 * size[1]) : round(y1 * size[1]),
                round(x0 * size[0]) : round(x1 * size[0]),
            ] = True
            # Explicit reviewed paint-region correction for enlarged authored geometry.
            # The stricter saturation gate excludes orange ore and bronze highlights.
            support |= region_mask & (red > 3 * green) & (red > 3 * blue)
        fixed_red = int(np.count_nonzero(owner & ~support))
        owner &= support
        data = np.zeros_like(rgba)
        data[:, :, 3] = 255
        data[owner, 0] = 255
        shades = (
            np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8])
            * 4
        )
        shade = np.argmin(abs(red[:, :, None] - shades), axis=2)
        data[:, :, 1] = np.where(owner, shade, 0).astype("uint8")
        assert np.any(owner) or not np.any(
            support
        ), f"Missing expected owner-color pixels: {board['id']} yaw {frame['heading']}"
        pivot = frame["part"]["pivot"]
        linear = list(frame["part"]["matrixWorld"])
        linear[12:15] = [0, 0, 0]
        entry = {
            "heading": frame["heading"],
            "logicalSize": [s / 4 for s in size],
            "offset": [(sx - pivot[0]) / ratio, (sy - pivot[1]) / ratio],
            "referenceLinear": linear,
            "referenceOrigin": [
                v - o
                for v, o in zip(
                    frame["part"]["matrixWorld"][12:15],
                    actor_origins[(board["identity"], frame["heading"])],
                )
            ],
            "sourceBounds": frame["sourceBounds"],
            "authoredBounds": box,
            "ownerPixels": int(owner.sum()),
            "fixedRedPixels": fixed_red,
            "ownerControlHashes": [sha(source_red), sha(source_blue)],
            "ownerRegions": owner_regions,
        }
        cells.append((sprite, Image.fromarray(data), entry))
    cw = max(c[0].width for c in cells) + 8
    ch = max(c[0].height for c in cells) + 8
    color = Image.new("RGBA", (cw * 4, ch * 2))
    data = Image.new("RGBA", color.size, (0, 0, 0, 255))
    entries = []
    for i, (sprite, remap, entry) in enumerate(cells):
        x, y = i % 4 * cw + 4, i // 4 * ch + 4
        color.paste(sprite, (x, y))
        data.paste(remap, (x, y))
        entry["rect"] = [x, y, sprite.width, sprite.height]
        entries.append(entry)
        name = f"{board['id']}-{entry['heading']}.png"
        sprite.save(a.review / name)
        detail = Image.open(board["selectedArt"])
        review.append(
            {
                "part": board["id"],
                "heading": entry["heading"],
                "size": entry["logicalSize"],
                "data": "data:image/png;base64,"
                + base64.b64encode((a.review / name).read_bytes()).decode(),
            }
        )
    files = {}
    for role, im in [("base", color), ("data", data)]:
        name = f"{board['id']}-{role}.png"
        im.save(pack / name)
        files[role] = {
            "file": name,
            "sha256": sha(pack / name),
            "bytes": (pack / name).stat().st_size,
        }
    manifest["parts"].append(
        {
            "key": board["part"],
            "actor": board["identity"],
            "member": board["sourceMember"],
            "section": board["frames"][0]["part"]["section"],
            "depthBounds": actor_bounds[board["identity"]],
            "pageSize": list(color.size),
            "files": files,
            "frames": entries,
            "provenance": {
                "art": board["selectedArt"],
                "sha256": sha(Path(board["selectedArt"])),
                "board": board["board"],
                "boardSha256": board["boardSha256"],
                "matte": "Preserve generated alpha; discard alpha <= 1 noise, otherwise color-seeded background extraction",
            },
        }
    )
(pack / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
(a.review / "pack.json").write_text(
    json.dumps(
        {
            "manifest": str(pack / "manifest.json"),
            "sha256": sha(pack / "manifest.json"),
            "status": "RESOURCE_CANDIDATE_RUNTIME_UNVERIFIED",
        },
        indent=2,
    )
    + "\n"
)
html = """<!doctype html><html lang="en"><meta charset="utf-8"><title>Vehicle bearings</title>
<style>body{font:20px system-ui;background:#48584e;color:white;padding:24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}figure{margin:0;min-height:150px}img{display:block}button{font:inherit}</style>
<h1>__ID__ authored component bearings</h1><p>Candidate artwork at 900-reference / 1080p apparent size. Runtime turning, depth and mechanics are not yet certified.</p><button id="detail">Show detail</button><div class="grid" id="grid"></div>
<script>const rows=__DATA__;let detail=false;function draw(){grid.replaceChildren();for(const r of rows){const f=document.createElement('figure'),i=new Image(),c=document.createElement('figcaption');i.src=r.data;i.style.width=r.size[0]*(detail?4:1.2)+'px';i.style.height=r.size[1]*(detail?4:1.2)+'px';c.textContent=r.part+' / '+r.heading;f.append(i,c);grid.append(f)}}document.querySelector('#detail').onclick=()=>{detail=!detail;draw()};draw();</script></html>"""
(a.review / "review.html").write_text(
    html.replace("__ID__", a.identity).replace("__DATA__", json.dumps(review))
)
print(
    json.dumps(
        {
            "identity": a.identity,
            "parts": len(boards),
            "bearings": len(review),
            "manifest": str(pack / "manifest.json"),
            "sha256": sha(pack / "manifest.json"),
        }
    )
)
