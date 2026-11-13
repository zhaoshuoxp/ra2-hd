"""Render full short-film source-fidelity gain controls with the same pinned local model."""
import argparse
import gc
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
from production_plan import weights

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.local/tooling/hd-movies-temporal'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--job', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--gains', default='0.5,0.25,0.15')
args = parser.parse_args()
args.directory = args.directory.resolve(); args.directory.mkdir(parents=True, exist_ok=True)
job = json.loads(args.job.read_text()); frames = job['video']['frames']
assert frames <= 180 and job['sourceStartFrame'] == 0 and not job['probe']
gains = [float(s) for s in args.gains.split(',')]; assert all(0 < g <= .5 for g in gains)
source = ROOT / '.artifacts/hd-movies/cuda-r1/bundle' / job['input']['file']
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
    'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


checkpoint = TOOLS / 'models/realbasicvsr-x4.pth'
assert sha(checkpoint) == job['checkpointSha256'] and sha(source) == job['input']['sha256']
width, height = job['video']['width'], job['video']['height']
raw = subprocess.check_output([ffmpeg, '-v', 'error', '-xerror', '-i', str(source), '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
values = np.frombuffer(raw, dtype=np.uint8).reshape(frames, height, width, 3).copy()
assert all(hashlib.sha256(v.tobytes()).hexdigest() == job['input']['frameRgbSha256'][n] for n, v in enumerate(values))
torch.set_num_threads(8)
spec = importlib.util.spec_from_file_location('temporal_model', Path(__file__).with_name('temporal-model.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
model, loading = module.load_network(TOOLS / 'upstream', checkpoint, 'mps', cpu_offload=True)
model.image_cleaning.forward = lambda tensor: torch.zeros_like(tensor)
scale = 4 if width == 140 else 2
sums = {gain: np.zeros((frames, height * 4, width * 4, 3), dtype=np.float32) for gain in gains}
totals = np.zeros(frames, dtype=np.float32)
started = time.perf_counter()
for window in job['plan']:
    input = torch.from_numpy(values[window['start']:window['end']].copy()).permute(0, 3, 1, 2).unsqueeze(0).float() / 255
    blend_weights = weights(window)

    def collect(index, full, cleaned):
        base = F.interpolate(cleaned, scale_factor=4, mode='bilinear', align_corners=False)
        frame, weight = window['start'] + index, blend_weights[index]
        for gain in gains:
            array = (base + gain * (full - base))[0].clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).numpy()
            sums[gain][frame] += array * weight
        totals[frame] += weight

    model.basicvsr._frame_consumer = collect
    with torch.inference_mode():
        assert model(input.to('mps')) is None
    del input, model.basicvsr._frame_consumer
    gc.collect(); torch.mps.synchronize(); torch.mps.empty_cache()
assert np.all(totals > 0)
del model; gc.collect(); torch.mps.synchronize(); torch.mps.empty_cache()
selected = sorted({0, min(17, frames - 1), min(18, frames - 1), frames // 2, frames * 3 // 4, frames - 1})
entries = []
for gain in gains:
    work = args.directory / ('gain-' + str(gain).replace('.', '-')); work.mkdir(exist_ok=True)
    output = work / 'video.mp4'
    command = [ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
        '-video_size', f'{width * 4}x{height * 4}', '-framerate', '15', '-i', 'pipe:0', '-an', '-c:v', 'libx264',
        '-threads', '4', '-preset', 'fast', '-crf', '16', '-profile:v', 'high', '-level:v', '4.0', '-bf', '0', '-g', '30',
        '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360', '-vf',
        f'scale={width * scale}:{height * scale}:flags=area:out_color_matrix=bt601:out_range=tv',
        '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv', str(output)]
    child = subprocess.Popen(command, stdin=subprocess.PIPE)
    for n, array in enumerate(sums.pop(gain)):
        child.stdin.write(np.rint(array / totals[n]).clip(0, 255).astype(np.uint8).tobytes())
    child.stdin.close(); assert child.wait() == 0
    expression = '+'.join(f'eq(n,{n})' for n in selected)
    subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(output), '-vf', f"select='{expression}'",
        '-fps_mode', 'vfr', str(work / 'candidate-native-%02d.png')], check=True)
    for index, n in enumerate(selected, 1):
        Image.fromarray(values[n]).save(work / f'original-native-{index:02}.png')
    record = dict(identity=job['identity'], detailGain=gain, candidateSha256=sha(output), selectedFrames=selected,
        video=dict(file=str(output.relative_to(ROOT)), width=width * scale, height=height * scale, frames=frames, fps=15),
        sourceInputSha256=sha(source), originalSha256=job['original']['sha256'], checkpointSha256=sha(checkpoint),
        contextPlan=job['plan'], modelLoading=loading, cleaning='bypass-learned-image-cleaning', backend='mps',
        implementationSha256=sha(Path(__file__)), modelImplementationSha256=sha(Path(__file__).with_name('temporal-model.py')),
        userMaximumDetailGain=.5, scope='Complete short-film calibration under the accepted restrained direction; independent engineering review pending')
    (work / 'receipt.json').write_text(json.dumps(record, indent=2) + '\n'); entries.append(record)
summary = dict(schema='hd-movie-source-detail-calibration-v1', identity=job['identity'], entries=entries,
    elapsedSeconds=time.perf_counter() - started, allocatedAfterRelease=torch.mps.current_allocated_memory())
(args.directory / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(dict(status='COMPLETE_SHORT_FILM_GAIN_CONTROLS_READY', identity=job['identity'], gains=gains,
    seconds=summary['elapsedSeconds'], allocatedAfterRelease=summary['allocatedAfterRelease'])))
