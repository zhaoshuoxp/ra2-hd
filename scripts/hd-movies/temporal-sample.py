"""Produce one bounded temporal sample from an original BIK segment, for visual review only."""
import argparse
import gc
import hashlib
import importlib.util
import json
from pathlib import Path
import resource
import subprocess
import threading
import time
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.local/tooling/hd-movies-temporal'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('sample', type=Path)
parser.add_argument('--scale', type=int, choices=[2, 4], default=4)
parser.add_argument('--device', choices=['mps', 'cpu'], default='mps')
parser.add_argument('--cpu-check', action='store_true')
parser.add_argument('--mps-memory-fraction', type=float, default=.7)
parser.add_argument('--cpu-offload', action='store_true')
parser.add_argument('--input-sample', type=Path, help='Reuse immutable source frames/audio without duplicating them')
parser.add_argument('--perceptual-weight', type=float, default=1.0)
parser.add_argument('--clean-threshold', type=float, default=255)
parser.add_argument('--resize-filter', choices=['lanczos', 'area'], default='lanczos')
parser.add_argument('--detail-gain', type=float, default=1.0)
parser.add_argument('--alternate-detail-gain', type=float)
args = parser.parse_args()
out = args.sample.resolve()
source_root = args.input_sample.resolve() if args.input_sample else out
source = json.loads((source_root / 'source.json').read_text())
if args.input_sample:
    out.mkdir(parents=True, exist_ok=False)
    (out / 'source.json').write_text(json.dumps(source, indent=2) + '\n')
assert 2 <= source['frames'] <= 60, 'Representative samples are bounded; no batch production'
assert not (out / 'candidate.mp4').exists(), 'Use a new sample output'

