"""Align the rear SHAD joint with the retained authored tail pylon."""

import hashlib
import json
import os
from pathlib import Path

root = Path.cwd()
old = root / ".local/hd-packs/allied-shad-vxl/rotor-r2"
new = old.parent / "rear-mount-r3"
new.mkdir(exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((old / "manifest.json").read_text())
manifest["revision"] = "rear-mount-r3"
for part in manifest["parts"]:
    if part["section"] == "CYLINDER18":
        part["rotorMountOffset"] = [9.75, 0, -3.5]
    for file in part["files"].values():
        assert sha(old / file["file"]) == file["sha256"]
        os.link(old / file["file"], new / file["file"])
manifest["rearMountCorrection"] = {
    "previousSha256": sha(old / "manifest.json"),
    "coordinates": "Native rotor parent: positive X forward, positive Z upward",
    "policy": "Translate the complete rear joint independently of blade spin",
    "authoredTailShaftPixels": {"135": [258.5, 4], "315": [55.5, 4]},
    "atlasBytes": "UNCHANGED", "bodyRegistration": "UNCHANGED",
    "frontRotor": "UNCHANGED", "bellyDepthEnvelope": "UNCHANGED",
}
(new / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
file = root / "desktop/allied-unit-contracts.json"
catalog = json.loads(file.read_text())
entry = catalog["vxl"]["SHAD"]
assert entry["hash"] == sha(old / "manifest.json")
entry.update(hash=sha(new / "manifest.json"), path="hd-packs/allied-shad-vxl/rear-mount-r3/manifest.json")
file.write_text(json.dumps(catalog, indent=2) + "\n")
print(json.dumps({"hash": entry["hash"], "rearMountOffset": [9.75, 0, -3.5]}))
