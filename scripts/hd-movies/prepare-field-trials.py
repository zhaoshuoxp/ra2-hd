"""Prepare lossless source trials only for independently identified live-action intervals."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--curation', type=Path, required=True)
parser.add_argument('--source-index', type=Path, required=True)
parser.add_argument('--directory', type=Path, required=True)
parser.add_argument('--identities', nargs='*')
args = parser.parse_args()
directory = args.directory.resolve()
directory.mkdir(parents=True, exist_ok=True)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(file):
    return json.loads(file.read_text())


def save(file, record):
    temporary = file.with_suffix(file.suffix + '.writing')
    temporary.write_text(json.dumps(record, indent=2) + '\n')
    temporary.replace(file)


curation = read(args.curation)
index = read(args.source_index)
entries = [row for row in curation['entries'] if any(shot['decision'] == 'FULL_LIVE_ACTION_TRIAL' for shot in row['shots'])]
if args.identities:
    entries = [row for row in entries if row['identity'] in args.identities]
entries.sort(key=lambda row: (row['identity'] != 'yr:s02_f00e', row['identity'] != 'ra2:s01_f00e', row['identity']))
ledger = dict(schema='hd-movie-field-trial-ledger-v1', status='PREPARING_TRIALS', completed=[], current=None,
              scope='Technical source-proxy preparation only; bounded motion/fine-detail review precedes production qualification')
ffmpeg = subprocess.check_output([str(ROOT / '.local/tooling/campaign-media/bin/python'), '-c',
                                  'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
try:
    for entry in entries:
        identity = entry['identity']
        work = directory / (identity.replace(':', '-') + '-fields-r1')
        work.mkdir(parents=True, exist_ok=True)
        intervals = [dict(first=shot['first'], lastExclusive=shot['lastExclusive'], filter='bwdif-send-frame', parity='tff')
                     for shot in entry['shots'] if shot['decision'] == 'FULL_LIVE_ACTION_TRIAL']
        treatment = dict(schema='hd-movie-source-treatment-v1', entries=[dict(identity=identity,
                         originalSha256=entry['originalSha256'], status='TRIAL', intervals=intervals,
                         sourceSurveySha256=entry['surveySha256'],
                         basis='Independent original-checkpoint inspection plus bounded RA2 TFF motion trial; no CGI or unresolved composite interval selected')])
        specification = work / 'treatment.json'
        if specification.exists():
            assert read(specification) == treatment, 'Use a new field-trial revision when intervals change'
        else:
            save(specification, treatment)
        ledger['current'] = identity
        save(directory / 'field-trial-ledger.json', ledger)
        source = work / 'source-temporary.bik'
        member = next(row for row in index['sources'] if row['identity'] == identity)
        assert member['sha256'] == entry['originalSha256']
        if not source.exists():
            with (ROOT / member['archive']).open('rb') as stream, source.open('xb') as destination:
                stream.seek(member['offset'])
                remaining = member['bytes']
                while remaining:
                    chunk = stream.read(min(4 * 1024 * 1024, remaining))
                    assert chunk
                    destination.write(chunk); remaining -= len(chunk)
        assert sha(source) == member['sha256']
        output = work / 'source.mkv'
        with (work / 'preparation.log').open('a') as log:
            subprocess.run([sys.executable, str(Path(__file__).with_name('prepare-source-video.py')), identity,
                            '--source', str(source), '--treatments', str(specification), '--directory', str(work),
                            '--output', str(output), '--trial'], stdout=log, stderr=subprocess.STDOUT, check=True)
        survey = read(ROOT / entry['surveyFile'])
        checkpoints = {row['frame']: row for row in survey['checkpoints']}
        points = sorted({frame for shot in entry['shots'] if shot['decision'] == 'FULL_LIVE_ACTION_TRIAL'
                         for frame in [shot['first'], shot['lastExclusive'] - 1, *shot['confirmedDefectFrames']]})
        comparison = work / 'source-comparison.json'
        if not comparison.exists():
            # Only unreceipted exports from an interrupted preparation are disposable.
            for image in [*work.glob('trial-*.png'), *work.glob('reference-extra-*.png')]:
                image.unlink()
            expression = '+'.join(f'eq(n,{point})' for point in points)
            subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(output),
                            '-vf', f"select='{expression}'", '-fps_mode', 'vfr', str(work / 'trial-%04d.png')], check=True)
            extras = sorted(set(points) - checkpoints.keys())
            if extras:
                expression = '+'.join(f'eq(n,{point})' for point in extras)
                subprocess.run([ffmpeg, '-nostdin', '-n', '-v', 'error', '-i', str(source),
                                '-vf', f"select='{expression}'", '-fps_mode', 'vfr', str(work / 'reference-extra-%04d.png')], check=True)
                for number, frame in enumerate(extras, 1):
                    image = work / f'reference-extra-{number:04d}.png'
                    checkpoints[frame] = dict(frame=frame, file=str(image.relative_to((ROOT / entry['surveyFile']).parent))
                                             if image.is_relative_to((ROOT / entry['surveyFile']).parent) else str(image), sha256=sha(image))
            rows = []
            for number, frame in enumerate(points, 1):
                reference = checkpoints[frame]
                candidate = work / f'trial-{number:04d}.png'
                rows.append(dict(frame=frame, original=dict(file=str((ROOT / entry['surveyFile']).parent.joinpath(reference['file']).relative_to(ROOT)), sha256=reference['sha256']),
                                 trial=dict(file=str(candidate.relative_to(ROOT)), sha256=sha(candidate))))
            save(comparison, dict(schema='hd-movie-source-field-comparison-v1', identity=identity,
                                   status='AWAITING_SOURCE_FINE_DETAIL_AND_MOTION_REVIEW',
                                   receiptFile=str((work / 'source-proxy.json').relative_to(ROOT)),
                                   receiptSha256=sha(work / 'source-proxy.json'), checkpoints=rows))
        source.unlink()
        ledger['completed'].append(dict(identity=identity, receipt=str((work / 'source-proxy.json').relative_to(ROOT)),
                                        comparison=str(comparison.relative_to(ROOT))))
        save(directory / 'field-trial-ledger.json', ledger)
        print(json.dumps(dict(identity=identity, status='TRIAL_INPUT_READY', comparisons=len(points))), flush=True)
    ledger.update(status='TRIAL_INPUTS_READY_REVIEW_PENDING', current=None)
finally:
    save(directory / 'field-trial-ledger.json', ledger)
