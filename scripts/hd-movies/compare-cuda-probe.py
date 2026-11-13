"""Compare every decoded CUDA probe frame with the matching validated MPS production probe."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('--reference', type=Path, required=True)
parser.add_argument('--encoder-control', type=Path, required=True)
args = parser.parse_args()
directory = args.directory.resolve()
receipt = json.loads((directory / 'receipt.json').read_text())
reference = json.loads(args.reference.read_text())
candidate = directory / 'video.mp4'
source = args.reference.parent / 'candidate.mp4'
assert receipt['identity'] == reference['identity'] and receipt['frames'] == reference['video']['frames']
assert receipt['job']['sourceStartFrame'] == reference['recipe']['startFrame']
assert receipt['job']['plan'] == json.loads((args.reference.parent / 'plan.json').read_text())['windows']
assert hashlib.sha256(candidate.read_bytes()).hexdigest() == receipt['file']['sha256']
assert hashlib.sha256(source.read_bytes()).hexdigest() == reference['file']['sha256']
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
children = [subprocess.Popen([ffmpeg, '-v', 'error', '-xerror', '-threads', '2', '-i', str(file), '-an',
                              '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
            for file in [source, candidate]]
rows, previous, temporal = [], None, []
try:
    for frame in range(receipt['frames']):
        values = [child.stdout.read(receipt['width'] * receipt['height'] * 3) for child in children]
        assert all(len(data) == receipt['width'] * receipt['height'] * 3 for data in values)
        a, b = [np.frombuffer(data, dtype=np.uint8).astype(np.int16) for data in values]
        delta = b - a
        rows.append(dict(frame=frame, meanAbsoluteRgbDifference=float(np.abs(delta).mean() / 255),
                         maximumByteDifference=int(np.abs(delta).max())))
        if previous is not None:
            temporal.append(float(np.abs(delta - previous).mean() / 255))
        previous = delta
    assert all(not child.stdout.read(1) and child.wait() == 0 for child in children)
finally:
    for child in children:
        child.stdout.close()
        if child.poll() is None:
            child.kill(); child.wait()
mean = float(np.mean([row['meanAbsoluteRgbDifference'] for row in rows]))
maximum = max(row['meanAbsoluteRgbDifference'] for row in rows)
change = max(temporal)
control = json.loads(args.encoder_control.read_text())
assert control['identicalRawRgbInput'] and control['scope'].startswith('Independent identical-input encoder')
# Two independently quantized references need an encoder-calibrated error budget.
# Operator parity and exact source RGB hashes are checked separately.
mean_limit = min(.006, max(.004, 2 * control['meanAbsoluteRgbDifference']))
passed = mean < mean_limit and maximum < .006 and change < .008
report = dict(schema='hd-movie-cuda-reference-comparison-v1', identity=receipt['identity'],
              status='PASS_FULL_RESOLUTION_REFERENCE_PARITY' if passed else 'FAIL_REFERENCE_PARITY',
              referenceSha256=reference['file']['sha256'], cudaSha256=receipt['file']['sha256'],
              frames=receipt['frames'], meanAbsoluteRgbDifference=mean, maximumFrameMeanDifference=maximum,
              maximumReferenceAdjustedTemporalDifference=change, perFrame=rows,
              encoderControlSha256=hashlib.sha256(args.encoder_control.read_bytes()).hexdigest(),
              thresholds=dict(mean=mean_limit, maximumFrameMean=.006, temporal=.008),
              scope='Every decoded full-resolution frame and residual temporal change; original source time/plan and accepted gain0.5 are identical. Native playback is a separate check.')
(directory / 'reference-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
for file, name in [(source, 'mps-mid.png'), (candidate, 'cuda-mid.png')]:
    target = directory / name
    if not target.exists():
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(file), '-vf', f"select='eq(n,{receipt['frames'] // 2})'",
                        '-frames:v', '1', str(target)], check=True)
assert passed, (mean, maximum, change)
print(json.dumps({key: value for key, value in report.items() if key != 'perFrame'}))
