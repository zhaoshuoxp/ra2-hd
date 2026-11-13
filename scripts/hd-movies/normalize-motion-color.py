"""Set explicit H264/MP4 color metadata without changing decoded pictures or clocks."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--ffmpeg', required=True)
args = parser.parse_args()
source, output = args.work.resolve(), args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
parent_file = source/'receipt.json'
receipt = json.loads(parent_file.read_text())


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def capture(file, arguments):
    return subprocess.check_output([args.ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '2',
                                   '-i', str(file), *arguments], text=True)


def pixels(file, fmt):
    return capture(file, ['-map', '0:v:0', '-an', '-pix_fmt', fmt, '-fps_mode', 'passthrough',
                          '-f', 'hash', '-hash', 'sha256', '-']).strip().split('=', 1)[1]


def packet_rows(file, stream):
    value = capture(file, ['-map', stream, '-c', 'copy', '-f', 'framehash', '-'])
    return [line for line in value.splitlines() if line.startswith('#tb 0:') or line and not line.startswith('#')]


before, after = source/'video.mp4', output/'video.mp4'
assert sha(before) == receipt['file']['sha256']
subprocess.run([args.ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(before),
    '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-bsf:v',
    'h264_metadata=colour_primaries=6:transfer_characteristics=1:matrix_coefficients=6:video_full_range_flag=0',
    '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-colorspace', 'smpte170m',
    '-color_range', 'tv', '-movflags', '+faststart', str(after)], check=True)
proof = {'schema': 'hd-movie-lossless-color-normalization-v1', 'status': 'CHECKING',
    'identity': receipt['identity'], 'parentCandidateSha256': sha(before), 'candidateSha256': sha(after),
    'parentProductionReceiptSha256': sha(parent_file), 'normalizerSha256': sha(Path(__file__)),
    'pictures': {}, 'color': {'range': 'limited', 'matrix': 'smpte170m', 'primaries': 'smpte170m', 'transfer': 'bt709'}}
for fmt in ['yuv420p', 'rgb24']:
    left, right = pixels(before, fmt), pixels(after, fmt)
    assert left == right, 'Decoded picture data changed'
    proof['pictures'][fmt+'Sha256'] = left
left, right = packet_rows(before, '0:a:0'), packet_rows(after, '0:a:0')
assert left == right, 'AAC packet payload or clock changed'
proof['audioPacketClockAndPayloadSha256'] = hashlib.sha256('\n'.join(left).encode()).hexdigest()
left, right = packet_rows(before, '0:v:0'), packet_rows(after, '0:v:0')
assert left[0] == right[0]
clocks = [[row.split(',')[:4] for row in rows[1:]] for rows in [left, right]]
assert clocks[0] == clocks[1] and len(clocks[0]) == receipt['video']['frames']
proof['everyVideoPacketClock'] = 'PASS_IDENTICAL_PTS_DTS_AND_DURATION'
proof['status'] = 'PASS_EVERY_DECODED_YUV_RGB_BYTE_VIDEO_CLOCK_AND_AAC_PACKET_UNCHANGED'
proof['scope'] = 'Only H264 VUI and MP4 color metadata are normalized. Existing source-matched decoded-picture engineering evidence remains applicable.'
proof_file = output/'color-normalization.json'
proof_file.write_text(json.dumps(proof, indent=2)+'\n')
result = copy.deepcopy(receipt)
result['file'] = {'path': 'video.mp4', 'bytes': after.stat().st_size, 'sha256': sha(after)}
result['codecMetadataNormalization'] = {'proofFile': str(proof_file.relative_to(ROOT)),
    'proofSha256': sha(proof_file), **proof}
result['scope'] += ' Explicit color metadata is normalized losslessly; complete decoded RGB/YUV, video packet clocks and original AAC packets match the parent.'
(output/'receipt.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({'status': proof['status'], 'identity': receipt['identity'], 'sha256': sha(after)}))
