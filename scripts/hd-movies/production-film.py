"""Restore one verified retail movie with resumable segments and bounded temporal context."""
import argparse
import gc
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import resource
import subprocess
import threading
import time
import numpy as np
import torch
import torch.nn.functional as F
from production_plan import windows, weights
from production_source import video_input

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / '.local/tooling/hd-movies-temporal'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity')
parser.add_argument('--source-index', type=Path, required=True)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--window', type=int, default=40)
parser.add_argument('--overlap', type=int, default=10)
parser.add_argument('--start-frame', type=int, default=0)
parser.add_argument('--frames', type=int)
parser.add_argument('--probe', action='store_true')
parser.add_argument('--ignore-cuts', action='store_true')
parser.add_argument('--video-source-receipt', type=Path, help='Verified video-only recovery or field-repair input; audio stays retail')
args = parser.parse_args()
work, output = args.work.resolve(), args.output.resolve()
work.mkdir(parents=True, exist_ok=True)
output.parent.mkdir(parents=True, exist_ok=True)

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def read(file):
    return json.loads(file.read_text())

def write(file, value):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(file)

inventory_file = ROOT / 'docs/hd-movies-inventory-20261109.json'
inventory = read(inventory_file)
movie = next(movie for movie in inventory['movies'] if movie['identity'] == args.identity)
index = read(args.source_index)
assert sha(inventory_file) == index['inventorySha256']
member = next(item for item in index['sources'] if item['identity'] == args.identity)
archive = next(item for item in index['archives'] if item['file'] == member['archive'])
video = movie['original']['video']
assert video['fpsNumerator'] == 15 and video['fpsDenominator'] == 1
assert movie['original']['audio']['tracks'] == 1, 'Audit nonstandard audio before production'
frames = args.frames if args.frames is not None else video['frames']
assert 0 <= args.start_frame < video['frames'] and 0 < frames <= video['frames'] - args.start_frame
assert 2 <= args.window <= 60 and 0 < args.overlap < args.window
assert args.probe or args.start_frame == 0 and frames == video['frames'] and args.window == 40 and args.overlap == 10 and not args.ignore_cuts
assert not args.probe or frames <= 180 and output.is_relative_to(ROOT / '.artifacts')
acceptance = read(ROOT / 'docs/hd-movies-natural-acceptance-20261110.json')
assert acceptance['status'] == 'ACCEPTED_REPRESENTATIVE_DIRECTION' and acceptance['fullBatchAuthorized']
assert acceptance['settings']['detailGain'] == .5 and acceptance['settings']['resizeFilter'] == 'area'
checkpoint = TOOLS / 'models/realbasicvsr-x4.pth'
assert sha(checkpoint) == acceptance['settings']['checkpointSha256']
assert torch.backends.mps.is_available(), 'Normal host Metal access is required'
torch.mps.set_per_process_memory_fraction(.7)
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
color = ['-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv']
scale = 4 if video['width'] == 140 else 2
width, height = video['width'] * scale, video['height'] * scale
recipe = dict(sourceSha256=member['sha256'], checkpointSha256=sha(checkpoint), detailGain=.5, cleanThreshold=255,
              window=args.window, overlap=args.overlap, startFrame=args.start_frame, frames=frames, ignoreCuts=args.ignore_cuts,
              implementation={name: sha(Path(__file__).with_name(name)) for name in ['production-film.py', 'production_plan.py', 'temporal-model.py', 'production_source.py']})
source = work / 'source-temporary.bik'
stat = (ROOT / member['archive']).stat()
assert stat.st_size == archive['bytes'] and abs(stat.st_mtime_ns / 1e6 - archive['mtimeMs']) < .01
if not source.exists():
    with (ROOT / member['archive']).open('rb') as stream, source.open('xb') as destination:
        stream.seek(member['offset'])
        remaining = member['bytes']
        while remaining:
            chunk = stream.read(min(4 * 1024 * 1024, remaining))
            assert chunk, 'Truncated original archive'
            destination.write(chunk)
            remaining -= len(chunk)
assert source.stat().st_size == member['bytes'] and sha(source) == member['sha256'] == movie['original']['sha256']
decode_source, source_input = video_input(ROOT, source, movie, args.video_source_receipt, args.probe)
if source_input:
    recipe['sourceVideoInput'] = source_input
recipe_sha = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
progress = dict(identity=args.identity, status='PREPARING', recipeSha256=recipe_sha, frames=frames,
                sourceStartFrame=args.start_frame, output=str(output), completedFrames=0, probe=args.probe)
