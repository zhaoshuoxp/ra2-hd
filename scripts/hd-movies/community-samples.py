"""Match bounded community movie windows to the accepted local samples and make browser previews."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('--edition', choices=['ra2', 'yr'])
parser.add_argument('--audio-only', action='store_true', help='Audit existing previews without changing their video files')
args = parser.parse_args()
base = args.directory.resolve()
local = json.loads((ROOT / '.artifacts/hd-movies/temporal/selection.json').read_text())
indices = {edition: json.loads((base / (edition + '-index.json')).read_text())
           for edition in ([args.edition] if args.edition else ['ra2', 'yr'])}
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def gray_frames(command):
    data = subprocess.check_output([ffmpeg, '-nostdin', '-v', 'error', *command,
                                    '-an', '-vf', 'scale=64:48:flags=area,format=gray',
                                    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'])
    assert len(data) % (64 * 48) == 0
    return np.frombuffer(data, dtype=np.uint8).reshape(-1, 64 * 48).astype(np.float32)

def normalize(frames):
    centered = frames - frames.mean(axis=1, keepdims=True)
    return centered / np.maximum(np.linalg.norm(centered, axis=1, keepdims=True), 1e-6)

def audio_alignment(file, sample, movie, community_time):
    rate = 8000
    reference_file = Path(sample['original']).with_name('source-audio.wav')
    reference_bytes = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(reference_file),
                                              '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'])
    scan_start = max(0, sample['sourceStart'] - 2)
    audio_bytes = subprocess.check_output([ffmpeg, '-v', 'error', '-ss', str(scan_start), '-i', str(file),
                                          '-t', str(min(movie['seconds'] - scan_start, sample['length'] + 4)),
                                          '-map', '0:a:0', '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'])
    reference = np.frombuffer(reference_bytes, dtype='<f4').astype(np.float64)
    scan = np.frombuffer(audio_bytes, dtype='<f4').astype(np.float64)
    reference -= reference.mean()
    assert len(scan) >= len(reference) and len(reference) > 0
    size = 1 << (len(scan) + len(reference) - 2).bit_length()
    convolution = np.fft.irfft(np.fft.rfft(scan, size) * np.fft.rfft(reference[::-1], size), size)
    numerator = convolution[len(reference) - 1:len(scan)]
    sums = np.concatenate(([0.0], np.cumsum(scan)))
    squares = np.concatenate(([0.0], np.cumsum(scan ** 2)))
    count = len(reference)
    variance = np.maximum(0, squares[count:] - squares[:-count] - (sums[count:] - sums[:-count]) ** 2 / count)
    scores = numerator / np.maximum(np.sqrt(variance * np.sum(reference ** 2)), 1e-12)
    best = int(np.argmax(scores))
    offset = scan_start + best / rate - sample['sourceStart']
    return dict(method='Normalized waveform correlation, mono 8 kHz analysis only; delivered audio is unchanged',
                correlation=float(scores[best]), audioOffsetSeconds=offset,
                videoOffsetSeconds=community_time - sample['sourceStart'],
                videoMinusAudioOffsetSeconds=community_time - sample['sourceStart'] - offset,
                referencePcmSha256=hashlib.sha256(reference_bytes).hexdigest(),
                qualification='Short-window audio similarity/timing evidence; no full-film language or dialogue acceptance')

for identity, sample in local.items():
    edition = identity.split(':')[0]
    if edition not in indices:
        continue
    candidates = [movie for movie in indices[edition]['movies'] if movie['identity'] == identity]
    assert candidates, f'Package member is unavailable: {identity}'
    candidates.sort(key=lambda movie: (movie['width'] * movie['height'], movie['fps']), reverse=True)
    movie = candidates[0]
    assert len(candidates) == 1 or (movie['width'] * movie['height'] > candidates[1]['width'] * candidates[1]['height']), \
        f'Inspect conflicting equal-resolution package members: {identity}'
    out = base / 'samples' / identity.replace(':', '-')
    out.mkdir(parents=True, exist_ok=True)
    assert (out / 'community.mp4').exists() if args.audio_only else not (out / 'community.mp4').exists(), \
        'Use a new comparison output, or explicitly audit existing audio'
    temporary = out / 'source-temporary.bik'
    digest = hashlib.sha256()
    try:
        with (ROOT / movie['archive']).open('rb') as archive, temporary.open('xb') as target:
            archive.seek(movie['offset'])
            remaining = movie['bytes']
            while remaining:
                data = archive.read(min(8 * 1024 * 1024, remaining))
                assert data, 'Truncated archive member'
                target.write(data); digest.update(data); remaining -= len(data)
        movie['sha256'] = digest.hexdigest()
        movie['byteIdenticalToOriginal'] = movie['sha256'] == movie['originalSha256']
        if args.audio_only:
            report = json.loads((out / 'sample.json').read_text())
            assert movie['sha256'] == report['source']['sha256']
            report['audioAlignment'] = audio_alignment(temporary, sample, movie, report['communityTime'])
            (out / 'sample.json').write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(dict(identity=identity, audioAlignment=report['audioAlignment'])), flush=True)
            continue
        metadata = subprocess.run([ffmpeg, '-nostdin', '-hide_banner', '-i', str(temporary)], capture_output=True, text=True).stderr
        (out / 'source-metadata.txt').write_text(metadata.replace(str(temporary), 'community-source.bik'))
        fps = movie['fps']
        assert fps in (15, 60), 'Inspect a new source clock explicitly'
        reference = gray_frames(['-i', sample['original'], '-map', '0:v:0'])
        assert len(reference) == 30
        scan_start_frame = max(0, int(round((sample['sourceStart'] - 3) * fps)))
        scan_frames = min(movie['frames'] - scan_start_frame, int((sample['length'] + 6) * fps))
        scanned = gray_frames(['-ss', f'{scan_start_frame / fps:.9f}', '-i', str(temporary),
                               '-map', '0:v:0', '-frames:v', str(scan_frames)])
        stride = int(fps / 15)
        reference_normalized, scanned_normalized = normalize(reference), normalize(scanned)
        scores = []
        for offset in range(len(scanned) - (len(reference) - 1) * stride):
            selected = scanned_normalized[offset + np.arange(len(reference)) * stride]
            scores.append(float((reference_normalized * selected).sum(axis=1).mean()))
        best = int(np.argmax(scores))
        assert scores[best] > .7, f'No reliable source-window match for {identity}: {max(scores)}'
        matched_frame = scan_start_frame + best
        matched_time = matched_frame / fps
        proxy = out / 'community.mp4'
        subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-ss', f'{matched_time:.9f}', '-i', str(temporary),
                        '-map', '0:v:0', '-map', '0:a:0?', '-t', str(sample['length']), '-fps_mode', 'passthrough',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p',
                        '-vf', 'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m',
                        '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(proxy)], check=True)
        for name, file in [('original', Path(sample['original'])), ('local', Path(sample['file'])), ('community', proxy)]:
            subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-ss', '1', '-i', str(file),
                            '-frames:v', '1', str(out / (name + '-mid.png'))], check=True)
        report = dict(schema='hd-movie-community-sample-v1', identity=identity, source=movie,
                      sourceAlternates=candidates[1:],
                      localSample=sample, originalTime=sample['sourceStart'], communityTime=matched_time,
                      alignment=dict(method='Mean normalized luma correlation across all thirty original frames; community frames sampled on the native clock',
                                     matchedStartFrame=matched_frame, offsetSeconds=matched_time - sample['sourceStart'],
                                     bestScore=scores[best], candidates=sorted([dict(startFrame=scan_start_frame + index, score=score)
                                                                              for index, score in enumerate(scores)],
                                                                             key=lambda item: item['score'], reverse=True)[:5],
                                     qualification='Window-specific visual match only; complete-film cuts and audio sync remain unaudited'),
                      preview=dict(file=str(proxy.relative_to(ROOT)), sha256=sha(proxy), bytes=proxy.stat().st_size,
                                   width=movie['width'], height=movie['height'], fps=fps, seconds=sample['length'],
                                   encoding='H264 CRF12 browser proxy, no restoration, crop, resize or frame-rate conversion',
                                   audio='Community source track retained through one AAC preview encode; only local original audio plays by default in review'),
                      visualAcceptance='PENDING_COMPARISON', productionSelected=False)
        report['audioAlignment'] = audio_alignment(temporary, sample, movie, matched_time)
        (out / 'sample.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(dict(identity=identity,dimensions=[movie['width'], movie['height']],fps=fps,
                              matchedTime=matched_time,score=scores[best],originalBytes=movie['byteIdenticalToOriginal'])), flush=True)
    finally:
        temporary.unlink(missing_ok=True)
