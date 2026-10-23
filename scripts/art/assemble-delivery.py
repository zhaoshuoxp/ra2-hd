"""Assemble independently copied Mac and portable Windows artwork deliveries."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
os.chdir(repo)
args.output.mkdir(parents=True, exist_ok=False)
baseline = "748d0998aaf663acda8807c158155bf0a5bb157b"
branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
assert not subprocess.check_output(["git", "status", "--porcelain"], text=True), "Commit the complete bounded handoff first"
matrix_file = Path(".artifacts/buildup-native-20261011-r4-matrix.json")
matrix = json.loads(matrix_file.read_text())
assert matrix["status"] == "PASS_COMPLETE_NATIVE_MATRIX" and len(matrix["entries"]) == 10
art = Path(".artifacts/buildup-art-20261011-final-r4")
assert json.loads((art / "validation.json").read_text())["status"].startswith("PASS")


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def clone(source, target):
    assert not target.exists()
    subprocess.run(["cp", "-cR", str(source), str(target)], check=True)


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + "\n")


deliveries = []
for platform, receipt_file in (
    ("Mac", ".artifacts/buildup-mac-20261011-r4-v1/package/package-receipt.json"),
    ("Windows-Return", ".artifacts/buildup-windows-20261011-r4-v2/package-receipt.json"),
):
    package = json.loads(Path(receipt_file).read_text())
    root = args.output / f"RA2-HD-Native-Buildup-Art-20261011-{platform}"
    clone(Path(package["folder"]), root)
    # Verify all copied payload entries before adding task-specific instructions.
    for row in package["files"]:
        file = root / row["file"]
        if "link" in row:
            assert file.is_symlink() and os.readlink(file) == row["link"]
        else:
            assert file.stat().st_size == row["bytes"] and digest(file) == row["sha256"]
    evidence = root / "Evidence"
    evidence.mkdir()
    shutil.copyfile(receipt_file, evidence / "packaging-before-annotation.json")
    shutil.copyfile(root / "START-HERE.txt", evidence / "inherited-start-here.txt")
    clone(art / "review-v2", root / "Art-Review")
    clone(Path(".artifacts/buildup-review-ui-20261011-r4-v2"), evidence / "review-browser")
    shutil.copyfile(art / "authoring.json", evidence / "authoring.json")
    shutil.copyfile(art / "validation.json", evidence / "validation.json")
    shutil.copyfile(art / "native-summary.json", evidence / "native-summary.json")
    bootstrap = Path(".artifacts/buildup-portable-bootstrap-20261011-r4-v1")
    shutil.copyfile(bootstrap / "portable-bootstrap-report.json", evidence / "portable-bootstrap-report.json")
    shutil.copyfile(bootstrap / "portable-bootstrap-menu.png", evidence / "portable-bootstrap-menu.png")
    shutil.copyfile(matrix_file, evidence / "native-matrix.json")
    native = evidence / "Native"
    native.mkdir()
    for entry in matrix["entries"]:
        source = Path(entry["output"])
        assert digest(source / "report.json") == entry["reportSha256"]
        target = native / source.name
        target.mkdir()
        for file in source.iterdir():
            if file.is_file() and file.suffix in (".json", ".png", ".webm"):
                shutil.copyfile(file, target / file.name)
    logs = evidence / "Logs"
    logs.mkdir()
    for name in ("final-validation", "final-focused", "final-yuri", "typecheck", "typecheck-v2",
                 "prepared-v3", "package", "windows-package-v2", "native-matrix", "review-ui-v2",
                 "portable-startup", "portable-bootstrap"):
        shutil.copyfile(Path("/private/tmp") / f"ra2-buildup-{name}.log", logs / f"{name}.log")
    shutil.copyfile(repo / "docs/native-buildup-art-20261011.md", root / "ARTWORK-REPORT.md")
    shutil.copyfile(repo / "scripts/art/verify-handoff.py", root / "verify-handoff.py")
    selection = json.loads((art / "authoring.json").read_text())
    save(root / "ART-SELECTION.json", {"baseline": baseline, "sourceHead": head,
        "families": [{k: row[k] for k in ("key", "identity", "theater", "side", "frames", "newMember",
                      "newFamilySha256")} for row in selection["families"]]})
    if platform == "Mac":
        launch = "Open Red Alert 2 HD Native Buildup Art R4.app. Keep the two sibling resource folders together."
        status = "MAC_CONTROLLED_NATIVE_MATRIX_PASS / USER_VISUAL_ACCEPTANCE_PENDING"
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(root / Path(package["app"]).name)], check=True)
        instructions = "Artwork feedback and acceptance belong in the current artwork conversation."
    else:
        launch = "Run Red Alert 2 HD.exe or Launch-Isolated-Review.cmd. No Node, Bun or separate browser is required."
        status = "WINDOWS_STATIC_PACKAGE_PASS / WINDOWS_RUNTIME_NOT_RUN / USER_VISUAL_ACCEPTANCE_PENDING"
        source = root / "Source"
        source.mkdir()
        bundle = source / "buildup-art.bundle"
        subprocess.run(["git", "bundle", "create", str(bundle), branch], check=True)
        subprocess.run(["git", "bundle", "verify", str(bundle)], check=True)
        subprocess.run(["git", "archive", "--format=zip", "--output=" + str(source / "source.zip"), head], check=True)
        with (source / "changes-from-748d099.patch").open("wb") as stream:
            subprocess.run(["git", "diff", "--binary", baseline, head], stdout=stream, check=True)
        save(root / "SOURCE-PLAN.json", {"head": head, "branch": branch, "baseline": baseline,
            "bundle": "Source/buildup-art.bundle", "worldRoot": "RA2-HD-Editions-Resources",
            "uiRoot": "RA2-HD-UI-Resources", "transfer": "NEW_CHECKOUT_ADD_IF_ABSENT_ONLY"})
        instructions = """For the existing Windows agent conversation:
