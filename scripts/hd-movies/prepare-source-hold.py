"""Preserve a known damaged source clock with an explicit previous-frame hold."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source, directory, output = args.source.resolve(), args.directory.resolve(), args.output.resolve()
directory.mkdir(parents=True, exist_ok=True)
output.parent.mkdir(parents=True, exist_ok=True)
policy_file = ROOT / 'docs/hd-movies-source-damage-handling-20261110.json'
policy = json.loads(policy_file.read_text())
inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
movie = next(row for row in inventory['movies'] if row['identity'] == policy['identity'])
assert policy['identity'] == 'ra2:s10_f00e' and policy['originalFrames'] == 973 and policy['validDecodedFrames'] == 972
video = movie['original']['video']
frames, width, height = video['frames'], video['width'], video['height']
assert frames == 973 and video['fpsNumerator'] == 15 and video['fpsDenominator'] == 1
missing = {272}

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

assert sha(source) == movie['original']['sha256']
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
recipe = dict(originalSha256=sha(source), missingSourcePts=sorted(missing), method='previous-valid-decoded-frame',
              policySha256=sha(policy_file), decoderSha256=sha(Path(ffmpeg)), implementationSha256=sha(Path(__file__)))
recipe_sha = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
receipt_file = directory / 'source-hold.json'
if receipt_file.exists():
    receipt = json.loads(receipt_file.read_text())
    assert receipt['recipeSha256'] == recipe_sha and sha(output) == receipt['sha256']
    print(json.dumps(dict(status='REUSED_VERIFIED_SOURCE_CLOCK_HOLD', identity=movie['identity'])))
    raise SystemExit(0)
assert not output.exists(), 'Inspect an unreceipted held-source proxy'
with (directory / 'original-decode.log').open('w') as log:
    hashes = subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', '-i', str(source), '-map', '0:v:0',
                                      '-fps_mode', 'passthrough', '-f', 'framehash', '-'], stderr=log, text=True)
(directory / 'original-framehash.txt').write_text(hashes)
rows = [line for line in hashes.splitlines() if line and not line.startswith('#')]
assert [int(line.split(',')[2]) for line in rows] == [frame for frame in range(frames) if frame not in missing], 'Unexpected source frame losses'
temporary = output.with_suffix('.partial.mkv')
if temporary.exists():
    temporary.unlink()
graph = (f'fps=fps=15:start_time=0:round=near,trim=end_frame={frames},setpts=PTS-STARTPTS,'
         'format=rgb24,format=bgr0,setparams=range=full:color_primaries=smpte170m:color_trc=bt709:colorspace=0')
with (directory / 'encoding.log').open('w') as log:
    subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(source), '-map', '0:v:0', '-an', '-vf', graph,
                    '-fps_mode', 'passthrough', '-frames:v', str(frames), '-c:v', 'ffv1', '-level', '3', '-g', '1',
                    '-pix_fmt', 'bgr0', '-color_range', 'pc', '-colorspace', '0', str(temporary)],
                   stdout=log, stderr=subprocess.STDOUT, check=True)
children, digest, previous, copied = [], hashlib.sha256(), None, 0
try:
    for file in [source, temporary]:
        children.append(subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-i', str(file), '-map', '0:v:0', '-an',
                                          '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
                                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL))
    for frame in range(frames):
        original = previous if frame in missing else children[0].stdout.read(width * height * 3)
        processed = children[1].stdout.read(width * height * 3)
        assert original is not None and len(original) == len(processed) == width * height * 3
        assert original == processed, f'Valid source pixels changed or the hold shifted at frame {frame}'
        digest.update(processed)
        previous = original
        copied += frame not in missing
    assert all(not child.stdout.read(1) and child.wait() == 0 for child in children)
finally:
    for child in children:
        child.stdout.close()
        if child.poll() is None:
            child.kill(); child.wait()
temporary.replace(output)
checkpoints = [268, 269, 270, 271, 272, 273, 274, 275, 280, 287, 300, 330, 360, 450, 600, 972]
expression = '+'.join(f'eq(n,{frame})' for frame in checkpoints)
subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(output), '-map', '0:v:0',
                '-vf', f"select='{expression}'", '-fps_mode', 'vfr', str(directory / 'recovered-%03d.png')], check=True)
receipt = dict(schema='hd-movie-source-clock-hold-v1', identity=movie['identity'], status='VERIFIED_SOURCE_CLOCK_AND_VALID_PIXELS_POST_DAMAGE_VISUAL_AUDIT_PENDING',
               recipeSha256=recipe_sha, recipe=recipe, file=str(output.relative_to(ROOT)), sha256=sha(output), bytes=output.stat().st_size,
               frames=frames, validDecodedFrames=copied, fps=15, durationSeconds=frames / 15,
               holds=[dict(frame=frame, sourceFrame=frame - 1, seconds=1 / 15) for frame in sorted(missing)],
               allValidDecodedRgbEquality='PASS_EVERY_RGB_BYTE', heldFrameEquality='PASS_PREVIOUS_VALID_SOURCE_FRAME', decodedRgbSha256=digest.hexdigest(),
               audioPolicy='Use original BIK audio unchanged in source time; proxy contains no audio',
               checkpoints=[dict(frame=frame, file=f'recovered-{number:03}.png') for number, frame in enumerate(checkpoints, 1)])
receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
