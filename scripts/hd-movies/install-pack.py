"""Verify and install an immutable offline HD movie pack into an imported resource folder."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pack', type=Path, default=Path(__file__).resolve().parent)
parser.add_argument('--resource-root', type=Path, required=True)
parser.add_argument('--replace-selection', action='store_true', help='Retain the old pointer and select this revision')
args = parser.parse_args()
pack, target = args.pack.resolve(strict=True), args.resource_root.resolve(strict=True)
assert target.is_dir() and '.app' not in [p.suffix for p in [target, *target.parents]], \
    'Choose an imported resource folder. The complete signed Mac app already contains the pack.'
pointer_file = pack / 'hd-movie-selection.json'
pointer = json.loads(pointer_file.read_text())
assert pointer['schema'] == 'hd-movie-selection-v1'
relative = Path(pointer['manifest'])
assert len(relative.parts) == 4 and relative.parts[:2] == ('media', 'hd-movies') and relative.name == 'manifest.json'
assert re.fullmatch('[a-z0-9][a-z0-9_-]{0,79}', relative.parts[2])
source = pack / relative.parent
manifest_file = pack / relative
manifest = json.loads(manifest_file.read_text())


def sha(file):
    with file.open('rb') as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
        return digest.hexdigest()


assert sha(manifest_file) == pointer['sha256']
assert manifest['schema'] == 'hd-movie-pack-v1' and manifest['revision'] == relative.parts[2]
assert len(manifest['entries']) == 136
assert len({(r['edition'], r['id']) for r in manifest['entries']}) == 136
files = [('manifest.json', manifest_file.stat().st_size, pointer['sha256'])]
for entry in manifest['entries']:
    file = entry['file']; name = file['path']
    assert Path(name).name == name and name == entry['edition'] + '-' + entry['id'] + '.mp4'
    assert entry['edition'] in ['ra2', 'yr']
    original = source / name
    assert not original.is_symlink() and original.is_file()
    assert original.stat().st_size == file['bytes'] and sha(original) == file['sha256'], name
    files.append((name, file['bytes'], file['sha256']))
destination = target / relative.parent
for folder in [target / 'media', target / 'media/hd-movies', destination]:
    assert not folder.is_symlink(), 'Movie installation does not follow destination symlinks'
selected = target / 'hd-movie-selection.json'
assert not selected.is_symlink()
previous = selected.read_bytes() if selected.exists() else None
same = previous is not None and json.loads(previous) == pointer
assert previous is None or same or args.replace_selection, \
    'Another revision is selected. Use --replace-selection to retain its pointer and select this pack.'
if destination.exists():
    for name, size, digest in files:
        file = destination / name
        assert not file.is_symlink() and file.is_file() and file.stat().st_size == size and sha(file) == digest, name
else:
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = destination.parent / ('.installing-' + uuid.uuid4().hex)
    staging.mkdir()
    try:
        for name, size, digest in files:
            original, file = source / name, staging / name
            if sys.platform == 'darwin':
                copied = subprocess.run(['/bin/cp', '-c', str(original), str(file)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                if copied.returncode:
                    file.unlink(missing_ok=True)
                    shutil.copyfile(original, file)
            else:
                shutil.copyfile(original, file)
            assert file.stat().st_size == size and sha(file) == digest
        staging.replace(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
backup = None
if previous is not None and not same:
    backup = target / ('hd-movie-selection.previous-' + time.strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8] + '.json')
    with backup.open('xb') as stream:
        stream.write(previous)
temporary = target / ('hd-movie-selection.' + uuid.uuid4().hex + '.writing')
with temporary.open('xb') as stream:
    stream.write(pointer_file.read_bytes())
os.replace(temporary, selected)
print(json.dumps(dict(status='PASS_VERIFIED_OFFLINE_HD_MOVIE_PACK_INSTALLED', identities=136,
    resourceRoot=str(target), selectedRevision=manifest['revision'], manifestSha256=pointer['sha256'],
    previousSelectionBackup=str(backup) if backup else None,
    userAcceptance=manifest['userAcceptance'], platformValidation='Mac arm64 native; Windows playback not run')))
