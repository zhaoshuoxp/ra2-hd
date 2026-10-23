"""Checkpoint and copy accepted M2 inputs without replacing existing files."""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def entry(root, file):
    relative = file.relative_to(root).as_posix()
    mode = file.lstat().st_mode & 0o7777
    if file.is_symlink():
        return dict(file=relative, link=os.readlink(file), mode=mode)
    return dict(file=relative, bytes=file.stat().st_size, sha256=sha(file), mode=mode)


def save(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open('x') as stream:
        json.dump(data, stream, indent=2)
        stream.write('\n')


parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['checkpoint', 'transfer', 'verify'])
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
source, destination = args.source.resolve(), args.destination.resolve()

if args.action == 'checkpoint':
    files = [entry(source, file) for name in ['.local', 'dist']
             for file in sorted((source / name).rglob('*'))
             if file.is_symlink() or file.is_file()]
    data = dict(schema='m2-main-preintegration-v1', source=str(source),
                sourceHead=subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(),
                sourceStatus=subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True),
                files=files)
elif args.action == 'verify':
    checkpoint = json.loads(args.destination.read_text())
    errors = []
    for expected in checkpoint['files']:
        file = source / expected['file']
        if not (file.exists() or file.is_symlink()) or entry(source, file) != expected:
            errors.append(expected['file'])
    data = dict(status='FAIL' if errors else 'PASS_PRESERVED_FILES', checked=len(checkpoint['files']), errors=errors)
    save(args.receipt, data)
    print(json.dumps(data))
    raise SystemExit(bool(errors))
else:
    inventories = [('.artifacts/m2-1/seams-v13d-transfer-inventory.json',
                    '7703f6ee3f4924f5741fed7cee384a9b3aa3ee93a932f69c91de9df2396e51fa'),
                   ('.artifacts/m2-1/production-v12c-transfer-inventory.json',
                    '10203589735dd64a3daf68dfbf10dd326047d6cc3308951eb726077364230ef1')]
    entries = {}
    for relative, digest in inventories:
        file = source / relative
        assert sha(file) == digest, relative
        entries[relative] = entry(source, file)
        for expected in json.loads(file.read_text())['files']:
            if expected['file'] == '.local/terrain-selection.json':
                # V12C pins its historical selector; V13D supersedes only this pointer.
                continue
            actual = entry(source, source / expected['file'])
            assert actual['sha256'] == expected['sha256'] and actual['bytes'] == expected['bytes'], expected['file']
            entries[expected['file']] = actual
    for relative in ['.local/terrain-selection.json',
                     '.artifacts/m2-1/authoring-v10/cliff-1-master.png',
                     '.artifacts/m2-1/authoring-v10/ramp01.tem-master.png',
                     '.artifacts/m2-1/authoring-v11/materials-master.png',
                     '.artifacts/m2-1/authoring-v4/road-master.png']:
        entries[relative] = entry(source, source / relative)
    pointer = json.loads((source / '.local/terrain-selection.json').read_text())
    assert pointer == dict(schemaVersion=1, revision='temperate-m2-1-seams-v13d',
                          sha256='47a93e1ae5c56150357dd3f040f654079de26f8c899ebbc923b3c099bbf97f38')
    assert sha(source / '.local/terrain-packs' / pointer['revision'] / 'manifest.json') == pointer['sha256']
    # The accepted V11B donor is an authoring dependency, not a second runtime pack.
    for file in sorted((source / '.local/terrain-packs/temperate-m2-1-ground-v11b').rglob('*')):
        if file.is_file():
            entries[file.relative_to(source).as_posix()] = entry(source, file)
    copied = identical = 0
    for relative, expected in sorted(entries.items()):
        assert not Path(relative).is_absolute() and '..' not in Path(relative).parts
        target = destination / relative
        assert 'link' not in expected, relative
        if target.exists() or target.is_symlink():
            assert entry(destination, target) == expected, f'Existing destination differs: {relative}'
            identical += 1
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            # APFS clone-on-write retains independent ownership and exact bytes.
            subprocess.run(['/bin/cp', '-cp', str(source / relative), str(target)], check=True)
            assert entry(destination, target) == expected, relative
            copied += 1
    data = dict(schema='m2-additive-transfer-v1', policy='ADD_IF_ABSENT_OR_IDENTICAL',
                source=str(source), destination=str(destination), copied=copied, identical=identical,
                inventories=[dict(file=f, sha256=h) for f, h in inventories], files=list(entries.values()),
                runtime='Only the selected V13D pack and selector are registered and packaged',
                authoring='V12C parent, V11B donor, accepted guides and exact source chain are retained separately')
save(args.receipt, data)
print(json.dumps({key: value for key, value in data.items() if key != 'files'}))
