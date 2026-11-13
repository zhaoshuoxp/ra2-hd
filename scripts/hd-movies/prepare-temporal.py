"""Prepare the pinned local-only temporal sample environment and official inference weights."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--with-reconstruction', action='store_true', help='Include the official reconstruction-only calibration checkpoint')
args = parser.parse_args()
TOOLS = ROOT / '.local/tooling/hd-movies-temporal'
TOOLS.mkdir(parents=True, exist_ok=True)
python = TOOLS / 'bin/python'
if not python.exists():
    subprocess.run([sys.executable, '-m', 'venv', str(TOOLS)], check=True)
subprocess.run([str(python), '-m', 'pip', 'install', '--no-cache-dir', 'torch==2.15.0', 'numpy==2.5.4', 'pillow==13.0.0'], check=True)
commit = '0a560bba9b79ebe78574e1d4cbbdd0e798e63568'
files = [
    ('upstream/basicvsr_net.py',
     f'https://raw.githubusercontent.com/open-mmlab/mmagic/{commit}/mmagic/models/editors/basicvsr/basicvsr_net.py',
     'fbe7f1c5add38df66458a54ed4d6f1da9ef623708705a97e026a72453f9ec8a0'),
    ('upstream/real_basicvsr_net.py',
     f'https://raw.githubusercontent.com/open-mmlab/mmagic/{commit}/mmagic/models/editors/real_basicvsr/real_basicvsr_net.py',
     '9b66b81031e2dc196eaadd4877d56aedda181efe50051222bd1cb275d3efdfaf'),
    ('models/realbasicvsr-x4.pth',
     'https://download.openmmlab.com/mmediting/restorers/real_basicvsr/'
     'realbasicvsr_c64b20_1x30x8_lr5e-5_150k_reds_20211104-52f77c2c.pth',
     '52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376'),
]
if args.with_reconstruction:
    files.append(('models/realbasicvsr-wogan-x4.pth',
                  'https://download.openmmlab.com/mmediting/restorers/real_basicvsr/'
                  'realbasicvsr_wogan_c64b20_2x30x8_lr1e-4_300k_reds_20211027-0e2ff207.pth',
                  '0e2ff2070a160bf19b26c194f82a0ee2ca8c6c4395a2bf927c768de048f156c1'))
receipt = []
for name, url, expected in files:
    file = TOOLS / name
    file.parent.mkdir(parents=True, exist_ok=True)
    if not file.exists():
        temporary = file.with_suffix(file.suffix + '.download')
        assert not temporary.exists(), 'Inspect the earlier incomplete download first'
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--retry', '2',
                        '--max-filesize', '160000000', '--output', str(temporary), url], check=True)
        with temporary.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected, name
        temporary.rename(file)
    with file.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected, name
    receipt.append(dict(file=name, source=url, bytes=file.stat().st_size, sha256=expected))
(TOOLS / 'source-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
with (TOOLS / 'requirements-lock.txt').open('w') as output:
    subprocess.run([str(python), '-m', 'pip', 'freeze', '--disable-pip-version-check'], stdout=output, check=True)
print(json.dumps(dict(status='READY_FOR_BOUNDED_LOCAL_SAMPLES', files=receipt,
                      policy='No cloud processing; no full-movie production or visual acceptance')))
