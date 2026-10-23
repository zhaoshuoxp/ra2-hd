"""Create an immutable SHAD boundary correction; retain every atlas byte."""

import hashlib
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "allied-units"))
from vxl_depth_bounds import cover_registered_frames

root = Path.cwd()
old = root / ".local/hd-packs/allied-shad-vxl/owner-r3"
new = old.parent / "belly-r1"
new.mkdir(exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((old / "manifest.json").read_text())
previous_bounds = manifest["parts"][0]["depthBounds"]
manifest["revision"] = "belly-r1"
bounds = cover_registered_frames(manifest["parts"])
manifest["depthBoundsCorrection"] = {
    "previousSha256": sha(old / "manifest.json"),
    "previousBounds": previous_bounds,
    "policy": "Shared actor envelope includes registered component origins at every bearing",
    "atlasBytes": "UNCHANGED",
    "imageRegistration": "UNCHANGED",
}
files = []
for part in manifest["parts"]:
    for entry in part["files"].values():
        source, destination = old / entry["file"], new / entry["file"]
        assert sha(source) == entry["sha256"]
        os.link(source, destination)
        assert sha(destination) == entry["sha256"]
        files.append(entry)
(new / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
catalog_path = root / "desktop/allied-unit-contracts.json"
catalog = json.loads(catalog_path.read_text())
entry = catalog["vxl"]["SHAD"]
assert entry["hash"] == sha(old / "manifest.json")
entry.update(hash=sha(new / "manifest.json"), path="hd-packs/allied-shad-vxl/belly-r1/manifest.json")
catalog_path.write_text(json.dumps(catalog, indent=2) + "\n")
report = {
    "status": "PASS_ATLAS_AND_REGISTRATION_PRESERVATION",
    "previousManifest": str(old / "manifest.json"),
    "manifest": str(new / "manifest.json"),
    "sha256": entry["hash"], "previousBounds": previous_bounds,
    "correctedBounds": bounds, "unchangedFiles": files,
    "changedBindings": ["SHAD"],
}
(root / ".artifacts/helicopter-belly-r1/metadata.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"hash": entry["hash"], "bounds": bounds, "unchangedAtlasFiles": len(files)}))
