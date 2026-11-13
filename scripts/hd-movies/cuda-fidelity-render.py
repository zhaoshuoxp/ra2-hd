"""Rebuild source-sensitive shots while reusing every unaffected immutable segment."""
import argparse
import gc
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import numpy as np
import torch
import torch.nn.functional as F
from production_plan import weights

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('job', type=Path)
parser.add_argument('--workspace', type=Path, required=True)
parser.add_argument('--gpu', type=int, default=0)
parser.add_argument('--cpu-parity', action='store_true')
args = parser.parse_args()
root, job_file = args.workspace.resolve(), args.job.resolve()
job = json.loads(job_file.read_text())
assert job['schema'] == 'hd-movie-cuda-job-v1'
assert job['settings'] == dict(detailGain=.5, cleanThreshold=255, window=40, overlap=10, fps=15, precision='ieee-fp32', cleaningBypassShots=job['treatment']['shots'])
source = (root / job['input']['file']).resolve()
assert source.is_relative_to(root)
work = root / 'outputs' / job['jobId']
work.mkdir(parents=True, exist_ok=True)
video = job['video']
frames, width, height = video['frames'], video['width'], video['height']
assert width in [140, 640, 800] and 0 < frames <= 10000
scale = 4 if width == 140 else 2
output_width, output_height = width * scale, height * scale


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, record):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(record, indent=2) + '\n')
    temporary.replace(file)


assert sha(source) == job['input']['sha256']
assert len(job['input']['frameRgbSha256']) == frames
for file, expected in job['implementation'].items():
    assert sha(root / file) == expected, 'Worker implementation changed'
checkpoint = root / 'models/realbasicvsr-x4.pth'
assert sha(checkpoint) == job['checkpointSha256'] == '52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376'
job_sha = sha(job_file)
output = work / 'video.mp4'
if (work / 'receipt.json').exists():
    receipt = json.loads((work / 'receipt.json').read_text())
    assert receipt['jobSha256'] == job_sha and sha(output) == receipt['file']['sha256']
    print(json.dumps(dict(status='REUSED_COMPLETE_CUDA_VIDEO', identity=job['identity'])), flush=True)
    raise SystemExit(0)
assert not output.exists(), 'Inspect an unreceipted CUDA output first'
assert torch.cuda.is_available()
torch.set_num_threads(8)
torch.cuda.set_device(args.gpu)
torch.cuda.set_per_process_memory_fraction(.85, args.gpu)
torch.backends.fp32_precision = 'ieee'
torch.backends.cuda.matmul.fp32_precision = 'ieee'
torch.backends.cudnn.fp32_precision = 'ieee'
torch.backends.cudnn.conv.fp32_precision = 'ieee'
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.deterministic = True
device = f'cuda:{args.gpu}'
free, total = torch.cuda.mem_get_info(args.gpu)
assert free > total * .9, 'Selected GPU is occupied; leave other workloads intact'
import imageio_ffmpeg
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
color = ['-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv']
plan = job['plan']
assert plan and plan[-1]['end'] == frames and plan[-1]['flushEnd'] == frames
cached = {}
for number, item in enumerate(job['reuseSegments']):
    if item is None:
        continue
    assert number < len(plan) and plan[number]['shot'] not in job['treatment']['shots']
    original = (root / item['file']).resolve()
    assert original.is_relative_to(root) and sha(original) == item['sha256']
    segment = work / f'segment-{number:05}.mp4'
    metadata = work / f'segment-{number:05}.json'
    if not metadata.exists():
        if segment.exists():
            assert sha(segment) == item['sha256']
        else:
            os.link(original, segment)
        save(metadata, dict(jobSha256=job_sha, window=plan[number], first=item['first'], last=item['last'],
                            file=segment.name, sha256=item['sha256'], bytes=item['bytes'], reusedFrom=item))
for number, window in enumerate(plan):
    metadata, segment = work / f'segment-{number:05}.json', work / f'segment-{number:05}.mp4'
    if metadata.exists():
        row = json.loads(metadata.read_text())
        assert row['jobSha256'] == job_sha and row['window'] == window and sha(segment) == row['sha256']
        cached[number] = row
    elif segment.exists():
        segment.unlink()
