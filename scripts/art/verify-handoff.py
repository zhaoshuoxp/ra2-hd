"""Verify the offline delivery and optionally clone a new isolated source checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
parser.add_argument("--target", type=Path, help="New, nonexistent source checkout; never an existing repository")
args = parser.parse_args()
root = args.root.resolve()
manifest = json.loads((root / "MANIFEST.json").read_text())


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_path(relative):
    parts = Path(relative)
    assert not parts.is_absolute() and ".." not in parts.parts and "\\" not in relative
    file = root / parts
    assert file.parent.resolve().is_relative_to(root), relative
    return file


for row in manifest["files"]:
    file = safe_path(row["file"])
    if "link" in row:
        assert file.is_symlink() and os.readlink(file) == row["link"], row["file"]
        assert file.resolve().is_relative_to(root), row["file"]
    else:
        assert not file.is_symlink() and file.is_file(), row["file"]
        assert file.stat().st_size == row["bytes"] and digest(file) == row["sha256"], row["file"]
print(f"PASS: {len(manifest['files'])} delivery entries verified")

if args.target:
    plan = json.loads((root / "SOURCE-PLAN.json").read_text())
    target = args.target.resolve()
    assert not target.exists(), "Choose a new directory; existing repositories and resources are never overwritten"
    assert not target.is_relative_to(root), "Stage outside the delivery directory"
    bundle = safe_path(plan["bundle"])
    subprocess.run(["git", "clone", "--branch", plan["branch"], str(bundle), str(target)], check=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=target, text=True).strip()
    assert head == plan["head"]
    files = []
    for prefix in (plan["worldRoot"], plan["uiRoot"]):
        for row in manifest["files"]:
            if row["file"].startswith(prefix + "/"):
                relative = Path(row["file"]).relative_to(prefix)
                destination = target / ".local" / relative
                assert not destination.exists() and not destination.is_symlink(), relative
                files.append((row, destination))
    assert len({str(destination).casefold() for _, destination in files}) == len(files)
    for row, destination in files:
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation is the additive transfer contract on every platform.
        with safe_path(row["file"]).open("rb") as source, destination.open("xb") as output:
            shutil.copyfileobj(source, output, 1024 * 1024)
        assert digest(destination) == row["sha256"], row["file"]
    receipt = {"status": "PASS_NEW_ISOLATED_SOURCE_AND_RESOURCE_STAGE", "head": head,
               "resourceFiles": len(files), "transfer": "ADD_IF_ABSENT_ONLY", "sourceRoot": str(target)}
    evidence = target / ".artifacts" / "buildup-handoff-stage"
    evidence.mkdir(parents=True, exist_ok=False)
    (evidence / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))
