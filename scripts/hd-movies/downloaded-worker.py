"""Encode downloaded pictures at native 60 fps and retain original AAC packet clocks."""
import argparse
from fractions import Fraction
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import subprocess
import time

spec = importlib.util.spec_from_file_location('downloaded_audit', Path(__file__).with_name('downloaded-audit.py'))
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def packet_hash(ffmpeg, file, media):
    text = subprocess.check_output([str(ffmpeg), '-v', 'error', '-i', str(file), '-map', f'0:{media}:0',
                                    '-c', 'copy', '-f', 'framehash', '-hash', 'sha256', '-'], text=True)
    base = Fraction(next(row.split(':', 1)[1].strip() for row in text.splitlines() if row.startswith('#tb 0:')))
    packets = [[field.strip() for field in row.split(',')] for row in text.splitlines()
               if row and not row.startswith('#')]
    canonical = json.dumps({'timeBase': str(base), 'packets': packets}, separators=(',', ':')).encode()
    return base, packets, hashlib.sha256(canonical).hexdigest()


def run(root, job_file, ffmpeg):
    started = time.monotonic()
    job = json.loads(job_file.read_text())
    name = job['identity'].replace(':', '-')
    assert re.fullmatch('[a-z0-9_-]+', name)
    output = root / 'outputs' / name
    output.mkdir(parents=True, exist_ok=True)
    output.chmod(0o700)
    final, receipt_file = output / 'video.mp4', output / 'receipt.json'
    picture = output / 'picture.mp4'
    if receipt_file.exists():
        receipt = json.loads(receipt_file.read_text())
        assert sha(final) == receipt['output']['sha256']
        assert sha(job_file) == receipt['jobSha256']
        return receipt
    source, reference, audio = [root / job[key]['file'] for key in ['source', 'reference', 'audio']]
    for key, file in [('source', source), ('reference', reference), ('audio', audio)]:
        assert sha(file) == job[key]['sha256'], (key, file)
    frames, source_frames = job['frames'], job['source']['frames']
    padding = frames - source_frames
    assert frames > 0 and 0 <= padding <= 90
    audit_dir = output / 'source-audit'
    if not (audit_dir / 'audit.json').exists():
        audit_module.audit(ffmpeg, source, reference, audit_dir, source_frames)
    color = 'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m'
    if not final.exists() and not picture.exists():
        temporary = output / 'picture.writing.mp4'
        assert not temporary.exists(), 'Inspect an interrupted encode before restarting'
        graph = f'tpad=stop={padding}:stop_mode=clone,settb=1/60000,setpts=N*1000,{color}'
        command = [str(ffmpeg), '-nostdin', '-n', '-v', 'error', '-threads', '2', '-i', str(source),
                   '-map', '0:v:0', '-an', '-vf', graph, '-filter_threads', '1',
                   '-frames:v', str(frames), '-fps_mode', 'passthrough', '-c:v', 'libx264',
                   '-preset', job['encoder']['preset'], '-crf', str(job['encoder']['crf']),
                   '-threads', str(job['encoder']['threads']), '-profile:v', 'high', '-level:v', '4.2',
                   '-pix_fmt', 'yuv420p', '-maxrate', '50M', '-bufsize', '50M',
                   '-video_track_timescale', '60000', '-movflags', '+faststart', str(temporary)]
        with (output / 'encode.log').open('w') as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
        temporary.replace(picture)
    if not final.exists():
        temporary = output / 'video.writing.mp4'
        # Mux after the bounded picture encode so its frame limit cannot truncate audio.
        with (output / 'mux.log').open('w') as log:
            subprocess.run([str(ffmpeg), '-nostdin', '-n', '-v', 'error', '-i', str(picture),
                            '-i', str(audio), '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy',
                            '-video_track_timescale', '60000', '-movflags', '+faststart', str(temporary)],
                           stdout=log, stderr=subprocess.STDOUT, check=True)
        temporary.replace(final)
    before_base, before_packets, before_audio = packet_hash(ffmpeg, audio, 'a')
    after_base, after_packets, after_audio = packet_hash(ffmpeg, final, 'a')
    assert before_base == after_base and before_packets == after_packets, 'Original AAC packet clock/payload differs'
    base, packets, video_hash = packet_hash(ffmpeg, final, 'v')
    times = sorted(Fraction(int(row[2])) * base for row in packets)
    assert len(times) == frames and all(value == Fraction(index, 60) for index, value in enumerate(times))
    assert all(Fraction(int(row[3])) * base == Fraction(1, 60) for row in packets)
    stats = output / 'source-psnr.txt'
    graph = (f'[0:v:0]setpts=PTS-STARTPTS,{color}[source];'
             f'[1:v:0]trim=end_frame={source_frames},setpts=PTS-STARTPTS[encoded];'
             f'[source][encoded]psnr=stats_file={stats}:stats_version=2[picture]')
    with (output / 'source-psnr.log').open('w') as log:
        subprocess.run([str(ffmpeg), '-nostdin', '-v', 'info', '-threads', '2', '-i', str(source),
                        '-threads', '2', '-i', str(final), '-filter_complex_threads', '1',
                        '-filter_complex', graph, '-map', '[picture]', '-an', '-fps_mode', 'passthrough',
                        '-f', 'null', '-'], stdout=log, stderr=subprocess.STDOUT, check=True)
    rows = [dict(re.findall(r'(\w+):([^ ]+)', line.strip())) for line in stats.read_text().splitlines()
            if line.startswith('n:')]
    assert len(rows) == source_frames, (len(rows), source_frames)
    psnr = [float(row['psnr_y']) for row in rows]
    finite = [value for value in psnr if math.isfinite(value)]
    minimum, mean = (min(finite), sum(finite) / len(finite)) if finite else (100., 100.)
    assert minimum >= 36 and mean >= 44, (minimum, mean)
    receipt = {'schema': 'downloaded-browser-movie-v1',
               'status': 'PASS_DOWNLOADED_PICTURE_TRANSCODE_ORIGINAL_AAC_AND_60FPS_CLOCK',
               'identity': job['identity'], 'jobSha256': sha(job_file),
               'operatorSha256': sha(Path(__file__)), 'auditOperatorSha256': sha(Path(__file__).with_name('downloaded-audit.py')),
               'ffmpegSha256': sha(ffmpeg), 'source': job['source'],
               'output': {'file': str(final.relative_to(root)), 'sha256': sha(final), 'bytes': final.stat().st_size,
                          'width': 1440, 'height': 1080, 'fpsNumerator': 60, 'fpsDenominator': 1,
                          'frames': frames, 'durationSeconds': frames / 60},
               'picturePolicy': 'Every downloaded native 60 fps source frame is retained in order; only a final-frame hold restores the original ending clock. No local enhancement, sharpening, resize, crop or interpolation.',
               'sourcePictureFrames': source_frames, 'endingHoldFrames': padding,
               'fullSourcePictureComparison': {'frames': len(rows), 'minimumLumaPsnr': minimum,
                                               'meanFiniteLumaPsnr': mean, 'statsSha256': sha(stats)},
               'originalAac': {'packets': len(before_packets), 'timeBase': str(before_base),
                               'beforeSha256': before_audio, 'afterSha256': after_audio,
                               'status': 'EXACT_ALL_PACKET_PTS_DTS_DURATION_AND_PAYLOAD'},
               'videoPackets': {'frames': len(packets), 'packetHash': video_hash, 'timeBase': str(base),
                                'status': 'EXACT_60FPS_PRESENTATION_CLOCK'},
               'sourceAudit': {'file': str((audit_dir / 'audit.json').relative_to(root)),
                               'sha256': sha(audit_dir / 'audit.json')},
               'sourceCutAudioAdmission': 'PENDING_SOURCE_ENGINEERING_REVIEW',
               'encoder': job['encoder'], 'seconds': time.monotonic() - started}
    receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
    picture.unlink(missing_ok=True)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--job', type=Path, required=True)
    parser.add_argument('--ffmpeg', type=Path, required=True)
    args = parser.parse_args()
    result = run(args.root.resolve(), args.job.resolve(), args.ffmpeg.resolve())
    print(json.dumps({'identity': result['identity'], 'status': result['status'], 'seconds': result['seconds']}), flush=True)
