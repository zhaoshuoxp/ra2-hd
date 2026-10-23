"""Reconstruct native-index buildup surfaces using accepted HD material donors.

Only MK members receive immutable new revisions. Native phase, coverage, owner
indices and logical geometry govern every intermediate frame; the terminal HD
frame is retained exactly. No animation frame map or runtime timing edit is used.
"""
import argparse
import copy
import hashlib
import json
import math
import re
import shutil
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, uniform_filter
from scipy.spatial import cKDTree

TARGETS = {"GACNST", "GAWEAP", "GATECH", "YAWEAP", "YATECH", "YABRCK", "NAPSIS", "NALASR", "NAWEAP"}
BASELINE = "748d0998aaf663acda8807c158155bf0a5bb157b"


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def read(file):
    return json.loads(Path(file).read_text())


def write(file, data):
    Path(file).parent.mkdir(parents=True, exist_ok=True)
    Path(file).write_text(json.dumps(data, indent=2) + "\n")


def retain_turret_dependencies(family, family_file, root=Path(".local"), source_family_file=None):
    """Keep turret bytes exact while relocating family-relative bindings."""
    dependencies = [*family.get("turrets", {}).items(),
                    *([("legacy", family["turret"])] if family.get("turret", {}).get("path") else [])]
    retained = []
    for variant, binding in dependencies:
        source = root / binding["path"]
        destination = Path(family_file).parent / ("turret" if variant == "legacy" else f"turrets/{variant}")
        shutil.copytree(source, destination)
        files = [p for p in source.rglob("*") if p.is_file()]
        for file in files:
            assert sha(destination / file.relative_to(source)) == sha(file)
        assert sha(destination / "manifest.json") == binding["sha256"]
        binding["path"] = destination.relative_to(root).as_posix() + "/"
        retained.append({"variant": variant, "sha256": binding["sha256"], "exactCopiedFiles": len(files)})
    binding = family.get("turret", {})
    if source_family_file and binding.get("manifest") and not binding.get("path"):
        relative = Path(binding["manifest"])
        assert not relative.is_absolute() and ".." not in relative.parts
        source = Path(source_family_file).parent / relative.parent
        destination = Path(family_file).parent / relative.parent
        shutil.copytree(source, destination)
        files = [file for file in source.rglob("*") if file.is_file()]
        for file in files:
            assert sha(destination / file.relative_to(source)) == sha(file)
        assert sha(destination / relative.name) == binding["sha256"]
        retained.append({"variant": "family-relative", "sha256": binding["sha256"],
                         "exactCopiedFiles": len(files)})
    return retained


@lru_cache(maxsize=64)
def pixels(file):
    return np.array(Image.open(file).convert("RGBA"))


ARTWORK_BOUND_MEMBERS = {'ygweapmk.shp', 'yaweapmk.shp', 'ygcnstmk.shp',
                         'yacnstmk.shp', 'ygyardmk.shp', 'yayardmk.shp'}


def artwork_frames(manifest):
    """Resolve scoped painted crops without changing native source metadata."""
    native = manifest['logical']['frames']
    bounds = manifest.get('paintedBuildup', {}).get('artworkBounds')
    if bounds is None:
        return native
    source = manifest['source']
    assert source['member'] in ARTWORK_BOUND_MEMBERS
    assert any(entry['member'] == source['member'] and entry['sha256'] == source['sha256']
               and entry['theater'] == source['theater'] and entry['frames'] == len(native)
               and entry['canvas'] == manifest['logical']['canvas']
               for entry in read('.artifacts/buildup-remaining-20261013-r74-v1/yuri-original-reconstruction-r114-v1/reverted-v47-source/desktop/construction-artwork-bounds-sources.json')['entries'])
    assert len(bounds) == len(native)
    width, height = manifest['logical']['canvas']
    for rect in bounds:
        assert len(rect) == 4 and all(type(v) is int and v >= 0 for v in rect)
        x, y, w, h = rect
        assert w > 0 and h > 0 and w % 2 == h % 2 == 0 and x+w <= width and y+h <= height
    return [{**frame, 'trimOrigin': rect[:2], 'trimSize': rect[2:], 'legacyRenderSize': rect[2:]}
            for frame, rect in zip(native, bounds)]