started = time.perf_counter()

def status(**values):
    progress.update(values)
    progress['elapsedSeconds'] = time.perf_counter() - started
    write(work / 'progress.json', progress)
    print(json.dumps(progress), flush=True)

receipt_file = work / 'receipt.json'
if receipt_file.exists():
    receipt = read(receipt_file)
    assert receipt['recipeSha256'] == recipe_sha and sha(output) == receipt['file']['sha256']
    source.unlink()
    status(status='REUSED_VERIFIED_COMPLETE_OUTPUT', completedFrames=frames)
    raise SystemExit(0)
assert not output.exists(), 'Inspect an unreceipted output before restarting'
trim = f'trim=start_frame={args.start_frame}:end_frame={args.start_frame + frames},setpts=PTS-STARTPTS'

def decoder(filter_text, log):
    return subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '2', '-i', str(decode_source),
                             '-map', '0:v:0', '-an', '-vf', filter_text, '-fps_mode', 'passthrough',
                             '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE, stderr=log)

def frame_read(stream, size):
    data = stream.read(size)
    assert len(data) == size, 'Original frame stream ended early'
    return data

cuts_file = work / 'cuts.json'
if cuts_file.exists():
    cut_record = read(cuts_file)
    assert cut_record['recipeSha256'] == recipe_sha
