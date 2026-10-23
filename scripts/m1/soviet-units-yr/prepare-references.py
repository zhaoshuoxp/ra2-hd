"""Decode exact native poses into review boards; no HD artwork is synthesized."""

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(".artifacts/m1-7-yr")
source = root / "source-v1"
out = root / "references-v1"
out.mkdir(exist_ok=False)
inv = json.loads((source / "inventory.json").read_text())
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
selections = []
for f in inv["families"]:
    if f["acceptedControl"] or f["representation"] != "SHP":
        continue
    raw = json.loads((source / (f["members"][0] + ".json")).read_text())
    seq = f["sequences"]
    if seq:
        states = [
            "Ready",
            "Walk",
            "FireUp",
            "Crawl",
            "Die1",
            "SecondaryFire" if "SecondaryFire" in seq else "FireProne",
        ]
        chosen = []
        for name in states:
            start, count, stride, *_ = seq[name].split(",")
            chosen.append((name, int(start) + min(2, int(count) - 1) + int(stride) * 3))
    else:
        walk = int(f["art"]["WalkFrames"])
        fire = int(f["art"]["FiringFrames"])
        chosen = [("swim" if f["id"] == "SQD" else "walk", walk * 3 + i) for i in [0, 2, 4]] + [
            ("attack", (walk + int(f["art"].get("StandingFrames", 1))) * 8 + fire * 3 + i)
            for i in [0, 2, min(3, fire - 1)]
        ]
    board = Image.new("RGB", (1024, 1024), (72, 88, 78))
    draw = ImageDraw.Draw(board)
    cells = []
    for i, (state, n) in enumerate(chosen):
        r = raw["frames"][n]
        im = Image.new("RGBA", tuple(raw["canvas"]))
        tile = Image.new("RGBA", (r["width"], r["height"]))
        tile.putdata([tuple(raw["palette"][p]) + ((255 if p else 0),) for p in r["pixels"]])
        im.alpha_composite(tile, (r["x"], r["y"]))
        x = (i % 3) * 340
        y = (i // 3) * 480 + 42
        factor = min(6, 300 / im.width, 390 / im.height)
        large = im.resize(
            (round(im.width * factor), round(im.height * factor)), Image.Resampling.NEAREST
        )
        board.paste(large, (x + (340 - large.width) // 2, y + (400 - large.height) // 2), large)
        draw.text((x + 12, y + 415), f"{state} / native frame {n}", font=font, fill="white")
        im.save(out / f'{f["id"]}-{n}-original.png')
        cells.append(
            {
                "state": state,
                "nativeFrame": n,
                "source": raw["member"],
                "nativeCanvas": raw["canvas"],
                "cell": [x, y, 340, 400],
                "displayFactor": factor,
            }
        )
    draw.text(
        (16, 12), f'{f["id"]} | Original native poses | reference only', font=font, fill="white"
    )
    board.save(out / f'{f["id"]}-board.png')
    selections.append({"id": f["id"], "cells": cells, "reference": f'{f["id"]}-board.png'})
(out / "selection.json").write_text(json.dumps(selections, indent=2) + "\n")
print("Prepared", len(selections), "exact-pose boards")
