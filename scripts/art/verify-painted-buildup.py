"""Verify painted construction assets independently of their authoring pipeline."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, maximum_filter, minimum_filter

from buildup import native_indices, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("predecessor", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--cutout-audit", type=Path)
args = parser.parse_args()
current, previous = read(args.authoring), read(args.predecessor)
cutout = read(args.cutout_audit) if args.cutout_audit else None
if cutout:
    assert cutout["authoritySha256"] == sha(args.authoring) and cutout["authoredAlphaValidated"]
    assert cutout["sequences"] == 108 and cutout["checkedDensityFrames"] == 4890
    assert all(not r["expandedBackgroundTexels"] and not r["clippedObjectTexels"] for r in cutout["families"])
keys = current["hdRepaintProgress"]["registeredCandidateKeys"]
result = {"schema": "painted-buildup-validation-v1", "families": [],
          "boundary": "Pixel, owner-role and preservation evidence; anatomy, temporal art and native acceptance remain separate"}
for record in current["families"]:
    old = next(r for r in previous["families"] if r["key"] == record["key"])
    if record["key"] not in keys:
        assert record == old, "Unregistered family changed"
        continue
    family, old_family = read(record["newFamilyPath"]), read(old["newFamilyPath"])
    assert sha(record["newFamilyPath"]) == record["newFamilySha256"]
    assert family["members"] == [record["newMember"] if m == old["newMember"] else m
                                  for m in old_family["members"]]
    root = Path(".local/hd-packs") / record["newMember"]["packId"] / record["newMember"]["revision"]
    old_root = Path(".local/hd-packs") / old["newMember"]["packId"] / old["newMember"]["revision"]
    manifest, before = read(root / "manifest.json"), read(old_root / "manifest.json")
    assert sha(root / "manifest.json") == record["newMember"]["sha256"]
    assert manifest["source"] == before["source"] and manifest["logical"] == before["logical"]
    raw = read(record["nativeSource"])
    checks = []
    for variant in manifest["variants"]:
        density = variant["density"]
        assert len(variant["frames"]) == record["frames"] and len(variant["pages"]) <= 8
        for page in variant["pages"]:
            assert max(page["size"]) <= 2048
            for role in ("base", "data"):
                assert sha(root / page[role]) == page[role + "Sha256"]
                assert (root / page[role]).stat().st_size == page[role + "Bytes"]
        for phase in range(record["frames"]):
            base, data = (unpack(root, manifest, density, phase, role) for role in ("base", "data"))
            logical = manifest["logical"]["frames"][phase]
            x, y = (v * density for v in logical["trimOrigin"])
            w, h = (v * density for v in logical["legacyRenderSize"])
            for role, array in (("base", base), ("data", data)):
                exported = np.array(Image.open(Path(record["exportsPath"]) / f"{phase:02}-{density}x-{role}.png"))
                if w and h:
                    assert np.array_equal(array[y:y+h, x:x+w], exported), "Encoded pixel round trip"
                else:
                    assert logical["empty"] and not exported[..., 3].any(), "Zero-extent control preview"
            assert not np.any(data[..., 1] > 15) and not np.any(data[..., 2])
            assert not np.any(data[..., 0][base[..., 3] == 0]), "Owner data outside alpha"
            terminal = phase == record["frames"] - 1
            if logical["empty"]:
                assert not base[..., 3].any() and not data[..., 0].any()
                checks.append({"phase": phase, "density": density, "control": "EXACT_NATIVE_EMPTY_FRAME"})
                continue
            if terminal:
                assert all(np.array_equal(array, unpack(old_root, before, density, phase, role))
                           for array, role in ((base, "base"), (data, "data")))
                checks.append({"phase": phase, "density": density, "terminal": "EXACT_PREDECESSOR"})
                continue
            indices = native_indices(raw, phase)
            visible = np.repeat(np.repeat(indices > 0, density, axis=0), density, axis=1)
            native_owner = (indices >= 16) & (indices <= 31)
            eligible = np.repeat(np.repeat(binary_dilation(native_owner, iterations=3), density, axis=0), density, axis=1)
            owner = data[..., 0] > 0
            assert not np.any(owner & ~eligible), "Invented ownership region"
            assert native_owner.any() or not owner.any(), "Ownership introduced before native phase"
            union = (visible | (base[..., 3] >= 128)).sum()
            iou = float((visible & (base[..., 3] >= 128)).sum() / max(1, union))
            if manifest.get("paintedBuildup", {}).get("cutout"):
                assert cutout, "Authored alpha requires independent complete source-matte validation"
            else:
                assert iou > .95, "Native macro silhouette drift"
            neutral = visible & ~eligible
            rgb = base[..., :3].astype(np.float64)
            blocks = rgb.reshape(indices.shape[0], density, indices.shape[1], density, 3)
            deviation = blocks.std(axis=(1, 3)).max(axis=2)
            native_neutral = (indices > 0) & ~binary_dilation(native_owner, iterations=3)
            detailed = float((deviation[native_neutral] > 2).mean()) if native_neutral.any() else None
            painted_difference = np.abs(rgb - np.array(record["palette"])[np.repeat(np.repeat(indices, density, axis=0), density, axis=1)])
            difference = float((painted_difference.max(axis=2)[neutral] > 8).mean()) if neutral.any() else None
            flat = native_neutral & (minimum_filter(indices, size=3) == maximum_filter(indices, size=3))
            flat_detail = float((deviation[flat] > 2).mean()) if flat.any() else None
            # Matching Original's hue is desirable. New texture within flat
            # Original neighborhoods distinguishes painted detail from scaling.
            assert (difference is None or difference > .5
                    or flat_detail is not None and flat_detail > .5), "Surface lacks painted HD material evidence"
            amber_coverage = None
            if record["identity"] == "GAGAP":
                native_rgb = np.array(record["palette"])[indices]
                amber = ((indices > 31) & (native_rgb[..., 0] >= 140) & (native_rgb[..., 1] >= 40)
                         & (native_rgb[..., 1] < native_rgb[..., 0] * .95)
                         & (native_rgb[..., 2] < native_rgb[..., 0] * .3))
                amber = np.repeat(np.repeat(amber, density, axis=0), density, axis=1)
                if amber.any():
                    # Emissive glass is a fixed color, independent of ownership.
                    warm = ((rgb[..., 0] > 90) & (rgb[..., 1] > rgb[..., 0] * .2)
                            & (rgb[..., 1] < rgb[..., 0] * .95) & (rgb[..., 2] < rgb[..., 0] * .5))
                    amber_coverage = float((warm & ~owner)[amber].mean())
                    assert amber_coverage > .6, "Amber emitter glass lost or remapped to a player color"
            checks.append({"phase": phase, "density": density, "nativeMacroSilhouetteIoU": iou,
                           "neutralBlocksWithSubpixelDetailFraction": detailed,
                           "neutralTexelsDifferentFromOriginalFraction": difference,
                           "newDetailWithinFlatNativeNeighborhoods": flat_detail,
                           "ownerTexels": int(owner.sum()), "fixedAmberGlassCoverage": amber_coverage})
    preserved = [m for m in family["members"] if m != record["newMember"]]
    for binding in preserved:
        p = Path(".local/hd-packs") / binding["packId"] / binding["revision"] / "manifest.json"
        assert sha(p) == binding["sha256"]
    result["families"].append({"key": record["key"], "checks": checks,
                               "logicalSourceGeometry": "EXACT_PREDECESSOR",
                               "nonBuildupMembers": "EXACT_PREDECESSOR"})
result.update(status="PASS_PAINTED_PIXELS_ROLES_AND_PRESERVATION", selectedSequences=len(keys),
              cutoutAuditSha256=sha(args.cutout_audit) if cutout else None,
              checkedDensityFrames=sum(len(f["checks"]) for f in result["families"]))
write(args.output, result)
print(result["status"], result["selectedSequences"], result["checkedDensityFrames"])
