"""Compare complete selected construction coverage with original painted mattes."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import label, center_of_mass, distance_transform_edt

from buildup import native_indices, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("sources", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--authored-alpha", action="store_true")
parser.add_argument("--predecessor", type=Path)
parser.add_argument("--exclude-grid-fragments", action="store_true")
parser.add_argument("--component-grid", action="store_true")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring, sources = read(args.authoring), read(args.sources)
previous = read(args.predecessor) if args.predecessor else None
rows = []
for record in authoring["families"]:
    root = Path(".local/hd-packs") / record["newMember"]["packId"] / record["newMember"]["revision"]
    manifest, raw = read(root / "manifest.json"), read(record["nativeSource"])
    assert sha(root / "manifest.json") == record["newMember"]["sha256"]
    painted = record["key"] in sources
    if previous:
        old = next(r for r in previous["families"] if r["key"] == record["key"])
        old_root = Path(".local/hd-packs") / old["newMember"]["packId"] / old["newMember"]["revision"]
        old_manifest = read(old_root / "manifest.json")
        assert manifest["logical"] == old_manifest["logical"]
        if not painted:
            assert record == old, "Unpainted selection changed"
    poses = {}
    for job in sources.get(record["key"], []):
        image = Image.open(job["image"]).convert("RGBA")
        columns, grid_rows = job.get("grid", [len(job["phases"]), 1])
        width, height = image.width // columns, image.height // grid_rows
        if args.component_grid:
            full = np.array(image)
            opaque = full[..., 3] >= 128
            components, count = label(opaque)
            slots = np.full(count + 1, -1, int)
            for component, (cy, cx) in enumerate(center_of_mass(opaque, components, range(1, count + 1)), 1):
                slots[component] = min(grid_rows - 1, int(cy * grid_rows / image.height)) * columns + min(
                    columns - 1, int(cx * columns / image.width))
            _, nearest = distance_transform_edt(~opaque, return_indices=True)
            nearest_slot = slots[components[nearest[0], nearest[1]]]
        for cell, phase in zip(job.get("cells", range(len(job["phases"]))), job["phases"]):
            assert phase not in poses, (record["key"], phase)
            if not raw["frames"][phase]["width"] or not raw["frames"][phase]["height"]:
                continue
            x, y = cell % columns * width, cell // columns * height
            pose = image.crop((x, y, x + width, y + height))
            if args.component_grid:
                mask = opaque & (slots[components] == cell)
                bounds = Image.fromarray(mask.astype(np.uint8) * 255).getbbox()
                assert bounds, (record["key"], phase)
                x0, y0, x1, y1 = bounds
                pixels = full[y0:y1, x0:x1].copy()
                pixels[nearest_slot[y0:y1, x0:x1] != cell] = 0
                pose = Image.fromarray(pixels)
            object_mask = np.array(pose.getchannel("A")) >= 128
            if args.exclude_grid_fragments:
                components, count = label(object_mask)
                areas = np.bincount(components.ravel())
                largest = int(areas[1:].max()) if count else 0
                border = np.unique(np.concatenate((components[0], components[-1], components[:, 0], components[:, -1])))
                for component in border:
                    if component and areas[component] < largest * .1:
                        object_mask[components == component] = False
            bounds = Image.fromarray(object_mask.astype(np.uint8) * 255).getbbox()
            assert bounds, (record["key"], phase)
            frame = raw["frames"][phase]
            matte = np.array(pose.crop(bounds).getchannel("A").resize(
                (frame["width"] * 4, frame["height"] * 4), Image.Resampling.LANCZOS))
            alpha = np.zeros((raw["canvas"][1] * 4, raw["canvas"][0] * 4), np.uint8)
            x, y = frame["x"] * 4, frame["y"] * 4
            alpha[y:y + matte.shape[0], x:x + matte.shape[1]] = matte
            poses[phase] = alpha
    checks, excess, missing = [], 0, 0
    for density in (2, 4):
        for phase in range(record["frames"]):
            base = unpack(root, manifest, density, phase)
            native = native_indices(raw, phase) > 0
            footprint = np.repeat(np.repeat(native, density, axis=0), density, axis=1)
            current = base[..., 3] >= 128
            union = (current | footprint).sum()
            row = {"phase": phase, "density": density, "opaqueTexels": int(current.sum()),
                   "nativeMacroIou": float((current & footprint).sum() / union) if union else 1.,
                   "control": "RETAINED_TERMINAL" if phase == record["frames"] - 1 else "NATIVE_GUIDE_ONLY"}
            if previous and phase == record["frames"] - 1:
                assert np.array_equal(base, unpack(old_root, old_manifest, density, phase))
                row["terminalPreservation"] = "EXACT_PREDECESSOR"
            if not painted and phase != record["frames"] - 1:
                assert row["nativeMacroIou"] >= .95, "Unpainted native silhouette requires inspection"
                row["control"] = "UNCHANGED_NATIVE_COVERAGE_CONTROL"
            if phase in poses:
                if density == 4:
                    matte = poses[phase]
                elif args.authored_alpha:
                    a = poses[phase].astype(float)
                    matte = np.floor(a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).mean(axis=(1, 3)) + .5).astype(np.uint8)
                else:
                    matte = np.array(Image.fromarray(poses[phase]).resize(
                        (base.shape[1], base.shape[0]), Image.Resampling.LANCZOS))
                ghost = current & (matte < 32)
                removed = (matte >= 224) & ~current
                row.update(control="PAINTED_MATTE_COMPARISON", expandedBackgroundTexels=int(ghost.sum()),
                           clippedObjectTexels=int(removed.sum()))
                excess += int(ghost.sum())
                missing += int(removed.sum())
                if args.authored_alpha:
                    error = np.abs(matte.astype(int) - base[..., 3].astype(int))
                    row["maximumAuthoredAlphaError"] = int(error.max())
                    assert not ghost.any() and not removed.any(), (record["key"], phase, density)
                    assert error.max() <= 1, "Authored matte changed during encoding or temporal transfer"
            checks.append(row)
    rows.append({"key": record["key"], "painted": painted, "checks": checks,
                 "expandedBackgroundTexels": excess, "clippedObjectTexels": missing,
                 "status": ("REQUIRES_CUTOUT_REPAIR" if excess or missing else
                            "AUTHORED_MATTE_PRESERVED" if painted else "UNCHANGED_NATIVE_COVERAGE_CONTROL")})
    print(record["key"], excess, missing, flush=True)
write(args.output / "audit.json", {"status": "COMPLETE_108_SEQUENCE_CUTOUT_SURVEY",
    "authoritySha256": sha(args.authoring), "sourcesSha256": sha(args.sources), "sequences": len(rows),
    "checkedDensityFrames": sum(len(r["checks"]) for r in rows), "families": rows,
    "authoredAlphaValidated": args.authored_alpha,
    "neighborGridFragmentsExcluded": args.exclude_grid_fragments,
    "completeComponentsDecodedByGridSlot": args.component_grid,
    "boundary": "Original guides account for every selection; painted-matte defects are measured separately from human acceptance"})
