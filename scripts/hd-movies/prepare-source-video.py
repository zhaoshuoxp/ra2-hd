"""Build a lossless, frame-preserving source proxy for reviewed field-repair intervals."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity')
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--treatments', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--trial', action='store_true')
args = parser.parse_args()
source, directory, output = args.source.resolve(), args.directory.resolve(), args.output.resolve()
directory.mkdir(parents=True, exist_ok=True)
output.parent.mkdir(parents=True, exist_ok=True)

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
movie = next(row for row in inventory['movies'] if row['identity'] == args.identity)
specification = json.loads(args.treatments.read_text())
assert specification['schema'] == 'hd-movie-source-treatment-v1'
entry = next(row for row in specification['entries'] if row['identity'] == args.identity)
assert entry['originalSha256'] == movie['original']['sha256'] == sha(source)
assert entry['status'] == 'VERIFIED_SOURCE_REPAIR_INTERVALS' or args.trial and entry['status'] == 'TRIAL'
video = movie['original']['video']
frames, width, height = video['frames'], video['width'], video['height']
assert video['fpsNumerator'] == 15 and video['fpsDenominator'] == 1
intervals = sorted(entry['intervals'], key=lambda row: row['first'])
assert intervals and all(0 <= row['first'] < row['lastExclusive'] <= frames and row['filter'] == 'bwdif-send-frame'
                         and row['parity'] in ['tff', 'bff'] for row in intervals)
assert all(left['lastExclusive'] <= right['first'] for left, right in zip(intervals, intervals[1:]))
recipe = dict(identity=args.identity, originalSha256=sha(source), treatmentSha256=sha(args.treatments),
              intervals=intervals, implementationSha256=sha(Path(__file__)))
recipe_sha = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
receipt_file = directory / 'source-proxy.json'
if receipt_file.exists():
    receipt = json.loads(receipt_file.read_text())
    assert receipt['recipeSha256'] == recipe_sha and sha(output) == receipt['sha256']
    print(json.dumps(dict(status='REUSED_VERIFIED_LOSSLESS_SOURCE_PROXY', identity=args.identity)))
    raise SystemExit(0)
assert not output.exists(), 'Inspect an unreceipted source proxy first'
parts, cursor = [], 0
for interval in intervals:
    if cursor < interval['first']:
        parts.append(dict(first=cursor, lastExclusive=interval['first'], parity=None))
    parts.append(dict(first=interval['first'], lastExclusive=interval['lastExclusive'], parity=interval['parity']))
    cursor = interval['lastExclusive']
if cursor < frames:
    parts.append(dict(first=cursor, lastExclusive=frames, parity=None))
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
for number, part in enumerate(parts):
    file = directory / f'part-{number:03}.mkv'
    record = directory / f'part-{number:03}.json'
    if record.exists():
        cached = json.loads(record.read_text())
        assert cached['recipeSha256'] == recipe_sha and cached['part'] == part and sha(file) == cached['sha256']
        continue
    if file.exists():
        file.unlink()  # Only this tool's interrupted, unreceipted lossless part.
    seek = max(0, part['first'] // 15 - 1)
    graph = f"trim=start_frame={part['first'] - seek * 15}:end_frame={part['lastExclusive'] - seek * 15},setpts=PTS-STARTPTS"
    if part['parity']:
        graph += f",bwdif=mode=send_frame:parity={part['parity']}:deint=all"
    graph += ',format=rgb24,format=bgr0,setparams=range=full:color_primaries=smpte170m:color_trc=bt709:colorspace=0'
    with (directory / 'encoding.log').open('a') as log:
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-ss', str(seek), '-i', str(source),
                        '-map', '0:v:0', '-an', '-vf', graph, '-frames:v', str(part['lastExclusive'] - part['first']),
                        '-fps_mode', 'passthrough', '-c:v', 'ffv1', '-level', '3', '-g', '1', '-pix_fmt', 'bgr0',
                        '-color_range', 'pc', '-colorspace', '0', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', str(file)],
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    record.write_text(json.dumps(dict(recipeSha256=recipe_sha, part=part, sha256=sha(file)), indent=2) + '\n')
concat = directory / 'parts.txt'
concat.write_text(''.join("file '" + str(directory / f'part-{number:03}.mkv').replace("'", "'\\''") + "'\n" for number in range(len(parts))))
temporary = output.with_suffix('.partial.mkv')
if temporary.exists():
    temporary.unlink()
subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat), '-map', '0:v:0',
                '-c:v', 'copy', '-bsf:v', 'setts=pts=N/(15*TB):dts=N/(15*TB):duration=1/(15*TB)', str(temporary)], check=True)
children, original_digest, proxy_digest, unchanged, treated = [], hashlib.sha256(), hashlib.sha256(), 0, 0
try:
    for file in [source, temporary]:
        children.append(subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-threads', '2', '-i', str(file), '-map', '0:v:0',
                                          '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
                                         stdout=subprocess.PIPE))
    for frame in range(frames):
        original, processed = [child.stdout.read(width * height * 3) for child in children]
        assert len(original) == len(processed) == width * height * 3, 'Lossless proxy changed source frame count'
        if any(row['first'] <= frame < row['lastExclusive'] for row in intervals):
            treated += 1
        else:
            assert original == processed, f'Untreated source pixels changed at frame {frame}'
            original_digest.update(original); proxy_digest.update(processed); unchanged += 1
    assert all(not child.stdout.read(1) and child.wait() == 0 for child in children)
finally:
    for child in children:
        child.stdout.close()
        if child.poll() is None:
            child.kill(); child.wait()
assert unchanged + treated == frames and original_digest.hexdigest() == proxy_digest.hexdigest()
temporary.replace(output)
receipt = dict(schema='hd-movie-lossless-source-proxy-v1', identity=args.identity, recipeSha256=recipe_sha, recipe=recipe,
               status='TRIAL_PROXY_VERIFIED' if args.trial else 'VERIFIED_SOURCE_PROXY', file=str(output.relative_to(ROOT)),
               sha256=sha(output), bytes=output.stat().st_size, frames=frames, fps=15, width=width, height=height,
               treatedFrames=treated, untreatedFrames=unchanged, untreatedRgbSha256=original_digest.hexdigest(),
               untreatedPixelEquality='PASS_EVERY_RGB_BYTE', audioPolicy='No proxy audio; delivery must use the original BIK audio directly',
               intervalBoundaryPolicy='Trim each interval before field reconstruction so its context never crosses the reviewed interval')
receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
