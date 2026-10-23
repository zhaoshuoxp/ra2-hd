"""Create complete immutable family descriptors with exact retained turret copies."""
import argparse
import shutil
from pathlib import Path

from buildup import read, sha, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("previous", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--revision", required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring = read(args.previous / "authoring.json")
catalogs = {side: read(f"desktop/{side}-building-coverage.json") for side in ("allied", "soviet", "yuri")}
changes = []
for record in authoring["families"]:
    old_file = Path(record["newFamilyPath"])
    family = read(old_file)
    dependencies = [*(family.get("turrets", {}).items()),
        *(([("legacy", family["turret"])] if family.get("turret", {}).get("path") else []))]
    if not dependencies:
        continue
    new_file = old_file.parent.parent / args.revision / "family.json"
    for variant, binding in dependencies:
        old = Path(".local") / binding["path"]
        new = new_file.parent / ("turret" if variant == "legacy" else f"turrets/{variant}")
        shutil.copytree(old, new)
        for file in old.rglob("*"):
            if file.is_file():
                assert sha(new / file.relative_to(old)) == sha(file)
        assert sha(new / "manifest.json") == binding["sha256"]
        binding["path"] = new.relative_to(".local").as_posix() + "/"
    write(new_file, family)
    changes.append({"key": record["key"], "previousFamilySha256": sha(old_file), "newFamilySha256": sha(new_file),
        "newMemberSha256Unchanged": record["newMember"]["sha256"], "status": "EXACT_TURRET_COPY_AND_FAMILY_RELATIVE_BINDING"})
    record.update(newFamilyPath=str(new_file), newFamilySha256=sha(new_file))
    catalogs[record["side"]][record["key"]].update(familyPath=new_file.relative_to(".local").as_posix(), familyHash=sha(new_file))
for side, catalog in catalogs.items():
    write(f"desktop/{side}-building-coverage.json", catalog)
authoring["revision"] = "full-survey-20261011-r9"
write(args.output / "authoring.json", authoring)
for name in ("findings.json", "findings.csv", "complete-retail-roster.json", "edition-theater-sources.json"):
    shutil.copyfile(args.previous / name, args.output / name)
write(args.output / "retained-turrets.json", {"status": "PASS_EXACT_RETAINED_TURRET_DEPENDENCIES", "changes": changes})
print("COMPLETE_IMMUTABLE_TURRET_DEPENDENCIES", len(changes))
