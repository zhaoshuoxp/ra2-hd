"""Measure full downloaded source clocks against exact-clock retained retail references."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import numpy as np


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def decoded(ffmpeg, file, audio=False):
    tail = ['-vn', '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le'] if audio else [
        '-an', '-map', '0:v:0', '-vf', 'scale=48:36:flags=area,format=gray',
        '-fps_mode', 'passthrough', '-f', 'rawvideo']
    return subprocess.check_output([str(ffmpeg), '-nostdin', '-v', 'error', '-xerror',
                                    '-threads', '2', '-i', str(file), *tail, 'pipe:1'])


def reference(ffmpeg, file, output, frames):
    picture = np.frombuffer(decoded(ffmpeg, file), np.uint8).reshape(-1, 36, 48)
    audio = np.frombuffer(decoded(ffmpeg, file, audio=True), '<f4')
    assert len(picture) == frames, (len(picture), frames)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, picture=picture, audio=audio)
    return {'file': str(output), 'sha256': sha(output), 'frames': len(picture), 'audioSamples8000': len(audio)}


def features(picture):
    # Exclude edge logos and watermarks from content-clock matching.
    values = picture[:, 2:32, 2:46].reshape(len(picture), -1).astype(np.float32)
    means = values.mean(axis=1)
    values -= means[:, None]
    norms = np.linalg.norm(values, axis=1)
    values /= np.maximum(norms[:, None], 1e-8)
    return values, means, norms / np.sqrt(values.shape[1])


def video_alignment(original, downloaded):
    ref, means, deviations = features(original)
    target, target_means, target_deviations = features(downloaded)
    offsets = np.arange(-120, 121)
    centers = np.arange(len(ref)) * 4
    scores = np.empty((len(ref), len(offsets)), np.float32)
    for column, offset in enumerate(offsets):
        indices = centers + offset
        valid = (indices >= 0) & (indices < len(target))
        clipped = np.clip(indices, 0, len(target) - 1)
        value = np.einsum('ij,ij->i', ref, target[clipped])
        flat = (deviations < 3) | (target_deviations[clipped] < 3)
        value[flat] = 1 - np.abs(means[flat] - target_means[clipped][flat]) / 255
        value[~valid] = -1
        # Nine-frame matching reduces ambiguous repeated faces and interpolated phases.
        cumulative = np.r_[0, np.cumsum(value, dtype=np.float64)]
        start = np.maximum(0, np.arange(len(ref)) - 4)
        end = np.minimum(len(ref), np.arange(len(ref)) + 5)
        scores[:, column] = (cumulative[end] - cumulative[start]) / (end - start)
    biased = scores - np.abs(offsets)[None, :] * .00005
    best = biased.argmax(axis=1)
    chosen = offsets[best]
    best_scores = scores[np.arange(len(ref)), best]
    motion = np.r_[0, np.abs(np.diff(original.astype(np.float32), axis=0)).mean(axis=(1, 2))]
    informative = (motion > .8) & (deviations > 5) & (best_scores > .8)
    anchors = []
    for frame in range(0, len(ref), 75):
        anchors.append({'originalFrame': frame, 'originalTime': frame / 15,
                        'downloadedFrame': int(centers[frame] + chosen[frame]),
                        'offsetSeconds': float(chosen[frame] / 60),
                        'correlation': float(best_scores[frame]), 'motion': float(motion[frame])})
    measured = chosen[informative]
    histogram = [{'offsetFrames60': int(offset), 'frames': int((measured == offset).sum())}
                 for offset in np.unique(measured)]
    return {'method': 'Full-clock 48x36 luma correlation with nine-reference-frame windows and native 60 fps candidates within two seconds. Retained exact-clock R5 frames are content references; this is not a quality score.',
            'referenceFrames': len(ref), 'downloadedFrames': len(target), 'informativeFrames': int(informative.sum()),
            'offsetHistogram': histogram, 'anchors': anchors,
            'correlationPercentiles': [float(x) for x in np.percentile(best_scores, [0, 1, 5, 50, 95])],
            'originalTailMean': [float(x) for x in original[-30:].mean(axis=(1, 2))],
            'downloadedTailMean': [float(x) for x in downloaded[-120::4].mean(axis=(1, 2))]}, {
                'offset': chosen, 'score': best_scores, 'informative': informative,
                'sameClockScore': scores[:, len(offsets) // 2], 'motion': motion}


def waveform(ref, target, rate=8000):
    anchors = []
    count = 3 * rate
    for start in range(0, max(1, len(ref) - count), 8 * rate):
        query = ref[start:start + count].astype(np.float64)
        if len(query) < count or np.std(query) < .0001:
            continue
        left, right = max(0, start - rate), min(len(target), start + count + rate)
        scan = target[left:right].astype(np.float64)
        if len(scan) < count:
            continue
        query -= query.mean()
        size = 1 << (len(scan) + count - 2).bit_length()
        convolution = np.fft.irfft(np.fft.rfft(scan, size) * np.fft.rfft(query[::-1], size), size)
        sums = np.r_[0., np.cumsum(scan)]
        squares = np.r_[0., np.cumsum(scan * scan)]
        variance = np.maximum(0, squares[count:] - squares[:-count] - (sums[count:] - sums[:-count]) ** 2 / count)
        scores = convolution[count - 1:len(scan)] / np.maximum(np.sqrt(variance * np.dot(query, query)), 1e-12)
        peak = int(np.argmax(scores))
        zero = start - left
        anchors.append({'originalTime': start / rate, 'offsetSeconds': (left + peak - start) / rate,
                        'correlation': float(scores[peak]),
                        'sameClockCorrelation': float(scores[zero]) if zero < len(scores) else None})
    length = min(len(ref), len(target))
    left = ref[:length].astype(np.float64); left -= left.mean()
    right = target[:length].astype(np.float64); right -= right.mean()
    whole = float(np.dot(left, right) / max(np.linalg.norm(left) * np.linalg.norm(right), 1e-12))
    return {'method': 'Complete same-clock waveform correlation plus three-second windows every eight seconds, mono 8 kHz analysis only, one-second lag search. Delivery audio is handled separately.',
            'referenceSamples': len(ref), 'downloadedSamples': len(target), 'anchors': anchors,
            'sameClockCompleteCorrelation': whole,
            'minimumCorrelation': min((row['correlation'] for row in anchors), default=None),
            'maximumAbsoluteOffsetSeconds': max((abs(row['offsetSeconds']) for row in anchors), default=None)}


def audit(ffmpeg, source, reference_file, output, expected_frames):
    started = time.monotonic()
    assert not (output / 'audit.json').exists()
    output.mkdir(parents=True, exist_ok=True)
    source_picture = np.frombuffer(decoded(ffmpeg, source), np.uint8).reshape(-1, 36, 48)
    assert len(source_picture) == expected_frames, (len(source_picture), expected_frames)
    source_audio = np.frombuffer(decoded(ffmpeg, source, audio=True), '<f4')
    with np.load(reference_file, allow_pickle=False) as ref:
        video, arrays = video_alignment(ref['picture'], source_picture)
        audio = waveform(ref['audio'], source_audio)
    np.savez_compressed(output / 'alignment.npz', **arrays)
    result = {'schema': 'downloaded-full-source-clock-audit-v1', 'status': 'COMPLETE_MEASUREMENTS_PENDING_ADMISSION',
              'source': {'file': str(source), 'sha256': sha(source)},
              'reference': {'file': str(reference_file), 'sha256': sha(reference_file)},
              'sourceCompleteVideoDecode': 'PASS', 'sourceCompleteAudioDecode': 'PASS',
              'video': video, 'audio': audio, 'seconds': time.monotonic() - started,
              'scope': 'Automatic complete-source decode/content-clock/audio measurements. Selected-still or native playback acceptance remains separate.'}
    (output / 'audit.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--frames', type=int, required=True)
    parser.add_argument('--prepare-reference', action='store_true')
    args = parser.parse_args()
    result = reference(args.ffmpeg, args.source, args.output, args.frames) if args.prepare_reference else audit(
        args.ffmpeg, args.source, args.reference, args.output, args.frames)
    print(json.dumps({key: result[key] for key in ['status', 'seconds'] if key in result}), flush=True)
