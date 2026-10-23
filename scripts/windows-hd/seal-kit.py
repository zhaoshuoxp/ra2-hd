"""Seal a cataloged kit and verify every member in a fresh extraction."""
import argparse
import hashlib
import json
import pathlib
import shutil
import stat
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--folder', required=True, type=pathlib.Path)
parser.add_argument('--archive', required=True, type=pathlib.Path)
parser.add_argument('--extraction', required=True, type=pathlib.Path)
parser.add_argument('--receipt', required=True, type=pathlib.Path)
args = parser.parse_args()


def sha(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


folder = args.folder.resolve()
manifest_file = folder / 'diagnostic-manifest.json'
manifest = json.loads(manifest_file.read_text())
rows = manifest['files'] + [{'file': 'diagnostic-manifest.json',
    'bytes': manifest_file.stat().st_size, 'sha256': sha(manifest_file)}]
assert len({row['file'] for row in rows}) == len(rows)
actual = {file.relative_to(folder).as_posix() for file in folder.rglob('*') if file.is_file()}
assert actual == {row['file'] for row in rows}, 'Unexpected or missing payload'
assert not any({'Diagnostic-Runs', 'Review-Profile', 'Profile', 'UserData'} & set(pathlib.PurePosixPath(name).parts) for name in actual)
assert not args.archive.exists() and not args.extraction.exists()
args.archive.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
    for row in rows:
        file = folder / row['file']
        assert not file.is_symlink() and file.stat().st_size == row['bytes'] and sha(file) == row['sha256']
        info = zipfile.ZipInfo.from_file(file, f"{folder.name}/{row['file']}")
        info.compress_type = zipfile.ZIP_DEFLATED
        info._compresslevel = 6
        if not file.stat().st_mode & stat.S_IWUSR:
            info.external_attr |= 1  # Windows read-only attribute for reference files.
        with file.open('rb') as source, archive.open(info, 'w') as target:
            shutil.copyfileobj(source, target, 4 * 1024 * 1024)
args.extraction.mkdir(parents=True)
with zipfile.ZipFile(args.archive) as archive:
    assert len(archive.infolist()) == len(rows)
    for member in archive.infolist():
        relative = pathlib.PurePosixPath(member.filename)
        assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] == folder.name
        mode = member.external_attr >> 16
        assert not stat.S_ISLNK(mode)
        destination = args.extraction.joinpath(*relative.parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, destination.open('xb') as target:
            shutil.copyfileobj(source, target, 4 * 1024 * 1024)
        destination.chmod(stat.S_IMODE(mode) or 0o644)
for row in rows:
    file = args.extraction / folder.name / row['file']
    assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], row['file']
receipt = {'status': 'PASS_FULL_ARCHIVE_AND_FRESH_EXTRACTION', 'diagnosticId': manifest['diagnosticId'],
    'baseCommit': manifest['baseCommit'], 'diagnosticCommit': manifest['diagnosticCommit'],
    'archive': str(args.archive.resolve()), 'bytes': args.archive.stat().st_size,
    'sha256': sha(args.archive), 'manifestSha256': sha(manifest_file), 'entries': len(rows),
    'extractedFolder': str((args.extraction / folder.name).resolve()), 'windowsNative': 'NOT_RUN'}
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
