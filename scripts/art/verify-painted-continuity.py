"""Verify stationary painted surfaces and hash-pinned accepted selections."""
import argparse
from pathlib import Path

import numpy as np
from scipy.ndimage import minimum_filter

from buildup import native_indices, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("accepted", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--cutout-reopened", action="store_true")
args = parser.parse_args()
authoring, accepted = read(args.authoring), read(args.accepted)
protected = accepted["hdRepaintProgress"]["registeredCandidateKeys"]
for key in protected:
    record = next(r for r in authoring["families"] if r["key"] == key)
    old = next(r for r in accepted["families"] if r["key"] == key)
    if not args.cutout_reopened:
        assert record == old, "Accepted selection changed"
    else:
        family, before = read(record["newFamilyPath"]), read(old["newFamilyPath"])
        assert [m for m in family["members"] if m != record["newMember"]] == [
            m for m in before["members"] if m != old["newMember"]]
        roots = [Path(".local/hd-packs") / r["newMember"]["packId"] / r["newMember"]["revision"] for r in (record, old)]
        manifests = [read(root / "manifest.json") for root in roots]
        assert manifests[0]["logical"] == manifests[1]["logical"]
        assert manifests[0]["source"] == manifests[1]["source"]
        for density in (2, 4):
            for role in ("base", "data"):
                assert np.array_equal(unpack(roots[0], manifests[0], density, record["frames"] - 1, role),
                                      unpack(roots[1], manifests[1], density, record["frames"] - 1, role))
rows = []
for record in authoring["families"]:
    if (record["key"] not in authoring["hdRepaintProgress"]["registeredCandidateKeys"]
            or record["key"] in protected and not args.cutout_reopened):
        continue
    root = Path(".local/hd-packs") / record["newMember"]["packId"] / record["newMember"]["revision"]
    assert sha(root / "manifest.json") == record["newMember"]["sha256"]
    manifest, raw = read(root / "manifest.json"), read(record["nativeSource"])
    palette = np.array(record["palette"], float) / 255
    def linear(color):
        return np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)
    def render(base, data):
        weight = data[..., :1] / 255
        light = linear(base[..., :3] / 255) * (1 - weight) + linear(palette[16 + data[..., 1]]) * weight
        return np.where(light <= .0031308, light * 12.92, 1.055 * light ** (1 / 2.4) - .055) * 255
    total, changed, phases = 0, 0, []
    for density in (2, 4):
        prior = None
        for phase in range(record["frames"]):
            indices = native_indices(raw, phase)
            base, data = [unpack(root, manifest, density, phase, role) for role in ("base", "data")]
            color = render(base, data)
            if prior is not None:
                old_indices, old_base, old_color = prior
                fixed = minimum_filter((indices == old_indices) & (indices > 0), size=3,
                                       mode="constant", cval=0).astype(bool)
                fixed = np.repeat(np.repeat(fixed, density, axis=0), density, axis=1)
                fixed &= (base[..., 3] >= 128) & (old_base[..., 3] >= 128)
                difference = (np.abs(color - old_color).max(axis=2) > 8) & fixed
                count, change = int(fixed.sum()), int(difference.sum())
                total += count
                changed += change
                phases.append({"density": density, "phase": phase, "unchangedSourceTexels": count,
                               "changedVisibleTexels": change})
            prior = indices, base, color
    fraction = changed / max(1, total)
    rows.append({"key": record["key"], "changedVisibleTexels": changed, "unchangedSourceTexels": total,
                 "changedFraction": fraction, "phases": phases})
    print(record["key"], f"{fraction:.4%}", flush=True)
passed = all(r["changedFraction"] <= .02 for r in rows)
pass_status = ("PASS_PAINTED_CONTINUITY_AND_CONSTRUCTION_PRESERVATION" if args.cutout_reopened
               else "PASS_PAINTED_CONTINUITY_AND_ACCEPTED_PRESERVATION")
write(args.output, {"status": pass_status if passed else "FAIL_CONTINUITY",
    "candidateAuthoringSha256": sha(args.authoring), "acceptedAuthoringSha256": sha(args.accepted),
    "acceptedSelectionsPreserved": [] if args.cutout_reopened else protected,
    "cutoutReopenedKeys": protected if args.cutout_reopened else [], "newSequences": rows,
    "boundary": "Composed reference-player RGB in unchanged 3x3 source neighborhoods, both densities; human and native acceptance remain separate"})
assert passed, "Static surface continuity exceeds the retained 2% boundary allowance"
