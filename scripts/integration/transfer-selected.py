"""Add only the accepted manifest closure, refusing every byte conflict."""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument("manifest", type=Path)
parser.add_argument("destination", type=Path)
parser.add_argument("report", type=Path)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
root = args.destination.resolve()
planned = []
for entry in manifest["resources"]:
    source = Path(entry["actualSource"])
    relative = Path(entry["relativeDestination"])
    assert not relative.is_absolute() and ".." not in relative.parts
    target = root / relative
    assert source.resolve() == source and not source.is_symlink(), source
    assert source.stat().st_size == entry["bytes"] and digest(source) == entry["sha256"], source
    state = "ADD" if not target.exists() else "IDENTICAL"
    if target.exists():
        assert target.resolve() == target and digest(target) == entry["sha256"], target
    planned.append((entry, source, target, state))
assert len(planned) == manifest["selectedResourceCount"]
assert sum(entry["bytes"] for entry, *_ in planned) == manifest["selectedResourceBytes"]
assert not args.report.exists(), args.report
args.report.parent.mkdir(parents=True, exist_ok=True)
rows = []
for entry, source, target, state in planned:
    if state == "ADD":
        target.parent.mkdir(parents=True, exist_ok=True)
        assert target.parent.resolve() == target.parent, target
        with source.open("rb") as incoming, target.open("xb") as outgoing:
            while block := incoming.read(1024 * 1024):
                outgoing.write(block)
    assert target.stat().st_size == entry["bytes"] and digest(target) == entry["sha256"], target
    rows.append({"source": str(source), "destination": str(target), "state": state,
                 "bytes": entry["bytes"], "sha256": entry["sha256"]})
report = {"status": "PASS_EXCLUSIVE_SELECTED_TRANSFER", "manifest": str(args.manifest.resolve()),
          "manifestSha256": digest(args.manifest), "files": rows, "count": len(rows),
          "added": sum(row["state"] == "ADD" for row in rows), "bytes": manifest["selectedResourceBytes"]}
with args.report.open("x") as stream:
    json.dump(report, stream, indent=2)
    stream.write("\n")
print(json.dumps({key: report[key] for key in ["status", "count", "added", "bytes"]}))
