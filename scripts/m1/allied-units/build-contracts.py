"""Pin complete staged families for the shared runtime and desktop registries."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("selection", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(".artifacts/allied-units")
staged = root / "staged-packs"
selected = json.loads(args.selection.read_text())
shp_work = json.loads((root / "production-shp-v3/worklist.json").read_text())["families"]
vxl_work = json.loads((root / "production-vxl-boards-v1/worklist.json").read_text())["boards"]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
catalog = {"status": "REVIEW_CANDIDATES_RUNTIME_AND_FINAL_ACCEPTANCE_PENDING", "shp": {}, "vxl": {}}

for identity, selection in selected.get("shp", {}).items():
    required = shp_work[identity]["members"]
    members, contracts = [], []
    for relative in selection["packs"]:
        path = staged / relative
        assert path.resolve().is_relative_to(staged.resolve())
        m = json.loads(path.read_text())
        assert m["rulesIdentities"] == [identity]
        source_name = m["source"]["member"]
        native = next(item for item in required if item["sourceMember"] == source_name)
        source = json.loads(Path(native["sourceFile"]).read_text())
        assert m["source"]["sha256"] == source["sha256"]
        assert len(m["logical"]["frames"]) == native["requiredSlots"]
        assert [v["density"] for v in m["variants"]] in ([2], [4])
        members.append({"member": source_name, "packId": m["packId"],
                        "revision": m["packRevision"], "sha256": digest(path)})
        contracts.append({"member": source_name, "frames": native["requiredSlots"],
                          "totalFrames": source["totalFrames"], "canvas": source["canvas"],
                          "sourceHash": source["sha256"], "manifestHash": digest(path)})
    assert sorted(m["member"] for m in members) == sorted(m["sourceMember"] for m in required)
    family = {"identity": identity, "theater": "TEMPERATE", "members": members}
    relative = Path(f"allied-{identity.lower()}-family") / str(selection["revision"]) / "family.json"
    path = staged / relative
    data = json.dumps(family, indent=2) + "\n"
    if path.exists():
        assert path.read_text() == data, "A family revision is immutable"
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)
    contract = {"identity": identity, "familyPath": "hd-packs/" + str(relative),
                "hash": digest(path), "familyHash": digest(path), "members": contracts,
                "projectiles": ([{"weapon": "GoodTeeth", "projectile": "ADOGJUMP", "member": "adogp.shp"}]
                                if identity == "ADOG" else [])}
    if identity == "GGI":
        contract["edition"] = "yr"
    catalog["shp"][identity] = contract

for identity, relative in selected.get("vxl", {}).items():
    path = staged / relative
    assert path.resolve().is_relative_to(staged.resolve())
    m = json.loads(path.read_text())
    assert m["identity"] == identity and m["density"] in [2, 4]
    required = [b for b in vxl_work if b["family"] == identity]
    assert sorted((b["identity"], b["part"]) for b in required) == sorted((p["actor"], p["key"]) for p in m["parts"])
    members = sorted(set(b["sourceMember"] for b in required))
    assert members == sorted(n for n in m["sources"] if n.endswith(".vxl"))
    contract = {"hash": digest(path), "members": members, "density": m["density"], "path": "hd-packs/" + relative}
    if identity in ["ROBO", "BFRT"]:
        contract["edition"] = "yr"
    catalog["vxl"][identity] = contract

args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open("x") as file:
    file.write(json.dumps(catalog, indent=2) + "\n")
print(json.dumps({kind: len(catalog[kind]) for kind in ["shp", "vxl"]}))
