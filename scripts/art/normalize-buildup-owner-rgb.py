"""Normalize shader-ignored RGB at fully categorical owner pixels only."""
import argparse
import copy
import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import pack_variant, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("previous", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--revision", required=True)
parser.add_argument("--keys", nargs="+", required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring = read(args.previous / "authoring.json")
catalogs = {side: read(f"desktop/{side}-building-coverage.json") for side in ("allied", "soviet", "yuri")}
profile_file = Path("desktop/hd-profile.mjs")
profile = profile_file.read_text()
receipts = []
for record in authoring["families"]:
    if record["key"] not in args.keys:
        continue
    binding = record["newMember"]
    old = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
    manifest = read(old / "manifest.json")
    new = old.parent / args.revision
    new.mkdir(exist_ok=False)
    exports = args.output / "frames" / record["key"]
    exports.mkdir(parents=True)
    for file in Path(record["exportsPath"]).glob("*.png"):
        shutil.copyfile(file, exports / file.name)
    candidate = copy.deepcopy(manifest)
    candidate.update(packRevision=args.revision, ownerRgbNormalization={"previousSha256": binding["sha256"],
        "rule": "Only R=255 remap RGB is zeroed; hdResolve and unfiltered owner mix discard this RGB before filtering"})
    candidate["variants"] = []
    changed = 0
    for density in (2, 4):
        images = []
        for n, frame in enumerate(manifest["logical"]["frames"]):
            before = unpack(old, manifest, density, n)
            data = unpack(old, manifest, density, n, "data")
            base = before.copy()
            if n != record["frames"] - 1:
                owned = (data[..., 0] == 255) & (base[..., 3] > 0)
                changed += int(np.count_nonzero(owned))
                base[..., :3][owned] = 0
                assert np.array_equal(base[~owned], before[~owned])
                assert np.array_equal(base[..., 3], before[..., 3])
                # The current shader resolves owner color separately per texel
                # before its area filter. Equality holds for any palette row.
                for color in ((0, 0, 255), (255, 0, 0), (16, 200, 75)):
                    lhs, rhs = before[..., :3].copy(), base[..., :3].copy()
                    lhs[owned], rhs[owned] = color, color
                    assert np.array_equal(lhs, rhs)
            else:
                assert np.array_equal(base, before)
            x, y = [v * density for v in frame["trimOrigin"]]
            w, h = [v * density for v in frame["legacyRenderSize"]]
            pair = [base[y:y+h, x:x+w], data[y:y+h, x:x+w]]
            images.append(pair)
            for role, image in zip(("base", "data"), pair):
                Image.fromarray(image).save(exports / f"{n:02}-{density}x-{role}.png")
        candidate["variants"].append(pack_variant(images, manifest["logical"]["frames"], density, new, True, 2048))
    write(new / "manifest.json", candidate)
    updated = {**binding, "revision": args.revision, "sha256": sha(new / "manifest.json")}
    old_family = Path(record["newFamilyPath"])
    family = read(old_family)
    family["members"] = [updated if m == binding else m for m in family["members"]]
    new_family = old_family.parent.parent / args.revision / "family.json"
    write(new_family, family)
    record.update(newMember=updated, newFamilyPath=str(new_family), newFamilySha256=sha(new_family),
        exportsPath=str(exports), ownerRgbNormalized=True)
    if record["side"] == "legacy":
        key = record["key"]
        profile = re.sub(rf"({key}: ')[^']+(')", lambda m: m[1] + (sha(new_family)
            if len(m[0].split("'")[1]) == 64 else args.revision) + m[2], profile)
    else:
        catalogs[record["side"]][record["key"]].update(familyPath=new_family.relative_to(".local").as_posix(), familyHash=sha(new_family))
    receipts.append({"key": record["key"], "normalizedPixels": changed, "status": "EXACT_OWNER_RESOLVED_COLOR_ALL_PALETTES_ALPHA_DATA_TERMINAL_UNCHANGED"})
    print(record["key"], changed, "PASS_RENDER_EQUIVALENT_OWNER_RGB", flush=True)
for side, catalog in catalogs.items():
    write(f"desktop/{side}-building-coverage.json", catalog)
profile_file.write_text(profile)
authoring["revision"] = args.revision
write(args.output / "authoring.json", authoring)
write(args.output / "owner-rgb.json", {"status": "PASS_RENDER_EQUIVALENT_RGB_NORMALIZATION", "receipts": receipts})
