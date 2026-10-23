"""Build source-only VXL reference boards from measured native runtime crops."""

from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

root = Path(".artifacts/m1-7")
src = root / "runtime-references-v3"
out = root / "vehicle-references-v2"
out.mkdir(exist_ok=False)
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
inv = json.loads((root / "source-v3/inventory.json").read_text())
report = json.loads((src / "result.json").read_text())
items = []
for f in inv["families"]:
    if f["acceptedControl"] or f["representation"] != "VXL/HVA":
        continue
    refs = next(x for x in report["units"] if x["name"] == f["id"])
    views = refs["views"]
    roles = [(0, "complete"), (90, "complete")]
    if len(f["members"]) > 2:
        roles += [
            (0, "body"),
            (0, "alternate" if "alternate" in views[0]["layers"] else "mechanical"),
        ]
    board = Image.new("RGB", (1024, 1024 if len(roles) > 2 else 560), (72, 88, 78))
    d = ImageDraw.Draw(board)
    cells = []
    for i, (heading, role) in enumerate(roles):
        v = next(v for v in views if v["heading"] == heading)
        im = Image.open(src / v["layers"][role])
        x = i % 2 * 512
        y = i // 2 * 480 + 45
        import numpy as np

        a = np.asarray(im.convert("RGB")).astype(int)
        mask = np.max(np.abs(a - np.array([72, 88, 78])), axis=2) > 8
        ys, xs = np.where(mask)
        bbox = [
            max(0, int(xs.min()) - 4),
            max(0, int(ys.min()) - 4),
            min(im.width, int(xs.max()) + 5),
            min(im.height, int(ys.max()) + 5),
        ]
        tile = im.crop(bbox)
        factor = min(4, 450 / tile.width, 370 / tile.height)
        display = tile.resize(
            (round(tile.width * factor), round(tile.height * factor)), Image.Resampling.NEAREST
        )
        placement = [x + (512 - display.width) // 2, y + (420 - display.height) // 2]
        board.paste(display, placement)
        d.text((x + 14, y + 425), f"{role} / yaw {heading}", font=font, fill="white")
        cells.append(
            {
                "heading": heading,
                "role": role,
                "source": v["layers"][role],
                "cell": [x + 4, y, 504, 420],
                "nativeCrop": v["crop"],
                "nativeBounds": v["bounds"],
                "factor": factor,
                "cropInNativePanel": bbox,
                "placement": placement,
                "displaySize": list(display.size),
            }
        )
    d.text((15, 10), f'{f["id"]} | Original native components', font=font, fill="white")
    board.save(out / f'{f["id"]}-board.png')
    items.append({"id": f["id"], "cells": cells, "reference": f'{f["id"]}-board.png'})
(out / "vehicle-selection.json").write_text(json.dumps(items, indent=2) + "\n")
print("Built", len(items), "vehicle boards")
