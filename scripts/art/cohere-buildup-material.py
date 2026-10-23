"""Keep translated native surface patches on one consistent HD material sample."""
import argparse
import copy
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import MaterialDonor, native_indices, pack_variant, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("previous", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--revision", required=True)
parser.add_argument("--keys", nargs="+", required=True)
parser.add_argument("--context", choices=("patch", "index-orientation", "native-color", "native-nearest"), default="patch")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring = read(args.previous / "authoring.json")
catalogs = {side: read(f"desktop/{side}-building-coverage.json") for side in ("allied", "soviet", "yuri")}
receipts = []
for record in authoring["families"]:
    if record["key"] not in args.keys:
        continue
    binding = record["newMember"]
    old = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
    manifest = read(old / "manifest.json")
    raw = read(record["nativeSource"])
    originals = [native_indices(raw, n) for n in range(record["frames"])]
    donor = MaterialDonor(originals[-1], np.array(record["palette"], np.uint8))
    contexts, confidence = [], []
    for original in originals[:-1]:
        h, w = original.shape
        padded = np.pad(original, 1)
        if args.context == "patch":
            context = np.stack([padded[y:y+h, x:x+w] for y in range(3) for x in range(3)], axis=2)
        else:
            palette = np.array(record["palette"], np.float32)
            luminance = palette[padded] @ np.array((.2126, .7152, .0722))
            gx = luminance[1:1+h, 2:2+w] - luminance[1:1+h, :w]
            gy = luminance[2:2+h, 1:1+w] - luminance[:h, 1:1+w]
            direction = lambda gradient: np.where(gradient > 4, 2, np.where(gradient < -4, 0, 1)).astype(np.uint8)
            context = np.stack([original, direction(gx), direction(gy)], axis=2)
        contexts.append(context)
        confidence.append(donor.correspondence(original)[2])
    new = old.parent / args.revision
    new.mkdir(exist_ok=False)
    exports = args.output / "frames" / record["key"]
    exports.mkdir(parents=True)
    for file in Path(record["exportsPath"]).glob("*.png"):
        shutil.copyfile(file, exports / file.name)
    candidate = copy.deepcopy(manifest)
    candidate.update(packRevision=args.revision,
        materialCoherence={"previousSha256": binding["sha256"], "context": args.context,
            "rule": "Highest-confidence native material sample; stable accepted surfaces and terminal remain exact"})
    candidate["variants"] = []
    changed = 0
    for density in (2, 4):
        bases = [unpack(old, manifest, density, n) for n in range(record["frames"])]
        data = [unpack(old, manifest, density, n, "data") for n in range(record["frames"])]
        samples = {}
        for n, original in enumerate(() if args.context.startswith("native-") else originals[:-1]):
            for y, x in np.argwhere((original > 0) & (confidence[n] < 1)):
                key = contexts[n][y, x].tobytes()
                score = float(confidence[n][y, x])
                if key not in samples or score > samples[key][0]:
                    samples[key] = (score, bases[n][y*density:(y+1)*density, x*density:(x+1)*density, :3].copy())
        images = []
        for n, original in enumerate(originals):
            base = bases[n].copy()
            if n < len(originals) - 1:
                if args.context.startswith("native-"):
                    palette = np.array(record["palette"], np.float32)
                    alpha = (original > 0).astype(np.float32)
                    rgb = palette[original] * alpha[..., None]
                    size = (base.shape[1], base.shape[0])
                    coverage = np.asarray(Image.fromarray(alpha).resize(size, Image.Resampling.BICUBIC))
                    channels = np.stack([np.asarray(Image.fromarray(rgb[..., c]).resize(size, Image.Resampling.BICUBIC))
                        for c in range(3)], axis=2)
                    native_color = np.clip(np.divide(channels, coverage[..., None], out=np.zeros_like(channels),
                        where=coverage[..., None] > .001), 0, 255).astype(np.uint8)
                    if args.context == "native-nearest":
                        native_color = np.repeat(np.repeat(palette[original].astype(np.uint8), density, axis=0), density, axis=1)
                for y, x in np.argwhere((original > 0) & (confidence[n] < 1)):
                    block = base[y*density:(y+1)*density, x*density:(x+1)*density, :3]
                    material = native_color[y*density:(y+1)*density, x*density:(x+1)*density] if args.context.startswith("native-") else (
                        samples[contexts[n][y, x].tobytes()][1])
                    changed += int(np.any(block != material))
                    block[:] = material
                if record.get("ownerRgbNormalized"):
                    base[..., :3][data[n][..., 0] == 255] = 0
                stable = np.repeat(np.repeat(confidence[n] == 1, density, axis=0), density, axis=1)
                assert np.array_equal(base[stable], bases[n][stable])
                assert np.array_equal(base[..., 3], bases[n][..., 3])
            else:
                assert np.array_equal(base, bases[n])
            frame = manifest["logical"]["frames"][n]
            x, y = [v * density for v in frame["trimOrigin"]]
            w, h = [v * density for v in frame["legacyRenderSize"]]
            pair = [base[y:y+h, x:x+w], data[n][y:y+h, x:x+w]]
            images.append(pair)
            for role, image in zip(("base", "data"), pair):
                Image.fromarray(image).save(exports / f"{n:02}-{density}x-{role}.png")
        candidate["variants"].append(pack_variant(images, manifest["logical"]["frames"], density, new, True, 2048))
    write(new / "manifest.json", candidate)
    updated = {**binding, "revision": args.revision, "sha256": sha(new / "manifest.json")}
    old_family = Path(record["newFamilyPath"])
    family = read(old_family)
    family["members"] = [updated if member == binding else member for member in family["members"]]
    new_family = old_family.parent.parent / args.revision / "family.json"
    write(new_family, family)
    record.update(newMember=updated, newFamilyPath=str(new_family), newFamilySha256=sha(new_family), exportsPath=str(exports))
    if record["side"] == "legacy":
        import re
        profile_file = Path("desktop/hd-profile.mjs")
        profile = profile_file.read_text()
        key = record["key"]
        profile = re.sub(rf"({key}: ')[^']+(')", lambda m: m[1] + args.revision + m[2]
            if len(m[0].split("'")[1]) != 64 else m[1] + sha(new_family) + m[2], profile)
        profile_file.write_text(profile)
    else:
        catalogs[record["side"]][record["key"]].update(familyPath=new_family.relative_to(".local").as_posix(), familyHash=sha(new_family))
    receipts.append({"key": record["key"], "changedUncertainNativeBlocks": changed, "coverageOwnerStableSurfacesTerminal": "EXACT_PREDECESSOR"})
    print(record["key"], changed, "COHERENT_NATIVE_SURFACE_MATERIAL", flush=True)
for side, catalog in catalogs.items():
    write(f"desktop/{side}-building-coverage.json", catalog)
authoring["revision"] = args.revision
write(args.output / "authoring.json", authoring)
write(args.output / "material-coherence.json", {"status": "PASS_NATIVE_SURFACE_COHERENCE_AND_PRESERVATION", "receipts": receipts})
