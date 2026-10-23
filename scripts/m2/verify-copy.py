"""Verify a copied review delivery against its immutable packaging receipt."""
import hashlib
import json
import os
import stat
import sys
from pathlib import Path

receipt_file, destination, output = map(Path, sys.argv[1:4])
receipt = json.loads(receipt_file.read_text())
source = Path(receipt['folder'])
errors = []
regular = links = 0
for entry in receipt['files']:
    relative = Path(entry['file'])
    assert not relative.is_absolute() and '..' not in relative.parts
    target, original = destination / relative, source / relative
    try:
        if 'link' in entry:
            links += 1
            if not target.is_symlink() or os.readlink(target) != entry['link']:
                errors.append(f'link: {relative}')
        else:
            regular += 1
            if target.is_symlink() or not target.is_file():
                errors.append(f'type: {relative}')
                continue
            digest = hashlib.sha256()
            with target.open('rb') as file:
                for chunk in iter(lambda: file.read(1024 * 1024), b''):
                    digest.update(chunk)
            if target.stat().st_size != entry['bytes'] or digest.hexdigest() != entry['sha256']:
                errors.append(f'bytes: {relative}')
        if stat.S_IMODE(target.lstat().st_mode) != stat.S_IMODE(original.lstat().st_mode):
            errors.append(f'mode: {relative}')
    except OSError as error:
        errors.append(f'{relative}: {error}')
result = dict(status='FAIL' if errors else 'PASS_COPIED_HASHES_LINKS_MODES',
              sourceHead=receipt['runtimeSourceHead'], destination=str(destination.resolve()),
              entries=len(receipt['files']), regularFilesVerified=regular, linksVerified=links,
              profile=str(destination / Path(receipt['profile']).name), errors=errors)
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
if errors:
    sys.exit(1)