missing = next((n for n in range(len(plan)) if n not in cached), len(plan))
missing_indices = set(range(len(plan))) - set(cached)
required = {previous for number in missing_indices for previous in range(max(0, number - 2), number + 1)}
spec = importlib.util.spec_from_file_location('temporal_model', root / 'worker/temporal-model.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
started = time.perf_counter()
model, loading = module.load_network(root / 'upstream', checkpoint, device, cpu_offload=True)
cleaning_forward = model.image_cleaning.forward
loading['cleaningStrategy'] = 'Whole source-sensitive shots bypass learned pre-cleaning; unaffected segments remain immutable'
loading['cleaningBypassShots'] = job['treatment']['shots']
progress = dict(schema='hd-movie-cuda-progress-v1', identity=job['identity'], jobId=job['jobId'], pid=os.getpid(),
                host=socket.gethostname(), gpu=args.gpu, frames=frames, completedFrames=0, status='MODEL_READY')


def status(**values):
    progress.update(values, elapsedSeconds=time.perf_counter() - started)
    save(work / 'progress.json', progress)
    print(json.dumps(progress), flush=True)


status()
pending, source_frames, cursor, emitted = {}, {}, 0, 0
digest = hashlib.sha256()
timings, parity = [], None
with (work / 'decode.log').open('ab') as log:
    decoder = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '2', '-i', str(source),
                                '-map', '0:v:0', '-an', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough',
                                '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE, stderr=log)
    try:
        for number, window in enumerate(plan):
            while cursor < window['end']:
                data = decoder.stdout.read(width * height * 3)
                assert len(data) == width * height * 3, 'Canonical input ended early'
                assert hashlib.sha256(data).hexdigest() == job['input']['frameRgbSha256'][cursor], f'Canonical RGB mismatch at frame {cursor}'
                digest.update(data)
                source_frames[cursor] = np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3)
                cursor += 1
            if number in required:
                model.image_cleaning.forward = (lambda value: torch.zeros_like(value)) if window['shot'] in job['treatment']['shots'] else cleaning_forward
                values = np.stack([source_frames[frame] for frame in range(window['start'], window['end'])])
                if len(values) == 1:
                    values = np.repeat(values, 2, axis=0)
                inputs = torch.from_numpy(values.copy()).permute(0, 3, 1, 2).unsqueeze(0).float() / 255
                if args.cpu_parity and parity is None:
                    tiny = F.interpolate(inputs[0, :2], size=(96, 128), mode='area').unsqueeze(0)
                    reference_model, _ = module.load_network(root / 'upstream', checkpoint, 'cpu', cpu_offload=True)
                    if window['shot'] in job['treatment']['shots']:
                        reference_model.image_cleaning.forward = lambda value: torch.zeros_like(value)
                    with torch.inference_mode():
                        reference = reference_model(tiny.clone()).cpu()
                        actual = model(tiny.clone().to(device)).cpu()
                    difference = (reference - actual).abs()
                    parity = dict(meanAbsoluteError=difference.mean().item(), maxAbsoluteError=difference.max().item(),
                                  scope='Two128x96frame operator parity; full-resolution production-reference comparison is separate')
                    save(work / 'cpu-parity.json', parity)
                    print(json.dumps(dict(cpuParity=parity)), flush=True)
                    assert parity['meanAbsoluteError'] < .001 and parity['maxAbsoluteError'] < .02
                    del reference_model, reference, actual, difference, tiny
                restored = []

                def collect(index, full, cleaned):
                    if index < window['end'] - window['start']:
                        base = F.interpolate(cleaned, scale_factor=4, mode='bilinear', align_corners=False)
                        image = (base + .5 * (full - base))[0]
                        restored.append(image.clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).contiguous().numpy())

                model.basicvsr._frame_consumer = collect
                torch.cuda.synchronize(args.gpu)
                before = time.perf_counter()
                with torch.inference_mode():
                    assert model(inputs.to(device)) is None
                torch.cuda.synchronize(args.gpu)
                seconds = time.perf_counter() - before
                timings.append(dict(window=number, contextFrames=len(values), inferenceSeconds=seconds))
                del model.basicvsr._frame_consumer, inputs, values
                assert len(restored) == window['end'] - window['start']
                for frame, image, weight in zip(range(window['start'], window['end']), restored, weights(window)):
                    pending.setdefault(frame, []).append((image, weight))
                del restored
            if number not in cached:
                segment = work / f'segment-{number:05}.mp4'
                command = [ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
                           '-video_size', f'{width * 4}x{height * 4}', '-framerate', '15', '-i', 'pipe:0', '-an',
                           '-c:v', 'libx264', '-threads', '8', '-preset', 'fast', '-crf', '16', '-profile:v', 'high',
                           '-level:v', '4.0', '-bf', '0', '-g', '30', '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360',
                           '-vf', f'scale={output_width}:{output_height}:flags=area:out_color_matrix=bt601:out_range=tv', *color, str(segment)]
                with (work / 'encode.log').open('ab') as encoder_log:
                    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=encoder_log)
                    try:
                        for frame in range(emitted, window['flushEnd']):
                            estimates = pending[frame]
                            if len(estimates) == 1:
                                image = estimates[0][0]
                            else:
                                value = np.zeros_like(estimates[0][0], dtype=np.float32)
                                for estimate, weight in estimates:
                                    value += estimate * weight
                                image = np.rint(value / sum(weight for _, weight in estimates)).clip(0, 255).astype(np.uint8)
                            encoder.stdin.write(image.tobytes())
                        encoder.stdin.close()
                        assert encoder.wait() == 0
                    finally:
                        if encoder.poll() is None:
                            encoder.kill(); encoder.wait()
                save(work / f'segment-{number:05}.json', dict(jobSha256=job_sha, window=window, first=emitted,
                     last=window['flushEnd'], file=segment.name, sha256=sha(segment), bytes=segment.stat().st_size))
            emitted = window['flushEnd']
            pending = {frame: estimates for frame, estimates in pending.items() if frame >= emitted}
            next_start = plan[number + 1]['start'] if number + 1 < len(plan) else frames
            source_frames = {frame: data for frame, data in source_frames.items() if frame >= next_start}
            gc.collect(); torch.cuda.empty_cache()
            status(status='RESTORING', completedFrames=emitted, window=number + 1, windows=len(plan))
        assert cursor == emitted == frames and not pending and not decoder.stdout.read(1) and decoder.wait() == 0
        assert digest.hexdigest() == job['input']['decodedRgbSha256'], 'Canonical RGB input differs from the Mac'
    finally:
        decoder.stdout.close()
        if decoder.poll() is None:
            decoder.kill(); decoder.wait()
        del model, cleaning_forward
        gc.collect(); torch.cuda.empty_cache(); torch.cuda.synchronize(args.gpu)
