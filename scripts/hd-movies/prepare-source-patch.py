"""Recover a bounded damaged picture region from a source-clock matched local donor."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--mask', choices=['difference', 'known-region'], default='known-region')
args = parser.parse_args()
directory, output = args.directory.resolve(), args.output.resolve()
directory.mkdir(parents=True, exist_ok=True)
output.parent.mkdir(parents=True, exist_ok=True)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(file):
    return json.loads(file.read_text())


def save(file, record):
    file.write_text(json.dumps(record, indent=2) + '\n')


base_receipt = ROOT / '.artifacts/hd-movies/source-motion/proxies/ra2-s10_f00e-hold/source-hold.json'
base = read(base_receipt)
assert base['identity'] == 'ra2:s10_f00e' and base['frames'] == 973
assert base['allValidDecodedRgbEquality'] == 'PASS_EVERY_RGB_BYTE'
source = ROOT / base['file']
assert sha(source) == base['sha256']
donor_base = ROOT / '.artifacts/hd-movies/source-motion/source-clock-investigation/community-s10'
alignment_file = donor_base / 'alignment.json'
alignment = read(alignment_file)
best = alignment['candidates'][0]
assert best['offsetAuthorFrames'] == 0 and best['minimum'] > .99
donor = read(donor_base / 'extracted-member.json')
assert sha(ROOT / donor['file']) == donor['sha256']
local_rgb, donor_rgb = donor_base / 'local-native-235-335.rgb', donor_base / 'author-native-235-335.rgb'
originals = np.fromfile(local_rgb, dtype=np.uint8).reshape(100, 480, 640, 3)
donors = np.fromfile(donor_rgb, dtype=np.uint8).reshape(originals.shape)
recipe = dict(originalSha256=base['recipe']['originalSha256'], baseReceiptFile=str(base_receipt.relative_to(ROOT)),
              baseReceiptSha256=sha(base_receipt), baseVideoSha256=sha(source), donorSha256=donor['sha256'],
              donorNativeRgbSha256=sha(donor_rgb), analysisNativeRgbSha256=sha(local_rgb),
              alignmentFile=str(alignment_file.relative_to(ROOT)), alignmentSha256=sha(alignment_file),
              first=272, lastExclusive=312, blockSize=16, blockMeanRgbDifference=12,
              mask=args.mask, maskDilationBlocks=1, alphaFeatherPixels=8, allowedRectangle=[96, 0, 640, 400],
              implementationSha256=sha(Path(__file__)))
receipt_file = directory / 'source-recovery.json'
if receipt_file.exists():
    existing = read(receipt_file)
    assert existing['recipe'] == {**recipe, **{key: existing['recipe'][key] for key in ['maskManifestFile', 'maskManifestSha256']}}
    assert sha(output) == existing['sha256']
    print(json.dumps(dict(status='REUSED_VERIFIED_LOCALIZED_SOURCE_RECOVERY', identity=base['identity'])))
    raise SystemExit(0)
assert not output.exists(), 'Inspect an interrupted recovery output before retrying'
patches, masks = {}, []
for frame in range(recipe['first'], recipe['lastExclusive']):
    index = frame - 235
    difference = np.abs(originals[index].astype(np.float32) - donors[index].astype(np.float32)).mean(2)
    blocks = difference.reshape(30, 16, 40, 16).mean((1, 3)) > recipe['blockMeanRgbDifference']
    blocks[:, :8], blocks[24:] = False, False
    padded = np.pad(blocks, 1)
    expanded = np.zeros_like(blocks)
    for row in range(3):
        for column in range(3):
            expanded |= padded[row:row + 30, column:column + 40]
    alpha = np.repeat(np.repeat(expanded, 16, axis=0), 16, axis=1).astype(np.float32)
    if args.mask == 'known-region':
        alpha.fill(0)
        alpha[:392, 104:] = 1
    # Feather the compositing mask only. The donor picture is never blurred.
    kernel = np.ones(17, dtype=np.float32) / 17
    for axis in [0, 1]:
        alpha = np.apply_along_axis(lambda values: np.convolve(values, kernel, mode='same'), axis, alpha)
    alpha[:, :96], alpha[400:] = 0, 0
    assert not alpha[:32, :96].any(), 'Protect the unchanged original corner and donor attribution area'
    image = np.rint(originals[index] * (1 - alpha[..., None]) + donors[index] * alpha[..., None]).astype(np.uint8)
    patches[frame] = (image, alpha > 0)
    masks.append(dict(frame=frame, seedBlocks=int(blocks.sum()), patchedPixels=int((alpha > 0).sum()),
                      alphaSha256=hashlib.sha256(alpha.tobytes()).hexdigest(),
                      patchedRgbSha256=hashlib.sha256(image.tobytes()).hexdigest()))
mask_file = directory / 'mask-manifest.json'
save(mask_file, dict(schema='hd-movie-localized-recovery-masks-v1', recipe=recipe, frames=masks,
                     scope='Only the known post-loss span and the recorded picture/hand/coat region. The matched donor uses source-pose frames 4*N, not intermediate interpolated frames.'))
recipe.update(maskManifestFile=str(mask_file.relative_to(ROOT)), maskManifestSha256=sha(mask_file))
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
command = [ffmpeg, '-nostdin', '-n', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
           '-video_size', '640x480', '-framerate', '15', '-i', 'pipe:0', '-an', '-vf', 'format=bgr0',
           '-c:v', 'ffv1', '-level', '3', '-g', '1', '-pix_fmt', 'bgr0', '-color_range', 'pc',
           '-colorspace', '0', '-color_primaries', 'smpte170m', '-color_trc', 'bt709', str(output)]
digest, unchanged_pixels = hashlib.sha256(), 0
with (directory / 'encoding.log').open('ab') as log:
    decoder = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-xerror', '-i', str(source), '-map', '0:v:0',
                                '-an', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE, stderr=log)
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
    try:
        for frame in range(973):
            data = decoder.stdout.read(640 * 480 * 3)
            assert len(data) == 640 * 480 * 3
            image = np.frombuffer(data, dtype=np.uint8).reshape(480, 640, 3)
            if frame in patches:
                assert np.array_equal(image, originals[frame - 235])
                patched, mask = patches[frame]
                assert np.array_equal(image[~mask], patched[~mask])
                unchanged_pixels += int((~mask).sum())
                data = patched.tobytes()
            else:
                unchanged_pixels += 640 * 480
            digest.update(data)
            encoder.stdin.write(data)
        assert not decoder.stdout.read(1) and decoder.wait() == 0
        encoder.stdin.close()
        assert encoder.wait() == 0
    finally:
        decoder.stdout.close()
        for child in [decoder, encoder]:
            if child.poll() is None:
                child.kill(); child.wait()
actual = subprocess.check_output([ffmpeg, '-v', 'error', '-xerror', '-i', str(output), '-an', '-pix_fmt', 'rgb24',
                                  '-f', 'hash', '-hash', 'sha256', '-'], text=True).strip().split('=', 1)[1]
assert actual == digest.hexdigest(), 'Lossless recovery output differs from the verified compositor'
clock = subprocess.check_output([ffmpeg, '-v', 'error', '-i', str(output), '-an', '-pix_fmt', 'rgb24', '-f', 'framehash', '-'], text=True)
rows = [row for row in clock.splitlines() if row and not row.startswith('#')]
assert '#tb 0: 1/15' in clock and len(rows) == 973
assert all(int(row.split(',')[2]) == frame for frame, row in enumerate(rows))
receipt = dict(schema='hd-movie-localized-source-recovery-v1', identity=base['identity'], status='VERIFIED_LOCALIZED_SOURCE_RECOVERY',
               recipe=recipe, file=str(output.relative_to(ROOT)), bytes=output.stat().st_size, sha256=sha(output),
               frames=973, fps=15, width=640, height=480, patchedRanges=[dict(first=272, lastExclusive=312)],
               donorMapping=dict(sourceToDonorFrameScale=4, sourceToDonorFrameOffset=0,
                                 cleanReferenceMinimumCorrelation=best['minimum'], cleanReferenceMeanCorrelation=best['mean']),
               unchangedPixels=unchanged_pixels, unpatchedPixelEquality='PASS_EVERY_RGB_BYTE_AGAINST_VERIFIED_CLOCK_BASE',
               decodedRgbSha256=actual, packetClock='PASS_EVERY_SOURCE_FRAME_TIMESTAMP',
               audioPolicy='No donor or proxy audio; production uses the original retail BIK audio',
               sourceProvenance='Localized repair from the user-supplied author remaster. All pixels outside the recorded mask retain the clock-corrected local original.',
               visualAudit='PENDING_BOUNDED_RESTORED_MOTION_REVIEW')
save(receipt_file, receipt)
print(json.dumps(receipt), flush=True)
