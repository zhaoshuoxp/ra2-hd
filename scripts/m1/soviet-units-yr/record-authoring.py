"""Preserve one built-in generated board and update its task-owned worklist."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("worklist", type=Path)
parser.add_argument("identity")
parser.add_argument("batch")
parser.add_argument("generated", type=Path)
parser.add_argument("--revision", type=int, default=1)
parser.add_argument("--prompt", type=Path)
args = parser.parse_args()
root = Path(".artifacts/m1-7-yr").resolve()
assert root in args.worklist.resolve().parents
work = json.loads(args.worklist.read_text())
family = work["families"][args.identity]
member, batch = next(
    (m, b) for m in family["members"] for b in m["batches"] if b["id"] == args.batch
)
assert args.revision > 0
assert args.revision > 1 or not batch.get(
    "selectedArt"
), "Use a new revision for corrections."
if batch.get("selectedArt"):
    assert args.prompt, "Save the exact correction prompt."
    batch.setdefault("history", []).append(
        {
            key: batch[key]
            for key in ["selectedArt", "selectedArtSha256", "status", "qaIssue"]
            if key in batch
        }
    )
output = Path(batch["prompt"]).parent / f"raw-v{args.revision}.png"
assert root in output.resolve().parents and not output.exists()
shutil.copy2(args.generated, output)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(output) == sha(args.generated)
batch.update(
    selectedArt=str(output),
    selectedArtSha256=sha(output),
    generatedSource=str(args.generated),
    status="AUTHORED_PENDING_EXPORT_QA",
)
batch["promptSha256"] = sha(Path(batch["prompt"]))
if args.prompt:
    batch["correctionPrompt"] = str(args.prompt)
    batch["correctionPromptSha256"] = sha(args.prompt)
selected = {sample["frame"] for sample in batch["samples"]}
for slot in member["slots"]:
    if slot["frame"] in selected:
        slot["status"] = "AUTHORED_PENDING_EXPORT_QA"
(output.parent / "batch.json").write_text(json.dumps(batch, indent=2) + "\n")
args.worklist.write_text(json.dumps(work, indent=2) + "\n")
ledger_path = root / "production-ledger.json"
ledger = json.loads(ledger_path.read_text())
production = ledger["families"][args.identity].setdefault("production", {})
authored = sum(
    len(b["samples"])
    for m in family["members"]
    for b in m["batches"]
    if b.get("selectedArt")
)
production.setdefault("worklists", {})[str(args.worklist)] = {
    "authoredFrames": authored,
    "requiredFrames": sum(m["requiredSlots"] for m in family["members"]),
    "status": "AUTHORED_PENDING_EXPORT_QA",
}
production["authoredFrames"] = sum(
    v["authoredFrames"] for v in production["worklists"].values()
)
production["status"] = "AUTHORING_IN_PROGRESS"
ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
print(
    json.dumps(
        {
            "identity": args.identity,
            "batch": args.batch,
            "path": str(output),
            "status": batch["status"],
        }
    )
)