memory = dict(cudaPeakAllocated=torch.cuda.max_memory_allocated(args.gpu), cudaPeakReserved=torch.cuda.max_memory_reserved(args.gpu),
              cudaAllocatedAfterRelease=torch.cuda.memory_allocated(args.gpu), totalDeviceBytes=total)
assert memory['cudaAllocatedAfterRelease'] == 0
concat = work / 'segments.txt'
concat.write_text(''.join(f"file 'segment-{number:05}.mp4'\n" for number in range(len(plan))))
partial = work / 'video.partial.mp4'
partial.unlink(missing_ok=True)
subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat), '-map', '0:v:0',
                '-c:v', 'copy', '-bsf:v', 'setts=pts=N/(15*TB):dts=N/(15*TB):duration=1/(15*TB)',
                '-video_track_timescale', '15360', '-movflags', '+faststart', *color, str(partial)], check=True)
packets = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(partial), '-map', '0:v:0', '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
tb = next(row.split(': ', 1)[1] for row in packets.splitlines() if row.startswith('#tb 0:'))
numerator, denominator = map(int, tb.split('/'))
rows = [row for row in packets.splitlines() if row and not row.startswith('#')]
assert len(rows) == frames and all(abs(int(row.split(',')[2]) * numerator / denominator - n / 15) < .0001 for n, row in enumerate(rows))
subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-i', str(partial), '-f', 'null', '-'], check=True)
partial.replace(output)
receipt = dict(schema='hd-movie-cuda-video-receipt-v1', identity=job['identity'], jobSha256=job_sha,
               status='VIDEO_RENDERED_AWAITING_MAC_AUDIO_AND_FULL_FILM_AUDIT', job=job,
               file=dict(file=str(output.relative_to(root)), sha256=sha(output), bytes=output.stat().st_size),
               frames=frames, fps=15, width=output_width, height=output_height, precision='ieee-fp32',
               torch=torch.__version__, cuda=torch.version.cuda, device=torch.cuda.get_device_name(args.gpu),
               host=socket.gethostname(), gpu=args.gpu, memory=memory, loading=loading, timings=timings,
               cpuParity=parity, reusedSegments=len(cached), recomputedSegments=len(missing_indices), packetClock='PASS_EVERY_PRESENTATION_TIMESTAMP', decode='PASS_COMPLETE_VIDEO',
               sourceRgbEquality='PASS_MAC_CANONICAL_RGB_SHA256', elapsedSeconds=time.perf_counter() - started)
save(work / 'receipt.json', receipt)
status(status=receipt['status'], completedFrames=frames)
