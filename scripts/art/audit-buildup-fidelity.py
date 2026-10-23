"""Audit R20 material provenance independently of geometry/runtime acceptance."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np

from buildup import MaterialDonor, native_indices

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("findings", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
assert not args.output.exists()
authoring = json.loads(args.authoring.read_text())
findings = {r["key"]: r for r in json.loads(args.findings.read_text())["ledger"]}
rows = []
for family in authoring["families"]:
    raw = json.loads(Path(family["nativeSource"]).read_text())
    palette = np.array(family["palette"], np.uint8)
    native = [native_indices(raw, n) for n in range(family["frames"])]
    donor = MaterialDonor(native[-1], palette)
    ledger = findings[family["key"]]
    owner_only = "OWNER" in ledger["repairMode"]
    native_replacement = bool(ledger.get("nativeColorConstructionSurfaces"))
    phases = []
    for n, source in enumerate(native[:-1]):
        # Fully remapped owner RGB is replaced by the shader. It cannot prove
        # authored neutral material detail and is excluded from this metric.
        occupied = (source > 0) & ~((source >= 16) & (source <= 31))
        total = int(occupied.sum())
        if owner_only:
            phases.append({"phase": n, "neutralSourcePixels": total,
                           "status": "PREVIOUS_HD_RGB_RETAINED"})
            continue
        _, _, confidence = donor.correspondence(source)
        weight = np.where(confidence == 1, 1, 0) if native_replacement else confidence
        uncertain = occupied & (confidence < 1)
        dominated = occupied & (weight < .5)
        phases.append({"phase": n, "neutralSourcePixels": total,
                       "unstableSourcePixels": int(uncertain.sum()),
                       "nativeDominatedPixelsLowerBound": int(dominated.sum()),
                       "nativeColorContributionLowerBound": float((1 - weight[occupied]).sum())})
    total = sum(p["neutralSourcePixels"] for p in phases)
    dominated = sum(p.get("nativeDominatedPixelsLowerBound", 0) for p in phases)
    row = {"key": family["key"], "identity": family["identity"],
           "theater": family["theater"], "phases": phases,
           "neutralSourcePixels": total,
           "nativeDominatedFractionLowerBound": None if owner_only or not total else dominated / total,
           "mode": "RETAINED_HD_OWNER_DATA_ONLY" if owner_only else
                   "UNCERTAIN_SURFACES_NATIVE_COLOR" if native_replacement else
                   "NATIVE_COLOR_PLUS_MAX_60_PERCENT_UNSTABLE_HD_BLEND",
           "terminalSourceColorRepair": bool(family.get("terminalRepairedFromNative"))}
    rows.append(row)
    print(family["key"], row["nativeDominatedFractionLowerBound"], flush=True)
pixels = sum(r["neutralSourcePixels"] for r in rows if r["mode"] != "RETAINED_HD_OWNER_DATA_ONLY")
dominated = sum(sum(p.get("nativeDominatedPixelsLowerBound", 0) for p in r["phases"]) for r in rows)
result = {"status": "R20_HD_ARTWORK_QUALITY_REOPENED_BY_USER",
          "authoringSha256": hashlib.sha256(args.authoring.read_bytes()).hexdigest(),
          "selectedSequences": len(rows),
          "nativeDominatedIntermediateNeutralFractionLowerBound": dominated / pixels,
          "sequencesWithMajorityNativeDominatedNeutralPixels": sum(
              (r["nativeDominatedFractionLowerBound"] or 0) > .5 for r in rows),
          "boundary": "Conservative algorithm provenance, not a perceptual quality score. "
                      "Actual donor alpha can only increase native color contribution. "
                      "Terminal and shader-replaced owner RGB are excluded. "
                      "Native geometry/runtime passes do not establish HD material acceptance.",
          "rows": rows}
args.output.write_text(json.dumps(result, indent=2) + "\n")
with args.output.with_suffix(".csv").open("w", newline="") as stream:
    keys = ["key", "identity", "theater", "neutralSourcePixels",
            "nativeDominatedFractionLowerBound", "mode", "terminalSourceColorRepair"]
    writer = csv.DictWriter(stream, fieldnames=keys)
    writer.writeheader()
    writer.writerows({k: r[k] for k in keys} for r in rows)
print(json.dumps({k: v for k, v in result.items() if k != "rows"}))
