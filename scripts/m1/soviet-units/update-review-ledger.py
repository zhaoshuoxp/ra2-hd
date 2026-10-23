"""Advance representative exports without resetting recorded acceptance or production."""

import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("manifest", type=Path)
args = parser.parse_args()
root = Path(".artifacts/m1-7")
ledger_path = root / "ledger.json"
ledger = json.loads(ledger_path.read_text())
exports = json.loads(args.manifest.read_text())
for identity, artwork in exports["families"].items():
    family = ledger["families"][identity]
    previous = family["artwork"]
    if family["representativeAcceptance"] == "ACCEPTED":
        assert artwork["rawSha256"] == previous["rawSha256"], identity
        for old, new in zip(previous["samples"], artwork["samples"], strict=True):
            for role in ["candidate", "original", "detail"]:
                assert old["files"][role]["sha256"] == new["files"][role]["sha256"], (
                    identity,
                    role,
                )
    family["artwork"] = artwork
ledger["currentReviewExports"] = str(args.manifest)
ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
print("Review exports advanced; all accepted representative pixels preserved.")
