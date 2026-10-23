"""Build candidate bundles and pin every output to the committed source."""
import hashlib
import json
import pathlib
import subprocess
import sys

output = pathlib.Path(sys.argv[1]).resolve()
assert not output.exists(), 'Preserve prior builds; use a new output directory'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
subprocess.run(['bun', '--bun', 'vite', 'build', '--outDir', str(output), '--sourcemap', 'hidden'], check=True)
assert head == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
files = []
for file in sorted(output.rglob('*')):
    if file.is_file():
        assert not file.is_symlink()
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                digest.update(block)
        files.append({'file': file.relative_to(output).as_posix(), 'bytes': file.stat().st_size,
            'sha256': digest.hexdigest()})
(output / 'build-identity.json').write_text(json.dumps({'sourceHead': head, 'sourcemap': 'hidden',
    'productionDist': 'UNCHANGED', 'files': files}, indent=2) + '\n')
