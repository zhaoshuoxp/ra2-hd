"""Validate returned evidence against a trusted kit and extract read-only data."""
import argparse
import hashlib
import json
import pathlib
import stat
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=pathlib.Path)
parser.add_argument('trusted_kit', type=pathlib.Path)
parser.add_argument('output', type=pathlib.Path)
args = parser.parse_args()
archive_file = args.archive.resolve()
output = args.output.resolve()
assert not output.exists(), 'Preserve prior evidence; use a new extraction directory'
launchers = {'Launch-Diagnostics.cmd', 'Export-Reports.cmd', 'Verify-Kit.cmd', 'Run-Control.cmd'}
reports = {'run.json', 'machine.json', 'os.json', 'phases.json', 'errors.json', 'process-metrics.json',
    'summary.json', 'trace.json', 'cpu.cpuprofile', 'trace-status.json', 'USER-NOTES.txt'}


def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


trusted_bytes = (args.trusted_kit / 'diagnostic-manifest.json').read_bytes()
trusted = json.loads(trusted_bytes)
manifest_hash = hashlib.sha256(trusted_bytes).hexdigest()
launcher_checks = []
with zipfile.ZipFile(archive_file) as archive:
    members = archive.infolist()
    names = [member.filename for member in members]
    assert len(names) == len(set(names)) == len({name.casefold() for name in names})
    assert sum(member.file_size for member in members) <= 2 * 1024**3
    for member in members:
        path = pathlib.PurePosixPath(member.filename)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in member.filename
        assert not member.is_dir() and not stat.S_ISLNK(member.external_attr >> 16)
        assert not member.flag_bits & 1 and member.file_size <= 512 * 1024**2
    assert archive.read('diagnostic-manifest.json') == trusted_bytes
    receipt = json.loads(archive.read('return-manifest.json'))
    assert receipt['diagnosticId'] == trusted['diagnosticId']
    assert receipt['schemaVersion'] == trusted['schemaVersion']
    rows = {row['file']: row for row in receipt['files']}
    assert len(rows) == len(receipt['files'])
    assert set(names) == set(rows) | {'return-manifest.json'}
    identities = {row['directory']: row for row in receipt['runIdentities']}
    assert len(identities) == len(receipt['runIdentities'])
    for name in names:
        path = pathlib.PurePosixPath(name)
        if name in {'diagnostic-manifest.json', 'return-manifest.json', 'verification.json'}:
            continue
        if path.parts[0] == 'launchers':
            assert len(path.parts) == 2 and path.name in launchers
        else:
            assert len(path.parts) == 3 and path.parts[0] == 'runs'
            assert path.parts[1] in identities and path.name in reports
    output.mkdir(parents=True)
    for member in members:
        destination = output / member.filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        with archive.open(member) as source, destination.open('xb') as target:
            for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
                digest.update(block)
                target.write(block)
        if member.filename in rows:
            row = rows[member.filename]
            assert destination.stat().st_size == row['bytes']
            assert digest.hexdigest() == row['sha256']
        destination.chmod(0o444)
    for directory, identity in identities.items():
        run = json.loads((output / 'runs' / directory / 'run.json').read_text())
        assert run['diagnosticId'] == trusted['diagnosticId']
        assert run['diagnosticCommit'] == trusted['diagnosticCommit']
        assert run['manifestSha256'] == manifest_hash
        assert run['config']['experimentId'] == identity['experimentId']
        assert run['status'] == identity['status']
    for name in sorted(launchers):
        returned_bytes = (output / 'launchers' / name).read_bytes()
        expected_bytes = (args.trusted_kit / name).read_bytes()
        launcher_checks.append({'file': name, 'status': 'IDENTICAL' if returned_bytes == expected_bytes else 'MODIFIED',
            'sha256': hashlib.sha256(returned_bytes).hexdigest()})

result = {'status': 'PASS_RETURN_CRC_HASH_FROZEN_IDENTITY_AND_SAFE_EXTRACTION',
    'archive': str(archive_file), 'bytes': archive_file.stat().st_size, 'sha256': sha(archive_file),
    'files': len(members), 'runs': len(identities), 'diagnosticId': trusted['diagnosticId'],
    'diagnosticCommit': trusted['diagnosticCommit'], 'manifestSha256': manifest_hash,
    'extractedDirectory': str(output), 'launcherPolicy': 'Inspected as data only; no returned scripts executed.',
    'launchers': launcher_checks}
record = output.with_name(output.name + '-validation.json')
with record.open('x') as stream:
    json.dump(result, stream, indent=2)
    stream.write('\n')
print(json.dumps(result, indent=2))
