"""Fetch explicitly selected files from the author's public Quark share for local review."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.parse

BASE = 'https://drive-pc.quark.cn/1/clouddrive/'
SHARE = '11453ba6735a'
FILES = {
    'ra2-1080-installer.exe': '5b66d4bd223b473a9be16b47c0565fbe',
    'yr-1080-installer.exe': 'fe8164724cd543ff87f0d69a82572cd7',
    'yr-720-installer.exe': 'c3c84137339e44e5a2666b37c7134ab4',
    'yr-720-1.bin': '94de224a415645bd81156447ed1e133f',
    'yr-1080-1.bin': 'db3c3700a0cf4347b6da43e04aea2a7f',
    'yr-1080-2.bin': 'c6285939465e455a8e381c926dcb423c',
    'ra2-720-1.bin': '8ae5fde0b41e462ca321b4f4ce93e5a9',
    'ra2-720-2.bin': 'e2f097622adb43c6831b9d266831add6',
    'ra2-1080-1.bin': '058b5fa6108a47e0b0059b5874603200',
    'ra2-1080-2.bin': '4e79c069cff940bfa6c8faa29efce145',
    'ra2-1080-3.bin': '224e0eb9bca5466baabaf8b03ce56165',
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('file', choices=FILES)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--head-bytes', type=int)
parser.add_argument('--list-folder')
args = parser.parse_args()
assert not args.output.exists(), 'Use a new output path'
args.output.parent.mkdir(parents=True, exist_ok=True)
cookie_file = tempfile.NamedTemporaryFile(prefix='ra2-hd-movies-public-', suffix='.cookies')
user_agent = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
common = ['curl', '--silent', '--show-error', '--cookie', cookie_file.name, '--cookie-jar', cookie_file.name,
          '-A', user_agent, '-H', 'Referer: https://pan.quark.cn/', '-H', 'Origin: https://pan.quark.cn']
subprocess.run([*common, '--max-time', '30', '--output', '/dev/null', 'https://pan.quark.cn/s/' + SHARE], check=True)

def request(endpoint, payload):
    response = subprocess.check_output([
        *common, '--max-time', '30', '-H', 'Content-Type: application/json', '--data', json.dumps(payload),
        BASE + endpoint + '?pr=ucpro&fr=pc',
    ])
    try:
        result = json.loads(response)
    except json.JSONDecodeError:
        raise RuntimeError('Public API returned a non-JSON response: ' + response[:120].decode(errors='replace')) from None
    assert result.get('status') == 200, {key: result.get(key) for key in ['status', 'code', 'message']}
    return result['data']

token = request('share/sharepage/token', {'pwd_id': SHARE, 'passcode': ''})['stoken']
if args.list_folder:
    query = urllib.parse.urlencode(dict(pr='ucpro', fr='pc', pwd_id=SHARE, stoken=token,
                                       pdir_fid=args.list_folder, _page=1, _size=100))
    result = json.loads(subprocess.check_output([*common, '--fail', '--max-time', '30',
                                               BASE + 'share/sharepage/detail?' + query]))
    for row in result['data']['list']:
        print(json.dumps({key: row.get(key) for key in ['fid', 'file_name', 'size', 'file_type']}))
    raise SystemExit(0)
download = request('file/download', {'fids': [FILES[args.file]], 'pwd_id': SHARE, 'stoken': token})[0]
command = [*common, '--location', '--fail', '--retry', '2', '--connect-timeout', '30']
if args.head_bytes:
    assert 0 < args.head_bytes <= 16 * 1024 * 1024
    command += ['--range', f'0-{args.head_bytes - 1}', '--max-filesize', str(args.head_bytes)]
command += ['--output', str(args.output), download['download_url']]
result = subprocess.run(command)
assert result.returncode == 0, f'Public download failed with curl exit {result.returncode}; no payload accepted'
size = args.output.stat().st_size
assert size == (args.head_bytes or download['size']), (size, download['size'])
with args.output.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
receipt = dict(schema='hd-movie-public-download-v1', source='https://pan.quark.cn/s/' + SHARE,
               authorRelease='https://www.bilibili.com/video/BV1iP411g7zm/', file=args.file,
               remoteFid=FILES[args.file], remoteBytes=download['size'], bytes=size, sha256=digest,
               partial=bool(args.head_bytes), publication='LOCAL_ONLY_NO_REDISTRIBUTION')
args.output.with_suffix(args.output.suffix + '.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
