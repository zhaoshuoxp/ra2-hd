"""Correct upper attachment registration while preserving every V6 floor node."""
import argparse
import copy
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects

from buildup import read, sha, write
from painted_rig import bounds, over, place
from upper_registration import warp_landmarks


def components(rgba, kind, minimum):
    color = rgba[..., :3].astype(float)
    if kind == "window":
        mask = ((color[..., 1] > color[..., 0] * 1.15)
                & (color[..., 1] > color[..., 2] * .65) & (color[..., 1] > 35))
    else:
        mask = ((color.min(axis=2) > 145)
                & ((color.max(axis=2)-color.min(axis=2)) < 65))
    ids, _ = label(mask & (rgba[..., 3] > 180))
    points = []
    for component, region in enumerate(find_objects(ids), 1):
        yy, xx = np.where(ids[region] == component)
        if len(xx)/16 >= minimum:
            points.append(((region[1].start+xx.mean())/4,
                           (region[0].start+yy.mean())/4, len(xx)/16))
    return sorted(points)


def windows(rgba, phase):
    points = components(rgba, "window", 4)
    first = [p for p in points if 128 < p[0] < 169 and 77 < p[1] < 110 and p[2] < 25]
    second = [p for p in points if 167 < p[0] < 207 and 99 < p[1] < 129 and p[2] < 25]
    # The terminal front-door highlight is separate from the five side windows.
    if phase == 24 and len(first) == 6:
        first = first[1:]
    assert len(first) == 5, (phase, "First hall windows", first)
    if phase >= 6:
        assert len(second) == 5, (phase, "Second hall windows", second)
    return np.array([p[:2] for p in first+second])


def lowest(rgba, left, right):
    mask = rgba[..., 3] > 180
    region = mask[:, round(left*4):round(right*4)]
    yy, xx = np.where(region)
    assert len(xx), (left, right)
    bottom = yy.max()
    selected = yy >= bottom-2
    return np.array([(left*4+xx[selected].mean()+.5)/4, (bottom+.5)/4])


def barracks(rgba, phase, reference):
    detected = windows(rgba, phase)
    indices = [0, 4] if len(detected) == 5 else [0, 4, 5, 9]
    source = detected[indices]
    target = reference[indices].copy()
    if phase == 3:
        target[:2, 1] += 6.5
    elif phase == 4:
        target[:2, 1] += 2.5
    if phase == 6:
        target[2:, 1] += 4
    names = [f"hall-{i//5}-window-{i%5}" for i in indices]
    local = np.array([[-2.75, -5], [2.75, -5], [2.75, 5], [-2.75, 5]])
    guards_source = np.concatenate([s+local for s in source])
    guards_target = np.concatenate([t+local for t in target])
    guard_names = [f"{name}-surface-{i}" for name in names for i in range(4)]
    return np.concatenate((source, guards_source)), np.concatenate((target, guards_target)), names+guard_names


def chronosphere(rgba, phase, projected_centers=None):
    points = components(rgba, "silver", 70)
    left = [p for p in points if p[0] < 110 and p[1] > 125]
    right = [p for p in points if 115 < p[0] < 174 and 103 < p[1] < 134]
    # Two broad cylindrical paint bands identify each already installed rod.
    left = sorted(left, key=lambda p: p[0])[:2]
    right = sorted(right, key=lambda p: p[0])[:2]
    if phase >= 18:
        # The moving cover occludes the nearer band. Infer its rigid axis from
        # the identical, fully visible rod at the other side of the platform.
        rear = next(p for p in right if p[0] > 125 and p[1] < 120)
        delta = np.array(left[1][:2])-np.array(left[0][:2])
        right = [rear, (*list(np.array(rear[:2])+delta), rear[2])]
    assert len(left) == len(right) == 2, (phase, "Rod landmarks", left, right)
    source = np.array([p[:2] for p in left+right])
    target = np.array([[52, 133], [73, 143], [111, 109], [132, 119]], float)
    if projected_centers is not None:
        target = np.asarray(projected_centers)
    names = ["left-rod-rear", "left-rod-front", "right-rod-rear", "right-rod-front"]
    planes_source, planes_target, plane_names = [], [], []
    for offset in (0, 2):
        s0, s1 = source[offset:offset+2]; t0, t1 = target[offset:offset+2]
        along_source = (s1-s0)/np.linalg.norm(s1-s0)
        along_target = (t1-t0)/np.linalg.norm(t1-t0)
        side_source = np.array([-along_source[1], along_source[0]]) * 11
        side_target = np.array([-along_target[1], along_target[0]]) * 7
        for end, along, sign in ((0, -8, -1), (0, -8, 1), (1, 10, 1), (1, 10, -1)):
            planes_source.append(source[offset+end]+along_source*along+side_source*sign)
            planes_target.append(target[offset+end]+along_target*along+side_target*sign)
            plane_names.append(f"rod-{offset//2}-surface-{len(plane_names)%4}")
    return (np.concatenate((source, planes_source)), np.concatenate((target, planes_target)), names+plane_names)


