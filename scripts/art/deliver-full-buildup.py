"""Assemble and hash self-contained complete-building artwork handoffs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--mac-receipt", type=Path, required=True)
parser.add_argument("--windows-receipt", type=Path, required=True)
parser.add_argument("--art", type=Path, required=True)
parser.add_argument("--matrix", type=Path, required=True)
parser.add_argument("--review", type=Path, required=True)
parser.add_argument("--review-check", type=Path, required=True)
parser.add_argument("--revision", default="R20")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
assert not subprocess.check_output(["git", "status", "--porcelain"], text=True), "Commit the complete source handoff first"
head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
baseline = "748d0998aaf663acda8807c158155bf0a5bb157b"
matrix = json.loads(args.matrix.read_text())
assert matrix["status"] in ("PASS_COMPLETE_NATIVE_MATRIX", "PASS_SUPPORTED_NATIVE_MATRIX_WITH_EXPLICIT_THEATER_BLOCKERS")
assert json.loads((args.art / "validation.json").read_text())["status"].startswith("PASS")
assert json.loads((args.review_check / "embedded-review-check.json").read_text())["status"].startswith("PASS")
selection = json.loads((args.art / "authoring.json").read_text())


def sha(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def clone(source, target):
    assert not target.exists()
    subprocess.run(["cp", "-cR", str(source), str(target)], check=True)


def write(file, data):
    file.write_text(json.dumps(data, indent=2) + "\n")


def inventory(root):
    rows = []
    for file in sorted(root.rglob("*")):
        if file.is_symlink():
            rows.append({"file": file.relative_to(root).as_posix(), "link": os.readlink(file)})
        elif file.is_file():
            rows.append({"file": file.relative_to(root).as_posix(), "bytes": file.stat().st_size, "sha256": sha(file)})
    return rows


def archive(root):
    target = root.with_suffix(".zip")
    assert not target.exists()
    with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
        for file in sorted(root.rglob("*")):
            if file.is_symlink():
                info = zipfile.ZipInfo(file.relative_to(root.parent).as_posix())
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(info, os.readlink(file))
            elif file.is_file():
                info = zipfile.ZipInfo.from_file(file, file.relative_to(root.parent).as_posix(), strict_timestamps=False)
                info.compress_type = zipfile.ZIP_DEFLATED
                with file.open("rb") as source, archive.open(info, "w", force_zip64=True) as destination:
                    shutil.copyfileobj(source, destination, 1024 * 1024)
    with zipfile.ZipFile(target) as check:
        assert check.testzip() is None
    digest = sha(target)
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n")
    return {"archive": str(target), "bytes": target.stat().st_size, "sha256": digest}


deliveries = []
for platform, receipt in (("Mac", args.mac_receipt), ("Windows-Return", args.windows_receipt)):
    package = json.loads(receipt.read_text())
    root = args.output / f"RA2-HD-All-Building-Buildup-20261011-{args.revision}-{platform}"
    clone(Path(package["folder"]), root)
    actual = {file.relative_to(root).as_posix() for file in root.rglob("*") if file.is_file() or file.is_symlink()}
    assert actual == {row["file"] for row in package["files"]}, "Package changed after its frozen inventory"
    for row in package["files"]:
        file = root / row["file"]
        assert (file.is_symlink() and os.readlink(file) == row["link"]) if "link" in row else (
            file.stat().st_size == row["bytes"] and sha(file) == row["sha256"])
    evidence = root / "Evidence"
    evidence.mkdir()
    for file in args.art.glob("*.json"):
        shutil.copyfile(file, evidence / file.name)
    shutil.copyfile(args.art / "findings.csv", evidence / "findings.csv")
    shutil.copyfile(args.matrix, evidence / "native-matrix.json")
    shutil.copyfile(receipt, evidence / "packaging.json")
    clone(args.review_check, evidence / "Embedded-Review-Check")
    clone(args.review, root / "Art-Review")
    native = evidence / "Native"
    native.mkdir()
    for entry in matrix["entries"]:
        source = Path(entry["output"])
        assert sha(source / "report.json") == entry["reportSha256"]
        destination = native / source.name
        destination.mkdir()
        for file in source.iterdir():
            if file.is_file() and file.suffix in (".json", ".png", ".webm"):
                shutil.copyfile(file, destination / file.name)
    blockers = evidence / "Theater-Blockers"
    blockers.mkdir()
    blocker = json.loads((args.art / "newurban-blocker.json").read_text())
    for entry in blocker["evidence"]:
        source = Path(entry["report"])
        assert sha(source) == entry["sha256"]
        destination = blockers / source.parent.name
        destination.mkdir()
        shutil.copyfile(source, destination / "report.json")
    logs = evidence / "Logs"
    logs.mkdir()
    for file in Path("/private/tmp").glob("ra2-buildup-full-*.log"):
        shutil.copyfile(file, logs / file.name)
    shutil.copyfile("docs/full-building-buildup-survey-20261011.md", root / "ARTWORK-REPORT.md")
    shutil.copyfile("scripts/art/verify-handoff.py", root / "verify-handoff.py")
    write(root / "ART-SELECTION.json", {"baseline": baseline, "sourceHead": head,
        "families": [{key: f[key] for key in ("key", "identity", "side", "theater", "editions", "frames", "newMember", "newFamilySha256")}
            for f in selection["families"]]})
    if platform == "Windows-Return":
        source = root / "Source"
        source.mkdir()
        subprocess.run(["git", "bundle", "create", str(source / "buildup-art.bundle"), branch], check=True)
        subprocess.run(["git", "bundle", "verify", str(source / "buildup-art.bundle")], check=True)
        subprocess.run(["git", "archive", "--format=zip", "--output=" + str(source / "source.zip"), head], check=True)
        with (source / "changes-from-748d099.patch").open("wb") as stream:
            subprocess.run(["git", "diff", "--binary", baseline, head], stdout=stream, check=True)
        write(root / "SOURCE-PLAN.json", {"head": head, "branch": branch, "baseline": baseline,
            "bundle": "Source/buildup-art.bundle", "worldRoot": "RA2-HD-Editions-Resources", "uiRoot": "RA2-HD-UI-Resources"})
        launch = "Run Red Alert 2 HD.exe after extracting the whole ZIP."
        stage = 'Verification/staging requires Python 3.11+; source staging also requires Git.\nVerify: python verify-handoff.py\nStage into a NEW directory: python verify-handoff.py --target "D:\\RA2\\full-buildup-art"\n'
        status = "STATIC_WINDOWS_PACKAGE_PASS_WINDOWS_RUNTIME_NOT_RUN"
    else:
        app = root / Path(package["app"]).name
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
        launch = f"Open {app.name}. Keep both sibling resource folders beside it."
        stage = "Use the current artwork conversation for visual feedback.\n"
        status = "MAC_SUPPORTED_NATIVE_MATRIX_PASS_NEWURBAN_BLOCKED_VISUAL_ACCEPTANCE_PENDING"
    (root / "START-HERE.txt").write_text(f"""RA2 HD complete building construction artwork — 2026-10-11
{launch}
Open Art-Review/Buildup-Art-Review.html for embedded Original/previous-HD/candidate
frames, both densities, slow/reverse controls, recorded native videos and GPU sheets.
108 selected sequences / 51 identities / 4,890 density-frame combinations.
The first 20 corrected sequences remain unchanged. New corrections cover 88 sequences.
Completed frames, non-MK members, Original shadows/rules/timing and budgets are retained.
212 terminal density frames are retained; four Gatling MK terminal frames restore missing guns.
Native-only construction detail uses source color where HD donor matching is unreliable.
New Urban: two sequences pass all source/pixel checks; native gameplay is blocked by the
baseline TMP map decoder. Evidence/Theater-Blockers retains HD and Original failures.
Status: {status}
Source closure: {head}; runtime package source: {package.get('sourceHead', package.get('gameplaySourceHead'))}
Base main: {baseline}. No main promotion, push or cleanup.
{stage}
Return this complete package to the existing Windows conversation after artwork acceptance.
Validate Windows artwork before continuing the deferred construction-yard deployment and
90+ FPS work. Windows runtime, natural-match/physical-input and visual acceptance are separate.
""")
    write(root / "MANIFEST.json", {"schema": "full-buildup-delivery-v1", "platform": platform,
        "status": status, "sourceHead": head, "baseline": baseline, "files": inventory(root)})
    subprocess.run(["python3", str(root / "verify-handoff.py"), "--root", str(root)], check=True)
    result = archive(root)
    deliveries.append({**result, "folder": str(root), "manifestSha256": sha(root / "MANIFEST.json"), "status": status})
    write(args.output / "delivery-receipt.json", {"sourceHead": head, "deliveries": deliveries})
    print(platform, result["bytes"], result["sha256"], flush=True)
