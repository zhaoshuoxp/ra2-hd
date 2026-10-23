"""Register authored component bearings to native pivots and package immutable resources."""

import argparse
import base64
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'owner-color'))
from authored_slots import isolated_cells
from vxl_depth_bounds import cover_registered_frames
from paint import complete_data

p = argparse.ArgumentParser()
p.add_argument("identity")
p.add_argument("worklist", type=Path)
p.add_argument("revision")
p.add_argument("review", type=Path)
p.add_argument("--ownership-references", type=Path, required=True)
p.add_argument("--output", type=Path, help="Task-owned staging pack root")
p.add_argument("--density", type=int, choices=[2, 4], default=2)
p.add_argument("--theater", choices=["TEMPERATE", "SNOW", "URBAN"], default="TEMPERATE")
p.add_argument("--acceptance", choices=["REPRESENTATIVE_ACCEPTED_FULL_FAMILY_REVIEW_PENDING",
    "SOURCE_DERIVED_CANDIDATE_VISUAL_REVIEW_PENDING"],
    default="REPRESENTATIVE_ACCEPTED_FULL_FAMILY_REVIEW_PENDING")
p.add_argument("--inventory", type=Path, default=Path(".artifacts/yuri-units/source-v2/inventory.json"))
p.add_argument("--reference-report", default="result.json")
a = p.parse_args()
work = json.loads(a.worklist.read_text())
boards = [b for b in work["boards"] if b["family"] == a.identity]
assert boards and all(
    b.get("selectedArt") and b.get("visualQa") == "PASS" for b in boards
), "Incomplete authored family"
pack = a.output or Path(f".artifacts/yuri-units/staged-packs/yuri-{a.identity.lower()}-vxl/{a.revision}")
pack.mkdir(parents=True, exist_ok=False)
a.review.mkdir(parents=True, exist_ok=False)
inv = json.loads(a.inventory.read_text())
family = next(f for f in inv["families"] if f["id"] == a.identity)
members = set(family["members"])
for child in family["children"]:
    members.update(child["members"])
members = {n for n in members if n.endswith((".vxl", ".hva"))}
assert sorted(b["part"] for b in boards) == sorted(p["key"] for u in json.loads((Path(work["references"]) / a.reference_report).read_text())["units"] if u["name"] in {b["identity"] for b in boards} for p in u["views"][0]["partMetadata"]), "Independent native part coverage changed"
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = {
    "schema": "unit-vxl-family-v1",
    "identity": a.identity,
    "theater": a.theater,
    "revision": a.revision,
    "density": a.density,
    "sources": {n: inv["assets"][n]["sha256"] for n in sorted(members)},
    "parts": [],
    "acceptance": a.acceptance,
}
review = []