def radar(rgba, phase):
    if phase < 7:
        source = np.array([lowest(rgba, 60, 97)])
        target = np.array([[81, 101]], float)
        names = ["central-socket"]
    else:
        source = np.array([lowest(rgba, 44, 74), lowest(rgba, 90, 112)])
        target = np.array([[63, 112], [103, 98]], float)
        names = ["left-socket", "right-socket"]
    # The center's lower outline is occluded by the front pod/steps. Its
    # projection inherits the visible socket plane instead of an alpha edge.
    return (np.concatenate((source, source+[0, -12])),
            np.concatenate((target, target+[0, -12])), names+[n+"-side" for n in names])


def cannon(rgba, phase, reference):
    source = np.array([lowest(rgba, 83, 107), lowest(rgba, 115, 141)])
    # Lower hardpoints stay fixed while the complete connected barrel can rotate.
    target = reference.copy()
    names = ["receiver-front-foot", "right-bearing-foot"]
    pivot = {8: [133, 93.5], 9: [133.5, 94], 10: [136, 95], 11: [137, 95]}[phase]
    return (np.concatenate((source, source+[0, -9], [pivot])),
            np.concatenate((target, target+[0, -9], [[133, 93.5]])),
            names+[n+"-side" for n in names]+["barrel-bearing-pivot"])


