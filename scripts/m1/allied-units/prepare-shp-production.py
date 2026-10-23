"""Prepare complete native-slot SHP authoring worklists for approved families only."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--members", nargs="*")
args = parser.parse_args()
root = Path(".artifacts/allied-units")
rows = json.loads((root / "coverage-ledger-v1.json").read_text())["rows"]
review = {e["id"]: e for e in json.loads((root / "review-v2/receipt.json").read_text())["entries"]}
ledger = {"families": {}}
for row in rows:
    if row["representation"] != "SHP" or row["acceptedReuseCandidate"] or row["id"] in ledger["families"]:
        continue
    members = []
    for member in row["source"]:
        if not member["member"].endswith(".shp"):
            continue
        members.append({**member, "requiredSlots": member["totalFrames"] if row["nativeContract"]["noShadow"] else member["totalFrames"] // 2,
                        "sourceFile": str(root / "source-v2" / row["edition"] / (member["member"] + ".json")),
                        "role": "limbo-launched-unit" if member["member"] == "adogp.shp" else "body"})
    ledger["families"][row["id"]] = {**row, "representativeAcceptance": "ACCEPTED", "sourceMembers": members,
        "members": [m["member"] for m in members], "artwork": {"selectedRaw": review[row["id"]]["raw"]}}
assert root.resolve() in args.output.resolve().parents
args.output.mkdir(parents=True, exist_ok=False)
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = {
    "kind": "NATIVE_SLOT_AUTHORING_WORKLIST",
    "runtimeActivation": False,
    "families": {},
}
priority = [
    "Ready",
    "Walk",
    "Idle1",
    "Idle2",
    "Crawl",
    "Die1",
    "Die2",
    "FireUp",
    "FireProne",
    "Down",
    "Up",
    "Deploy",
    "DeployedFire",
    "Deployed",
    "Undeploy",
    "Paradrop",
    "Cheer",
    "Guard",
    "Prone",
    "Panic",
]

for identity, family in ledger["families"].items():
    if (
        family["representativeAcceptance"] != "ACCEPTED"
        or family["representation"] != "SHP"
    ):
        continue
    family_out = args.output / identity
    family_out.mkdir()
    result = {
        "acceptance": family["representativeAcceptance"],
        "members": [],
        "complete": False,
    }
    for member in family["sourceMembers"]:
        if not member["member"].endswith(".shp") or (
            args.members and member["member"] not in args.members
        ):
            continue
        source_path = Path(
            member.get("sourceFile", root / "source-v2" / (member["member"] + ".json"))
        )
        source = json.loads(source_path.read_text())
        count = member["requiredSlots"]
        membership = [[] for _ in range(count)]
        anomalies = []
        sequences = (
            family["sequences"] if member["member"] == family["members"][0] else None
        )
        if sequences:
            names = sorted(
                sequences, key=lambda n: priority.index(n) if n in priority else 100
            )
            for name in names:
                start, length, stride, *_ = sequences[name].split(",")
                for facing in range(8 if int(stride) else 1):
                    for phase in range(int(length)):
                        index = int(start) + int(stride) * facing + phase
                        if 0 <= index < count:
                            membership[index].append(
                                {"action": name, "facing": facing, "phase": phase}
                            )
                        else:
                            anomalies.append(
                                {
                                    "action": name,
                                    "facing": facing,
                                    "phase": phase,
                                    "index": index,
                                }
                            )
        elif member["member"] == family["members"][0]:
            walk = int(family["art"]["WalkFrames"])
            standing = int(family["art"].get("StandingFrames", 1))
            fire = int(family["art"]["FiringFrames"])
            for i in range(count):
                if i < walk * 8:
                    name, local, stride = (
                        "Swim" if identity == "DLPH" else "Walk",
                        i,
                        walk,
                    )
                elif i < (walk + standing) * 8:
                    name, local, stride = "Standing", i - walk * 8, standing
                elif i >= (walk + standing + fire) * 8:
                    continue
                else:
                    name, local, stride = "Attack", i - (walk + standing) * 8, fire
                membership[i].append(
                    {"action": name, "facing": local // stride, "phase": local % stride}
                )
        if member.get("role") == "limbo-launched-unit":
            for i in range(count):
                membership[i] = [{"action": "LeapBearing", "facing": i, "phase": 0}]
        batches = []
        slots = []
        groups = []
        for i in range(count):
            frame = source["frames"][i]
            state = membership[i][0]["action"] if membership[i] else "NativeExtra"
            slots.append(
                {
                    "frame": i,
                    "empty": frame["empty"],
                    "sourceSha256": frame["sha256"],
                    "trim": [frame["x"], frame["y"], frame["width"], frame["height"]],
                    "sequenceMembership": membership[i],
                    "status": (
                        "EMPTY_NATIVE" if frame["empty"] else "AWAITING_AUTHORING"
                    ),
                }
            )
            if frame["empty"]:
                continue
            if not groups or groups[-1][0] != state:
                groups.append((state, []))
            groups[-1][1].append(i)
        for state, indices in groups:
            for start in range(0, len(indices), 48):
                ids = indices[start : start + 48]
                batch_id = f'{Path(member["member"]).stem}-{state.lower()}-{ids[0]:03d}-{ids[-1]:03d}'
                folder = family_out / batch_id
                folder.mkdir()
                columns = min(len(ids), 4 if len(ids) <= 16 else 6 if len(ids) <= 36 else 8)
                rows = math.ceil(len(ids) / columns)
                board_size = (columns * 256, rows * 256)
                board = Image.new("RGB", board_size, (72, 88, 78))
                draw = ImageDraw.Draw(board)
                samples = []
                for n, fid in enumerate(ids):
                    f = source["frames"][fid]
                    indices2d = np.array(f["pixels"], dtype="uint8").reshape(
                        f["height"], f["width"]
                    )
                    rgba = np.zeros((f["height"], f["width"], 4), dtype="uint8")
                    rgba[:, :, :3] = np.array(source["palette"], dtype="uint8")[
                        indices2d
                    ]
                    rgba[:, :, 3] = (indices2d != 0).astype("uint8") * 255
                    body = Image.fromarray(
                        ((indices2d != 0) & (indices2d != 12)).astype("uint8") * 255
                    ).getbbox()
                    # Reference only: separate the native ground patch outside color-body bounds.
                    ground = indices2d == 12
                    if body:
                        ground[body[1] : body[3], body[0] : body[2]] = False
                    rgba[ground] = 0
                    sprite = Image.fromarray(rgba)
                    factor = min(8, 210 / f["width"], 210 / f["height"])
                    x, y = n % columns * 256, n // columns * 256
                    size = (round(f["width"] * factor), round(f["height"] * factor))
                    origin = (x + (256 - size[0]) // 2, y + 36 + (210 - size[1]) // 2)
                    sprite = sprite.resize(size, Image.Resampling.NEAREST)
                    board.paste(sprite, origin, sprite)
                    draw.text(
                        (x + 16, y + 12), f"FRAME {fid:03d}", font=font, fill="white"
                    )
                    samples.append(
                        {
                            "frame": fid,
                            "cell": [x, y + 32, 256, 220],
                            "contentOrigin": origin,
                            "referenceScale": factor,
                            "bodyColorBounds": body,
                            "nativeGroundPixels": int(ground.sum()),
                        }
                    )
                for n in range(len(ids), columns * rows):
                    draw.text(
                        (n % columns * 256 + 16, n // columns * 256 + 12),
                        "UNUSED",
                        font=font,
                        fill="white",
                    )
                board.save(folder / "native-poses.png")
                style = family["artwork"]["selectedRaw"]
                view_names = [
                    "back / away from camera",
                    "back-left",
                    "left profile",
                    "front-left",
                    "front / toward camera",
                    "front-right",
                    "right profile",
                    "back-right",
                ]
                view_hints = []
                for fid in ids:
                    states = membership[fid]
                    if not states or member.get("role") == "limbo-launched-unit":
                        continue
                    state_info = states[0]
                    if (
                        sequences
                        and int(sequences[state_info["action"]].split(",")[2]) == 0
                    ):
                        continue
                    view_hints.append(
                        f"FRAME {fid:03d}: {view_names[state_info['facing']]}"
                    )
                orientation = (
                    "; ".join(view_hints) or "Use the exact native pose for each cell."
                )
                aquatic = identity in ["TANY", "GHOST"] and (292 <= ids[0] <= 601 or ids[0] >= 611)
                state_note = (
                    "Aquatic representation: preserve the native waterline, subdued blue/navy submerged body "
                    "and thin blue surface ripples wherever present. Use the approved diving materials and "
                    "native swim/tread/dive/sink pose, never a fully visible standing land soldier. "
                    "The native image controls how much of the figure remains visible.\n"
                    if aquatic else ""
                )
                prompt = f"""Use case: precise-object-edit / native-sequence game sprite production.