1. Verify all payloads: python verify-handoff.py
2. Create a NEW source directory: python verify-handoff.py --target "D:\\RA2\\buildup-art-work"
   Choose an unused directory. The tool clones the bundled branch and hash-checks
   additive resources. Existing repositories, profiles and accepted resources are untouched.
3. Install source dependencies there using the repository's pinned package/lock files.
   Launch the supplied portable game first to check artwork independently of a new build.
4. After user artwork acceptance, freeze this candidate's matched Windows baseline,
   then continue the deferred construction-yard deployment and 90+ FPS investigation.
   This package includes accepted M2.3 main plus returned culling/animation repairs;
   its measurements cannot be compared to the old C9 baseline as a single art change.

Source/source.zip is a tracked-source snapshot; Source/buildup-art.bundle retains
the full branch history. SOURCE-PLAN.json uses only delivery-relative paths.
Evidence raw reports retain Mac provenance paths; Windows launch/staging do not use them.
The artwork authoring script also requires retained predecessor assets to reproduce
the old-HD comparison; that historical dataset is preserved in the Mac artwork worktree.
"""
    (root / "START-HERE.txt").write_text(f"""RA2 HD Original-guided buildup artwork — 2026-10-11

Extract the entire ZIP to a writable folder; do not launch inside the ZIP.
{launch}
Each delivery has independent resources and creates a private profile in its own folder.

Open Art-Review/Buildup-Art-Review.html for nine offline same-phase comparisons
of Original, 748d099 HD and the repaired candidate. Check 2X/4X, temperate/snow,
native and quarter speed, build and reverse. All review images are embedded.
Affected: GACNST, GAWEAP, GATECH, YAWEAP, YATECH, YABRCK, NAPSIS, NALASR, NAWEAP.
20 sequence selections / 956 density-frame combinations. Intermediate geometry
follows Original, registered accepted HD material is transferred, and construction-only
surfaces retain source color/detail. Completed HD frames and non-MK members are preserved.

Status: {status}
Copied Mac checks: 8 HD edition/theater/density sessions, 60 native building cases,
plus 2 Original control sessions with 15 cases. Build/sale, requested member binding,
all same-phase GPU captures, fixed budget and page/WebGL checks pass.
No Windows runtime, 90+ FPS, deployment optimization or physical-input acceptance is claimed.

Tracked artwork/runtime selection: {package.get('runtimeSourceHead', package.get('gameplaySourceHead'))}
Complete source and handoff closure: {head}
Base main: {baseline}
Main promotion and remote push have not occurred.
{instructions}
""")
    files = []
    for file in sorted(root.rglob("*")):
        relative = file.relative_to(root).as_posix()
        if file.is_symlink():
            files.append({"file": relative, "link": os.readlink(file)})
        elif file.is_file():
            files.append({"file": relative, "bytes": file.stat().st_size, "sha256": digest(file)})
    save(root / "MANIFEST.json", {"schema": "buildup-art-delivery-v1", "platform": platform,
        "status": status, "baseline": baseline, "sourceHead": head, "files": files})
    deliveries.append({"folder": root.name, "manifestSha256": digest(root / "MANIFEST.json"),
                       "entries": len(files), "bytes": sum(row.get("bytes", 0) for row in files), "status": status})
save(args.output / "delivery-receipt.json", {"baseline": baseline, "sourceHead": head,
    "mainPromotion": "NOT_PERFORMED", "remotePush": "NOT_PERFORMED", "deliveries": deliveries})
print(json.dumps(deliveries))
