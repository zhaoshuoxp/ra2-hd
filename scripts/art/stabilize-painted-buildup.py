"""Create immutable construction revisions with native-guided shared HD material."""
import argparse
import copy
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import native_indices, pack_flat, read, retain_turret_dependencies, sha, unpack, write
from painted_motion import cohere_pose_materials

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--revision", required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring = read(args.authoring)
rows = []
for record in authoring["families"]:
    if record["key"] not in authoring["hdRepaintProgress"]["registeredCandidateKeys"]:
        continue
    binding = record["newMember"]
    old_root = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
    previous = read(old_root / "manifest.json")
    assert sha(old_root / "manifest.json") == binding["sha256"]
    raw, palette = read(record["nativeSource"]), np.array(record["palette"], np.uint8)
    native = [native_indices(raw, n) for n in range(record["frames"])]
    root = old_root.parent / args.revision
    root.mkdir(exist_ok=False)
    exports = args.output / "frames" / record["key"]
    exports.mkdir(parents=True)
    candidate = copy.deepcopy(previous)
    candidate.update(packRevision=args.revision, temporalMaterialRegistration={
        "mode": "NATIVE_POSE_SHARED_PAINTED_HD_MATERIAL", "previousSha256": binding["sha256"],
        "nativeRgbContribution": 0, "terminal": "EXACT_PREDECESSOR", "alpha": "EXACT_PREDECESSOR"})
    candidate["variants"] = []
    evidence = []
    for density in (2, 4):
        before = [[unpack(old_root, previous, density, n, role) for role in ("base", "data")]
                  for n in range(record["frames"])]
        pairs, transfers = cohere_pose_materials(native, before, palette)
        evidence.extend({**row, "density": density} for row in transfers)
        cropped = []
        for n, pair in enumerate(pairs):
            logical = previous["logical"]["frames"][n]
            x, y = (v * density for v in logical["trimOrigin"])
            w, h = (v * density for v in logical["legacyRenderSize"])
            cropped.append([a[y:y+h, x:x+w] for a in pair])
            for role, a, crop in zip(("base", "data"), pair, cropped[-1]):
                if density == 4:
                    Image.fromarray(a).save(exports / f"{n:02}-4x-{role}-canvas.png")
                image = Image.fromarray(crop) if w and h else Image.new("RGBA", (1, 1))
                image.save(exports / f"{n:02}-{density}x-{role}.png")
        candidate["variants"].append(pack_flat(cropped, previous["logical"]["frames"], density, root))
    write(root / "manifest.json", candidate)
    new_binding = {**binding, "revision": args.revision, "sha256": sha(root / "manifest.json")}
    family = read(record["newFamilyPath"])
    assert sha(record["newFamilyPath"]) == record["newFamilySha256"]
    family["members"] = [new_binding if m == binding else m for m in family["members"]]
    family_file = Path(record["newFamilyPath"]).parent.parent / args.revision / "family.json"
    assert not family_file.exists()
    retained_turrets = retain_turret_dependencies(family, family_file)
    write(family_file, family)
    record.update(newMember=new_binding, newFamilyPath=str(family_file), newFamilySha256=sha(family_file),
                  exportsPath=str(exports), temporalRepair="NATIVE_POSE_SHARED_PAINTED_HD_MATERIAL")
    rows.append({"key": record["key"], "predecessor": binding, "candidate": new_binding,
                 "phases": evidence, "retainedTurrets": retained_turrets})
    print(record["key"], "registered", flush=True)
authoring.update(revision=args.revision)
write(args.output / "authoring.json", authoring)
write(args.output / "temporal-registration.json", {"status": "REGISTERED_PENDING_TEMPORAL_NATIVE_AND_VISUAL_VALIDATION",
    "sourceAuthoring": str(args.authoring), "sourceAuthoringSha256": sha(args.authoring), "families": rows})
