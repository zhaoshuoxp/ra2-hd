"""Prepare source-aligned eight-bearing boards; never synthesize authored pixels."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument("references", type=Path)
p.add_argument("output", type=Path)
args = p.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
source = json.loads((args.references / "result.json").read_text())
accepted = {f["id"]: f for f in json.loads(
    Path(".artifacts/m1-7-yr/review-exports-v2/manifest.json").read_text()
)["families"]}
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
boards = []
for unit in source["units"]:
    if unit["name"] == "HTNK":
        continue
    parent = {"BPLN": "BORIS"}.get(unit["name"], unit["name"])
    for part in unit["views"][0]["partMetadata"]:
        key = part["key"]
        board = Image.new("RGB", (2048, 1024), (72, 88, 78))
        draw = ImageDraw.Draw(board)
        frames = []
        for index, view in enumerate(unit["views"]):
            original = Image.open(args.references / view["layers"][key]).convert("RGB")
            data = np.asarray(original).astype(int)
            mask = np.max(np.abs(data - [72, 88, 78]), axis=2) > 12
            ys, xs = np.nonzero(mask)
            if not len(xs):
                raise ValueError(
                    f"Empty native part: {unit['name']}/{key}/{view['heading']}"
                )
            bounds = [
                int(xs.min()),
                int(ys.min()),
                int(xs.max()) + 1,
                int(ys.max()) + 1,
            ]
            crop = original.crop(bounds)
            scale = min(4, 440 / crop.width, 410 / crop.height)
            width, height = round(crop.width * scale), round(crop.height * scale)
            cx, cy = index % 4 * 512, index // 4 * 512
            x, y = cx + (512 - width) // 2, cy + 70 + (410 - height) // 2
            board.paste(crop.resize((width, height), Image.Resampling.NEAREST), (x, y))
            draw.text(
                (cx + 14, cy + 16),
                f"{unit['name']} {key} / yaw {view['heading']}",
                font=font,
                fill="white",
            )
            frames.append(
                {
                    "heading": view["heading"],
                    "cell": [cx, cy, 512, 512],
                    "guideBounds": [x, y, x + width, y + height],
                    "sourceBounds": bounds,
                    "pivot": view["pivot"],
                    "ratio": view["ratio"],
                    "source": view["layers"][key],
                    "part": next(m for m in view["partMetadata"] if m["key"] == key),
                }
            )
        name = f"{unit['name']}-{key}"
        filename = args.output / f"{name}.png"
        board.save(filename)
        boards.append(
            {
                "id": name,
                "family": parent,
                "identity": unit["name"],
                "part": key,
                "sourceMember": part["source"],
                "board": str(filename),
                "boardSha256": hashlib.sha256(filename.read_bytes()).hexdigest(),
                "acceptedReference": accepted[unit["name"]]["raw"],
                "frames": frames,
                "status": "AUTHORING_PENDING",
            }
        )
(args.output / "worklist.json").write_text(
    json.dumps({"status": "SOURCE_BOARDS_ONLY", "boards": boards}, indent=2) + "\n"
)
print(
    json.dumps(
        {"boards": len(boards), "bearings": sum(len(b["frames"]) for b in boards)}
    )
)
