"""Admit the complete source-matched movie pack after per-film engineering review."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ledger', type=Path, required=True)
parser.add_argument('--review', type=Path, required=True)
parser.add_argument('--select', action='store_true')
parser.add_argument('--revision', default='local-natural-r5')
args = parser.parse_args()
ledger = json.loads(args.ledger.read_text())
review = json.loads(args.review.read_text())
assert review['status'] == 'PASS_ALL_136_SOURCE_MATCHED_ENGINEERING_AUDITS'
audits = {r['identity']: r for r in review['entries']}
inventory_file = ROOT / 'docs/hd-movies-inventory-20261109.json'
inventory = json.loads(inventory_file.read_text())
movies = {m['identity']: m for m in inventory['movies']}
assert len(ledger['completed']) == len(audits) == len(movies) == 136
assert {r['identity'] for r in ledger['completed']} == set(audits) == set(movies)
revision = args.revision
assert re.fullmatch('[a-z0-9][a-z0-9_-]{0,79}', revision) and ledger['revision'] == revision
pack = ROOT / '.local/media/hd-movies' / revision


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


entries = []
for row in sorted(ledger['completed'], key=lambda r: r['identity']):
    identity = row['identity']; movie = movies[identity]
    receipt = json.loads((ROOT / row['receipt']).read_text())
    audit = audits[identity]
    file = ROOT / row['file']
    assert file.parent == pack and file.stat().st_size == row['bytes']
    assert sha(file) == row['sha256'] == receipt['file']['sha256'] == audit['candidateSha256']
    assert audit['status'] == 'SOURCE_FIDELITY_REVIEWED' and not audit.get('unresolvedBlockers')
    assert receipt['decode'] == 'PASS_ALL_VIDEO_AND_AUDIO' and receipt['packetClock'] == 'PASS_EVERY_PRESENTATION_TIMESTAMP'
    assert receipt['video']['frames'] == movie['original']['video']['frames']
    assert receipt['original']['sha256'] == movie['original']['sha256']
    edition, movie_id = identity.split(':', 1)
    original_seconds = movie['original']['video']['frames'] / 15
    audio = receipt['audio']
    subtitle = movie['subtitles']
    entries.append(dict(edition=edition, id=movie_id,
        original=dict(sha256=movie['original']['sha256'], member=movie['original']['member'],
                      language='en', durationSeconds=original_seconds),
        file=dict(path=file.name, bytes=file.stat().st_size, sha256=row['sha256']), video=receipt['video'],
        audio={key: audio[key] for key in ['strategy', 'language', 'sourcePcmSha256', 'decodedPcmSha256']},
        subtitles=dict(strategy='game' if subtitle['runtimeCueCount'] else 'none', burnedIn=False,
                       timelineSha256=subtitle['runtimeTimelineSha256'], runtimeCueCount=subtitle['runtimeCueCount'],
                       sourceCueCount=subtitle['sourceCueCount'], sourceTextPolicy='Original on-screen labels, logos and titles remain intact'),
        timeline=receipt['timeline'],
        acceptance=dict(technical='verified', visual='accepted', cut='verified',
            visualBasis='Independent source-matched engineering review under the user-accepted natural direction',
            userRepresentativeDirection='accepted', userCompleteFilmReview='pending-final-delivery-review',
            retainedQualifications=audit.get('qualifications', [])),
        provenance=dict(sources=['local-retail-sha256:' + movie['original']['sha256'],
                                 'https://github.com/open-mmlab/RealBasicVSR'],
            model='RealBasicVSR x4 GAN EMA', checkpointSha256=receipt['recipe']['checkpointSha256'],
            recipeSha256=receipt['recipeSha256'], recipe=receipt['recipe'],
            productionReceiptSha256=sha(ROOT / row['receipt']), engineeringReviewSha256=sha(args.review),
            auditEvidenceSha256=audit['evidenceSha256'], originalAudioCorrelation=audio['mono8kZeroOffsetCorrelation'])))
manifest_file = pack / 'manifest.json'
created_utc = (json.loads(manifest_file.read_text())['createdUtc'] if manifest_file.exists()
               else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
manifest = dict(schema='hd-movie-pack-v1', revision=revision,
    createdUtc=created_utc, entries=entries,
    inventorySha256=sha(inventory_file), inventoryCounts=dict(ra2=80, yr=56, fullscreen=53, radar=83, sourceFrames=69622),
    userAcceptance=dict(representativeDirection='accepted-natural-settings', completeFilmReview='pending-final-delivery-review'),
    scope='Private offline source-matched neural restoration with original BIK audio and source15fps. Engineering acceptance is separate from user final-film acceptance.')
raw = (json.dumps(manifest, indent=2) + '\n').encode()
assert len(raw) <= 4 * 1024 * 1024
selection = dict(schema='hd-movie-selection-v1', manifest=f'media/hd-movies/{revision}/manifest.json',
                 sha256=hashlib.sha256(raw).hexdigest())
if manifest_file.exists():
    assert manifest_file.read_bytes() == raw, 'Do not mutate an existing immutable movie manifest'
if args.select:
    pointer = ROOT / '.local/hd-movie-selection.json'
    assert not pointer.exists() or json.loads(pointer.read_text()) == selection, 'Inspect the existing HD movie selection first'
if not manifest_file.exists():
    temporary = pack / 'manifest.json.writing'; temporary.write_bytes(raw); temporary.replace(manifest_file)
if args.select:
    temporary = pointer.with_suffix('.json.writing'); temporary.write_text(json.dumps(selection, indent=2) + '\n'); temporary.replace(pointer)
print(json.dumps(dict(status='PACK_SELECTED' if args.select else 'PACK_VERIFIED_UNSELECTED', revision=revision,
                      entries=len(entries), manifestBytes=len(raw), sha256=selection['sha256'])))