def sha(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

checkpoint = TOOLS / 'models/realbasicvsr-x4.pth'
assert sha(checkpoint) == '52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376'
assert sha(source_root / 'input.rgb') == source['inputSha256']
assert 0 <= args.perceptual_weight <= 1 and 0 < args.clean_threshold <= 255
assert 0 < args.detail_gain <= 1
assert args.alternate_detail_gain is None or 0 < args.alternate_detail_gain <= 1
reconstruction_checkpoint = TOOLS / 'models/realbasicvsr-wogan-x4.pth'
if args.perceptual_weight != 1:
    assert sha(reconstruction_checkpoint) == '0e2ff2070a160bf19b26c194f82a0ee2ca8c6c4395a2bf927c768de048f156c1'
if args.device == 'mps':
    assert torch.backends.mps.is_available(), 'Metal access is required for this sample'
    assert 0 < args.mps_memory_fraction <= .8
    torch.mps.set_per_process_memory_fraction(args.mps_memory_fraction)
torch.set_num_threads(4)
module_spec = importlib.util.spec_from_file_location('temporal_model', Path(__file__).with_name('temporal-model.py'))
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
start = time.perf_counter()
loading_options = dict(cpu_offload=args.cpu_offload, refine_threshold=args.clean_threshold,
                       reconstruction_checkpoint=reconstruction_checkpoint, perceptual_weight=args.perceptual_weight)
model, loading = module.load_network(TOOLS / 'upstream', checkpoint, args.device, **loading_options)
print(json.dumps(dict(phase='model-loaded', seconds=time.perf_counter() - start, loading=loading)), flush=True)
values = np.fromfile(source_root / 'input.rgb', dtype=np.uint8).reshape(source['frames'], source['height'], source['width'], 3)
inputs = torch.from_numpy(values.copy()).permute(0, 3, 1, 2).unsqueeze(0).float() / 255
report = dict(schema='hd-movie-temporal-sample-v1', identity=source['identity'], startFrame=source['startFrame'],
              frames=source['frames'], seconds=source['seconds'], originalSha256=source['sourceSha256'],
              sourceDimensions=[source['width'], source['height']], deliveryScale=args.scale,
              model='RealBasicVSR x4', checkpointSha256=sha(checkpoint), torch=torch.__version__,
              upstreamCommit='0a560bba9b79ebe78574e1d4cbbdd0e798e63568', loading=loading, device=args.device,
              policy='One complete short sequence; no frame interpolation, spatial tiling, speed change or audio generation',
              visualAcceptance='PENDING', completeMovie=False)
report['sourceDirectory'] = str(source_root.relative_to(ROOT))
report['resizeFilter'] = args.resize_filter
report['detailGain'] = args.detail_gain
report['detailPolicy'] = 'Scale the learned high-resolution residual before adding the cleaned-source bilinear base; no post-encode blur or sharpening'
if args.perceptual_weight != 1:
    report['reconstructionCheckpointSha256'] = sha(reconstruction_checkpoint)
if args.device == 'mps':
    report['mpsMemoryFraction'] = args.mps_memory_fraction
    report['mpsRecommendedMaxBytes'] = torch.mps.recommended_max_memory()
if args.cpu_check:
    with torch.inference_mode():
        reference_model, _ = module.load_network(TOOLS / 'upstream', checkpoint, 'cpu', **loading_options)
        reference = reference_model(inputs[:, :2].clone()).cpu()
        actual = model(inputs[:, :2].clone().to(args.device)).cpu()
    difference = (actual - reference).abs()
    report['cpuParity'] = dict(frames=2, meanAbsoluteError=difference.mean().item(), maxAbsoluteError=difference.max().item())
    assert report['cpuParity']['meanAbsoluteError'] < .001, report['cpuParity']
    del reference_model, reference, actual, difference
    print(json.dumps(dict(phase='cpu-parity', result=report['cpuParity'])), flush=True)
    if args.device == 'mps':
        torch.mps.synchronize(); torch.mps.empty_cache()

memory = dict(mpsAllocatedPeak=0, mpsDriverPeak=0)
stop = threading.Event()
def observe_memory():
    while not stop.wait(.1):
        if args.device == 'mps':
            memory['mpsAllocatedPeak'] = max(memory['mpsAllocatedPeak'], torch.mps.current_allocated_memory())
            memory['mpsDriverPeak'] = max(memory['mpsDriverPeak'], torch.mps.driver_allocated_memory())
observer = threading.Thread(target=observe_memory, daemon=True)
observer.start()
counts = {}
def hook(label):
    def observed(*unused):
        counts[label] = counts.get(label, 0) + 1
        if counts[label] % 5 == 0:
            print(json.dumps(dict(phase=label, scheduledFrames=counts[label], elapsedSeconds=time.perf_counter() - start)), flush=True)
    return observed
hooks = [model.image_cleaning.register_forward_hook(hook('cleaning')),
         model.basicvsr.backward_resblocks.register_forward_hook(hook('backward')),
         model.basicvsr.forward_resblocks.register_forward_hook(hook('forward'))]
start = time.perf_counter()
try:
    with torch.inference_mode():
        need_base = args.detail_gain != 1 or args.alternate_detail_gain is not None
        if need_base:
            output, cleaned = model(inputs.clone().to(args.device), return_lqs=True)
        else:
            output = model(inputs.clone().to(args.device))
        if args.device == 'mps':
            torch.mps.synchronize()
        report['inferenceSeconds'] = time.perf_counter() - start
        output = output.cpu()
        if need_base:
            cleaned = cleaned.cpu()
finally:
    stop.set(); observer.join()
    for handle in hooks:
        handle.remove()
assert output.shape == (1, source['frames'], 3, source['height'] * 4, source['width'] * 4)
assert torch.isfinite(output).all(), 'Restoration produced invalid values'
report['memory'] = {**memory, 'processPeakRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
del model
gc.collect()
if args.device == 'mps':
    torch.mps.synchronize(); torch.mps.empty_cache()
    report['memory']['mpsAllocatedAfterRelease'] = torch.mps.current_allocated_memory()
    report['memory']['mpsDriverAfterCacheRelease'] = torch.mps.driver_allocated_memory()
converter = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                     'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
target = out / 'candidate.mp4'
width, height = source['width'] * args.scale, source['height'] * args.scale
command = [converter, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
           '-video_size', f"{source['width'] * 4}x{source['height'] * 4}", '-framerate', str(source['fps']), '-i', 'pipe:0',
           '-i', str(source_root / 'original.mp4'), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-crf', '16',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'copy',
           '-vf', f'scale={width}:{height}:flags={args.resize_filter}:out_color_matrix=bt601:out_range=tv',
           '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv']
report['colorPolicy'] = 'BT.601 limited-range conversion; SMPTE170M matrix/primaries and BT709 transfer at every output size'
def encode(file, gain):
    encoder = subprocess.Popen([*command, str(file)], stdin=subprocess.PIPE)
    for index, frame in enumerate(output[0]):
        if gain != 1:
            base = torch.nn.functional.interpolate(cleaned[0, index:index + 1], scale_factor=4,
                                                   mode='bilinear', align_corners=False)[0]
            frame = base + gain * (frame - base)
        image = frame.clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).contiguous().numpy()
        encoder.stdin.write(image.tobytes())
    encoder.stdin.close()
    assert encoder.wait() == 0, 'Candidate encode failed'

encode(target, args.detail_gain)
alternate = out / 'candidate-alternate.mp4'
if args.alternate_detail_gain is not None:
    encode(alternate, args.alternate_detail_gain)
    report['alternateCandidate'] = dict(file=str(alternate.relative_to(ROOT)), detailGain=args.alternate_detail_gain,
                                         bytes=alternate.stat().st_size, sha256=sha(alternate))
del output, inputs
if need_base:
    del cleaned
def audio_hash(file):
    return subprocess.check_output([converter, '-v', 'error', '-i', str(file), '-map', '0:a:0',
                                    '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip()
report['audioPcmHashOriginalPreview'] = audio_hash(source_root / 'original.mp4')
report['audioPcmHashCandidate'] = audio_hash(target)
assert report['audioPcmHashCandidate'] == report['audioPcmHashOriginalPreview'], 'Remuxed original preview audio differs'
if args.alternate_detail_gain is not None:
    assert audio_hash(alternate) == report['audioPcmHashOriginalPreview']
    subprocess.run([converter, '-nostdin', '-n', '-v', 'error', '-ss', str(source['seconds'] / 2), '-i', str(alternate),
                    '-frames:v', '1', str(out / 'alternate-mid.png')], check=True)
report['cleaningFramesProcessed'] = counts.get('cleaning', 0)
for name, file in [('original', source_root / 'original.mp4'), ('candidate', target)]:
    subprocess.run([converter, '-nostdin', '-n', '-v', 'error', '-ss', str(source['seconds'] / 2), '-i', str(file),
                    '-frames:v', '1', str(out / (name + '-mid.png'))], check=True)
report['candidate'] = dict(file=str(target.relative_to(ROOT)), bytes=target.stat().st_size, sha256=sha(target),
                           width=width, height=height, fps=source['fps'], seconds=source['seconds'])
report['totalSeconds'] = time.perf_counter() - start
(out / 'sample.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
