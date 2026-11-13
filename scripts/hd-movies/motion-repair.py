"""Apply the approved selective field repair to a pinned HD movie master."""
import argparse
import gc
import hashlib
import json
from pathlib import Path
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(path, value):
    temporary = path.with_suffix(path.suffix + '.writing')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def field_graph(width, height):
    return (
        f'[0:v]format=yuv444p,scale={width}:960:flags=lanczos,split=2[a][b];'
        '[a]field=top,bwdif=mode=send_frame:parity=tff:deint=all[a0];'
        '[b]field=bottom,bwdif=mode=send_frame:parity=tff:deint=all[b0];'
        '[a0][b0]vstack=inputs=2,il=l=i:c=i,setfield=prog,'
        f'scale={width}:{height}:flags=lanczos[v]'
    )


def decode(ffmpeg, source, first, last, width, height, corrected=False):
    origin = max(0, first // 15 - 1)
    trim = f'trim=start_frame={first-origin*15}:end_frame={last-origin*15},setpts=PTS-STARTPTS'
    command = [ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-threads', '2',
               '-ss', str(origin), '-i', str(source)]
    if corrected:
        graph = field_graph(width, height).replace('[0:v]format=', f'[0:v]{trim},format=', 1)
        command += ['-filter_complex_threads', '2', '-filter_complex', graph, '-map', '[v]']
    else:
        command += ['-map', '0:v', '-vf', trim]
    raw = subprocess.check_output(command + ['-an', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'])
    assert len(raw) == (last-first) * width * height * 3, (first, last, len(raw))
    return np.frombuffer(raw, dtype=np.uint8).reshape(last-first, height, width, 3)


def moving_combs(original, grid_width, require_motion=True):
    grid = np.stack([np.asarray(Image.fromarray(v).resize((grid_width, 480), Image.Resampling.LANCZOS),
                               dtype=np.float32) for v in original])
    luma = grid @ np.array([.299, .587, .114], dtype=np.float32)
    result = []
    for index in range(len(grid)):
        center = luma[index, 1:-1]
        first, second = center-luma[index, :-2], center-luma[index, 2:]
        comb = np.pad((first*second > 0) & (np.minimum(abs(first), abs(second)) > 5), ((1, 1), (0, 0)))
        motion = np.maximum(abs(grid[index]-grid[max(index-1, 0)]).mean(2),
                            abs(grid[index]-grid[min(index+1, len(grid)-1)]).mean(2))
        result.append(comb & (motion > 3.5) if require_motion else comb)
    return result


def dilate_mask(value, radius=4):
    """Exact square dilation; radius four is equivalent to Pillow MaxFilter(9)."""
    horizontal = value.copy()
    for distance in range(1, radius+1):
        horizontal[:, :-distance] |= value[:, distance:]
        horizontal[:, distance:] |= value[:, :-distance]
    result = horizontal.copy()
    for distance in range(1, radius+1):
        result[:-distance] |= horizontal[distance:]
        result[distance:] |= horizontal[:-distance]
    return Image.fromarray(result.astype(np.uint8)*255)


def protect_colors(alpha, before, specifications):
    """Retain bounded authored colored strokes across actor overlaps."""
    for specification in specifications:
        x0, y0, x1, y1 = specification['rectangle']
        height, width = alpha.shape
        assert 0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height
        colors = before[y0:y1, x0:x1].astype(np.int16)
        red, green, blue = colors[:, :, 0], colors[:, :, 1], colors[:, :, 2]
        selected = np.zeros(red.shape, dtype=bool)
        if 'blueOverRed' in specification:
            blue_pixels = ((blue-red >= specification['blueOverRed'])
                           & (blue-green >= specification.get('blueOverGreen', 0))
                           & (colors.max(2)-colors.min(2) >= specification.get('minimumChroma', 12)))
            if 'maximumRed' in specification:
                blue_pixels &= red <= specification['maximumRed']
            if 'minimumGreenMinusRed' in specification:
                blue_pixels &= green-red >= specification['minimumGreenMinusRed']
            selected |= blue_pixels
        if 'redOverGreen' in specification:
            selected |= ((red-green >= specification['redOverGreen'])
                         & (red-blue >= specification.get('redOverBlue', 50)))
        if 'greenOverRed' in specification:
            selected |= ((green-red >= specification['greenOverRed'])
                         & (green-blue >= specification.get('greenOverBlue', 20)))
        if 'yellowMinimum' in specification:
            selected |= ((np.minimum(red, green) >= specification['yellowMinimum'])
                         & (np.minimum(red, green)-blue >= specification.get('yellowBlueGap', 55)))
        if 'whiteMinimum' in specification:
            selected |= ((colors.min(2) >= specification['whiteMinimum'])
                         & (colors.max(2)-colors.min(2) <= specification.get('whiteMaximumSpread', 45)))
        protection = np.asarray(dilate_mask(selected, 2).filter(ImageFilter.GaussianBlur(1)), dtype=np.float32)/255
        protection = np.maximum(protection, selected.astype(np.float32))
        alpha[y0:y1, x0:x1] *= 1-protection
        assert np.all(alpha[y0:y1, x0:x1][selected] == 0)


def polygon_protection(polygons, width, height, feather):
    mask = Image.new('L', (width, height))
    drawing = ImageDraw.Draw(mask)
    for polygon in polygons:
        assert len(polygon) >= 3 and all(0 <= x <= width and 0 <= y <= height for x, y in polygon)
        drawing.polygon([tuple(point) for point in polygon], fill=255)
    solid = np.asarray(mask, dtype=np.float32)/255
    soft = np.asarray(mask.filter(ImageFilter.GaussianBlur(max(1, feather/2))), dtype=np.float32)/255
    return 1-np.maximum(solid, soft)


def polygon_eligibility(polygons, width, height, feather):
    """Confine foreground overrides to the measured silhouette, with inward feather."""
    mask = Image.new('L', (width, height))
    drawing = ImageDraw.Draw(mask)
    for polygon in polygons:
        assert len(polygon) >= 3 and all(0 <= x <= width and 0 <= y <= height for x, y in polygon)
        drawing.polygon([tuple(point) for point in polygon], fill=255)
    solid = np.asarray(mask, dtype=np.float32)/255
    soft = np.asarray(mask.filter(ImageFilter.GaussianBlur(max(1, feather/2))), dtype=np.float32)/255
    return solid*soft


def rectangle_alpha(rectangles, width, height, feather, inverse=False):
    """Keep a region's feather inside eligibility or outside a protected rectangle."""
    result = np.zeros((height, width), dtype=np.float32)
    yy, xx = np.ogrid[:height, :width]
    for x0, y0, x1, y1 in rectangles:
        assert 0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height
        if inverse:
            distance = np.maximum.reduce(np.broadcast_arrays(x0-xx, xx-(x1-1), y0-yy, yy-(y1-1)))
            inside = 1-np.clip(distance/max(1, feather), 0, 1)
        else:
            distance = np.minimum.reduce(np.broadcast_arrays(xx-x0, x1-1-xx, yy-y0, y1-1-yy))
            inside = np.clip(distance/max(1, feather), 0, 1)
        result = np.maximum(result, inside)
    return 1-result if inverse else result


def tracked_rectangles(tracks, frame):
    result = []
    for track in tracks:
        points = track['keyframes']
        assert points and points[0][0] <= frame <= points[-1][0]
        left = max((p for p in points if p[0] <= frame), key=lambda p: p[0])
        right = min((p for p in points if p[0] >= frame), key=lambda p: p[0])
        fraction = (frame-left[0])/(right[0]-left[0]) if right[0] != left[0] else 0
        result.append([int(round(a+(b-a)*fraction)) for a, b in zip(left[1], right[1])])
    return result


def tracked_polygons(tracks, frame):
    result = []
    for track in tracks:
        points = track['keyframes']
        assert points and points[0][0] <= frame <= points[-1][0]
        left = max((p for p in points if p[0] <= frame), key=lambda p: p[0])
        right = min((p for p in points if p[0] >= frame), key=lambda p: p[0])
        fraction = (frame-left[0])/(right[0]-left[0]) if right[0] != left[0] else 0
        assert len(left[1]) == len(right[1])
        result.append([[int(round(x+(u-x)*fraction)), int(round(y+(v-y)*fraction))]
                       for (x, y), (u, v) in zip(left[1], right[1])])
    return result


def process(job_file, workspace, work, ffmpeg):
    job = json.loads(job_file.read_text())
    assert job['schema'] == 'hd-movie-selective-motion-job-v1'
    assert job['approval']['status'] == 'USER_ACCEPTED_R4_FULL_BATCH_AUTHORIZED'
    width, height, frames = job['width'], job['height'], job['frames']
    assert (width, height) in [(1280, 960), (1600, 1200)] and job['fps'] == 15
    source = (workspace/job['source']['file']).resolve()
    assert source.is_relative_to(workspace) and sha(source) == job['source']['sha256']
    reference = job.get('sourceFieldReference')
    reference_inputs = []
    for item in [*reference.get('overrides', []), reference] if reference else []:
        file = (workspace/item['file']).resolve()
        assert file.is_relative_to(workspace) and sha(file) == item['sha256']
        assert item['detailGain'] == .5 and item['fps'] == 15
        reference_inputs.append((item, file))
    partitions = job['partitions']
    assert partitions[0]['first'] == 0 and partitions[-1]['lastExclusive'] == frames
    assert all(p['first'] < p['lastExclusive'] and p['mode'] in ['keep', 'repair', 'regions'] for p in partitions)
    assert all(a['lastExclusive'] == b['first'] for a, b in zip(partitions, partitions[1:]))
    assert any(p['mode'] != 'keep' for p in partitions)
    work.mkdir(parents=True, exist_ok=True)
    output, receipt_file = work/'video.mp4', work/'receipt.json'
    job_sha, implementation_sha = sha(job_file), sha(Path(__file__))
    if receipt_file.exists():
        receipt = json.loads(receipt_file.read_text())
        assert receipt['jobSha256'] == job_sha and receipt['implementationSha256'] == implementation_sha
        assert sha(output) == receipt['file']['sha256']
        print(json.dumps({'status': 'REUSED_VERIFIED_COMPLETE_MOTION_OUTPUT', 'identity': job['identity']}))
        return
    temporary = work/'video.writing.mp4'
    assert not output.exists() and not temporary.exists(), 'Inspect an interrupted output before restarting'
    started = time.perf_counter()
    records, completed = [], 0

    def progress(status):
        save(work/'progress.json', {'status': status, 'identity': job['identity'], 'frames': frames,
             'completedFrames': completed, 'seconds': time.perf_counter()-started, 'jobSha256': job_sha})

    progress('RECONSTRUCTING_MOVING_COMBS')
    command = [ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', f'{width}x{height}', '-framerate', '15', '-i', 'pipe:0', '-i', str(source),
        '-map', '0:v', '-map', '1:a:0', '-c:a', 'copy',
        '-vf', (f'scale={width}:{height}:out_color_matrix=bt601:out_range=tv,'
                'setparams=range=limited:color_primaries=smpte170m:color_trc=bt709:colorspace=smpte170m'),
        '-c:v', 'libx264', '-threads', '8', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-profile:v', 'high', '-level:v', '4.0', '-bf', '0', '-g', '30', '-video_track_timescale', '15360',
        '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', '-color_range', 'tv',
        '-movflags', '+faststart', str(temporary)]
    with (work/'encode.log').open('w') as log:
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        try:
            for partition in partitions:
                p0, p1 = partition['first'], partition['lastExclusive']
                feather = partition.get('featherPixels', 8)
                static_allow = None
                if partition['mode'] == 'regions' and not partition.get('tracks'):
                    static_allow = rectangle_alpha(partition['regions'], width, height, feather)
                protected = (rectangle_alpha(partition['protected'], width, height, feather, True)
                             if partition.get('protected') else None)
                polygon_factor = (polygon_protection(partition['protectedPolygons'], width, height, feather)
                                  if partition.get('protectedPolygons') else None)
                for first in range(p0, p1, 40):
                    last = min(first+40, p1)
                    context_first, context_last = max(p0, first-2), min(p1, last+2)
                    original = decode(ffmpeg, source, context_first, context_last, width, height)
                    repair = partition['mode'] != 'keep'
                    if repair and reference:
                        reference_file, mapping = next((file, p) for item, file in reference_inputs
                            for p in item['ranges'] if p['first'] <= p0 < p1 <= p['lastExclusive'])
                        offset = mapping['referenceFirst']-mapping['first']
                        corrected = decode(ffmpeg, reference_file, context_first+offset,
                                           context_last+offset, width, height)
                    else:
                        corrected = decode(ffmpeg, source, context_first, context_last, width, height, True) if repair else None
                    spatial_only = partition.get('sourceConfirmedSpatialComb', False)
                    assert not spatial_only or reference and p1-p0 == 1
                    combs = moving_combs(original, width//2, not spatial_only) if repair else None
                    for frame in range(first, last):
                        index = frame-context_first
                        before = original[index]
                        if repair:
                            temporal = np.logical_or.reduce(combs[max(0, index-1):min(len(combs), index+2)])
                            mask = dilate_mask(temporal)
                            mask = mask.filter(ImageFilter.GaussianBlur(1.5)).resize((width, height), Image.Resampling.BILINEAR)
                            alpha = np.asarray(mask, dtype=np.float32)/255
                            foreground = partition.get('foregroundPolygons', []) + tracked_polygons(
                                partition.get('foregroundPolygonTracks', []), frame)
                            moving_alpha = alpha.copy() if foreground else None
                            allow = static_allow
                            if partition.get('tracks'):
                                boxes = partition.get('regions', []) + tracked_rectangles(partition['tracks'], frame)
                                allow = rectangle_alpha(boxes, width, height, feather)
                            if allow is not None:
                                alpha *= allow
                            if protected is not None:
                                alpha *= protected
                            if polygon_factor is not None:
                                alpha *= polygon_factor
                            if partition.get('protectedPolygonTracks'):
                                polygons = tracked_polygons(partition['protectedPolygonTracks'], frame)
                                alpha *= polygon_protection(polygons, width, height, feather)
                            if partition.get('colorProtection'):
                                protect_colors(alpha, before, partition['colorProtection'])
                            if foreground:
                                alpha = np.maximum(alpha, moving_alpha*polygon_eligibility(
                                    foreground, width, height, partition.get('foregroundFeatherPixels', feather)))
                            result = np.rint(before.astype(np.float32)*(1-alpha[:, :, None])
                                             + corrected[index].astype(np.float32)*alpha[:, :, None]).clip(0, 255).astype(np.uint8)
                            unchanged = alpha == 0
                            assert np.array_equal(result[unchanged], before[unchanged])
                            mean_alpha, unchanged_pixels = float(alpha.mean()), int(unchanged.sum())
                        else:
                            result, mean_alpha, unchanged_pixels = before, 0., width*height
                        digest = hashlib.sha256(result.tobytes()).hexdigest()
                        records.append({'frame': frame, 'rgbSha256': digest, 'meanAlpha': mean_alpha,
                                        'unchangedPixels': unchanged_pixels})
                        encoder.stdin.write(result.tobytes())
                        if frame in job.get('evidenceFrames', []):
                            Image.fromarray(before).save(work/f'before-{frame:05}.png')
                            Image.fromarray(result).save(work/f'preencode-{frame:05}.png')
                        completed += 1
                    del original, corrected, combs
                    gc.collect()
                    progress('RECONSTRUCTING_MOVING_COMBS')
            encoder.stdin.close()
            assert encoder.wait() == 0, 'Inspect encode.log'
        except BaseException:
            encoder.stdin.close()
            encoder.terminate()
            encoder.wait()
            progress('STOPPED_FOR_INVESTIGATION')
            raise
    assert completed == frames
    temporary.replace(output)
    receipt = {'schema': 'hd-movie-selective-motion-production-v1', 'status': 'RENDERED_ENGINEERING_GATES_PENDING',
        'identity': job['identity'], 'jobSha256': job_sha, 'implementationSha256': implementation_sha,
        'source': job['source'], 'approval': job['approval'], 'video': {'width': width, 'height': height, 'frames': frames, 'fps': 15},
        'fieldGraph': field_graph(width, height), 'partitions': partitions,
        'mask': {'grid': [width//2, 480], 'combThreshold': 5, 'motionThreshold': 3.5,
                 'temporalUnionRadius': 1, 'dilate': 9, 'sigma': 1.5, 'window': 40, 'halo': 2},
        'records': records, 'file': {'path': 'video.mp4', 'bytes': output.stat().st_size, 'sha256': sha(output)},
        'ffmpegVersion': subprocess.check_output([ffmpeg, '-version'], text=True).splitlines()[0],
        'seconds': time.perf_counter()-started,
        'scope': 'Approved post-restoration moving-comb repair. Original R5 audio packets copied; zero-mask RGB and protected regions retained before encoding. No added GAN gain, learned cleaning, sharpening or frame interpolation.'}
    if reference:
        receipt['sourceFieldReference'] = reference
        receipt['scope'] = ('Source-confirmed legacy-field reconstruction precedes the same qualified natural neural restoration '
                            'for bounded archive controls. Measured moving-comb masks blend these controls once into R5; '
                            'original R5 audio packets and zero-mask RGB remain unchanged. No increase in neural strength, '
                            'new sharpening or frame interpolation.')
    save(receipt_file, receipt)
    progress('RENDERED_ENGINEERING_GATES_PENDING')
    print(json.dumps({key: receipt[key] for key in ['status', 'identity', 'seconds', 'file']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--ffmpeg', required=True)
    args = parser.parse_args()
    process(args.job.resolve(), args.workspace.resolve(), args.work.resolve(), args.ffmpeg)