def unpack(folder, manifest, density, n, role="base"):
    if density == 2 and not any(v["density"] == 2 for v in manifest["variants"]):
        base = unpack(folder, manifest, 4, n).astype(np.float64)
        data = unpack(folder, manifest, 4, n, "data").astype(np.float64)
        alpha = base[..., 3]
        rgb = base[..., :3] / 255
        linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)

        def sum_blocks(a):
            return a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, *a.shape[2:]).sum(axis=(1, 3))

        total = sum_blocks(alpha)
        weighted = sum_blocks(linear * alpha[..., None])
        reduced = np.divide(weighted, total[..., None], out=np.zeros_like(weighted), where=total[..., None] > 0)
        srgb = np.where(reduced <= .0031308, reduced * 12.92, 1.055 * reduced ** (1 / 2.4) - .055)
        color = np.zeros((*total.shape, 4), np.uint8)
        color[..., :3] = np.clip(np.floor(srgb * 255 + .5), 0, 255)
        color[..., 3] = np.floor(total / 4 + .5).astype(np.uint8)
        color[..., :3][color[..., 3] == 0] = 0
        owner = alpha * data[..., 0] / 255
        owner_total = sum_blocks(owner)
        remap = np.zeros_like(color)
        remap[..., 0] = np.floor(np.divide(owner_total * 255, total, out=np.zeros_like(total), where=total > 0) + .5)
        remap[..., 1] = np.floor(np.divide(sum_blocks(owner * data[..., 1]), owner_total,
                                         out=np.zeros_like(total), where=owner_total > 0) + .5)
        remap[..., :2][color[..., 3] == 0] = 0
        logical = artwork_frames(manifest)[n]
        x, y = [v * 2 for v in logical["trimOrigin"]]
        w, h = [v * 2 for v in logical["legacyRenderSize"]]
        remap[y:y + h, x:x + w, 3] = 255
        return color if role == "base" else remap
    variant = next(v for v in manifest["variants"] if v["density"] == density)
    placement = variant["frames"][n]
    page = next(p for p in variant["pages"] if p["id"] == placement["page"])
    atlas = pixels(str(folder / page[role]))
    x, y, w, h = placement["sampleRect"]
    if "map" in page:
        lookup = pixels(str(folder / page["map"]))
        yy, xx = np.mgrid[y:y + h, x:x + w]
        code = lookup[yy // 4, xx // 4].astype(np.int64)
        ids = code[..., 0] + (code[..., 1] << 8) + (code[..., 2] << 16)
        columns = page["size"][0] // 4
        crop = atlas[(ids // columns) * 4 + yy % 4, (ids % columns) * 4 + xx % 4]
    else:
        crop = atlas[y:y + h, x:x + w]
    logical = artwork_frames(manifest)[n]
    canvas = np.zeros((*[v * density for v in manifest["logical"]["canvas"]][::-1], 4), np.uint8)
    x, y = (v * density for v in logical["trimOrigin"])
    canvas[y:y + h, x:x + w] = crop
    return canvas


def native_indices(raw, n):
    f = raw["frames"][n]
    result = np.zeros(raw["canvas"][::-1], np.uint8)
    result[f["y"]:f["y"] + f["height"], f["x"]:f["x"] + f["width"]] = np.array(
        f["pixels"], np.uint8).reshape(f["height"], f["width"])
    assert hashlib.sha256(bytes(f["pixels"])).hexdigest() == f["pixelHash"]
    return result


def features(indices, palette):
    """Local source surfaces, rather than completed-building reveal heights."""
    rgb = palette[indices].astype(np.float32) / 255
    # Neighborhood descriptors identify translated caps, panel folds and walls.
    padded = np.pad(rgb, ((1, 1), (1, 1), (0, 0)))
    h, w = indices.shape
    patches = [padded[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)]
    yy, xx = np.indices((h, w))
    return np.concatenate([*patches, (xx / w)[..., None] * .12, (yy / h)[..., None] * .12], axis=2)


class MaterialDonor:
    def __init__(self, original, palette):
        self.original, self.palette = original, palette
        self.features = features(original, palette)
        self.positions, self.trees = {}, {}
        for index in np.unique(original[original > 0]):
            positions = np.argwhere(original == index)
            self.positions[int(index)] = positions
            self.trees[int(index)] = cKDTree(self.features[positions[:, 0], positions[:, 1]])

    def correspondence(self, original):
        descriptor = features(original, self.palette)
        yy, xx = np.indices(original.shape)
        donor_y, donor_x = yy.copy(), xx.copy()
        confidence = np.zeros(original.shape, np.float32)
        for index in np.unique(original[original > 0]):
            if int(index) not in self.trees:
                continue
            coords = np.argwhere(original == index)
            distances, ids = self.trees[int(index)].query(descriptor[coords[:, 0], coords[:, 1]], workers=1)
            matches = self.positions[int(index)][ids]
            donor_y[coords[:, 0], coords[:, 1]] = matches[:, 0]
            donor_x[coords[:, 0], coords[:, 1]] = matches[:, 1]
            confidence[coords[:, 0], coords[:, 1]] = np.exp(-distances * 4) * .6
        unchanged = (original == self.original) & (original > 0)
        # A stable source neighborhood must have stable donor RGB through time.
        stable = uniform_filter(unchanged.astype(np.float32), size=3, mode="constant") > .999
        donor_y[stable], donor_x[stable], confidence[stable] = yy[stable], xx[stable], 1
        return donor_y, donor_x, confidence

    def render(self, original, accepted, density, correspondence):
        donor_y, donor_x, confidence = correspondence
        h, w = original.shape
        yy, xx = np.indices((h * density, w * density))
        native_y, native_x = yy // density, xx // density
        sampled = accepted[donor_y[native_y, native_x] * density + yy % density,
                           donor_x[native_y, native_x] * density + xx % density].astype(np.float32)
        stable = confidence[native_y, native_x] == 1
        # Independent pixel matches can introduce seams at donor block edges.
        # Filter uncertain transferred material, keeping stable HD surfaces exact.
        smooth = gaussian_filter(sampled[..., :3], sigma=(density * .35, density * .35, 0))
        sampled[..., :3][~stable] = smooth[~stable]
        # Native-only construction surfaces retain their own color and anatomy.
        rgb = self.palette[original].astype(np.uint8)
        enlarged = np.array(Image.fromarray(rgb).resize((w * density, h * density), Image.Resampling.BICUBIC))
        weight = confidence[native_y, native_x] * (sampled[..., 3] / 255)
        output = np.zeros((h * density, w * density, 4), np.uint8)
        output[..., :3] = np.clip(enlarged * (1 - weight[..., None]) + sampled[..., :3] * weight[..., None], 0, 255)
        coverage = original[native_y, native_x] > 0
        output[..., 3] = coverage.astype(np.uint8) * 255
        output[..., :3][~coverage] = 0
        # Remap is categorical source data, never inferred from authored color.
        owners = original[native_y, native_x]
        data = np.zeros_like(output)
        data[..., 3] = 255
        remap = (owners >= 16) & (owners <= 31)
        data[..., 0][remap] = 255
        data[..., 1][remap] = owners[remap] - 16
        return output, data


def pack_flat(images, logical, density, folder, aligned=False):
    gutter = 4 if aligned else 2
    spacing = gutter * 2
    layouts, placements = [], {}
    for n in sorted(range(len(images)), key=lambda n: (-images[n][0].shape[0], -images[n][0].shape[1], n)):
        h, w = images[n][0].shape[:2]
        choices = [(s["height"] - h - spacing, 2048 - s["x"] - w - spacing, pi, ri)
                   for pi, rows in enumerate(layouts) for ri, s in enumerate(rows)
                   if h + spacing <= s["height"] and s["x"] + w + spacing <= 2048]
        if choices:
            _, _, pi, ri = min(choices)
            shelf = layouts[pi][ri]
        else:
            pi = next((i for i, rows in enumerate(layouts) if sum(s["height"] for s in rows) + h + spacing <= 2048), len(layouts))
            if pi == len(layouts):
                layouts.append([])
            shelf = {"x": 0, "y": sum(s["height"] for s in layouts[pi]), "height": h + spacing}
            layouts[pi].append(shelf)
        x, y = shelf["x"] + gutter, shelf["y"] + gutter
        placements[n] = {"nativeFrame": n, "page": f"p{pi}", "sampleRect": [x, y, w, h],
                         "contentRect": [x, y, *(v * density for v in logical[n]["trimSize"])]}
        shelf["x"] += w + spacing
    assert len(layouts) <= 8, (density, len(layouts))
    pages = []
    for pi, rows in enumerate(layouts):
        size = [max(s["x"] for s in rows), sum(s["height"] for s in rows)]
        page = {"id": f"p{pi}", "size": size}
        for ri, role in enumerate(("base", "data")):
            atlas = Image.new("RGBA", size, (0, 0, 0, 255 if ri else 0))
            for n, placement in placements.items():
                if placement["page"] == page["id"]:
                    atlas.paste(Image.fromarray(images[n][ri]), tuple(placement["sampleRect"][:2]))
            name = f"{density}x-p{pi}-{role}.png"
            atlas.save(folder / name)
            page.update({role: name, role + "Sha256": sha(folder / name), role + "Bytes": (folder / name).stat().st_size})
        pages.append(page)
    return {"density": density, "pages": pages, "frames": [placements[n] for n in range(len(images))]}


def pack_variant(images, logical, density, folder, serialized, virtual_height=1024):
    """Losslessly pool 4px tiles inside the existing shader/page contracts."""
    if not serialized:
        return pack_flat(images, logical, density, folder)
    layouts, placements = [], {}
    for n in sorted(range(len(images)), key=lambda n: (-images[n][0].shape[0], -images[n][0].shape[1], n)):
        h, w = images[n][0].shape[:2]
        choices = [(s["height"] - h - 8, 4096 - s["x"] - w - 8, pi, ri)
                   for pi, rows in enumerate(layouts) for ri, s in enumerate(rows)
                   if h + 8 <= s["height"] and s["x"] + w + 8 <= 4096]
        if choices:
            _, _, pi, ri = min(choices)
            shelf = layouts[pi][ri]
        else:
            # Bound the virtual page area before pooling: even a page with no
            # reusable tiles must fit a 2048px physical atlas losslessly.
            pi = next((i for i, rows in enumerate(layouts) if sum(s["height"] for s in rows) + h + 8 <= virtual_height), len(layouts))
            if pi == len(layouts):
                layouts.append([])
            shelf = {"x": 0, "y": sum(s["height"] for s in layouts[pi]), "height": h + 8}
            layouts[pi].append(shelf)
        x, y = shelf["x"] + 4, shelf["y"] + 4
        placements[n] = {"nativeFrame": n, "page": f"p{pi}", "sampleRect": [x, y, w, h],
                         "contentRect": [x, y, *(v * density for v in logical[n]["trimSize"])]}
        shelf["x"] += w + 8
    assert len(layouts) <= 8
    pages = []
    for pi, rows in enumerate(layouts):
        w, h = math.ceil(max(s["x"] for s in rows) / 4) * 4, math.ceil(sum(s["height"] for s in rows) / 4) * 4
        base = np.zeros((h, w, 4), np.uint8)
        data = base.copy()
        data[..., 3] = 255
        for n, placement in placements.items():
            if placement["page"] != f"p{pi}":
                continue
            x, y, fw, fh = placement["sampleRect"]
            base[y:y + fh, x:x + fw], data[y:y + fh, x:x + fw] = images[n]
        columns, rows = w // 4, h // 4

        def tiles(a):
            return a.reshape(rows, 4, columns, 4, a.shape[2]).transpose(0, 2, 1, 3, 4).reshape(-1, 16 * a.shape[2])

        combined = np.ascontiguousarray(np.concatenate([tiles(base), tiles(data[..., :2])], axis=1))
        unique, inverse = np.unique(combined.view(np.dtype((np.void, 96))).reshape(-1), return_inverse=True)
        decoded = unique.view(np.uint8).reshape(-1, 96)
        count = len(unique)
        pool_w = min(512, math.ceil(math.sqrt(count)))
        pool_h = math.ceil(count / pool_w)
        assert pool_h <= 512
        color = np.zeros((pool_w * pool_h, 4, 4, 4), np.uint8)
        remap = color.copy()
        remap[..., 3] = 255
        color[:count] = decoded[:, :64].reshape(-1, 4, 4, 4)
        remap[:count, :, :, :2] = decoded[:, 64:].reshape(-1, 4, 4, 2)

        def atlas(a):
            return a.reshape(pool_h, pool_w, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(pool_h * 4, pool_w * 4, 4)

        lookup = np.zeros((rows, columns, 4), np.uint8)
        for channel in range(3):
            lookup[..., channel] = ((inverse >> (channel * 8)) & 255).reshape(rows, columns)
        lookup[..., 3] = 255
        assert np.array_equal(decoded[inverse, :64], tiles(base))
        assert np.array_equal(decoded[inverse, 64:], tiles(data[..., :2]))
        page = {"id": f"p{pi}", "size": [pool_w * 4, pool_h * 4], "virtualSize": [w, h],
                "tileCount": count, "mapSize": [columns, rows], "gpuBytes": pool_w * pool_h * 16 * 6 + rows * columns * 4}
        for role, a in [("base", atlas(color)), ("data", atlas(remap)), ("map", lookup)]:
            name = f"{density}x-p{pi}-{role}.png"
            Image.fromarray(a).save(folder / name)
            page.update({role: name, role + "Sha256": sha(folder / name), role + "Bytes": (folder / name).stat().st_size})
        pages.append(page)
    return {"density": density, "storage": "lossless-four-pixel-pool-v1", "pages": pages,
            "frames": [placements[n] for n in range(len(images))]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True, help="Read-only baseline source inventories")
    parser.add_argument("--source-root", type=Path, help="Fresh native inventories: allied, yuri and soviet subdirectories")
    parser.add_argument("--output", type=Path, default=Path(".artifacts/buildup-art-20261011-v1"))
    parser.add_argument("--revision", default="native-buildup-20261011-r1")
    parser.add_argument("--identities", nargs="+", default=sorted(TARGETS))
    parser.add_argument("--jobs", type=Path, help="Explicit reviewed survey jobs; preserves every unselected resource")
    parser.add_argument("--resume", action="store_true", help="Reuse only completed, hash-verified immutable job receipts")
    args = parser.parse_args()
    if not args.jobs:
        assert set(args.identities) <= TARGETS
    args.output.mkdir(parents=True, exist_ok=args.resume)
    inventories = []
    for side, prefix in zip(("allied", "yuri", "soviet"), ("allied-buildings/source-v2", "yuri-buildings/source-v1", "m1-6c/source-v2")):
        source = args.source_root / side if args.source_root else args.reference / ".artifacts" / prefix
        inventories.append((source, read(source / "inventory.json")))
    packs = Path(".local/hd-packs")
    catalogs = {side: read(args.reference / f"desktop/{side}-building-coverage.json") for side in ("allied", "soviet", "yuri")}
    selected_catalogs = {side: read(f"desktop/{side}-building-coverage.json") for side in catalogs}
    profile_file = Path("desktop/hd-profile.mjs")
    baseline_profile = (args.reference / profile_file).read_text()
    profile = profile_file.read_text()
    special_revisions = dict(re.findall(r"(\w+): '([^']+)'", baseline_profile.split("export const sovietBatchRevisions = ")[1].split(";")[0]))
    current_revisions = dict(re.findall(r"(\w+): '([^']+)'", profile.split("export const sovietBatchRevisions = ")[1].split(";")[0]))
    jobs = [(side, key, entry) for side, catalog in catalogs.items() for key, entry in catalog.items()
            if entry["family"] in args.identities]
    for name in ("NAWEAP", "NAPSIS", "NALASR"):
        if name in args.identities:
            slug = name.lower()
            jobs.append(("legacy", slug, {"family": name, "theater": "TEMPERATE",
                "familyPath": f"hd-packs/soviet-{slug}-authored/{special_revisions[slug]}/family.json"}))
    specifications = read(args.jobs) if args.jobs else []
    if args.jobs:
        jobs = [(s["side"], s["key"], s["entry"]) for s in specifications]
    report = {"schema": "native-buildup-art-v1", "baseline": BASELINE, "revision": args.revision,
              "method": "Same-index native surfaces; accepted terminal HD material correspondence; categorical native owner data",
              "visualAcceptance": "PENDING", "windowsRuntime": "NOT_RUN", "families": []}
    if args.resume:
        report = read(args.output / "authoring.json")
        assert report["baseline"] == BASELINE and report["revision"] == args.revision
    for side, key, entry in jobs:
        completed = next((f for f in report["families"] if f["key"] == key), None)
        if completed:
            assert sha(completed["newFamilyPath"]) == completed["newFamilySha256"]
            new_binding = completed["newMember"]
            assert sha(packs / new_binding["packId"] / new_binding["revision"] / "manifest.json") == new_binding["sha256"]
            if side == "legacy":
                profile = profile.replace(f"{key}: '{current_revisions[key]}'", f"{key}: '{args.revision}'")
                profile = re.sub(rf"({key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{completed['newFamilySha256']}\2", profile)
            elif side == "power":
                profile_key = "powerPlant" if key == "gapowr" else "napowr"
                profile = re.sub(rf"({profile_key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{completed['newFamilySha256']}\2", profile)
                profile = profile.replace(entry["familyPath"], Path(completed["newFamilyPath"]).relative_to(".local").as_posix())
            else:
                entry.update(familyPath=Path(completed["newFamilyPath"]).relative_to(".local").as_posix(),
                             familyHash=completed["newFamilySha256"])
            print(key, "REUSED_HASH_VERIFIED_COMPLETE_RECEIPT", flush=True)
            continue
        old_family_file = Path(".local") / entry["familyPath"]
        family = read(old_family_file)
        if "familyHash" in entry:
            assert sha(old_family_file) == entry["familyHash"]
        binding = next(m for m in family["members"] if m["member"].endswith("mk.shp"))
        old_pack = packs / binding["packId"] / binding["revision"]
        manifest = read(old_pack / "manifest.json")
        assert sha(old_pack / "manifest.json") == binding["sha256"]
        source_dir, inventory, row = next((s, i, r) for s, i in inventories for r in i["matrix"]
            if r["id"] == entry["family"] and r["theater"] == entry["theater"] and any(
                m["source"]["sha256"] == manifest["source"]["sha256"] and "BUILDUP" in m["roles"] for m in r["members"]))
        native_member = next(m for m in row["members"] if m["source"]["sha256"] == manifest["source"]["sha256"])
        assert manifest["source"]["sha256"] == native_member["source"]["sha256"]
        raw_path = source_dir / "members" / (manifest["source"]["sha256"] + ".json")
        raw = read(raw_path)
        assert raw["source"]["sha256"] == manifest["source"]["sha256"]
        native_copy = args.output / "native" / raw_path.name
        if not native_copy.exists():
            native_copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(raw_path, native_copy)
        count = len(manifest["logical"]["frames"])
        assert count == native_member["visibleFrames"]
        originals = [native_indices(raw, n) for n in range(count)]
        palette = np.array(row["palette"]["colors"], np.uint8)
        donor = MaterialDonor(originals[-1], palette)
        correspondences = [donor.correspondence(original) for original in originals[:-1]]
        owner_only = any(s["key"] == key and s.get("repairMode") == "OWNER_DATA_ONLY" for s in specifications)
        repair_terminal = any(s["key"] == key and s.get("repairTerminal") for s in specifications)
        terminal_only = any(s["key"] == key and s.get("terminalOnly") for s in specifications)
        new_pack = packs / binding["packId"] / args.revision
        new_pack.mkdir(parents=True, exist_ok=False)
        exports = args.output / "frames" / key
        exports.mkdir(parents=True)
        result = copy.deepcopy(manifest)
        result.update(packRevision=args.revision, purpose="Original-guided same-index buildup art repair",
            buildupRepair={"previousSha256": binding["sha256"], "nativeSha256": raw["source"]["sha256"],
                "terminalPixels": "PRESERVED_EXACTLY_AT_EACH_DENSITY", "phaseMapping": "IDENTITY",
                "review": "PENDING_USER_VISUAL_ACCEPTANCE", "sourceInventorySha256": sha(source_dir / "inventory.json")})
        result["variants"] = []
        checks = []
        for density in (2, 4):
            accepted = unpack(old_pack, manifest, density, count - 1)
            frames = []
            for n, original in enumerate(originals):
                logical = manifest["logical"]["frames"][n]
                native = raw["frames"][n]
                assert logical["trimOrigin"] == [native["x"], native["y"]]
                assert logical["trimSize"] == [native["width"], native["height"]]
                if n == count - 1 and repair_terminal:
                    base, data = donor.render(original, accepted, density, donor.correspondence(original))
                elif n == count - 1 or terminal_only:
                    base = accepted.copy() if n == count - 1 else unpack(old_pack, manifest, density, n)
                    data = unpack(old_pack, manifest, density, n, "data")
                else:
                    base, data = donor.render(original, accepted, density, correspondences[n])
                    if owner_only:
                        base = unpack(old_pack, manifest, density, n)
                        data = unpack(old_pack, manifest, density, n, "data")
                        enlarged_indices = np.repeat(np.repeat(original, density, axis=0), density, axis=1)
                        native_owner = (enlarged_indices >= 16) & (enlarged_indices <= 31) & (base[..., 3] > 0)
                        data[..., :2] = 0
                        data[..., 0][native_owner] = 255
                        data[..., 1][native_owner] = enlarged_indices[native_owner] - 16
                x, y = (v * density for v in logical["trimOrigin"])
                w, h = (v * density for v in logical["legacyRenderSize"])
                pair = []
                for role, array in (("base", base), ("data", data)):
                    trimmed = np.zeros((h, w, 4), np.uint8)
                    if role == "data":
                        trimmed[..., 3] = 255
                    cw, ch = (v * density for v in logical["trimSize"])
                    trimmed[:ch, :cw] = array[y:y + ch, x:x + cw]
                    # A native zero-extent slot remains zero in the manifest
                    # and atlas; PNG review files require a transparent pixel.
                    preview = trimmed if w and h else np.zeros((1, 1, 4), np.uint8)
                    Image.fromarray(preview).save(exports / f"{n:02}-{density}x-{role}.png")
                    pair.append(trimmed)
                frames.append(pair)
                if n < count - 1 and not owner_only:
                    coverage = np.repeat(np.repeat(original > 0, density, axis=0), density, axis=1)
                    assert np.array_equal(base[..., 3] > 0, coverage)
                    native_owner = np.repeat(np.repeat((original >= 16) & (original <= 31), density, axis=0), density, axis=1)
                    assert np.array_equal(data[..., 0] == 255, native_owner)
                original_rgba = np.dstack([palette[original], np.uint8(original > 0) * 255])
                if density == 2:
                    Image.fromarray(original_rgba).save(exports / f"{n:02}-original.png")
                old_base = unpack(old_pack, manifest, density, n)
                Image.fromarray(old_base).save(exports / f"{n:02}-{density}x-before.png")
                checks.append({"frame": n, "density": density, "nativeVisiblePixels": int((original > 0).sum()),
                    "candidateVisiblePixels": int((base[..., 3] > 0).sum()), "nativeOwnerPixels": int(((original >= 16) & (original <= 31)).sum()),
                    "terminalExact": bool(np.array_equal(base, old_base)) if n == count - 1 else None})
            result["variants"].append(pack_variant(frames, manifest["logical"]["frames"], density, new_pack,
                                                  binding["packId"].startswith("yuri-coverage-")))
        write(new_pack / "manifest.json", result)
        new_binding = {**binding, "revision": args.revision, "sha256": sha(new_pack / "manifest.json")}
        family["members"] = [new_binding if m["member"] == binding["member"] else m for m in family["members"]]
        family["buildupRepair"] = {"previousFamilySha256": sha(old_family_file), "changedMembers": [binding["member"]],
            "nativeFrameMapping": "IDENTITY", "status": "CANDIDATE_USER_VISUAL_ACCEPTANCE_PENDING"}
        new_family = old_family_file.parent.parent / args.revision / "family.json"
        if family.get("turret", {}).get("manifest"):
            # Legacy turret manifests are family-relative even though none of
            # their artwork changes. Retain a complete independent descriptor.
            source_turret = old_family_file.parent / Path(family["turret"]["manifest"]).parent
            target_turret = new_family.parent / Path(family["turret"]["manifest"]).parent
            shutil.copytree(source_turret, target_turret)
            assert sha(target_turret / "manifest.json") == family["turret"]["sha256"]
        for variant, turret in family.get("turrets", {}).items():
            source_turret = Path(".local") / turret["path"]
            target_turret = new_family.parent / "turrets" / variant
            shutil.copytree(source_turret, target_turret)
            assert sha(target_turret / "manifest.json") == turret["sha256"]
            turret["path"] = target_turret.relative_to(".local").as_posix() + "/"
        if family.get("turret", {}).get("path"):
            turret = family["turret"]
            target_turret = new_family.parent / "turret"
            shutil.copytree(Path(".local") / turret["path"], target_turret)
            assert sha(target_turret / "manifest.json") == turret["sha256"]
            turret["path"] = target_turret.relative_to(".local").as_posix() + "/"
        write(new_family, family)
        if side == "legacy":
            profile = profile.replace(f"{key}: '{current_revisions[key]}'", f"{key}: '{args.revision}'")
            profile = re.sub(rf"({key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{sha(new_family)}\2", profile)
        elif side == "power":
            profile_key = "powerPlant" if key == "gapowr" else "napowr"
            profile = re.sub(rf"({profile_key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{sha(new_family)}\2", profile)
            profile = profile.replace(entry["familyPath"], new_family.relative_to(".local").as_posix())
        else:
            entry.update(familyPath=new_family.relative_to(".local").as_posix(), familyHash=sha(new_family))
        report["families"].append({"key": key, "side": side, "identity": entry["family"], "theater": entry["theater"],
            "oldFamilyPath": old_family_file.as_posix(), "newFamilyPath": new_family.as_posix(), "newFamilySha256": sha(new_family),
            "oldMember": binding, "newMember": new_binding, "nativeSource": native_copy.as_posix(),
            "exportsPath": exports.as_posix(),
            "palette": palette.tolist(), "frames": count, "checks": checks,
            "repairMode": "OWNER_DATA_ONLY" if owner_only else "NATIVE_PHASE_SURFACES",
            "terminalRepairedFromNative": repair_terminal,
            "preservedMembers": [m for m in family["members"] if m["member"] != binding["member"]]})
        write(args.output / "authoring.json", report)
        print(key, count, "native phases; terminal and peer members preserved", flush=True)
    for side, key, entry in jobs:
        if side not in ("legacy", "power"):
            selected_catalogs[side][key] = entry
    for side, catalog in selected_catalogs.items():
        write(f"desktop/{side}-building-coverage.json", catalog)
    profile_file.write_text(profile)
    print("Complete", len(jobs), "selected sequences; user visual acceptance pending")


if __name__ == "__main__":
    main()
