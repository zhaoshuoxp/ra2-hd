"""Register painted material to native poses without native neutral RGB fallback."""
import argparse
import copy
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_dilation, distance_transform_edt, label, maximum_filter, minimum_filter

from buildup import native_indices, pack_flat, read, retain_turret_dependencies, sha, unpack, write
from painted_motion import cohere_pose_materials
from painted_cutout import fit_painted_pose, painted_pose_bounds, extract_grid_poses


def linearize(color):
    return np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)


def encode(color):
    return np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("paintings", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--key", required=True)
parser.add_argument("--revision", required=True)
parser.add_argument("--approved-study", type=Path)
parser.add_argument("--select", action="store_true")
parser.add_argument("--cohere", action="store_true", help="Reuse painted HD on unchanged native neighborhoods")
parser.add_argument("--reuse-key", help="Reuse source-equivalent painted poses from a registered counterpart")
parser.add_argument("--freeze-reuse", action="store_true", help="Keep counterpart poses exact instead of adapting their target-theater material")
args = parser.parse_args()
assert not args.freeze_reuse or args.reuse_key
args.output.mkdir(parents=True, exist_ok=False)
authoring = read(args.authoring)
record = next(f for f in authoring["families"] if f["key"] == args.key)
raw = read(record["nativeSource"])
sources = {}
for job in read(args.paintings):
    if job["key"] != args.key:
        continue
    image = Image.open(job["image"]).convert("RGBA")
    columns, rows = job.get("grid", [len(job["phases"]), 1])
    assert len(job["phases"]) <= columns * rows
    cells = job.get("cells", list(range(len(job["phases"]))))
    assert len(cells) == len(job["phases"]) and len(set(cells)) == len(cells)
    assert all(0 <= n < columns * rows for n in cells)
    decoded_poses = extract_grid_poses(image, columns, rows)
    for column, phase in zip(cells, job["phases"]):
        assert phase not in sources
        assert column in decoded_poses, (args.key, phase, column)
        pose, bounds = decoded_poses[column]
        sources[phase] = (pose, {"image": job["image"], "sha256": sha(job["image"]),
                                "cell": column, "sourceRegion": bounds})
if args.approved_study:
    assert args.key == "gacsph-temperate", "The accepted study depicts this source only"
    study = Image.open(args.approved_study).convert("RGBA")
    decoded_poses = extract_grid_poses(study, 3, 1)
    for column, phase in enumerate((4, 10, 17)):
        pose, bounds = decoded_poses[column]
        sources[phase] = (pose,
                          {"image": str(args.approved_study), "sha256": sha(args.approved_study),
                           "cell": column, "sourceRegion": bounds, "userAcceptedMaterialDirection": True})
reused = {}
if args.reuse_key:
    donor = next(f for f in authoring["families"] if f["key"] == args.reuse_key)
    assert donor.get("repairMode") == "PAINTED_HD_MATERIAL_NATIVE_POSE_REGISTRATION"
    donor_raw = read(donor["nativeSource"])
    donor_root = Path(".local/hd-packs") / donor["newMember"]["packId"] / donor["newMember"]["revision"]
    donor_manifest = read(donor_root / "manifest.json")
    assert sha(donor_root / "manifest.json") == donor["newMember"]["sha256"]
    assert donor_manifest.get("paintedBuildup", {}).get("cutout") == "AUTHORED_ALPHA_NO_RETAIL_CLIP_OR_BACKGROUND_EXTENSION", (
        "Counterpart reuse requires a repaired authored cutout, not a legacy retail-clipped donor")
    for phase in range(min(record["frames"], donor["frames"]) - 1):
        indices = native_indices(raw, phase)
        used = np.unique(indices[indices > 0])
        if (np.array_equal(indices, native_indices(donor_raw, phase))
                and np.array_equal(np.array(record["palette"])[used], np.array(donor["palette"])[used])):
            reused[phase] = [unpack(donor_root, donor_manifest, 4, phase, role) for role in ("base", "data")]
            sources[phase] = (None, {"mode": "PAINTED_NATIVE_POSE_COUNTERPART", "key": args.reuse_key,
                                    "memberSha256": donor["newMember"]["sha256"], "phase": phase})
old_binding = record["newMember"]
old_root = Path(".local/hd-packs") / old_binding["packId"] / old_binding["revision"]
previous = read(old_root / "manifest.json")
required = {n for n in range(record["frames"] - 1) if not previous["logical"]["frames"][n]["empty"]}
assert required <= set(sources) <= set(range(record["frames"] - 1))
new_root = old_root.parent / args.revision
new_root.mkdir(exist_ok=False)
exports = args.output / "frames" / args.key
exports.mkdir(parents=True)
palette = np.array(record["palette"], np.uint8)
canvases, checks = [], []
for phase in range(record["frames"]):
    logical = previous["logical"]["frames"][phase]
    origin = np.array(logical["trimOrigin"]) * 4
    width, height = np.array(logical["legacyRenderSize"]) * 4
    if logical["empty"]:
        base = unpack(old_root, previous, 4, phase)
        data = unpack(old_root, previous, 4, phase, "data")
        assert not base[..., 3].any() and not data[..., 0].any()
        checks.append({"phase": phase, "mode": "EXACT_EMPTY_NATIVE_CONTROL", "nativeNeutralRgbContribution": 0})
    elif phase == record["frames"] - 1:
        base = unpack(old_root, previous, 4, phase)
        data = unpack(old_root, previous, 4, phase, "data")
        provenance = {"mode": "EXACT_ACCEPTED_TERMINAL"}
    elif phase in reused:
        base, data = reused[phase]
        checks.append({"phase": phase, "paintedMaterial": sources[phase][1],
                       "nativeNeutralRgbContribution": 0})
    else:
        source, provenance = sources[phase]
        native = native_indices(raw, phase)
        frame = raw["frames"][phase]
        size = (frame["width"] * 4, frame["height"] * 4)
        painted = fit_painted_pose(source, size, exclude_border_fragments=False)
        provenance = {**provenance, "cellObjectBounds": list(painted_pose_bounds(source, False)),
                      "cellExtraction": "COMPLETE_COMPONENTS_ASSIGNED_TO_SOURCE_GRID_SLOT"}
        occupied = painted[..., 3] >= 128
        assert occupied.any(), phase
        rgb = painted[..., :3].copy()
        indices = native[frame["y"]:frame["y"] + frame["height"],
                         frame["x"]:frame["x"] + frame["width"]]
        alpha = painted[..., 3].copy()
        expected_owner = (indices >= 16) & (indices <= 31)
        owners = binary_dilation(expected_owner, iterations=2)
        owner_region = np.repeat(np.repeat(owners, 4, axis=0), 4, axis=1)
        owner_core = np.repeat(np.repeat(expected_owner, 4, axis=0), 4, axis=1)
        color = rgb.astype(np.float64)
        if record["identity"] == "GAGAP":
            # Register the painted amber glass to the native emitter openings.
            # Whole-sprite bounds alone cannot align these narrow lens cores.
            nc = palette[indices]
            apertures = ((indices > 31) & (nc[..., 0] >= 140) & (nc[..., 1] >= 40)
                         & (nc[..., 1] < nc[..., 0] * .95) & (nc[..., 2] < nc[..., 0] * .3))
            painted_glass = (occupied & (color[..., 0] > 100)
                             & (color[..., 1] > color[..., 0] * .27)
                             & (color[..., 1] < color[..., 0] * .85)
                             & (color[..., 2] < color[..., 0] * .45))
            labels, count = label(binary_closing(painted_glass, iterations=2))
            regions = sorted((np.argwhere(labels == n) for n in range(1, count + 1)),
                             key=len, reverse=True)[:3]
            regions = sorted((r for r in regions if len(r) >= 12), key=lambda r: r[:, 1].mean())
            if apertures.any():
                assert regions, f"{args.key}/{phase}: missing painted amber glass"
                target = np.argwhere(np.repeat(np.repeat(apertures, 4, axis=0), 4, axis=1))
                centers = np.array([r[:, 1].mean() for r in regions])
                assigned = np.abs(target[:, 1:2] - centers).argmin(axis=1)
                for n, region in enumerate(regions):
                    coords = target[assigned == n]
                    if not len(coords):
                        continue
                    gy, gx = region.min(axis=0)
                    gh, gw = region.max(axis=0) - region.min(axis=0) + 1
                    ty, tx = coords.min(axis=0)
                    th, tw = coords.max(axis=0) - coords.min(axis=0) + 1
                    glass_rgb = rgb[gy:gy+gh, gx:gx+gw].copy()
                    glass_mask = painted_glass[gy:gy+gh, gx:gx+gw]
                    # Snow caps and metal dividers inside the donor rectangle
                    # cannot fill a native amber-glass aperture.
                    assert glass_mask.any()
                    _, near = distance_transform_edt(~glass_mask, return_indices=True)
                    glass_rgb[~glass_mask] = glass_rgb[near[0][~glass_mask], near[1][~glass_mask]]
                    glass = np.array(Image.fromarray(glass_rgb).resize(
                        (int(tw), int(th)), Image.Resampling.LANCZOS))
                    color[coords[:, 0], coords[:, 1]] = glass[coords[:, 0] - ty, coords[:, 1] - tx]
        red_signal = color[..., 0] - np.maximum(color[..., 1], color[..., 2])
        red_paint = (red_signal > 20) & (color[..., 0] > color[..., 1] * 2)
        native_color = palette[indices]
        warm_fixed = ((indices > 31) & (native_color[..., 0] > 80)
                      & (native_color[..., 1] > native_color[..., 0] * .2)
                      & (native_color[..., 0] > native_color[..., 2] * 1.4))
        warm_fixed = binary_dilation(warm_fixed, iterations=1)
        warm_fixed = np.repeat(np.repeat(warm_fixed, 4, axis=0), 4, axis=1)
        # Native owner roles also prevent premature red supports in early poses.
        neutralize = red_paint & ~owner_region & ~warm_fixed
        neutral = np.floor(color @ np.array((.2126, .7152, .0722)) + .5)
        color[neutralize] = neutral[neutralize, None]
        tint = owner_region & ((red_paint & ~warm_fixed) | owner_core) & (alpha > 0)
        missing_tint = tint & ~red_paint
        tone = np.max(color, axis=2)
        color[..., 0][missing_tint] = tone[missing_tint]
        color[..., 1][missing_tint] = tone[missing_tint] * .06
        color[..., 2][missing_tint] = tone[missing_tint] * .04
        # A neutral highlight plus palette paint reproduces fine HD shading
        # with every player palette, using the existing shader's weighted mix.
        light = linearize(color / 255)
        floor = np.minimum(light[..., 1], light[..., 2])
        levels = linearize(palette[16:32, 0].astype(np.float64) / 255)
        red = np.minimum(light[..., 0], levels.max())
        shade = np.argmin(np.where(levels[None, None] >= red[..., None],
                                  levels[None, None] - red[..., None], 1000), axis=2)
        strength = np.clip((red - floor) / levels[shade], 0, 1)
        strength[~tint] = 0
        neutral_base = np.divide(floor, 1 - strength, out=np.zeros_like(floor), where=strength < .999)
        color[tint] = encode(np.clip(neutral_base[tint, None], 0, 1)) * 255
        remap = np.zeros((*alpha.shape, 4), np.uint8)
        remap[..., 3] = 255
        remap[..., 0] = np.floor(strength * 255 + .5).astype(np.uint8)
        remap[..., 1][tint] = shade[tint]
        local_base = np.zeros((height, width, 4), np.uint8)
        local_data = np.zeros_like(local_base)
        local_data[..., 3] = 255
        local_base[:size[1], :size[0], :3] = np.clip(np.floor(color + .5), 0, 255).astype(np.uint8)
        local_base[:size[1], :size[0], 3] = alpha
        local_base[..., :3][local_base[..., 3] == 0] = 0
        local_data[:size[1], :size[0]] = remap
        base = np.zeros((raw["canvas"][1] * 4, raw["canvas"][0] * 4, 4), np.uint8)
        data = base.copy()
        x, y = origin
        base[y:y + height, x:x + width] = local_base
        data[y:y + height, x:x + width] = local_data
        checks.append({"phase": phase, "paintedMaterial": provenance,
                       "paintedRegistrationEdgeFraction": float((~occupied & (alpha > 128)).sum()
                                                               / max(1, (alpha > 128).sum())),
                       "nativeOwnerPixels": int(expected_owner.sum()),
                       "highResolutionOwnerTexels": int((remap[..., 0] > 0).sum()),
                       "nativeNeutralRgbContribution": 0})
    canvases.append([base, data])

coherence = []
if args.cohere:
    native = [native_indices(raw, phase) for phase in range(record["frames"])]
    canvases, coherence = cohere_pose_materials(native, canvases, palette, frozen=reused if args.freeze_reuse else ())

arrays = []
for phase, (base, data) in enumerate(canvases):
    logical = previous["logical"]["frames"][phase]
    x, y = (v * 4 for v in logical["trimOrigin"])
    width, height = (v * 4 for v in logical["legacyRenderSize"])
    arrays.append([base[y:y + height, x:x + width], data[y:y + height, x:x + width]])
    for role, array in (("base", base), ("data", data)):
        Image.fromarray(array).save(exports / f"{phase:02}-4x-{role}-canvas.png")


def reduce(pair):
    base, data = pair
    alpha = base[..., 3].astype(np.float64) / 255
    srgb = base[..., :3].astype(np.float64) / 255
    linear = linearize(srgb)
    def total(a):
        return a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, *a.shape[2:]).sum(axis=(1, 3))
    coverage = total(alpha)
    light = np.divide(total(linear * alpha[..., None]), coverage[..., None],
                      out=np.zeros((base.shape[0] // 2, base.shape[1] // 2, 3)), where=coverage[..., None] > 0)
    color = encode(light)
    reduced = np.concatenate([np.clip(np.floor(color * 255 + .5), 0, 255).astype(np.uint8),
                              np.floor(coverage[..., None] * 255 / 4 + .5).astype(np.uint8)], axis=2)
    reduced[..., :3][reduced[..., 3] == 0] = 0
    owner = alpha * data[..., 0] / 255
    weight = total(owner)
    remap = np.zeros_like(reduced)
    remap[..., 0] = np.floor(np.divide(weight * 255, coverage, out=np.zeros_like(weight), where=coverage > 0) + .5)
    levels = linearize(palette[16:32, 0].astype(np.float64) / 255)
    shade_light = np.divide(total(owner * levels[data[..., 1]]), weight,
                            out=np.zeros_like(weight), where=weight > 0)
    remap[..., 1] = np.argmin(np.abs(shade_light[..., None] - levels), axis=2)
    remap[..., 1][weight == 0] = 0
    remap[..., :2][reduced[..., 3] == 0] = 0
    remap[..., 3] = 255
    return [reduced, remap]


candidate = copy.deepcopy(previous)
candidate.update(packRevision=args.revision, paintedBuildup={"mode": "PAINTED_HD_RGB_NO_NATIVE_NEUTRAL_COLOR",
    "registration": "Native trim anchors with authored premultiplied coverage",
    "cutout": "AUTHORED_ALPHA_NO_RETAIL_CLIP_OR_BACKGROUND_EXTENSION",
    "previousSha256": old_binding["sha256"]})
candidate["variants"] = []
for density in (2, 4):
    images = arrays if density == 4 else [reduce(pair) for pair in arrays]
    if density == 2:
        if args.cohere:
            full = [reduce(pair) for pair in canvases]
            full[-1] = [unpack(old_root, previous, 2, record["frames"] - 1, role) for role in ("base", "data")]
            for phase in reused:
                full[phase] = [unpack(donor_root, donor_manifest, 2, phase, role) for role in ("base", "data")]
            full, density_coherence = cohere_pose_materials(native, full, palette, frozen=reused if args.freeze_reuse else ())
            coherence.extend({**row, "density": 2} for row in density_coherence)
            images = []
            for phase, pair in enumerate(full):
                frame = previous["logical"]["frames"][phase]
                x, y = (v * 2 for v in frame["trimOrigin"])
                w, h = (v * 2 for v in frame["legacyRenderSize"])
                images.append([a[y:y+h, x:x+w] for a in pair])
        phase = record["frames"] - 1
        frame = previous["logical"]["frames"][phase]
        x, y = (v * 2 for v in frame["trimOrigin"])
        w, h = (v * 2 for v in frame["legacyRenderSize"])
        images[-1] = [unpack(old_root, previous, 2, phase, role)[y:y+h, x:x+w] for role in ("base", "data")]
    candidate["variants"].append(pack_flat(images, previous["logical"]["frames"], density, new_root))
    for phase, pair in enumerate(images):
        for role, array in zip(("base", "data"), pair):
            preview = Image.fromarray(array) if all(array.shape[:2]) else Image.new("RGBA", (1, 1))
            preview.save(exports / f"{phase:02}-{density}x-{role}.png")
write(new_root / "manifest.json", candidate)
binding = {**old_binding, "revision": args.revision, "sha256": sha(new_root / "manifest.json")}
family = read(record["newFamilyPath"])
family["members"] = [binding if m == old_binding else m for m in family["members"]]
family_file = Path(record["newFamilyPath"]).parent.parent / args.revision / "family.json"
assert not family_file.exists()
retained_turrets = retain_turret_dependencies(family, family_file)
write(family_file, family)
record.update(newMember=binding, newFamilyPath=str(family_file), newFamilySha256=sha(family_file),
              exportsPath=str(exports), repairMode="PAINTED_HD_MATERIAL_NATIVE_POSE_REGISTRATION")
registered = sorted(set(authoring.get("hdRepaintProgress", {}).get("registeredCandidateKeys", [])) | {args.key})
authoring.update(revision=args.revision, hdRepaintProgress={"registeredCandidateKeys": registered,
    "pendingKeys": [r["key"] for r in authoring["families"] if r["key"] not in registered
                    and r.get("repairMode") != "OWNER_DATA_ONLY"],
    "fullArtworkAcceptance": "PENDING"})
write(args.output / "authoring.json", authoring)
write(args.output / "painted-registration.json", {"status": "REGISTERED_PAINTED_CANDIDATE_PENDING_NATIVE_AND_TEMPORAL_VALIDATION",
    "key": args.key, "checks": checks, "coherence": coherence,
    "terminalFrames": "EXACT_PREDECESSOR", "retainedTurrets": retained_turrets, "runtimeSelected": args.select})
if args.select:
    catalog_file = Path(f"desktop/{record['side']}-building-coverage.json")
    catalog = read(catalog_file)
    assert catalog[args.key]["familyHash"] == read(args.authoring)["families"][[f["key"] for f in authoring["families"]].index(args.key)]["newFamilySha256"]
    catalog[args.key].update(familyPath=family_file.relative_to(".local").as_posix(), familyHash=sha(family_file))
    write(catalog_file, catalog)
print(args.key, "PAINTED_REGISTERED", len(checks), sha(new_root / "manifest.json"))
