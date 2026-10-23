"""Losslessly align construction tiles without changing any exported pixels."""
import argparse
import copy
import re
from pathlib import Path

import numpy as np

from buildup import pack_flat, pack_variant, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("previous", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--revision", required=True)
parser.add_argument("--identities", nargs="+", required=True)
parser.add_argument("--keys", nargs="+", help="Limit storage changes to these exact selected sequences")
parser.add_argument("--storage", choices=("serialized", "aligned-flat"), default="serialized")
parser.add_argument("--virtual-height", type=int, default=1024)
parser.add_argument("--resume", action="store_true", help="Reuse only hash-checked complete packs with identical decoded pixels")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=args.resume)
authoring = read(args.previous / "authoring.json")
catalogs = {side: read(f"desktop/{side}-building-coverage.json") for side in ("allied", "soviet", "yuri")}
changes = []
profile_file = Path("desktop/hd-profile.mjs")
profile = profile_file.read_text()
for record in authoring["families"]:
    if record["identity"] not in args.identities:
        continue
    if args.keys and record["key"] not in args.keys:
        continue
    binding = record["newMember"]
    old = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
    new = old.parent / args.revision
    new.mkdir(exist_ok=args.resume)
    previous = read(old / "manifest.json")
    manifest = copy.deepcopy(previous)
    manifest.update(packRevision=args.revision, storageRepair={"previousSha256": binding["sha256"], "pixels": "EXACT"})
    manifest["variants"] = []
    reused = args.resume and (new / "manifest.json").exists()
    if reused:
        manifest = read(new / "manifest.json")
        assert manifest["storageRepair"]["previousSha256"] == binding["sha256"]
        for variant in manifest["variants"]:
            for page in variant["pages"]:
                for role in ("base", "data", "map"):
                    if role in page:
                        assert sha(new / page[role]) == page[role + "Sha256"]
    for density in (() if reused else (2, 4)):
        images = []
        for n, frame in enumerate(previous["logical"]["frames"]):
            x, y = [v * density for v in frame["trimOrigin"]]
            w, h = [v * density for v in frame["legacyRenderSize"]]
            images.append([unpack(old, previous, density, n, role)[y:y+h, x:x+w] for role in ("base", "data")])
        variant = pack_flat(images, previous["logical"]["frames"], density, new, aligned=True) if args.storage == "aligned-flat" else (
            pack_variant(images, previous["logical"]["frames"], density, new, True, args.virtual_height))
        manifest["variants"].append(variant)
    if not reused:
        write(new / "manifest.json", manifest)
    for density in (2, 4):
        for n in range(record["frames"]):
            for role in ("base", "data"):
                assert np.array_equal(unpack(old, previous, density, n, role), unpack(new, manifest, density, n, role))
    family = read(record["newFamilyPath"])
    updated = {**binding, "revision": args.revision, "sha256": sha(new / "manifest.json")}
    family["members"] = [updated if member == binding else member for member in family["members"]]
    old_family = Path(record["newFamilyPath"])
    new_family = old_family.parent.parent / args.revision / "family.json"
    if new_family.exists():
        assert args.resume and read(new_family) == family
    else:
        write(new_family, family)
    record.update(newMember=updated, newFamilyPath=str(new_family), newFamilySha256=sha(new_family))
    if record["side"] == "legacy":
        key = record["key"]
        start = profile.index("export const sovietBatchRevisions = ")
        end = profile.index(";", start)
        profile = profile[:start] + re.sub(rf"({key}: ')[^']+(')", rf"\g<1>{args.revision}\2", profile[start:end]) + profile[end:]
        profile = re.sub(rf"({key}: ')[a-f0-9]{{64}}(')", rf"\g<1>{sha(new_family)}\2", profile)
    else:
        catalogs[record["side"]][record["key"]].update(familyPath=new_family.relative_to(".local").as_posix(), familyHash=sha(new_family))
    changes.append({"key": record["key"], "previousMemberSha256": binding["sha256"], "newMemberSha256": updated["sha256"],
        "status": "PASS_ALL_PHASE_BASE_AND_DATA_PIXEL_IDENTITY"})
    print(record["key"], "PASS_LOSSLESS_ALIGNED_TILES", flush=True)
for side, catalog in catalogs.items():
    write(f"desktop/{side}-building-coverage.json", catalog)
profile_file.write_text(profile)
authoring["revision"] = args.revision
write(args.output / "authoring.json", authoring)
write(args.output / "repack.json", {"changes": changes, "status": "PASS_LOSSLESS_STORAGE_ONLY"})
