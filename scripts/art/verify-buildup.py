"""Independently check selected asset round trips, native phases and preservation."""
import argparse
import json
from pathlib import Path

import numpy as np

from buildup import native_indices, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--reference", type=Path, required=True)
args = parser.parse_args()
report = read(args.authoring)
result = {"schema": "native-buildup-validation-v1", "status": "RUNNING", "families": [],
          "boundary": "Complete exported pixel/contract validation; native runtime and human visual acceptance are separate"}
for family in report["families"]:
    new_family = read(family["newFamilyPath"])
    old_family = read(args.reference / family["oldFamilyPath"])
    assert new_family["members"] == [family["newMember"] if m == family["oldMember"] else m for m in old_family["members"]]
    binding = family["newMember"]
    new_root = Path(".local/hd-packs") / binding["packId"] / binding["revision"]
    new = read(new_root / "manifest.json")
    binding = family["oldMember"]
    old_root = args.reference / ".local/hd-packs" / binding["packId"] / binding["revision"]
    old = read(old_root / "manifest.json")
    assert sha(new_root / "manifest.json") == family["newMember"]["sha256"]
    assert new["source"] == old["source"]
    assert new["logical"] == old["logical"]
    raw = read(family["nativeSource"])
    assert raw["source"]["sha256"] == new["source"]["sha256"]
    checks = []
    for variant in new["variants"]:
        density = variant["density"]
        for page in variant["pages"]:
            assert max(page["size"]) <= 2048
            for role in ("base", "data", "map"):
                if role in page:
                    assert sha(new_root / page[role]) == page[role + "Sha256"]
                    assert (new_root / page[role]).stat().st_size == page[role + "Bytes"]
        assert len(variant["frames"]) == family["frames"]
        for n in range(family["frames"]):
            native = native_indices(raw, n)
            native_hd = np.repeat(np.repeat(native, density, axis=0), density, axis=1)
            base = unpack(new_root, new, density, n)
            data = unpack(new_root, new, density, n, "data")
            before = unpack(old_root, old, density, n)
            export = Path(family.get("exportsPath", args.authoring.parent / "frames" / family["key"])) / f"{n:02}-{density}x-base.png"
            from PIL import Image
            trim = np.array(Image.open(export).convert("RGBA"))
            logical = new["logical"]["frames"][n]
            x, y = [v * density for v in logical["trimOrigin"]]
            w, h = [v * density for v in logical["trimSize"]]
            assert np.array_equal(base[y:y + h, x:x + w], trim[:h, :w]), "Encoded pixel round trip"
            terminal = n == family["frames"] - 1
            if terminal and family.get("terminalRepairedFromNative"):
                assert np.array_equal(base[..., 3] > 0, native_hd > 0)
                owners = (native_hd >= 16) & (native_hd <= 31)
                assert np.array_equal(data[..., 0] == 255, owners)
                assert np.array_equal(data[..., 1][owners], native_hd[owners] - 16)
            elif terminal:
                assert np.array_equal(base, before)
                assert np.array_equal(data, unpack(old_root, old, density, n, "data"))
            elif family.get("repairMode") == "OWNER_DATA_ONLY":
                assert np.array_equal(base, before), "Owner-only repair retains all base pixels"
                owners = (native_hd >= 16) & (native_hd <= 31) & (base[..., 3] > 0)
                assert np.array_equal(data[..., 0] == 255, owners)
                assert np.array_equal(data[..., 1][owners], native_hd[owners] - 16)
            else:
                assert np.array_equal(base[..., 3] > 0, native_hd > 0)
                owners = (native_hd >= 16) & (native_hd <= 31)
                assert np.array_equal(data[..., 0] == 255, owners)
                assert np.array_equal(data[..., 1][owners], native_hd[owners] - 16)
            reference = native_hd > 0

            def iou(mask):
                union = (mask | reference).sum()
                return float((mask & reference).sum() / union) if union else 1.0

            checks.append({"frame": n, "density": density, "terminal": terminal,
                           "beforeCoverageIoU": iou(before[..., 3] > 0), "afterCoverageIoU": iou(base[..., 3] > 0)})
    for binding in family["preservedMembers"]:
        member = Path(".local/hd-packs") / binding["packId"] / binding["revision"] / "manifest.json"
        assert sha(member) == binding["sha256"]
        assert sha(args.reference / member) == binding["sha256"]
    if new_family.get("turret", {}).get("manifest"):
        relative = Path(new_family["turret"]["manifest"])
        old_turret = (args.reference / family["oldFamilyPath"]).parent / relative.parent
        new_turret = Path(family["newFamilyPath"]).parent / relative.parent
        for file in old_turret.rglob("*"):
            if file.is_file():
                assert sha(new_turret / file.relative_to(old_turret)) == sha(file)
    for variant, turret in new_family.get("turrets", {}).items():
        old_turret = args.reference / ".local" / old_family["turrets"][variant]["path"]
        new_turret = Path(".local") / turret["path"]
        assert turret["sha256"] == old_family["turrets"][variant]["sha256"]
        for file in old_turret.rglob("*"):
            if file.is_file():
                assert sha(new_turret / file.relative_to(old_turret)) == sha(file)
    if new_family.get("turret", {}).get("path"):
        old_turret = args.reference / ".local" / old_family["turret"]["path"]
        new_turret = Path(".local") / new_family["turret"]["path"]
        assert new_family["turret"]["sha256"] == old_family["turret"]["sha256"]
        for file in old_turret.rglob("*"):
            if file.is_file():
                assert sha(new_turret / file.relative_to(old_turret)) == sha(file)
    result["families"].append({"key": family["key"], "nativeFrames": family["frames"], "checks": checks,
        "nativeGeometry": "EXACT", "intermediateNativeCoverage": "PREDECESSOR_BASE_EXACT" if family.get("repairMode") == "OWNER_DATA_ONLY" else "EXACT",
        "intermediateOwnerData": "NATIVE_INDICES_WITHIN_PREDECESSOR_COVERAGE" if family.get("repairMode") == "OWNER_DATA_ONLY" else "EXACT",
        "terminalBaseAndData": "REPAIRED_NATIVE_GUN_COMPONENTS" if family.get("terminalRepairedFromNative") else "EXACT_PREDECESSOR",
        "nonBuildupMembers": "EXACT_PREDECESSOR"})
    print(family["key"], "PASS_ALL_NATIVE_PHASES_BOTH_DENSITIES", flush=True)
changed = {f["key"] for f in report["families"]}
for side in ("allied", "soviet", "yuri"):
    file = Path(f"desktop/{side}-building-coverage.json")
    current, predecessor = read(file), read(args.reference / file)
    assert set(current) == set(predecessor)
    for key, entry in current.items():
        if key not in changed:
            assert entry == predecessor[key]
        else:
            assert {k: v for k, v in entry.items() if k not in ("familyPath", "familyHash")} == {
                k: v for k, v in predecessor[key].items() if k not in ("familyPath", "familyHash")}
result.update(status="PASS_COMPLETE_NATIVE_PHASES_AND_PRESERVATION", selectedSequences=len(result["families"]),
              checkedDensityFrames=sum(len(f["checks"]) for f in result["families"]),
              terminalFramesPreserved=2 * sum(not f.get("terminalRepairedFromNative") for f in report["families"]),
              terminalFramesRepaired=2 * sum(bool(f.get("terminalRepairedFromNative")) for f in report["families"]))
write(args.output, result)
print(result["status"], result["selectedSequences"], result["checkedDensityFrames"])