def frame_boundary(record, phase, canvas):
    root = Path(".local/hd-packs") / record["newMember"]["packId"] / record["newMember"]["revision"]
    frame = read(root / "manifest.json")["logical"]["frames"][phase]
    x, y = frame["trimOrigin"]; w, h = frame["trimSize"]
    # The complete source part lies inside this rectangle. Triangulate this
    # retained domain itself, so every source texel maps inside the same frame.
    # Merely adding its corners to a larger unconstrained mesh would let
    # triangles cross the frame edges and displace tips outside the sprite.
    return np.array([[x, y], [x+w, y], [x+w, y+h], [x, y+h]], float)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("authoring", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    authoring = read(args.authoring)
    temp = {r["key"].split("-")[0]: r for r in authoring["families"] if r["key"].endswith("-temperate")}
    references = {}
    for ident, phase, name in [("gapile", 8, "first-hall"), ("gtgcan", 8, "connected-upper")]:
        r = temp[ident]; raw = read(r["nativeSource"])
        image = np.zeros((raw["canvas"][1]*4, raw["canvas"][0]*4, 4), np.uint8)
        for n in r["componentRig"]["phases"][phase]:
            if n["name"] in ("first-hall", "second-hall", "connected-upper"):
                image = over(place(Image.open(n["image"]), n["box"], raw["canvas"]), image)
        if ident == "gapile":
            # Mature original facade positions, before terminal roofing occludes windows.
            references[ident] = np.array([[135.5+6*i, 98.5-3*i] for i in range(5)]
                                         + [[170.5+6*i, 116-3*i] for i in range(5)])
        else:
            references[ident] = np.array([lowest(image, 83, 107), lowest(image, 115, 141)])
    rigs, receipts = {}, []
    for ident in ["gapile", "gacsph", "gaairc", "gtgcan"]:
        r = temp[ident]; raw = read(r["nativeSource"]); rig = copy.deepcopy(r["componentRig"])
        changed = []
        for phase, nodes in enumerate(rig["phases"]):
            if not isinstance(nodes, list):
                continue
            if (ident == "gapile" and phase < 3) or (ident == "gacsph" and phase < 6) \
                    or (ident == "gaairc" and phase < 5) or (ident == "gtgcan" and phase < 8):
                continue
            for ni, n in enumerate(nodes):
                if n["name"] not in {"first-hall", "second-hall", "painted-partial-roofs-and-halls",
                                      "mechanism", "radar", "connected-upper"}:
                    continue
                if ident == "gapile" and phase < 9:
                    # Process the two installed hall surfaces together, preserving other nodes.
                    if n["name"] == "second-hall":
                        continue
                    upper_names = {"first-hall", "second-hall"}
                    rgba = np.zeros((raw["canvas"][1]*4, raw["canvas"][0]*4, 4), np.uint8)
                    for hn in nodes:
                        if hn["name"] in upper_names:
                            rgba = over(place(Image.open(hn["image"]), hn["box"], raw["canvas"]), rgba)
                else:
                    rgba = place(Image.open(n["image"]), n["box"], raw["canvas"])
                if ident == "gapile":
                    source, target, names = barracks(rgba, phase, references[ident])
                elif ident == "gacsph":
                    source, target, names = chronosphere(rgba, phase)
                elif ident == "gaairc":
                    source, target, names = radar(rgba, phase)
                else:
                    source, target, names = cannon(rgba, phase, references[ident])
                corners = frame_boundary(r, phase, raw["canvas"])
                desired = target.copy()
                calibration = []
                if ident == "gacsph":
                    projected = target[:4].copy()
                    for iteration in range(6):
                        source, target, names = chronosphere(rgba, phase, projected)
                        probe, _ = warp_landmarks(rgba, np.concatenate((source, corners)), np.concatenate((target, corners)))
                        found = np.array([p[:2] for p in components(probe, "silver", 45)])
                        corrections = np.zeros((4, 2))
                        for li in range(4 if phase < 18 else 3):
                            distances = np.linalg.norm(found-desired[li], axis=1)
                            assert distances.min() < 12, (phase, "Lost rod feature", li)
                            corrections[li] = desired[li]-found[distances.argmin()]
                        maximum = float(np.linalg.norm(corrections, axis=1).max())
                        calibration.append({"iteration": iteration, "maximumVisibleFeatureError": maximum})
                        if maximum <= .4:
                            break
                        projected += corrections * .9
                    assert maximum <= .4, (phase, "Rod registration did not converge", calibration)
                try:
                    output, check = warp_landmarks(rgba, np.concatenate((source, corners)), np.concatenate((target, corners)))
                except AssertionError as error:
                    raise AssertionError((ident, phase, error.args)) from error
                bb = bounds(output[..., 3] > 0); x0, y0, x1, y1 = bb
                file = args.output / f"{ident}-{phase:02}-upper.png"
                Image.fromarray(output[y0:y1, x0:x1]).save(file)
                replacement = {"name": "attachment-registered-upper", "image": str(file), "sha256": sha(file),
                               "box": [v/4 for v in bb]}
                nodes[ni] = replacement
                if ident == "gapile" and phase < 9:
                    rig["phases"][phase] = [nn for nn in nodes if nn["name"] != "second-hall"]
                receipts.append({"key": r["key"], "phase": phase, "sourceNode": n,
                                 "landmarks": [{"name": name, "source": s.tolist(),
                                                "target": (desired[li] if ident == "gacsph" and li < 4 else t).tolist(),
                                                "projectionTarget": t.tolist()}
                                               for li, (name, s, t) in enumerate(zip(names, source, target))],
                                 "materialFeatureCalibration": calibration, **check})
                changed.append(phase)
                break
        rig["upperRegistration"] = {"method": "PHYSICAL_ATTACHMENT_MESH_NO_ASSEMBLY_BOUNDS_FIT",
                                    "fixedFoundation": "EXACT_V6_SOURCE_AND_PLACEMENT",
                                    "changedPhases": changed, "sourceAuthoringSha256": sha(args.authoring)}
        rigs[r["key"]] = rig
    # Apply the identical attachment mesh to the existing snow upper painting.
    # Every snow foundation, reveal stage and ground marking stays byte-pinned.
    for key, temp_rig in list(rigs.items()):
        snow_key = key.replace("-temperate", "-snow")
        r = next(r for r in authoring["families"] if r["key"] == snow_key)
        raw = read(r["nativeSource"]); rig = copy.deepcopy(r["componentRig"])
        for receipt in [c for c in receipts if c["key"] == key]:
            phase = receipt["phase"]; nodes = rig["phases"][phase]
            old_name = receipt["sourceNode"]["name"]
            selected = {old_name, "second-hall"} if old_name == "first-hall" else {old_name}
            rgba = np.zeros((raw["canvas"][1]*4, raw["canvas"][0]*4, 4), np.uint8)
            for n in nodes:
                if n["name"] in selected:
                    rgba = over(place(Image.open(n["image"]), n["box"], raw["canvas"]), rgba)
            landmarks = receipt["landmarks"]
            source = np.array([p["source"] for p in landmarks]); target = np.array([p["projectionTarget"] for p in landmarks])
            corners = frame_boundary(r, phase, raw["canvas"])
            output, check = warp_landmarks(rgba, np.concatenate((source, corners)), np.concatenate((target, corners)))
            bb = bounds(output[..., 3] > 0); x0, y0, x1, y1 = bb
            file = args.output / f"{snow_key}-{phase:02}-upper.png"
            Image.fromarray(output[y0:y1, x0:x1]).save(file)
            replacement = {"name": "attachment-registered-upper", "image": str(file), "sha256": sha(file),
                           "box": [v/4 for v in bb]}
            ni = next(i for i, n in enumerate(nodes) if n["name"] == old_name)
            rig["phases"][phase] = [replacement if i == ni else n for i, n in enumerate(nodes)
                                    if n["name"] != "second-hall" or old_name != "first-hall"]
            receipts.append({**receipt, "key": snow_key, "matchedTemperateAlphaGeometry": True, **check})
        rig["upperRegistration"] = copy.deepcopy(temp_rig["upperRegistration"])
        rigs[snow_key] = rig
    for key in ["garobo-temperate", "garobo-snow"]:
        r = next(r for r in authoring["families"] if r["key"] == key)
        raw = read(r["nativeSource"]); rig = copy.deepcopy(r["componentRig"])
        anchors = {"dish-0": [84, 88], "dish-1": [96, 110], "dish-2": [134, 95]}
        changed = []
        for phase, nodes in enumerate(rig["phases"]):
            if not isinstance(nodes, list):
                continue
            for n in nodes:
                if n["name"] not in anchors:
                    continue
                rgba = place(Image.open(n["image"]), n["box"], raw["canvas"])
                x0, _, x1, _ = n["box"]
                source = lowest(rgba, x0, x1); target = np.array(anchors[n["name"]], float)
                shift = np.floor((target-source)*4+.5)/4
                corners = frame_boundary(r, phase, raw["canvas"])
                local = np.array([[0, 0], [-4, -3], [4, -3], [0, -10]])
                output, check = warp_landmarks(rgba, np.concatenate((source+local, corners)),
                                              np.concatenate((target+local, corners)))
                bb = bounds(output[..., 3] > 0); x0, y0, x1, y1 = bb
                file = args.output / f"{key}-{phase:02}-{n['name']}.png"
                Image.fromarray(output[y0:y1, x0:x1]).save(file)
                n.update(image=str(file), sha256=sha(file), box=[v/4 for v in bb])
                receipts.append({"key": key, "phase": phase, "part": n["name"],
                                 "method": "ATTACHMENT_TO_AUTHORED_FLOOR_SOCKET",
                                 "landmarks": [{"name": n["name"]+"-foot", "source": source.tolist(),
                                                "target": target.tolist()}], "shift": shift.tolist(), **check})
                changed.append(phase)
        rig["upperRegistration"] = {"method": "ATTACHMENT_TO_AUTHORED_FLOOR_SOCKET",
                                    "fixedFoundation": "EXACT_V6_SOURCE_AND_PLACEMENT",
                                    "changedPhases": sorted(set(changed)), "sourceAuthoringSha256": sha(args.authoring)}
        rigs[key] = rig
    write(args.output / "rigs.json", rigs)
    write(args.output / "landmarks.json", {"baseline": str(args.authoring), "baselineSha256": sha(args.authoring),
          "status": "UNSELECTED_ATTACHMENT_CANDIDATE", "checks": receipts})
    print(len(receipts), "upper poses anchored; V6 floors unchanged")


if __name__ == "__main__":
    main()