else:
    candidates, previous, previous_hist = [], None, None
    with (work / 'analysis.log').open('ab') as log:
        child = decoder(trim + ',scale=96:72:flags=area', log)
        try:
            for frame in range(frames):
                current = np.frombuffer(frame_read(child.stdout, 96 * 72 * 3), dtype=np.uint8).reshape(72, 96, 3)
                histogram = np.bincount((current.mean(axis=2).astype(np.uint8) // 16).ravel(), minlength=16) / (96 * 72)
                if previous is not None:
                    difference = float(np.abs(current.astype(np.float32) - previous).mean() / 255)
                    distance = float(np.abs(histogram - previous_hist).sum() / 2)
                    if difference > .18 or difference > .10 and distance > .35:
                        candidates.append(dict(frame=frame, rgbDifference=difference, histogramDistance=distance))
                previous, previous_hist = current.astype(np.float32), histogram
            assert not child.stdout.read(1) and child.wait() == 0, 'Original decode count or integrity differs'
        finally:
            child.stdout.close()
            if child.poll() is None:
                child.kill(); child.wait()
    cut_record = dict(recipeSha256=recipe_sha, decodedFrames=frames, candidates=candidates,
                      method='Conservative source RGB/histogram discontinuities; these are audit candidates, not an exhaustive editorial cut claim')
    write(cuts_file, cut_record)
cuts = [] if args.ignore_cuts else [cut['frame'] for cut in cut_record['candidates']]
if source_input and not args.ignore_cuts:
    cuts = sorted(set(cuts + [frame - args.start_frame for frame in source_input['boundaries']
                             if args.start_frame < frame < args.start_frame + frames]))
plan = windows(frames, cuts, args.window, args.overlap)
write(work / 'plan.json', dict(recipeSha256=recipe_sha, windows=plan, contextPolicy='No context crosses a detected cut; identical-frame estimates use normalized sine overlap weights'))
cached = {}
for number, window in enumerate(plan):
    segment, record = work / f'segment-{number:05}.mp4', work / f'segment-{number:05}.json'
    if record.exists():
        metadata = read(record)
        assert metadata['recipeSha256'] == recipe_sha and metadata['window'] == window and sha(segment) == metadata['sha256']
        cached[number] = metadata
    elif segment.exists():
        segment.unlink()  # Unreceipted, disposable interrupted encode; complete segments are immutable.
missing = next((number for number in range(len(plan)) if number not in cached), len(plan))
assert sorted(cached) == list(range(missing)), 'Completed fragments must form a prefix'
spec = importlib.util.spec_from_file_location('temporal_model', Path(__file__).with_name('temporal-model.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
model, loading = module.load_network(TOOLS / 'upstream', checkpoint, 'mps', cpu_offload=True)
stop = threading.Event()
memory = dict(mpsAllocatedPeak=0, mpsDriverPeak=0)

def observe():
    while not stop.wait(.2):
        memory['mpsAllocatedPeak'] = max(memory['mpsAllocatedPeak'], torch.mps.current_allocated_memory())
        memory['mpsDriverPeak'] = max(memory['mpsDriverPeak'], torch.mps.driver_allocated_memory())

observer = threading.Thread(target=observe, daemon=True); observer.start()
pending, source_frames, cursor, emitted = {}, {}, 0, 0
decoder_child = None
try:
    with (work / 'decode.log').open('ab') as log:
        decoder_child = decoder(trim, log)
        for number, window in enumerate(plan):
            while cursor < window['end']:
                source_frames[cursor] = np.frombuffer(frame_read(decoder_child.stdout, video['width'] * video['height'] * 3), dtype=np.uint8).reshape(video['height'], video['width'], 3)
                cursor += 1
            # Recompute at most two predecessor windows to reconstruct a resumed overlap.
            needed = number >= max(0, missing - 2)
            if needed:
                values = np.stack([source_frames[frame] for frame in range(window['start'], window['end'])])
                if len(values) == 1:
                    values = np.repeat(values, 2, axis=0)  # Context only; emit the single original frame once.
                inputs = torch.from_numpy(values.copy()).permute(0, 3, 1, 2).unsqueeze(0).float() / 255
                restored = []
                def collect(index, full, cleaned):
                    if index < window['end'] - window['start']:
                        base = F.interpolate(cleaned, scale_factor=4, mode='bilinear', align_corners=False)
                        frame = (base + .5 * (full - base))[0]
                        restored.append(frame.clamp(0, 1).mul(255).round().byte().permute(1, 2, 0).contiguous().numpy())
                model.basicvsr._frame_consumer = collect
                inference_start = time.perf_counter()
                with torch.inference_mode():
                    assert model(inputs.to('mps')) is None
                torch.mps.synchronize()
                inference_seconds = time.perf_counter() - inference_start
                del model.basicvsr._frame_consumer, inputs, values
                assert len(restored) == window['end'] - window['start']
                for frame, image, weight in zip(range(window['start'], window['end']), restored, weights(window)):
                    pending.setdefault(frame, []).append((image, weight))
                del restored
            else:
                inference_seconds = 0
            first, last = emitted, window['flushEnd']
            if number not in cached:
                segment = work / f'segment-{number:05}.mp4'
                command = [ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
                           '-video_size', f"{video['width'] * 4}x{video['height'] * 4}", '-framerate', '15', '-i', 'pipe:0',
                           '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-profile:v', 'high', '-level:v', '4.0',
                           '-bf', '0', '-g', '30', '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360',
                           '-vf', f'scale={width}:{height}:flags=area:out_color_matrix=bt601:out_range=tv', *color, str(segment)]
                with (work / 'encode.log').open('ab') as encoder_log:
                    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=encoder_log)
                    try:
                        for frame in range(first, last):
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
                        assert encoder.wait() == 0, 'Fragment encode failed'
                    finally:
                        if encoder.poll() is None:
                            encoder.kill(); encoder.wait()
                metadata = dict(recipeSha256=recipe_sha, window=window, first=first, last=last,
                                file=segment.name, sha256=sha(segment), bytes=segment.stat().st_size)
                write(work / f'segment-{number:05}.json', metadata)
            emitted = last
            pending = {frame: estimates for frame, estimates in pending.items() if frame >= emitted}
            next_start = plan[number + 1]['start'] if number + 1 < len(plan) else frames
            source_frames = {frame: value for frame, value in source_frames.items() if frame >= next_start}
            gc.collect(); torch.mps.empty_cache()
            status(status='RESTORING', completedFrames=emitted, window=number + 1, windows=len(plan),
                   inferenceSeconds=inference_seconds, cuts=len(cuts), mpsLiveBytes=torch.mps.current_allocated_memory())
        assert cursor == frames and emitted == frames and not pending and not decoder_child.stdout.read(1)
        assert decoder_child.wait() == 0
finally:
    stop.set(); observer.join()
    if decoder_child:
        decoder_child.stdout.close()
        if decoder_child.poll() is None:
            decoder_child.kill(); decoder_child.wait()
    del model
    gc.collect(); torch.mps.empty_cache(); torch.mps.synchronize()
    memory.update(mpsAllocatedAfterRelease=torch.mps.current_allocated_memory(),
                  mpsDriverAfterCacheRelease=torch.mps.driver_allocated_memory(), processPeakRssBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
assert memory['mpsAllocatedAfterRelease'] == 0, 'Live Metal tensors were retained'
concat = work / 'segments.txt'
concat.write_text(''.join("file '" + str((work / f'segment-{number:05}.mp4')).replace("'", "'\\''") + "'\n" for number in range(len(plan))))
temporary_output = output.with_suffix('.partial.mp4')
if temporary_output.exists():
    temporary_output.unlink()
seconds = frames / 15
subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat),
                '-ss', str(args.start_frame / 15), '-i', str(source), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                '-bsf:v', 'setts=pts=N/(15*TB):dts=N/(15*TB):duration=1/(15*TB)',
                '-c:a', 'aac', '-b:a', '192k', '-t', str(seconds), '-movflags', '+faststart',
                '-video_track_timescale', '15360', *color, str(temporary_output)], check=True)
status(status='VERIFYING_OUTPUT', completedFrames=frames)
packets = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(temporary_output), '-map', '0:v:0', '-c:v', 'copy', '-f', 'framehash', '-'], text=True)
timebase = next(line.split(': ', 1)[1] for line in packets.splitlines() if line.startswith('#tb 0:'))
numerator, denominator = map(int, timebase.split('/'))
packet_rows = [line for line in packets.splitlines() if line and not line.startswith('#')]
assert len(packet_rows) == frames
for frame, row in enumerate(packet_rows):
    assert abs(int(row.split(',')[2]) * numerator / denominator - frame / 15) < .0001, 'Presentation clock changed'
