"""Archive, deliver and independently extract the accepted M3.1 Mac package."""
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
parser.add_argument("phase", choices=["archive", "deliver", "extract"])
parser.add_argument("stage", type=Path)
parser.add_argument("--desktop", type=Path, default=Path("/Users/Aone/Desktop"))
parser.add_argument("--extract", type=Path)
args = parser.parse_args()
stage = args.stage.resolve()
receipt = json.loads((stage / "stage.json").read_text())
rows = json.loads((stage / "inventory.json").read_text())
folder = Path(receipt["folder"])
archive = stage.parent / (folder.name + ".zip")


def sha(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def save(file, value):
    file.write_text(json.dumps(value, indent=2) + "\n")


def verify_layout(zipped):
    items = [entry for entry in zipped.infolist() if not entry.is_dir()]
    expected = {folder.name + "/" + row["file"] for row in rows}
    assert len(items) == len(expected) == len({entry.filename for entry in items})
    assert {entry.filename for entry in items} == expected
    assert not any("/UserData/" in name or "-Profile/" in name or name.startswith("__MACOSX/") for name in expected)
    for row in rows:
        entry = zipped.getinfo(folder.name + "/" + row["file"])
        assert stat.S_IMODE(entry.external_attr >> 16) == row["mode"], row["file"]
        if "link" in row:
            assert stat.S_ISLNK(entry.external_attr >> 16)
            assert zipped.read(entry).decode() == row["link"]
        else:
            assert stat.S_ISREG(entry.external_attr >> 16)
            assert entry.file_size == row["bytes"]


if args.phase == "archive":
    assert receipt["status"] == "PASS_INDEPENDENT_MAC_ASSEMBLY_PENDING_DESKTOP_ZIP_NATIVE_TEST"
    assert not archive.exists()
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1,
                         allowZip64=True, strict_timestamps=False) as zipped:
        for index, row in enumerate(rows):
            file = folder / row["file"]
            name = folder.name + "/" + row["file"]
            if "link" in row:
                entry = zipfile.ZipInfo(name)
                entry.create_system = 3
                entry.external_attr = (stat.S_IFLNK | row["mode"]) << 16
                zipped.writestr(entry, row["link"].encode())
            else:
                zipped.write(file, name)
            if (index + 1) % 2000 == 0:
                print(json.dumps({"phase": "ARCHIVING", "entries": index + 1, "total": len(rows)}), flush=True)
    with zipfile.ZipFile(archive) as zipped:
        verify_layout(zipped)
        for row in rows:
            if "link" not in row:
                with zipped.open(folder.name + "/" + row["file"]) as stream:
                    assert hashlib.file_digest(stream, "sha256").hexdigest() == row["sha256"], row["file"]
    result = {"status": "PASS_ZIP_ALL_BYTES_LINKS_AND_MODES", "path": str(archive),
              "bytes": archive.stat().st_size, "sha256": sha(archive), "entries": len(rows),
              "inventorySha256": sha(stage / "inventory.json")}
    save(stage.parent / "archive.json", result)
elif args.phase == "deliver":
    verified = json.loads((stage.parent / "archive.json").read_text())
    assert verified["status"] == "PASS_ZIP_ALL_BYTES_LINKS_AND_MODES"
    assert sha(archive) == verified["sha256"]
    destination = args.desktop.resolve() / archive.name
    temporary = destination.with_name(destination.name + ".partial")
    assert not destination.exists() and not temporary.exists(), "Preserve existing Desktop deliveries"
    with archive.open("rb") as source, temporary.open("xb") as output:
        shutil.copyfileobj(source, output, length=8 * 1024 * 1024)
        output.flush()
        os.fsync(output.fileno())
    assert temporary.stat().st_size == verified["bytes"] and sha(temporary) == verified["sha256"]
    temporary.rename(destination)
    result = {**verified, "status": "PASS_DESKTOP_COPY_HASH_MATCH", "path": str(destination),
              "sourceArchive": str(archive)}
    save(stage.parent / "desktop-delivery.json", result)
else:
    delivered = json.loads((stage.parent / "desktop-delivery.json").read_text())
    assert delivered["status"] == "PASS_DESKTOP_COPY_HASH_MATCH"
    desktop_zip = Path(delivered["path"])
    assert sha(desktop_zip) == delivered["sha256"]
    assert args.extract is not None
    extracted = args.extract.resolve()
    extracted.mkdir(parents=True, exist_ok=False)
    destination = extracted / folder.name
    destination.mkdir()
    with zipfile.ZipFile(desktop_zip) as zipped:
        verify_layout(zipped)
        for index, row in enumerate(rows):
            relative = Path(row["file"])
            assert not relative.is_absolute() and ".." not in relative.parts
            file = destination / relative
            file.parent.mkdir(parents=True, exist_ok=True)
            if "link" in row:
                assert not Path(row["link"]).is_absolute()
                assert (file.parent / row["link"]).resolve().is_relative_to(destination)
                file.symlink_to(row["link"])
            else:
                digest = hashlib.sha256()
                with zipped.open(folder.name + "/" + row["file"]) as source, file.open("xb") as output:
                    while data := source.read(8 * 1024 * 1024):
                        digest.update(data)
                        output.write(data)
                assert digest.hexdigest() == row["sha256"] and file.stat().st_size == row["bytes"]
                file.chmod(row["mode"])
            assert stat.S_IMODE(file.lstat().st_mode) == row["mode"]
            if (index + 1) % 2000 == 0:
                print(json.dumps({"phase": "DESKTOP_ZIP_EXTRACT_VERIFIED", "entries": index + 1, "total": len(rows)}), flush=True)
    app = destination / Path(receipt["app"]).name
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    result = {"status": "PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_ALL_BYTES_LINKS_MODES_AND_SIGNATURE",
              "desktopZip": str(desktop_zip), "zipSha256": delivered["sha256"], "folder": str(destination),
              "app": str(app), "executable": receipt["executable"], "entries": len(rows)}
    save(stage.parent / "extracted.json", result)
print(json.dumps(result), flush=True)
