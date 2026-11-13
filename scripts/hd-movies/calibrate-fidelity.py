"""Compare source-fidelity network variants in an exact bounded production context."""
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

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, required=True)
parser.add_argument('--gpu', type=int, required=True)
parser.add_argument('--mode', choices=['gan', 'no-clean', 'wogan'], required=True)
parser.add_argument('--frame', type=int, default=729)
parser.add_argument('--job', default='yr-a00_f00e-cuda-r1')
args = parser.parse_args()
root = args.workspace.resolve()
job = json.loads((root / 'jobs' / (args.job + '.json')).read_text())
window = next(w for w in job['plan'] if w['start'] <= args.frame < w['flushEnd'])
work = root / 'bench' / (args.job + '-fidelity-' + args.mode)
work.mkdir(exist_ok=True)
assert not (work / 'receipt.json').exists()
torch.set_num_threads(8)
torch.cuda.set_device(args.gpu)
torch.backends.fp32_precision = 'ieee'
torch.backends.cuda.matmul.fp32_precision = 'ieee'
torch.backends.cudnn.fp32_precision = 'ieee'
torch.backends.cudnn.conv.fp32_precision = 'ieee'
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.deterministic = True
import imageio_ffmpeg
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
width, height = job['video']['width'], job['video']['height']
raw = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(root / job['input']['file']),
    '-vf', f'trim=start_frame={window["start"]}:end_frame={window["end"]}', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
values = np.frombuffer(raw, dtype=np.uint8).reshape(window['end'] - window['start'], height, width, 3).copy()
assert all(hashlib.sha256(v.tobytes()).hexdigest() == job['input']['frameRgbSha256'][window['start'] + n] for n, v in enumerate(values))
spec = importlib.util.spec_from_file_location('temporal_model', root / 'worker/temporal-model.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
reconstruction = root / 'models/realbasicvsr-wogan-x4.pth'
if args.mode == 'wogan':
    assert hashlib.sha256(reconstruction.read_bytes()).hexdigest() == '0e2ff2070a160bf19b26c194f82a0ee2ca8c6c4395a2bf927c768de048f156c1'
model, loading = module.load_network(root / 'upstream', root / 'models/realbasicvsr-x4.pth', f'cuda:{args.gpu}',
    cpu_offload=True, refine_threshold=255, reconstruction_checkpoint=reconstruction,
    perceptual_weight=0. if args.mode == 'wogan' else 1.)
if args.mode == 'no-clean':
    model.image_cleaning.forward = lambda tensor: torch.zeros_like(tensor)
results = []


def collect(index, full, cleaned):
    base = F.interpolate(cleaned, scale_factor=4, mode='bilinear', align_corners=False)
    restored = (base + .5 * (full - base)).clamp(0, 1).mul(255).round().byte().float() / 255
    restored = F.interpolate(restored, size=(height * 2, width * 2), mode='area')[0]
    array = restored.clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).numpy()
    results.append(array)
    source_frame = window['start'] + index
    if source_frame in [args.frame - 1, args.frame, args.frame + 1]:
        Image.fromarray(array).save(work / f'candidate-{source_frame:04}.png')
        cleaned_array = cleaned[0].clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).numpy()
        Image.fromarray(cleaned_array).save(work / f'cleaned-{source_frame:04}.png')
        Image.fromarray(values[index]).save(work / f'original-{source_frame:04}.png')


model.basicvsr._frame_consumer = collect
inputs = torch.from_numpy(values).permute(0, 3, 1, 2).unsqueeze(0).float() / 255
started = time.perf_counter()
with torch.inference_mode():
    model(inputs.to(f'cuda:{args.gpu}'))
del model, inputs
gc.collect(); torch.cuda.empty_cache()
command = [ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
    '-video_size', f'{width*2}x{height*2}', '-framerate', '15', '-i', 'pipe:0', '-an', '-c:v', 'libx264',
    '-threads', '8', '-crf', '16', '-preset', 'fast', '-bf', '0', '-pix_fmt', 'yuv420p',
    '-vf', 'scale=iw:ih:out_color_matrix=bt601:out_range=tv', '-colorspace', 'smpte170m',
    '-color_primaries', 'smpte170m', '-color_trc', 'bt709', str(work / 'candidate.mp4')]
child = subprocess.Popen(command, stdin=subprocess.PIPE)
for frame in results:
    child.stdin.write(frame.tobytes())
child.stdin.close(); assert child.wait() == 0
record = dict(schema='hd-movie-fidelity-calibration-v1', identity=job['identity'], mode=args.mode, window=window,
    loading=loading, seconds=time.perf_counter()-started, frames=len(results), detailGain=.5,
    status='RENDERED_AWAITING_VISUAL_REVIEW')
(work / 'receipt.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