def matte(tile):
    if tile.mode == "RGBA" and tile.getchannel("A").getextrema()[0] < 255:
        rgba = np.array(tile)
        rgba[rgba[:, :, 3] <= 1] = 0
        return Image.fromarray(rgba)
    raise ValueError("Generated transparent alpha is required; do not infer a source silhouette")


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
    assert sha(Path(board["selectedArt"])) == board["selectedArtSha256"]
    assert sha(Path(board["board"])) == board["boardSha256"]
    raw = Image.open(board["selectedArt"])
    cells = []
    isolated = isolated_cells(raw, *board.get("selectedArtGrid", [4, 2]), occupied=8)
    order = board.get("authoredCellOrder", list(range(8)))
    assert sorted(order) == list(range(8)), "Cell order must retain all authored views"
    for frame, cell_index in zip(board["frames"], order, strict=True):
        detail, box = isolated[cell_index]
        replacement = board.get("authoredFrameOverrides", {}).get(str(frame["heading"]))
        if replacement:
            replacement_path = Path(replacement["path"])
            assert sha(replacement_path) == replacement["sha256"]
            replacement_image = Image.open(replacement_path).convert("RGBA")
            if replacement.get("matte") == "authored-flat-magenta":
                rgba = np.array(replacement_image).astype(float)
                key = np.minimum(rgba[..., 0], rgba[..., 2]) - rgba[..., 1]
                coverage = np.clip(1 - key / 255, 0, 1)
                coverage[key > 180] = 0
                rgba[..., :3] = np.divide(rgba[..., :3] - (1 - coverage[..., None]) * [255, 0, 255],
                                          np.maximum(coverage[..., None], .01))
                rgba[..., 3] *= coverage
                replacement_image = Image.fromarray(np.uint8(np.clip(rgba, 0, 255)))
            replacement_cells = isolated_cells(replacement_image, *replacement.get("grid", [1, 1]),
                                                occupied=replacement.get("occupied", 1))
            detail, box = replacement_cells[replacement.get("index", 0)]
        sx, sy, ex, ey = frame["sourceBounds"]
        ratio = frame["ratio"]
        # Retain the previously registered half-pixel logical bounds at either density.
        logical_size = [round((ex - sx) / ratio * 2) / 2, round((ey - sy) / ratio * 2) / 2]
        size = [round(v * a.density) for v in logical_size]
        available_density = min(detail.width / logical_size[0], detail.height / logical_size[1])
        assert available_density >= 4, (board["id"], frame["heading"], available_density, "Insufficient authored detail for true 4x")
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
        radius = max(1, round(3 * 2 / ratio)) * a.density // 2
        support = (
            np.array(support.filter(ImageFilter.MaxFilter(radius * 2 + 1)))
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
        if np.any(support):
            data, added_paint, neutral_paint = complete_data(rgba, data, a.density, board["identity"], board["sourceMember"], frame["heading"])
        else:
            assert not np.any(owner), "Unexpected paint on a native neutral part"
            added_paint, neutral_paint = 0, fixed_red
        owner = data[:, :, 0] >= 128
        fixed_red = neutral_paint
        assert np.any(owner) or not np.any(
            support
        ), f"Missing expected owner-color pixels: {board['id']} yaw {frame['heading']}"
        pivot = frame["part"]["pivot"]
        linear = list(frame["part"]["matrixWorld"])
        linear[12:15] = [0, 0, 0]
        entry = {
            "heading": frame["heading"],
            "logicalSize": logical_size,
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
            "authoredDetailSize": list(detail.size),
            "authoredResampleScale": factor,
            "availableAuthoredDensity": available_density,
            "expandedAuthoredOwnerPixels": added_paint,
            "ownerPixels": int(owner.sum()),
            "fixedRedPixels": fixed_red,
            "ownerControlHashes": [sha(source_red), sha(source_blue)],
            "ownerRegions": owner_regions,
        }
        cells.append((sprite, Image.fromarray(data), entry))
    cw = max(c[0].width for c in cells) + 8
    ch = max(c[0].height for c in cells) + 8
    columns = 4 if cw * 4 <= 2048 else 2
    color = Image.new("RGBA", (cw * columns, ch * (8 // columns)))
    data = Image.new("RGBA", color.size, (0, 0, 0, 255))
    entries = []
    for i, (sprite, remap, entry) in enumerate(cells):
        x, y = i % columns * cw + 4, i // columns * ch + 4
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
        name = f"{board.get('resourceStem', board['id'])}-{role}.png"
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
                **({"authoredCellOrder": order} if "authoredCellOrder" in board else {}),
                **({"authoredFrameOverrides": board["authoredFrameOverrides"]} if board.get("authoredFrameOverrides") else {}),
                "matte": "Separate isolated authored alpha components by grid center, preserve generated alpha within two-pixel support; no native silhouette or source RGB fill",
            },
        }
    )
# Component origins can differ from the first captured joint. Local crop bounds
# alone can omit the belly even when the atlas contains the complete image.
cover_registered_frames(manifest["parts"])
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
<h1>__ID__ authored component bearings</h1><p>Candidate artwork at native logical size with independent authored density buffers. Runtime turning, depth and mechanics are not yet certified.</p><button id="detail">Show detail</button><div class="grid" id="grid"></div>
<script>const rows=__DATA__;let detail=false;function draw(){grid.replaceChildren();for(const r of rows){const f=document.createElement('figure'),i=new Image(),c=document.createElement('figcaption');i.src=r.data;i.style.width=r.size[0]*(detail?__DENSITY__:1)+'px';i.style.height=r.size[1]*(detail?__DENSITY__:1)+'px';c.textContent=r.part+' / '+r.heading;f.append(i,c);grid.append(f)}}document.querySelector('#detail').onclick=()=>{detail=!detail;draw()};draw();</script></html>"""
(a.review / "review.html").write_text(
    html.replace("__ID__", a.identity).replace("__DENSITY__", str(a.density)).replace("__DATA__", json.dumps(review))
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
