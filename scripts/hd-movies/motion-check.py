"""Verify a complete repaired movie against its pinned R5 master and export evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def run(ffmpeg, arguments):
    return subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', '-xerror', *arguments], text=True)


def check(job_file, workspace, work, output, ffmpeg):
    job = json.loads(job_file.read_text())
    receipt_file = work/'receipt.json'
    receipt = json.loads(receipt_file.read_text())
    source, candidate = workspace/job['source']['file'], work/'video.mp4'
    assert sha(source) == job['source']['sha256'] == receipt['source']['sha256']
    assert sha(candidate) == receipt['file']['sha256']
    assert sha(job_file) == receipt['jobSha256']
    assert receipt['implementationSha256'] == job['operatorSha256']
    count = job['frames']
    assert [r['frame'] for r in receipt['records']] == list(range(count))
    for partition in job['partitions']:
        if partition['mode'] == 'keep':
            assert all(r['meanAlpha'] == 0 and r['unchangedPixels'] == job['width']*job['height']
                       for r in receipt['records'][partition['first']:partition['lastExclusive']])
    output.mkdir(parents=True, exist_ok=True)
    result_file = output/'check.json'
    if result_file.exists():
        prior = json.loads(result_file.read_text())
        assert prior['candidateSha256'] == receipt['file']['sha256'] and prior['checkerSha256'] == sha(Path(__file__))
        return prior
    decoded = run(ffmpeg, ['-threads', '2', '-i', str(candidate), '-map', '0:v:0', '-map', '0:a:0',
                          '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'])
    assert int([s.split('=', 1)[1] for s in decoded.splitlines() if s.startswith('frame=')][-1]) == count
    clock = run(ffmpeg, ['-i', str(candidate), '-map', '0:v:0', '-c:v', 'copy', '-f', 'framehash', '-'])
    numerator, denominator = map(int, next(s.split(': ', 1)[1] for s in clock.splitlines() if s.startswith('#tb 0:')).split('/'))
    packets = [s.split(',') for s in clock.splitlines() if s and not s.startswith('#')]
    assert len(packets) == count
    assert all(abs(int(p[2])*numerator/denominator-n/15) < .0001 for n, p in enumerate(packets))
    audio = []
    for path in [source, candidate]:
        encoded = run(ffmpeg, ['-i', str(path), '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', '-']).strip().split('=', 1)[1]
        pcm = run(ffmpeg, ['-i', str(path), '-map', '0:a:0', '-af', f'atrim=end={count/15}',
                          '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-']).strip().split('=', 1)[1]
        audio.append({'encodedPacketSha256': encoded, 'decodedPcmSha256': pcm})
    assert audio[0] == audio[1], 'Audio packets, priming or source-clock PCM changed'
    frames = set(job.get('evidenceFrames', []))
    changed = sorted(receipt['records'], key=lambda r: r['meanAlpha'], reverse=True)
    frames.update(r['frame'] for r in changed[:4])
    for partition in job['partitions']:
        if partition['mode'] != 'keep':
            frames.update([partition['first'], (partition['first']+partition['lastExclusive']-1)//2,
                           partition['lastExclusive']-1])
    frames = sorted(n for n in frames if 0 <= n < count)
    image_pins = []
    selection = '+'.join(f'eq(n\\,{n})' for n in frames)
    for kind, path in [('before', source), ('candidate', candidate)]:
        directory = output/kind
        directory.mkdir(exist_ok=True)
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-xerror', '-threads', '2', '-i', str(path),
                        '-map', '0:v', '-an', '-vf', f'select={selection}', '-fps_mode', 'passthrough',
                        str(directory/'frame-%04d.png')], check=True)
        exported = sorted(directory.glob('frame-*.png'))
        assert len(exported) == len(frames)
        for frame, path in zip(frames, exported):
            image_pins.append({'frame': frame, 'kind': kind, 'file': str(path.relative_to(output)), 'sha256': sha(path)})
    result = {'schema': 'hd-movie-motion-complete-file-check-v1',
        'status': 'PASS_COMPLETE_DECODE_EVERY_PTS_AND_IDENTICAL_R5_AUDIO', 'identity': job['identity'],
        'candidateSha256': receipt['file']['sha256'], 'sourceSha256': job['source']['sha256'],
        'jobSha256': sha(job_file), 'productionReceiptSha256': sha(receipt_file), 'checkerSha256': sha(Path(__file__)),
        'frames': count, 'dimensions': [job['width'], job['height']], 'fps': 15, 'audio': audio[1],
        'changedFrames': sum(r['meanAlpha'] > 0 for r in receipt['records']),
        'meanAlpha': sum(r['meanAlpha'] for r in receipt['records'])/count,
        'evidenceFrames': frames, 'images': image_pins, 'checkedUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'scope': 'Full candidate audiovisual decode, every presentation timestamp, identical R5 AAC packets and trimmed PCM. All protected keep intervals have zero alpha and complete preencode RGB preservation. Native evidence is exported for separate visual engineering review.'}
    result_file.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({key: result[key] for key in ['status', 'identity', 'frames', 'changedFrames', 'meanAlpha']}), flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['job', 'workspace', 'work', 'output']:
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--ffmpeg', required=True)
    args = parser.parse_args()
    check(args.job.resolve(), args.workspace.resolve(), args.work.resolve(), args.output.resolve(), args.ffmpeg)
