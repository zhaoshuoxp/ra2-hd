"""Snapshot protected local payloads without following symlinks or writing to them."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root = Path.cwd()
source = root.parent / 'Resource/Command and Conquer Red Alert II'
roots = [source, root / '.local', root / 'dist',
         *sorted(p for p in (root / '.artifacts').iterdir() if p.name != 'm1-5'),
         *sorted(p for p in (Path.home() / 'Library/Application Support').glob('RA2 HD*') if p.name != 'RA2 HD M1.5')]



def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


result = {'roots': {}}
for base in roots:
    entries = []
    if base.exists():
        for path in sorted(base.rglob('*')):
            stat = path.lstat()
            row = {'path': str(path.relative_to(base)), 'size': stat.st_size,
                   'mtime_ns': stat.st_mtime_ns, 'mode': stat.st_mode}
            if path.is_symlink():
                row['link'] = str(path.readlink())
            elif path.is_file() and base != source:
                row['sha256'] = digest(path)
            entries.append(row)
    result['roots'][str(base)] = entries
result['sourceArchives'] = {path.name: digest(path) for path in source.iterdir()
                            if path.name.lower() in ('ra2.mix', 'language.mix', 'multi.mix')}
out = root / '.artifacts/m1-5'
out.mkdir(parents=True, exist_ok=True)
mode = sys.argv[1]
assert mode in ('before', 'after')
target = out / f'preservation-{mode}.json'
if mode == 'before':
    assert not target.exists(), 'Preserve the initial snapshot'
    (out / 'initial-git.json').write_text(json.dumps({
        'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'branch': subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip(),
        'status': subprocess.check_output(['git', 'status', '--porcelain'], text=True),
    }, indent=2) + '\n')
target.write_text(json.dumps(result, indent=2) + '\n')
if mode == 'after':
    before = json.loads((out / 'preservation-before.json').read_text())
    assert before == result, 'Protected payload changed; inspect snapshots'
print(json.dumps({'status': 'PASS', 'mode': mode,
                  'entries': {key: len(value) for key, value in result['roots'].items()}}))
