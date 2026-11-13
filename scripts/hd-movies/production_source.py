"""Validate a derived video input without replacing the retail identity or audio."""
import hashlib
import json
from pathlib import Path


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def video_input(root, original_file, movie, receipt_file, probe=False):
    """Return a hash-pinned video-only input and its source-time boundaries."""
    if receipt_file is None:
        return original_file, None
    root, receipt_file = root.resolve(), receipt_file.resolve()
    assert receipt_file.is_relative_to(root), 'Keep input provenance in the local workspace'
    receipt = json.loads(receipt_file.read_text())
    assert receipt['identity'] == movie['identity'], 'Video input belongs to another media identity'
    original_sha = movie['original']['sha256']
    assert sha(original_file) == original_sha
    file = (root / receipt['file']).resolve()
    assert file.is_relative_to(root) and file != original_file
    assert file.stat().st_size == receipt['bytes'] and sha(file) == receipt['sha256']
    video = movie['original']['video']
    assert receipt['frames'] == video['frames'] and receipt['fps'] == 15
    boundaries = []
    if receipt['schema'] == 'hd-movie-raw-sector-recovery-v1':
        assert receipt['status'] == 'VERIFIED_RAW_SECTOR_RECOVERY'
        assert receipt['originalSha256'] == original_sha
        assert receipt['audioIdentityAudit'] == 'PASS_EVERY_COMPRESSED_AUDIO_PACKET_IDENTICAL'
        # All changed bytes must lie inside the known, zeroed video-data sector.
        before, after = original_file.read_bytes(), file.read_bytes()
        first, last = receipt['recoveredByteRange']
        assert len(before) == len(after) and 0 <= first < last <= len(before)
        assert not any(before[first:last]) and any(after[first:last])
        assert before[:first] == after[:first] and before[last:] == after[last:]
        method = 'Recovered original-size compressed video sector; original audio retained'
    elif receipt['schema'] == 'hd-movie-source-clock-hold-v1':
        assert receipt['status'].startswith('VERIFIED_SOURCE_CLOCK_')
        assert receipt['recipe']['originalSha256'] == original_sha
        assert receipt['recipe']['method'] == 'previous-valid-decoded-frame'
        assert receipt['allValidDecodedRgbEquality'] == 'PASS_EVERY_RGB_BYTE'
        assert receipt['heldFrameEquality'] == 'PASS_PREVIOUS_VALID_SOURCE_FRAME'
        holds = receipt['holds']
        assert receipt['validDecodedFrames'] + len(holds) == video['frames']
        assert sorted(row['frame'] for row in holds) == receipt['recipe']['missingSourcePts']
        assert all(0 < row['frame'] < video['frames'] and row['sourceFrame'] == row['frame'] - 1
                   and abs(row['seconds'] - 1 / 15) < 1e-9 for row in holds)
        method = 'Explicit previous-frame hold at rejected source timestamps; original audio retained'
    elif receipt['schema'] == 'hd-movie-lossless-source-proxy-v1':
        assert receipt['status'] == 'VERIFIED_SOURCE_PROXY' or probe and receipt['status'] == 'TRIAL_PROXY_VERIFIED'
        assert receipt['recipe']['originalSha256'] == original_sha
        assert receipt['width'] == video['width'] and receipt['height'] == video['height']
        assert receipt['untreatedPixelEquality'] == 'PASS_EVERY_RGB_BYTE'
        assert receipt['treatedFrames'] + receipt['untreatedFrames'] == video['frames']
        for interval in receipt['recipe']['intervals']:
            assert 0 <= interval['first'] < interval['lastExclusive'] <= video['frames']
            assert interval['filter'] == 'bwdif-send-frame' and interval['parity'] in ['tff', 'bff']
            boundaries.extend([interval['first'], interval['lastExclusive']])
        method = 'Reviewed field reconstruction intervals in a lossless source-clock proxy'
    elif receipt['schema'] == 'hd-movie-localized-source-recovery-v1':
        assert receipt['status'] == 'VERIFIED_LOCALIZED_SOURCE_RECOVERY'
        assert receipt['recipe']['originalSha256'] == original_sha
        assert receipt['width'] == video['width'] and receipt['height'] == video['height']
        assert receipt['unpatchedPixelEquality'] == 'PASS_EVERY_RGB_BYTE_AGAINST_VERIFIED_CLOCK_BASE'
        assert receipt['packetClock'] == 'PASS_EVERY_SOURCE_FRAME_TIMESTAMP'
        assert receipt['donorMapping']['sourceToDonorFrameScale'] == 4
        assert receipt['donorMapping']['sourceToDonorFrameOffset'] == 0
        assert receipt['donorMapping']['cleanReferenceMinimumCorrelation'] > .99
        for key in ['baseReceipt', 'alignment', 'maskManifest']:
            assert sha(root / receipt['recipe'][key + 'File']) == receipt['recipe'][key + 'Sha256']
        assert all(0 <= row['first'] < row['lastExclusive'] <= video['frames'] for row in receipt['patchedRanges'])
        method = 'Localized damaged-picture recovery from a matched author remaster; unchanged original pixels elsewhere'
    else:
        raise AssertionError('Unrecognized video-input provenance')
    record = dict(receiptFile=str(receipt_file.relative_to(root)), receiptSha256=sha(receipt_file),
                  file=str(file.relative_to(root)), sha256=receipt['sha256'], bytes=receipt['bytes'],
                  originalSha256=original_sha, method=method, frames=video['frames'], fps=15,
                  boundaries=sorted(set(boundaries)))
    return file, record