decoded = subprocess.check_output([ffmpeg, '-v', 'error', '-xerror', '-i', str(temporary_output), '-map', '0:v:0', '-map', '0:a:0',
                                   '-f', 'null', '-', '-progress', 'pipe:1', '-nostats'], text=True)
assert int([line.split('=', 1)[1] for line in decoded.splitlines() if line.startswith('frame=')][-1]) == frames

def pcm(file, original=False):
    return subprocess.check_output([ffmpeg, '-v', 'error', *(['-ss', str(args.start_frame / 15)] if original else []), '-i', str(file),
                                    '-map', '0:a:0', '-af', f'atrim=end={seconds}', '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip().split('=', 1)[1]

def audition_signal(file, original=False):
    data = subprocess.check_output([ffmpeg, '-v', 'error', *(['-ss', str(args.start_frame / 15)] if original else []), '-i', str(file),
                                    '-map', '0:a:0', '-t', str(seconds), '-ac', '1', '-ar', '8000', '-c:a', 'pcm_f32le', '-f', 'f32le', '-'])
    return np.frombuffer(data, dtype=np.float32)

source_signal, delivered_signal = audition_signal(source, True), audition_signal(temporary_output)
count = min(len(source_signal), len(delivered_signal))
assert abs(len(source_signal) - len(delivered_signal)) <= 16, 'Original/delivery audio duration changed'
audio_ncc = float(np.dot(source_signal[:count], delivered_signal[:count]) / math.sqrt(float(np.dot(source_signal[:count], source_signal[:count])) * float(np.dot(delivered_signal[:count], delivered_signal[:count])))) if np.any(source_signal) and np.any(delivered_signal) else None
assert audio_ncc is None or audio_ncc > .98, 'Original audio alignment/quality needs investigation'
audio = dict(strategy='original-transcode', language='en', sourcePcmSha256=pcm(source, True), decodedPcmSha256=pcm(temporary_output),
             normalization='Original rate/channels, PCM16 for hashing, trimmed to the original video clock; AAC encoded once from BIK.', mono8kZeroOffsetCorrelation=audio_ncc)
temporary_output.replace(output)
receipt = dict(schema='hd-movie-production-receipt-v1', identity=args.identity, recipeSha256=recipe_sha, recipe=recipe,
               status='PROBE_COMPLETE' if args.probe else 'PRODUCED_AWAITING_FULL_FILM_AUDIT', original=movie['original'],
               file=dict(path=output.name, bytes=output.stat().st_size, sha256=sha(output)),
               video=dict(codec='h264', width=width, height=height, frames=frames, fpsNumerator=15, fpsDenominator=1, durationSeconds=seconds),
               audio=audio, subtitles=movie['subtitles'], cuts=cut_record, windows=len(plan), memory=memory,
               decode='PASS_ALL_VIDEO_AND_AUDIO', packetClock='PASS_EVERY_PRESENTATION_TIMESTAMP', loading=loading,
               visualAcceptance='REPRESENTATIVE_SETTINGS_ACCEPTED_FULL_FILM_AUDIT_PENDING', elapsedSeconds=time.perf_counter() - started,
               timeline=[dict(original=0, media=0), dict(original=seconds, media=seconds)])
write(receipt_file, receipt)
source.unlink()
status(status=receipt['status'], completedFrames=frames, bytes=receipt['file']['bytes'], sha256=receipt['file']['sha256'])
