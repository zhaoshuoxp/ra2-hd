"""Retain finalized reports and selected journals without copying test profiles."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HISTORY = ROOT.parent / "project-history/yr-campaign-implementation-20261104"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def retain(source, destination):
    raw = source.read_bytes()
    if destination.exists():
        compressed = destination.read_bytes()
        if gzip.decompress(compressed) != raw:
            raise ValueError(f"Finalized evidence changed: {destination}")
    else:
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as output:
            output.write(compressed)
    return {"file": destination.name, "sha256": sha(compressed), "reportSha256": sha(raw)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", action="append", default=[])
    parser.add_argument("--report-tree", action="append", default=[],
        help="Also retain finalized reports in an explicit nested task artifact directory.")
    args = parser.parse_args()
    directory = HISTORY / "Evidence"
    index_file = directory / "index.json"
    index = json.loads(index_file.read_text())
    records = {row["file"]: row for row in index["records"]}
    added = []
    artifacts = ROOT / ".artifacts/yr-campaign"
    sources = set(artifacts.glob("*/report.json"))
    for relative in args.report_tree:
        tree = (ROOT / relative).resolve()
        if not tree.is_relative_to(artifacts) or not tree.is_dir():
            raise ValueError("Only this task's explicit diagnostic report trees are admitted")
        sources.update(tree.rglob("report.json"))
    for source in sorted(sources):
        report = json.loads(source.read_text())
        if not report.get("status") or report["status"] == "RUNNING":
            continue
        parts = source.relative_to(artifacts).parent.parts
        if any("__" in part for part in parts):
            raise ValueError("Ambiguous flattened report path")
        row = retain(source, directory / ("__".join(parts) + ".json.gz"))
        row["status"] = report["status"]
        if row["file"] not in records:
            added.append(row["file"])
        elif records[row["file"]] != row:
            raise ValueError(f"Indexed evidence changed: {row['file']}")
        records[row["file"]] = row
    index["records"] = sorted(records.values(), key=lambda row: row["file"])
    index_file.write_text(json.dumps(index, indent=2) + "\n")
    checkpoints = HISTORY / "Checkpoints"
    for relative in args.checkpoint:
        source = (ROOT / relative).resolve()
        if not source.is_relative_to(ROOT / ".artifacts/yr-campaign"):
            raise ValueError("Only this task's explicit diagnostic journals are admitted")
        retain(source, checkpoints / (source.parent.name + "-" + source.name + ".gz"))
    journal_index = []
    for file in sorted(checkpoints.glob("*.json.gz")):
        compressed = file.read_bytes()
        raw = gzip.decompress(compressed)
        saved = json.loads(raw)
        journal_index.append({"file": file.name, "sha256": sha(compressed), "rawSha256": sha(raw),
            "tick": saved.get("tick"), "identity": saved.get("identity", saved.get("launch")),
            "qualification": "Historical diagnostic evidence; public missions initialize from original source maps."})
    (checkpoints / "index.json").write_text(json.dumps({"schema": "yr-selected-journal-index-v1",
        "records": journal_index}, indent=2) + "\n")
    print(json.dumps({"reports": len(records), "added": added, "selectedJournals": len(journal_index)}))


if __name__ == "__main__":
    main()
