"""Stage hash-verified public Homebrew extraction tools inside the local task directory."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/tooling/hd-movies'
CACHE = ROOT / '.artifacts/hd-movies/tool-downloads'
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

def curl(url, *args):
    return subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', *args, url])

receipts = []
for name in ['innoextract', 'boost', 'xz', 'zstd']:
    formula = json.loads(curl(f'https://formulae.brew.sh/api/formula/{name}.json'))
    bottles = formula['bottle']['stable']['files']
    tag = next(tag for tag in ['arm64_sonoma', 'arm64_sequoia', 'arm64_tahoe', 'arm64_golden_gate'] if tag in bottles)
    bottle = bottles[tag]
    archive = CACHE / (name + '.tar.gz')
    if not archive.exists():
        token = json.loads(curl(f'https://ghcr.io/token?service=ghcr.io&scope=repository:homebrew/core/{name}:pull'))['token']
        curl(bottle['url'], '-H', 'Authorization: Bearer ' + token, '--output', str(archive))
    with archive.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == bottle['sha256'], name
    retained = []
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            filename = Path(member.name).name
            selected = (name == 'innoextract' and member.name.endswith('/bin/innoextract')
                        or filename.startswith(('libboost_filesystem', 'libboost_program_options', 'libboost_iostreams',
                                                'libboost_date_time', 'libboost_atomic', 'libboost_random',
                                                'libboost_container', 'liblzma', 'libzstd'))
                        and filename.endswith('.dylib'))
            if not selected or not (member.isfile() or member.issym()):
                continue
            destination = OUT / ('bin' if filename == 'innoextract' else 'lib') / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            if member.issym():
                assert '/' not in member.linkname and '..' not in member.linkname
                destination.unlink(missing_ok=True)
                destination.symlink_to(member.linkname)
            else:
                destination.write_bytes(tar.extractfile(member).read())
                destination.chmod(0o755)
            retained.append(str(destination.relative_to(OUT)))
    receipts.append(dict(package=name, version=formula['versions']['stable'], revision=formula['revision'],
                         source=bottle['url'], sha256=bottle['sha256'], retained=retained))

for file in [*(OUT / 'bin').iterdir(), *(OUT / 'lib').iterdir()]:
    if file.is_symlink():
        continue
    output = subprocess.check_output(['otool', '-L', str(file)], text=True)
    for line in output.splitlines()[1:]:
        dependency = line.strip().split(' (')[0]
        if dependency.startswith(('/usr/lib/', '/System/Library/')):
            continue
        target = OUT / 'lib' / Path(dependency).name
        assert target.exists(), dependency
        subprocess.run(['install_name_tool', '-change', dependency, str(target), str(file)], check=True)
    subprocess.run(['codesign', '--force', '--sign', '-', str(file)], check=True, capture_output=True)
(OUT / 'tool-receipt.json').write_text(json.dumps(receipts, indent=2) + '\n')
subprocess.run([str(OUT / 'bin/innoextract'), '--version'], check=True)
