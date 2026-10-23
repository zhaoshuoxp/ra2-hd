"""Build explicit construction component placements from retained painted assets."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label

from buildup import read, sha, write
from painted_cutout import extract_grid_poses
from painted_rig import fit_rgba, over, place


def save_node(image, file, box, name):
    image.save(file)
    return {"name": name, "image": str(file), "sha256": sha(file), "box": list(box)}


def bottom_pivot(image):
    alpha = np.array(image)[..., 3]
    y, x = np.where(alpha[-max(2, image.height // 25):] >= 128)
    return float(x.mean()) / image.width


def components(image):
    a = np.array(image)
    labels, _ = label(a[..., 3] >= 128)
    parts = []
    for n, area in enumerate(np.bincount(labels.ravel())):
        if n == 0 or area < 100:
            continue
        y, x = np.where(labels == n)
        box = (x.min(), y.min(), x.max() + 1, y.max() + 1)
        part = a[box[1]:box[3], box[0]:box[2]].copy()
        # Alpha fringes belong to their isolated component; no neighboring
        # object has opaque material within these disjoint early-part boxes.
        parts.append((float(x.mean()), Image.fromarray(part)))
    return [p[1] for p in sorted(parts, key=lambda p: p[0])]


def robot_rig(record, root):
    output = root / "garobo-nodes-v2"
    output.mkdir(exist_ok=False)
    upper = extract_grid_poses(Image.open(root / "garobo-upper-00-v1.png"), 3, 3)
    early = extract_grid_poses(Image.open(root / "garobo-dishes-00-v1.png"), 3, 3)
    late = extract_grid_poses(Image.open(root / "garobo-left-towers-09-17-v1.png"), 3, 3)
    final = extract_grid_poses(Image.open(root / "garobo-satellites-final-parts-v1.png"), 3, 1)
    foundation = Image.open(root / "garobo-current-foundation-reference.png")
    floor = save_node(foundation, output / "foundation.png", (65, 71, 149, 114), "foundation")
    raw = read(record["nativeSource"])
    tops = [None, 84, 78, 71] + [frame["y"] for frame in raw["frames"][4:20]]
    roots = [(84, 88), (106, 112), (135, 97)]
    early_sizes = {5: [(20, 16)], 6: [(21, 21), (20, 18)],
                   7: [(22, 27), (22, 24), (18, 22)], 8: [(26, 34), (25, 30), (22, 29)]}
    collar_tops = [[76, 99, 85], [70, 92, 78], [63, 85, 71], [57, 79, 65],
                   [52, 74, 60], [48, 70, 56], [45, 67, 53]] + [[45, 67, 53]] * 4
    head_tops = [[53, 78, 64], [47, 70, 57], [41, 65, 52], [38, 61, 48],
                 [34, 57, 44], [29, 54, 41], [25, 50, 38], [26, 51, 39],
                 [26, 51, 39], [26, 51, 39], [26, 51, 39]]
    phases = []
    for phase in range(20):
        nodes = [floor]
        if phase:
            mast = upper[1 if phase == 1 else 4][0] if phase < 9 else extract_grid_poses(
                Image.open(root / "garobo-center-01-v1.png"), 3, 3)[min(phase - 9, 8)][0]
            width = 7 if phase == 1 else 13
            nodes.append(save_node(mast, output / f"{phase:02}-mast.png",
                                   (104 - width / 2, tops[phase], 104 + width / 2, 94), "mast"))
        if 5 <= phase <= 8:
            parts = components(early[phase][0])
            expected = 1 if phase == 5 else 2 if phase == 6 else 3
            assert len(parts) == expected
            for index, (part, (width, height)) in enumerate(zip(parts, early_sizes[phase])):
                x, y = roots[index]
                pivot = bottom_pivot(part)
                nodes.append(save_node(part, output / f"{phase:02}-dish-{index}.png",
                                       (x - width * pivot, y - height, x + width * (1 - pivot), y),
                                       f"dish-{index}"))
        elif phase >= 9:
            for index, (x, y) in enumerate(roots):
                part = late[min(phase - 9, 8)][0] if phase < 18 else final[index][0]
                a = np.array(part)
                red = (a[..., 0] > a[..., 1] * 2.) & (a[..., 0] > 100) & (a[..., 3] >= 128)
                labels, _ = label(red)
                clusters = []
                for n, area in enumerate(np.bincount(labels.ravel())):
                    if n and area > 20:
                        yy, xx = np.where(labels == n)
                        clusters.append((yy.min(), yy.max(), float(xx.mean()), area))
                # The first red feature is the dish pivot; the next row is
                # the drum's red slots. Their seam separates the rotating
                # head from the independently telescoping column.
                pivot_y = min(c[0] for c in clusters)
                slots = [c[0] for c in clusters if c[0] > pivot_y + part.height * .12]
                assert slots
                cut = int(min(slots) - part.height * .025)
                head, column = part.crop((0, 0, part.width, cut)), part.crop((0, cut, part.width, part.height))
                foot = np.where(a[-max(3, part.height // 20):, :, 3] >= 128)[1]
                foot_width = min(24, 18 + (phase - 9) * 2)
                scale = foot_width / max(1, int(foot.max() - foot.min() + 1))
                width = max(1, round(part.width * scale * 4))
                collar = collar_tops[phase - 9][index]
                head_height = round((collar - head_tops[phase - 9][index]) * 4)
                column_height = round((y - collar) * 4)
                combined = Image.new("RGBA", (width, head_height + column_height))
                combined.paste(Image.fromarray(fit_rgba(head, (width, head_height))), (0, 0))
                combined.paste(Image.fromarray(fit_rgba(column, (width, column_height))), (0, head_height))
                pivot = bottom_pivot(combined)
                w = width / 4
                frame = raw["frames"][phase]
                w = min(w, (x - frame["x"]) / max(.001, pivot),
                        (frame["x"] + frame["width"] - x) / max(.001, 1 - pivot))
                nodes.append(save_node(combined, output / f"{phase:02}-dish-{index}.png",
                                       (x - w * pivot, head_tops[phase - 9][index], x + w * (1 - pivot), y),
                                       f"dish-{index}"))
        # Far towers precede the front tower; the mast stands behind it.
        nodes.sort(key=lambda node: 0 if node["name"] == "foundation" else
                   1 if node["name"] == "dish-0" else 2 if node["name"] == "dish-2" else
                   3 if node["name"] == "mast" else 4)
        phases.append(nodes)
    return {"nativeSourceSha256": sha(record["nativeSource"]), "phases": phases,
            "foundationStableFrom": 0, "foundationSource": floor,
            "neutralMaterialProvenance": "AUTHORED_PAINTED_RGBA_ONLY"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("authoring", type=Path)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    record = next(f for f in read(args.authoring)["families"] if f["key"] == "garobo-temperate")
    rig = robot_rig(record, args.assets)
    write(args.output, {record["key"]: rig})
    raw = read(record["nativeSource"])
    previews = args.assets / "garobo-prototype-v6"
    previews.mkdir(exist_ok=False)
    for phase, nodes in enumerate(rig["phases"]):
        painted = np.zeros((raw["canvas"][1] * 4, raw["canvas"][0] * 4, 4), np.uint8)
        for node in nodes:
            painted = over(place(Image.open(node["image"]), node["box"], raw["canvas"]), painted)
        Image.fromarray(painted).save(previews / f"{phase:02}.png")
    print("20 robot phases authored; selection unchanged")


if __name__ == "__main__":
    main()
