"""Add selected immutable packs without replacing any installed pack file."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("catalog", type=Path)
args = parser.parse_args()
catalog = json.loads(args.catalog.read_text())
staged = Path(".artifacts/allied-units/staged-packs")
destination = Path(".local/hd-packs")
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = {}


def collect(relative, expected):
    path = staged / relative
    assert path.resolve().is_relative_to(staged.resolve()) and not path.is_symlink()
    assert hash_file(path) == expected, relative
    files[relative] = expected
    return json.loads(path.read_text()) if path.suffix == ".json" else None


for entry in catalog["shp"].values():
    family = collect(entry["familyPath"].removeprefix("hd-packs/"), entry["hash"])
    for member in family["members"]:
        directory = Path(member["packId"]) / member["revision"]
        pack = collect(str(directory / "manifest.json"), member["sha256"])
        for variant in pack["variants"]:
            for page in variant["pages"]:
                for role in ["base", "data"]:
                    collect(str(directory / page[role]), page[role + "Sha256"])
for entry in catalog["vxl"].values():
    relative = entry["path"].removeprefix("hd-packs/")
    pack = collect(relative, entry["hash"])
    for part in pack["parts"]:
        for asset in part["files"].values():
            collect(str(Path(relative).parent / asset["file"]), asset["sha256"])

# Preflight every collision before writing anything.
for relative, expected in files.items():
    path = destination / relative
    assert path.resolve().is_relative_to(destination.resolve()) and not path.is_symlink()
    assert not path.exists() or hash_file(path) == expected, f"Immutable pack collision: {path}"
for relative, expected in files.items():
    path = destination / relative
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with (staged / relative).open("rb") as source, path.open("xb") as output:
            shutil.copyfileobj(source, output)
    assert hash_file(path) == expected
Path("desktop/allied-unit-contracts.json").write_text(args.catalog.read_text())
print(f"Installed {len(files)} verified files; runtime and final acceptance pending")
