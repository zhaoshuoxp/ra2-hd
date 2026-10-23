"""Check copied resources against accepted main and explicit packaging transformations."""
import hashlib
import json
import sys
from pathlib import Path


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


receipt_file, copied_file, main, output = map(Path, sys.argv[1:5])
receipt = json.loads(receipt_file.read_text())
copied = json.loads(copied_file.read_text())
folder = Path(copied['app']).parent
independent = shared = added = 0
errors, normalized = [], []
keys = ['virtualName', 'bytes', 'sha256', 'validation']
for entry in receipt['files']:
    if 'link' in entry:
        continue
    relative = Path(entry['file'])
    target, source = folder / relative, Path(receipt['folder']) / relative
    if target.stat().st_ino == source.stat().st_ino and target.stat().st_dev == source.stat().st_dev:
        errors.append(f'Hardlinked package file: {relative}')
    else:
        independent += 1
    if relative.parts[0] not in ['RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']:
        continue
    local = main / '.local' / Path(*relative.parts[1:])
    if not local.exists():
        added += 1
        continue
    if relative.as_posix() == 'RA2-HD-Editions-Resources/ra2-core-manifest.json':
        original = json.loads(local.read_text())
        expected = dict(schemaVersion=1, files=[{key: row[key] for key in keys} for row in original['files']])
        if json.loads(target.read_text()) != expected:
            errors.append('Unexpected core-manifest semantic transformation')
        normalized.append(dict(path=str(relative), sourceSha256=sha(local), copiedSha256=sha(target),
            reason='Existing packager retains only runtime member identity, byte size, hash and structural validation; importer provenance stays in main.',
            fields=keys, status='PASS_EXACT_EXPECTED_TRANSFORMATION'))
    elif relative.as_posix() == 'RA2-HD-Editions-Resources/upstream-support/manifest.json':
        original = json.loads(local.read_text())
        support_keys = ['original', 'commit', 'sha256', 'bytes']
        expected = [{key: row[key] for key in support_keys} for row in original
                    if Path(row['original']).name in ['general.csf', 'ra2cd.mix']]
        if json.loads(target.read_text()) != expected:
            errors.append('Unexpected support-manifest semantic transformation')
        normalized.append(dict(path=str(relative), sourceSha256=sha(local), copiedSha256=sha(target),
            reason='Existing allowlisted runtime support projection omits importer-only metadata.',
            fields=support_keys, status='PASS_EXACT_EXPECTED_TRANSFORMATION'))
    elif relative.name in ['terrain-selection.json', 'environment-selection.json']:
        normalized.append(dict(path=str(relative), sourceSha256=sha(local), copiedSha256=sha(target),
            reason='Task-owned new selection; main retains accepted M2.1 while combined visual acceptance is pending.',
            status='EXPECTED_TASK_SELECTION_MAIN_UNCHANGED'))
    elif sha(local) != entry['sha256']:
        errors.append(f'Changed shared payload: {relative}')
    else:
        shared += 1
result = dict(schema='m2-2-copied-shared-parity-v1', status='FAIL' if errors else 'PASS',
    runtimeSourceHead=receipt['runtimeSourceHead'], copiedRoot=str(folder), mainRoot=str(main),
    independentRegularFiles=independent, sharedPayloadFilesExact=shared, additionalResourceFiles=added,
    expectedMetadataDifferences=normalized, errors=errors,
    boundary='Copied hashes/modes/symlinks and signature are verified separately. No main resource or selector is modified.')
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'expectedMetadataDifferences'}))
sys.exit(bool(errors))
