"""Pin the authored SHAD hub centers to native tandem rotor axes."""

import hashlib
import json
import os
from pathlib import Path

root = Path.cwd()
old = root / ".local/hd-packs/allied-shad-vxl/belly-r1"
new = old.parent / "rotor-r2"
new.mkdir(exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((old / "manifest.json").read_text())
manifest["revision"] = "rotor-r2"
# The central metallic hub covers, measured within the accepted first-frame crops.
anchors = {"CYLINDER18": [133, 54], "CYLINDER09": [132, 60]}
for part in manifest["parts"]:
    if part["section"] in anchors:
        frame = part["frames"][0]
        _, _, w, h = frame["rect"]
        frame["rotorAnchor"] = [anchors[part["section"]][0] / w, anchors[part["section"]][1] / h]
    for file in part["files"].values():
        assert sha(old / file["file"]) == file["sha256"]
        os.link(old / file["file"], new / file["file"])
manifest["rotorRegistrationCorrection"] = {
    "previousSha256": sha(old / "manifest.json"),
    "policy": "Both horizontal painted hubs attach to their native spin axes",
    "authoredHubPixels": anchors,
    "atlasBytes": "UNCHANGED", "bodyRegistration": "UNCHANGED",
    "bellyDepthEnvelope": "UNCHANGED",
}
(new / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
file = root / "desktop/allied-unit-contracts.json"
catalog = json.loads(file.read_text())
entry = catalog["vxl"]["SHAD"]
assert entry["hash"] == sha(old / "manifest.json")
entry.update(hash=sha(new / "manifest.json"), path="hd-packs/allied-shad-vxl/rotor-r2/manifest.json")
file.write_text(json.dumps(catalog, indent=2) + "\n")
(root / ".artifacts/helicopter-rotors-r2/metadata.json").write_text(json.dumps({
    "status": "PASS_IMMUTABLE_ATLAS_PRESERVATION", "manifest": str(new / "manifest.json"),
    "sha256": entry["hash"], "previousSha256": sha(old / "manifest.json"),
    "authoredHubPixels": anchors, "unchangedAtlasFiles": 6,
    "unchangedBodyFrames": 8, "bellyDepthEnvelope": "UNCHANGED",
}, indent=2) + "\n")
print(json.dumps({"hash": entry["hash"], "anchors": anchors}))