Image 1 is the EDIT TARGET: exact native {identity} {member["member"]} poses for {state}, frames {ids}. Image 2 is the USER-APPROVED STYLE/IDENTITY REFERENCE for this same unit, not a pose replacement.
{state_note}
Author a high-resolution {board_size[0]}x{board_size[1]} board with exactly {columns} columns and {rows} rows, the same cells and {len(ids)} occupied cells. Each sprite must fit within 65 percent of its cell width and height, centered with ample margin. No labels in the authored output. Keep unused cells empty. Redraw each original sprite with the approved unit's detailed painted-realistic materials, costume/equipment/anatomy and upper-left lighting.
Native camera facing contract: {orientation}. Back-facing views must not show a frontal face or chest; front-facing views must not show a back. Anatomy and handedness follow the same individual across the turn.
Every cell must preserve its OWN native facing, pose, phase, handedness, limb count, weapon/tool orientation, body scale and position. Back views remain back views. Walking/crawling/attacking/death phases must differ as the native references differ. Do not duplicate a static pose or rotate a flat picture to simulate another view. Small hands, feet and moving parts must remain coherent.
Keep exact original cell registration and native silhouette landmarks while adding genuinely authored fine detail; do not merely enlarge source pixels. Do not invent new equipment, muzzle effects, scenery, gore, glow, ground patches or cast shadows. Original shadow pixels are retained separately at export. Any flat black stair-stepped ground shape in the original is a game-owned shadow, not part of the figure: remove it entirely from the authored board while preserving complete boots/feet. No dark pedestal beneath feet. GI/GGI deployed emplacements must retain full native volume, never miniaturized; GGI is heavily built. Tanya has fair skin, a ponytail and feet together when standing ready. Preserve colored team regions from the original unit and the approved material style.
Fully opaque flat MAGENTA RGB(255,0,255) background for color-key export. No blue edge speckles, texture, gradient or vignette. Unused cells must be entirely magenta. This is one coherent native action group for one unit. Omit FRAME labels while preserving the exact grid and cell order. Do not crop sprites or add decorative elements.
"""
                (folder / "prompt.txt").write_text(prompt)
                batch = {
                    "id": batch_id,
                    "boardSize": board_size,
                    "grid": [columns, rows],
                    "action": state,
                    "samples": samples,
                    "reference": str(folder / "native-poses.png"),
                    "referenceSha256": sha(folder / "native-poses.png"),
                    "prompt": str(folder / "prompt.txt"),
                    "style": style,
                    "styleSha256": sha(Path(style)),
                    "status": "AWAITING_AUTHORING",
                }
                batches.append(batch)
                (folder / "batch.json").write_text(json.dumps(batch, indent=2) + "\n")
        assert sorted(s["frame"] for b in batches for s in b["samples"]) == [
            s["frame"] for s in slots if not s["empty"]
        ]
        result["members"].append(
            {
                "sourceMember": member["member"],
                "sourceFile": str(source_path),
                "sourceSha256": member["sha256"],
                "requiredSlots": count,
                "slots": slots,
                "batches": batches,
                "sequenceOutOfRange": anomalies,
                "complete": False,
            }
        )
    if result["members"]:
        manifest["families"][identity] = result
(args.output / "worklist.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(
    json.dumps(
        {
            "families": len(manifest["families"]),
            "batches": sum(
                len(m["batches"])
                for f in manifest["families"].values()
                for m in f["members"]
            ),
            "runtimeActivation": False,
        }
    )
)
