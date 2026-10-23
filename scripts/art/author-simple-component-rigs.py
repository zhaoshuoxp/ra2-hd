"""Author cannon, prism and radar construction rigs with independent foundations."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import label

from buildup import native_indices, read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import bounds, fit_rgba, material_surface, over, place, project_rgba


def node(image, output, name, box):
    image = image.convert("RGBA")
    image.save(output)
    return {"name": name, "image": str(output), "sha256": sha(output), "box": list(box)}


def canvas_node(rgba, output, name):
    box = bounds(rgba[..., 3] > 0)
    assert box
    x0, y0, x1, y1 = box
    return node(Image.fromarray(rgba[y0:y1, x0:x1]), output, name, [v / 4 for v in box])


def material_patch(image, kind):
    """Select an authored enamel patch; no guide color enters the texture."""
    a = np.array(image).astype(float)
    if kind == "red":
        color = (a[..., 0] > a[..., 1] * 2) & (a[..., 0] > 150)
    else:
        color = ((a[..., 0] > 180) & (a[..., 1] > 120) & (a[..., 2] < a[..., 1] * .6))
    mask = color & (a[..., 3] >= 250)
    # Find a fully authored square, avoiding edges and neighboring material.
    from scipy.ndimage import minimum_filter
    for size in (31, 15, 7, 3, 1):
        safe = minimum_filter(mask, size=size, mode="constant")
        y, x = np.where(safe)
        if len(x):
            index = len(x) // 2
            radius = size // 2
            return image.crop((int(x[index]) - radius, int(y[index]) - radius,
                               int(x[index]) + radius + 1, int(y[index]) + radius + 1))
    raise AssertionError("Missing authored enamel material")


def poses(root, name, grid=(3, 3)):
    return {cell: image for cell, (image, _) in extract_grid_poses(Image.open(root / name), *grid).items()}


def pivot(image):
    a = np.array(image)
    _, x = np.where(a[-max(2, image.height // 20):, :, 3] >= 128)
    return float(x.mean()) / image.width


def anchored_node(image, output, name, root, top, width, frame):
    ratio = pivot(image)
    left, right = frame["trimOrigin"][0], frame["trimOrigin"][0] + frame["legacyRenderSize"][0]
    width = min(width, (root[0] - left) / max(.001, ratio),
                (right - root[0]) / max(.001, 1 - ratio))
    assert width > 0
    return node(image, output, name,
                (root[0] - width * ratio, top, root[0] + width * (1 - ratio), root[1]))


def prism_crown(image, whole_building=False):
    a = np.array(image)
    amber = ((a[..., 0] > 180) & (a[..., 1] > 90) & (a[..., 1] < 175)
             & (a[..., 2] < 85) & (a[..., 3] >= 128))
    if whole_building:
        amber[round(image.height * .6):] = False
    y, _ = np.where(amber)
    assert len(y), "Missing crown collar landmarks"
    cut = min(image.height, int(y.max()) + 5)
    crown = image.crop((0, 0, image.width, cut))
    return crown.crop(crown.getbbox())


def prism(record, root, output, logical):
    upper = poses(root, "atesla-upper-00-v1.png")
    base_image = poses(root, "atesla-fixed-base-v1.png", (1, 1))[0]
    base = node(base_image, output / "foundation.png", "foundation", (63, 77, 107, 106))
    stem = node(upper[2], output / "stem.png", "stem", (75, 46, 95, 82))
    raw = read(record["nativeSource"])
    phases = [{"retainPredecessor": True}]
    for phase in range(1, 8):
        nodes = [base]
        if phase == 1:
            nodes.append(node(upper[1], output / "01-cap.png", "cap", (75, 69, 94, 78)))
        elif phase in (2, 3):
            nodes.append(stem)
        elif phase == 4:
            nodes.append(anchored_node(upper[4], output / "04-crown.png", "crown", (85, 85), 39, 44,
                                       logical[phase]))
        else:
            nodes.append(stem)
            source = upper[phase] if phase < 7 else Image.open(root / "atesla-terminal-clean-v1.png")
            crown = prism_crown(source, whole_building=phase == 7)
            guide = native_indices(raw, phase)
            region = guide > 0
            region[56:] = False
            box = bounds(region)
            nodes.append(anchored_node(crown, output / f"{phase:02}-crown.png", "crown", (85, 56),
                                       box[1], box[2] - box[0], logical[phase]))
        phases.append(nodes)
    return {"nativeSourceSha256": sha(record["nativeSource"]), "phases": phases,
            "foundationStableFrom": 1, "foundationSource": base,
            "neutralMaterialProvenance": "AUTHORED_PAINTED_RGBA_ONLY"}


def cannon(record, root, output, logical):
    floor = poses(root, "gtgcan-floor-00-v1.png", (3, 2))
    upper = [poses(root, "gtgcan-upper-00-v1.png", (3, 2)),
             poses(root, "gtgcan-upper-01-v1.png", (3, 2))]
    final = poses(root, "gtgcan-terminal-upper-v2.png", (1, 1))[0]
    ground_boxes = [(89, 110, 142, 129), (77, 109, 154, 133), (63, 106, 168, 140),
                    (63, 105, 168, 140), (59, 104, 172, 142)]
    master = node(floor[4], output / "foundation.png", "foundation", ground_boxes[4])
    raw = read(record["nativeSource"])
    phases = []
    for phase in range(12):
        base = master if phase >= 4 else node(floor[phase], output / f"{phase:02}-foundation.png",
                                              "foundation", ground_boxes[phase])
        image = upper[phase // 6][phase % 6] if phase < 11 else final
        # Complete authored connected assemblies retain their receiver anatomy.
        # Only the separate foundation is immutable; no whole-building resize.
        left = [91, 91, 90, 89, 83, 81, 81, 81, 81, 81, 81, 81][phase]
        right = [141, 141, 142, 142, 150, 151, 151, 151, 151, 151, 158, 168][phase]
        body = node(image, output / f"{phase:02}-connected-upper.png", "connected-upper",
                    (left, raw["frames"][phase]["y"], right, 128 if phase == 0 else 132))
        phases.append([base, body])
    return {"nativeSourceSha256": sha(record["nativeSource"]), "phases": phases,
            "foundationStableFrom": 4, "foundationSource": master,
            "receiverConnection": "Complete authored barrel, black neck and paired hinge braces",
            "neutralMaterialProvenance": "AUTHORED_PAINTED_RGBA_ONLY"}


def radar(record, root, output, logical):
    atlas = [poses(root, "gaairc-upper-00-v2.png"), poses(root, "gaairc-upper-01-v1.png"),
             poses(root, "gaairc-upper-02-v1.png", (3, 2))]
    floor = poses(root, "gaairc-fixed-floor-v2.png", (1, 1))[0]
    master = node(floor, output / "foundation.png", "foundation", (45, 83, 179, 153))
    raw = read(record["nativeSource"])
    red = material_patch(poses(root, "gapile-canonical-flat-hall-v1.png", (1, 1))[0], "red")
    source_jobs = read(root / "../buildup-cutout-20261012-r60-v1/painted-sources-final-r62.json")
    job = next(j for j in source_jobs["gaairc-temperate"] if 5 in j["phases"])
    source = poses(Path("."), job["image"], tuple(job["grid"]))[job["phases"].index(5)]
    yellow = material_patch(source, "yellow")
    red.save(output / "red-enamel.png")
    yellow.save(output / "yellow-enamel.png")
    board = Image.new("L", tuple(raw["canvas"]))
    ImageDraw.Draw(board).polygon([(124, 95), (180, 123), (124, 154), (72, 124)], fill=255)
    board_mask = np.array(board) > 0
    pad_centers = np.array([(97.5, 124), (123, 109), (152.5, 124), (123, 139)])
    pad_offsets = [(-.7, -.9), (.0, .85), (-1.9, .0), (.85, -1.7)]
    palette = np.array(record["palette"], float)
    marking_checks = []
    phases = [{"retainPredecessor": True} for _ in range(5)]
    for phase in range(5, 25):
        if phase < 9:
            image = atlas[0][phase]
        elif phase < 18:
            image = atlas[1][phase - 9]
        else:
            image = atlas[2][min(phase - 18, 5)]
        box = (61, 68, 99, 116) if phase < 7 else (45, raw["frames"][phase]["y"], 111, 119)
        if phase >= 8:
            box = (42, raw["frames"][phase]["y"], 111, 119)
        body = node(image, output / f"{phase:02}-radar.png", "radar", box)
        nodes = [master]
        indices = native_indices(raw, phase)
        colors = palette[indices]
        gold = ((indices > 31) & (colors[..., 0] > 170) & (colors[..., 1] > 110)
                & (colors[..., 2] < colors[..., 1] * .65) & board_mask)
        if gold.any():
            nodes.append(canvas_node(material_surface(yellow, gold, vector=True), output / f"{phase:02}-gold.png", "floor-stripes"))
        owners, count = label((indices >= 16) & (indices <= 31))
        pads = []
        for component in range(1, count + 1):
            yy, xx = np.where(owners == component)
            if len(xx) < 15:
                continue
            center = np.array((xx.mean(), yy.mean()))
            distances = np.linalg.norm(pad_centers - center, axis=1)
            pad = int(distances.argmin())
            if distances[pad] > 10:
                continue
            painted = material_surface(red, owners == component, vector=True)
            n = canvas_node(painted, output / f"{phase:02}-pad-{pad}.png", f"pad-{pad}")
            dx, dy = pad_offsets[pad]
            n["box"] = [n["box"][0] + dx, n["box"][1] + dy, n["box"][2] + dx, n["box"][3] + dy]
            nodes.append(n)
            pads.append(pad)
        nodes.append(body)
        phases.append(nodes)
        marking_checks.append({"phase": phase, "visiblePadMarks": sorted(pads)})
    return {"nativeSourceSha256": sha(record["nativeSource"]), "phases": phases,
            "foundationStableFrom": 5, "foundationSource": master,
            "floorMarkings": "INDEPENDENT_AUTHORED_ENAMEL_NATIVE_PHASE_SURFACES",
            "markingChecks": marking_checks,
            "neutralMaterialProvenance": "AUTHORED_PAINTED_RGBA_ONLY"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("authoring", type=Path)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    authoring = read(args.authoring)
    functions = {"atesla-temperate": prism, "gtgcan-temperate": cannon, "gaairc-temperate": radar}
    rigs = {}
    for key, build in functions.items():
        record = next(f for f in authoring["families"] if f["key"] == key)
        member = record["newMember"]
        manifest = read(Path(".local/hd-packs") / member["packId"] / member["revision"] / "manifest.json")
        output = args.assets / f"{key}-nodes-{args.version}"
        output.mkdir(exist_ok=False)
        rig = rigs[key] = build(record, args.assets, output, manifest["logical"]["frames"])
        raw = read(record["nativeSource"])
        for phase, nodes in enumerate(rig["phases"]):
            if isinstance(nodes, dict):
                continue
            rgba = np.zeros((raw["canvas"][1] * 4, raw["canvas"][0] * 4, 4), np.uint8)
            for n in nodes:
                rgba = over(place(Image.open(n["image"]), n["box"], raw["canvas"]), rgba)
            Image.fromarray(rgba).save(output / f"{phase:02}-preview.png")
    write(args.output, rigs)
    print("3 independently anchored candidates authored; no runtime selection")


if __name__ == "__main__":
    main()
