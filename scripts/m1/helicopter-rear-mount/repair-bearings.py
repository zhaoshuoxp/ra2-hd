"""Register the rear hub against each retained authored body view."""

import hashlib
import json
import math
import os
from pathlib import Path

root = Path.cwd()
old = root / ".local/hd-packs/allied-shad-vxl/rotor-r2"
new = old.parent / "rear-mount-r4"
new.mkdir(exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((old / "manifest.json").read_text())
manifest["revision"] = "rear-mount-r4"
rear, body = manifest["parts"][0], manifest["parts"][2]
assert rear["section"] == "CYLINDER18" and body["section"] == "DUMMY01"
targets = [[46.5, 93], [55, 123], [194, 88], [258.5, 4], [186.5, 11], [55.5, 31], [50, 6.5], [55.5, 4]]
scale = 6.0339778661252055


def project(v):
    x, y, z = v
    camera_x, camera_z = (x - z) / math.sqrt(2), (x + z) / math.sqrt(2)
    return [camera_x / scale, (-math.cos(math.pi / 6) * y + camera_z / 2) / scale]


for i, frame in enumerate(rear["frames"]):
    bf = body["frames"][i]
    origin = project(bf["referenceOrigin"])
    target = [bf["offset"][j] + origin[j] + targets[i][j] / 4 for j in range(2)]
    linear = frame["referenceLinear"]
    axes = [project(linear[c:c + 3]) for c in [0, 4, 8]]
    delta = [target[j] - axes[2][j] * 1.993475 for j in range(2)]
    x = delta[0] / axes[0][0] if abs(axes[0][0]) > 0.1 else 9.75
    y = 0 if abs(axes[0][0]) > 0.1 else (delta[0] - axes[0][0] * x) / axes[1][0]
    z = (delta[1] - axes[0][1] * x - axes[1][1] * y) / axes[2][1]
    frame["rotorMountOffset"] = [round(v, 6) for v in [x, y, z]]
for part in manifest["parts"]:
    for file in part["files"].values():
        assert sha(old / file["file"]) == file["sha256"]
        os.link(old / file["file"], new / file["file"])
manifest["rearMountCorrection"] = {
    "previousSha256": sha(old / "manifest.json"),
    "coordinates": "Native rotor parent: positive X forward, positive Z upward",
    "policy": "Use the visible body bearing's mount, independent of blade spin and density",
    "authoredTailMountPixels": targets,
    "mountSurfaces": ["rear deck"] * 3 + ["painted tail shaft"] * 5,
    "atlasBytes": "UNCHANGED", "bodyRegistration": "UNCHANGED",
    "frontRotor": "UNCHANGED", "bellyDepthEnvelope": "UNCHANGED",
}
(new / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
file = root / "desktop/allied-unit-contracts.json"
catalog = json.loads(file.read_text())
entry = catalog["vxl"]["SHAD"]
assert entry["hash"] == sha(old.parent / "rear-mount-r3/manifest.json")
entry.update(hash=sha(new / "manifest.json"), path="hd-packs/allied-shad-vxl/rear-mount-r4/manifest.json")
file.write_text(json.dumps(catalog, indent=2) + "\n")
print(json.dumps({"hash": entry["hash"], "mounts": [f["rotorMountOffset"] for f in rear["frames"]]}))
