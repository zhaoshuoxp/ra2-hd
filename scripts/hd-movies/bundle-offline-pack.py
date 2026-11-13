"""Freeze the selected offline movie pack with its installer and verify every ZIP member."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--zip', type=Path, required=True)
parser.add_argument('--receipt', type=Path, required=True)
args = parser.parse_args()
resource = ROOT / '.local'
selection_file = resource / 'hd-movie-selection.json'
selection = json.loads(selection_file.read_text())
manifest_file = resource / selection['manifest']
manifest = json.loads(manifest_file.read_text())


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


assert sha(manifest_file) == selection['sha256'] and len(manifest['entries']) == 136
assert not args.zip.exists()
args.output.mkdir(parents=False, exist_ok=False)
files = []


def copy(source, relative):
    target = args.output / relative; target.parent.mkdir(parents=True, exist_ok=True)
    assert source.resolve() == source and not source.is_symlink()
    subprocess.run(['/bin/cp', '-c', str(source), str(target)], check=True)
    assert sha(target) == sha(source)
    files.append(dict(file=relative.as_posix(), bytes=target.stat().st_size, sha256=sha(target), mode=target.stat().st_mode & 0o777))


copy(selection_file, Path('hd-movie-selection.json'))
copy(manifest_file, Path(selection['manifest']))
for entry in manifest['entries']:
    file = entry['file']; relative = Path(selection['manifest']).parent / file['path']
    assert (resource / relative).stat().st_size == file['bytes'] and sha(resource / relative) == file['sha256']
    copy(resource / relative, relative)
copy(ROOT / 'scripts/hd-movies/install-pack.py', Path('install-pack.py'))
copy(ROOT / 'docs/hd-movies-offline-install.md', Path('README.md'))
copy(ROOT / 'LICENSE', Path('LICENSE'))
with zipfile.ZipFile(args.zip, 'x', allowZip64=True) as archive:
    for row in files:
        archive.write(args.output / row['file'], arcname=args.output.name + '/' + row['file'],
            compress_type=zipfile.ZIP_STORED if row['file'].endswith('.mp4') else zipfile.ZIP_DEFLATED,
            compresslevel=6)
with zipfile.ZipFile(args.zip) as archive:
    assert len(archive.infolist()) == len(files)
    for row in files:
        info = archive.getinfo(args.output.name + '/' + row['file'])
        assert info.file_size == row['bytes'] and ((info.external_attr >> 16) & 0o777) == row['mode']
        with archive.open(info) as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256']
record = dict(schema='hd-movie-offline-bundle-v1', status='PASS_OFFLINE_PACK_ALL_FILES_AND_ZIP_DECOMPRESSED_BYTES_MODES',
    directory=str(args.output.resolve()), revision=manifest['revision'], manifestSha256=selection['sha256'],
    files=files, identities=136, bytes=sum(r['bytes'] for r in files),
    zip=dict(file=str(args.zip.resolve()), bytes=args.zip.stat().st_size, sha256=sha(args.zip)),
    userAcceptance=manifest['userAcceptance'], publication='PRIVATE_LOCAL_ONLY')
args.receipt.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(status=record['status'], zip=record['zip'], files=len(files))))
