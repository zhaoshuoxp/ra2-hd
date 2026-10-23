"""Install only hash-pinned additive Yuri files after preflighting all collisions."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('catalog', type=Path)
p.add_argument('--receipt', type=Path, default=Path('.artifacts/yuri-units/installed-resources-v1.json'))
p.add_argument('--preserve-receipt', type=Path)
a = p.parse_args()
catalog = json.loads(a.catalog.read_text())
staged = Path('.artifacts/yuri-units/staged-packs')
destination = Path('.local/hd-packs')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
files = {}
if a.preserve_receipt:
    assert not a.receipt.exists(), 'Preserve earlier installation receipts'
    for entry in json.loads(a.preserve_receipt.read_text())['files']:
        relative = entry['path'].removeprefix('hd-packs/')
        assert sha(destination / relative) == entry['sha256']
        files[relative] = entry['sha256']

def collect(relative, expected):
    path = staged / relative
    assert path.resolve().is_relative_to(staged.resolve()) and not path.is_symlink()
    assert sha(path) == expected
    files[relative] = expected
    return json.loads(path.read_text()) if path.suffix == '.json' else None

for entry in catalog['shp'].values():
    family = collect(entry['familyPath'].removeprefix('hd-packs/'), entry['hash'])
    for member in family['members']:
        directory = Path(member['packId']) / member['revision']
        pack = collect(str(directory / 'manifest.json'), member['sha256'])
        for variant in pack['variants']:
            for page in variant['pages']:
                for role in ['base', 'data']:
                    collect(str(directory / page[role]), page[role + 'Sha256'])
for entry in catalog['vxl'].values():
    for variant in entry['variants']:
        relative = variant['path'].removeprefix('hd-packs/')
        pack = collect(relative, variant['hash'])
        for part in pack['parts']:
            for asset in part['files'].values():
                collect(str(Path(relative).parent / asset['file']), asset['sha256'])
for relative, expected in files.items():
    path = destination / relative
    assert path.resolve().is_relative_to(destination.resolve()) and not path.is_symlink()
    assert not path.exists() or sha(path) == expected, f'Immutable pack collision: {path}'
for relative, expected in files.items():
    path = destination / relative
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with (staged / relative).open('rb') as source, path.open('xb') as output:
            shutil.copyfileobj(source, output)
    assert sha(path) == expected
Path('desktop/yuri-unit-contracts.json').write_text(a.catalog.read_text())
receipt = {'status': 'INSTALLED_RUNTIME_PENDING', 'sourceRoot': str(staged.resolve()),
           'destinationRoot': str(destination.resolve()), 'files': [{'path': 'hd-packs/' + r, 'sha256': h,
           'bytes': (destination / r).stat().st_size} for r, h in sorted(files.items())]}
a.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(f'Installed {len(files)} verified additive files')
