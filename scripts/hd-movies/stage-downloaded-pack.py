"""Stage the source-selected downloaded pack while preserving immutable prior revisions."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
REVISION = 'downloaded-1080p-r1'


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(file):
    return json.loads(file.read_text())


def stage(work, select):
    baseline = read(work / 'baseline.json')
    for row in baseline['preexistingWorkingFiles'] + baseline['resourceSelectionFiles']:
        assert sha(ROOT / row['file']) == row['sha256'], row['file']
    parent_file = ROOT / '.local/media/hd-movies/local-natural-r6/manifest.json'
    assert sha(parent_file) == baseline['hdMovieSelection']['sha256']
    parent = read(parent_file)
    sources = {row['identity']: row for row in read(work / 'sources.json')['movies']}
    engineering_file = work / 'source-engineering.json'
    engineering = read(engineering_file)
    assert engineering['status'] == 'PASS_DOWNLOADED_SOURCE_ENGINEERING_WITH_RETAINED_QUALIFICATIONS'
    decisions = {row['identity']: row for row in engineering['masters']}
    assert decisions.keys() == sources.keys() and len(decisions) == 51
    assignments = read(work / 'dispatch-plan.json')['assignments']
    owners = {identity: host for host, identities in assignments.items() for identity in identities}
    target = ROOT / '.local/media/hd-movies' / REVISION
    assert not target.exists(), 'Use a new immutable revision after staging'
    target.mkdir()
    manifest = copy.deepcopy(parent)
    manifest.update(revision=REVISION, createdUtc=datetime.now(timezone.utc).isoformat(),
                    userAcceptance={'downloadedFullscreenChoice': 'USER_AUTHORIZED',
                                    'retainedHdRadarChoice': 'USER_AUTHORIZED',
                                    'completeFilmReview': 'PENDING_FINAL_DELIVERY_REVIEW'},
                    scope='51 user-downloaded 1440x1080/60 fps full-screen films with exact original AAC and caption clocks; 83 HD radar and two unavailable library-only films retain their exact R6 payloads. Native downloaded interpolation and picture phase remain qualified.')
    records = []
    for entry in manifest['entries']:
        identity = entry['edition'] + ':' + entry['id']
        name = entry['file']['path']
        if identity not in sources:
            source = parent_file.parent / name
            assert sha(source) == entry['file']['sha256']
            shutil.copyfile(source, target / name)
            records.append({'identity': identity, 'action': 'RETAIN_EXACT_R6', 'sha256': entry['file']['sha256']})
            continue
        owner = owners[identity]
        directory = work / 'outputs' if owner == 'mac' else work / 'returned' / owner / 'outputs'
        directory /= identity.replace(':', '-')
        receipt_file = directory / 'receipt.json'
        receipt = read(receipt_file)
        assert receipt['status'] == 'PASS_DOWNLOADED_PICTURE_TRANSCODE_ORIGINAL_AAC_AND_60FPS_CLOCK'
        source = directory / 'video.mp4'
        assert sha(source) == receipt['output']['sha256'] == decisions[identity]['sha256']
        job = read(work / 'jobs' / (identity.replace(':', '-') + '.json'))
        assert sha(work / 'jobs' / (identity.replace(':', '-') + '.json')) == receipt['jobSha256']
        assert receipt['originalAac']['beforeSha256'] == receipt['originalAac']['afterSha256'] == job['audio']['originalPacketClockSha256']
        shutil.copyfile(source, target / name)
        entry['file'] = {'path': name, 'bytes': source.stat().st_size, 'sha256': receipt['output']['sha256']}
        entry['video'] = {'codec': 'h264', 'width': 1440, 'height': 1080,
                          'frames': receipt['output']['frames'], 'fpsNumerator': 60, 'fpsDenominator': 1,
                          'durationSeconds': receipt['output']['durationSeconds']}
        assert abs(entry['video']['durationSeconds'] - entry['original']['durationSeconds']) < 1e-8
        entry['timeline'] = [{'original': 0, 'media': 0},
                             {'original': entry['original']['durationSeconds'], 'media': entry['video']['durationSeconds']}]
        entry['acceptance'] = {
            'technical': 'verified', 'visual': 'accepted', 'cut': 'verified',
            'visualBasis': 'User-selected downloaded source, complete native-frame encode/clock/audio checks, source content-clock audit and sampled engineering review.',
            'userRepresentativeDirection': 'downloaded-source-selected',
            'userCompleteFilmReview': 'pending-final-delivery-review',
            'retainedQualifications': [
                'The native downloaded 60 fps sequence includes upstream interpolation, variable picture phase, occasional cut blends, motion blur and soft boundaries. The MRZJL watermark remains intact.',
                'Original AAC packet payloads and PTS/DTS/duration remain exact; existing localized captions retain the original audio clock.',
                f"An ending hold adds {receipt['endingHoldFrames']} native-rate frames to restore the shorter downloaded ending to the original clip clock; all downloaded picture frames remain in order.",
                'Complete automatic source/encode checks and sampled engineering review do not establish continuous human inspection of every frame or whole-film user acceptance.',
            ]}
        entry['provenance'] = {
            'sources': ['user-downloaded-bik-sha256:' + sources[identity]['sha256'],
                        'local-retail-original-audio-sha256:' + entry['audio']['sourcePcmSha256']],
            'sourceType': 'user-selected-downloaded-fullscreen',
            'downloadedSourceSha256': sources[identity]['sha256'],
            'downloadedFrames': receipt['sourcePictureFrames'], 'nativeDownloadedFps': 60,
            'watermarkPolicy': 'Preserve all upstream marks and authored on-screen text',
            'recipe': {'operatorSha256': receipt['operatorSha256'], 'auditOperatorSha256': receipt['auditOperatorSha256'],
                       'ffmpegSha256': receipt['ffmpegSha256'], 'encoder': receipt['encoder'],
                       'endingHoldFrames': receipt['endingHoldFrames'],
                       'originalAudioPacketClockSha256': receipt['originalAac']['beforeSha256']},
            'engineering': {'file': str(engineering_file.relative_to(ROOT)), 'sha256': sha(engineering_file)},
            'receipt': {'file': str(receipt_file.relative_to(ROOT)), 'sha256': sha(receipt_file)},
        }
        records.append({'identity': identity, 'action': 'ADOPT_DOWNLOADED_FULLSCREEN',
                        'sha256': receipt['output']['sha256'], 'frames': receipt['output']['frames'],
                        'sourceFrames': receipt['sourcePictureFrames'], 'endingHoldFrames': receipt['endingHoldFrames']})
    manifest_file = target / 'manifest.json'
    manifest_file.write_text(json.dumps(manifest, indent=2) + '\n')
    for entry in manifest['entries']:
        assert sha(target / entry['file']['path']) == entry['file']['sha256']
    selection = {'schema': 'hd-movie-selection-v1', 'manifest': f'media/hd-movies/{REVISION}/manifest.json',
                 'sha256': sha(manifest_file)}
    shutil.copyfile(manifest_file, ROOT / 'docs' / f'hd-movies-pack-{REVISION}.json')
    if select:
        pointer = ROOT / '.local/hd-movie-selection.json'
        assert read(pointer) == baseline['hdMovieSelection']
        shutil.copyfile(pointer, work / 'selection-before-downloaded.json')
        temporary = pointer.with_suffix('.writing')
        temporary.write_text(json.dumps(selection, indent=2) + '\n')
        temporary.replace(pointer)
    result = {'status': 'PASS_IMMUTABLE_DOWNLOADED_PACK_SELECTED' if select else 'PASS_IMMUTABLE_DOWNLOADED_PACK_STAGED',
              'revision': REVISION, 'selection': selection, 'identities': len(records),
              'downloadedFullscreen': 51, 'retainedHdRadar': 83, 'retainedLibraryOnly': 2,
              'payloadBytes': sum(entry['file']['bytes'] for entry in manifest['entries']),
              'originalFrames': sum(row['original']['video']['frames'] for row in read(ROOT / 'docs/hd-movies-inventory-20261109.json')['movies']),
              'deliveryFrames': sum(entry['video']['frames'] for entry in manifest['entries']), 'records': records}
    (work / 'admission.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key != 'records'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('work', type=Path)
    parser.add_argument('--select', action='store_true')
    args = parser.parse_args()
    stage(args.work.resolve(), args.select)
