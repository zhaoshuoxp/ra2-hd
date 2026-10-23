"""Independently check static-source flicker and exact geometry/state preservation."""
import argparse
from pathlib import Path

import numpy as np
from scipy.ndimage import minimum_filter

from buildup import native_indices, read, sha, unpack, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("candidate", type=Path)
parser.add_argument("previous", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
candidate, previous = read(args.candidate), read(args.previous)
rows, totals = [], np.zeros(3, np.int64)
for record in candidate["families"]:
    old = next(r for r in previous["families"] if r["key"] == record["key"])
    if record["key"] not in candidate["hdRepaintProgress"]["registeredCandidateKeys"]:
        assert old == record
        continue
    roots = [Path(".local/hd-packs") / r["newMember"]["packId"] / r["newMember"]["revision"] for r in (old, record)]
    manifests = [read(root / "manifest.json") for root in roots]
    assert manifests[0]["source"] == manifests[1]["source"]
    assert manifests[0]["logical"] == manifests[1]["logical"]
    families = [read(r["newFamilyPath"])["members"] for r in (old, record)]
    assert families[1] == [record["newMember"] if m == old["newMember"] else m for m in families[0]]
    raw = read(record["nativeSource"])
    masks = [native_indices(raw, n) for n in range(record["frames"])]
    palette = np.array(record["palette"], float) / 255
    def rendered(pair):
        base, data = pair
        weight = data[..., :1] / 255
        convert = lambda a: np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
        light = convert(base[..., :3] / 255) * (1 - weight) + convert(palette[16 + data[..., 1]]) * weight
        return np.where(light <= .0031308, light * 12.92, 1.055 * light ** (1 / 2.4) - .055) * 255
    frame_rows, total = [], np.zeros(3, np.int64)
    for density in (2, 4):
        canvases = [[[unpack(root, m, density, n, role) for role in ("base", "data")]
                     for n in range(record["frames"])] for root, m in zip(roots, manifests)]
        assert all(np.array_equal(a, b) for a, b in zip(canvases[0][-1], canvases[1][-1]))
        for n, (before, after) in enumerate(zip(*canvases)):
            assert np.array_equal(before[0][..., 3], after[0][..., 3]), "Alpha or part order changed"
            assert np.array_equal(before[1][..., 3], after[1][..., 3])
            if n == 0:
                continue
            fixed = minimum_filter((masks[n] == masks[n-1]) & (masks[n] > 0), size=3,
                                   mode="constant", cval=0).astype(bool)
            fixed = np.repeat(np.repeat(fixed, density, axis=0), density, axis=1)
            count = int(fixed.sum())
            differences = []
            for sequence in canvases:
                left, right = sequence[n-1], sequence[n]
                pixels = fixed & (left[0][..., 3] >= 128) & (right[0][..., 3] >= 128)
                # Palette IDs are inactive at zero owner weight. Measure actual
                # composed RGB so invisible data differences cannot count as
                # flicker, or hide a visible base/owner cancellation error.
                changed = np.abs(rendered(left) - rendered(right)).max(axis=2) > 8
                differences.append(int(changed[pixels].sum()))
            total += [count, *differences]
            frame_rows.append({"phase": n, "density": density, "unchangedSourceTexels": count,
                               "beforeChangedTexels": differences[0], "afterChangedTexels": differences[1]})
    reduction = 1 - total[2] / total[1]
    assert reduction >= .98, f"{record['key']}: static texture change remains excessive ({reduction})"
    rows.append({"key": record["key"], "unchangedSourceTexels": int(total[0]),
                 "beforeChangedTexels": int(total[1]), "afterChangedTexels": int(total[2]),
                 "changedTexelReduction": float(reduction), "frames": frame_rows,
                 "terminal": "EXACT_PREDECESSOR", "alphaSourceLogicalAndNonMK": "EXACT_PREDECESSOR"})
    totals += total
write(args.output, {"status": "PASS_STATIC_SOURCE_TEXTURE_CONTINUITY_AND_EXACT_PRESERVATION",
    "sourceAuthoringSha256": sha(args.previous), "candidateAuthoringSha256": sha(args.candidate),
    "sequences": rows, "beforeChangedTexels": int(totals[1]), "afterChangedTexels": int(totals[2]),
    "changedTexelReduction": float(1 - totals[2] / totals[1]),
    "boundary": "Unchanged 3x3 native neighborhoods, both densities; visual acceptance and native gameplay are separate"})
print(len(rows), "sequences; static texture-change reduction", f"{1 - totals[2] / totals[1]:.4%}")
