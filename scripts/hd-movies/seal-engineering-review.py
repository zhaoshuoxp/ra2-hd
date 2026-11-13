"""Seal per-identity engineering evidence without implying user complete-film acceptance."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ledger', type=Path, required=True)
parser.add_argument('--technical', type=Path, required=True)
parser.add_argument('--color-screen', type=Path, required=True)
parser.add_argument('--color-review', type=Path)
parser.add_argument('--reviewer', type=Path, action='append', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
ledger = json.loads(args.ledger.read_text())
technical = json.loads(args.technical.read_text())
screen = json.loads(args.color_screen.read_text())
inventory = {r['identity']: r for r in json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())['movies']}
assert technical['status'] == 'PASS_ALL_136_FILES_AUDIO_AND_SOURCE_CLOCKS'
assert len(ledger['completed']) == len(technical['entries']) == len(screen['entries']) == len(inventory) == 136
assert technical['counts']['frames'] == screen['frames'] == 69622
checks, screens = [{r['identity']: r for r in rows} for rows in [technical['entries'], screen['entries']]]
color_reviews = {r['identity']: r for r in json.loads(args.color_review.read_text())['entries']} if args.color_review else {}
positive = {'NO_OBSERVED_NEW_FIDELITY_BLOCKER', 'NO_OBSERVED_BLOCKER',
    'NO_OBSERVED_NEW_FIDELITY_BLOCKER_AT_REVIEWED_STILLS', 'SOURCE_MATCHED_STILL_REVIEW_NO_NEW_BLOCKER',
    'QUALIFIED_BASELINE_SELECTED_STILLS', 'QUALIFIED_CORRECTED_SELECTED_STILLS',
    'NO_OBSERVED_BLOCKER_IN_SELECTED_STILLS', 'NO_OBSERVED_BLOCKER_IN_REVIEWED_STILLS'}


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def local(file):
    p = Path(file)
    p = p if p.is_absolute() else ROOT / p
    assert p.resolve().is_relative_to(ROOT), 'Engineering evidence must be retained in the workspace'
    return p


reviewers = []
for file in args.reviewer:
    data = json.loads(file.read_text())
    reviewers.append((file, data))
entries = []
for row in sorted(ledger['completed'], key=lambda r: r['identity']):
    identity = row['identity']; movie = inventory[identity]
    choices = [(file, entry) for file, data in reviewers for group in ['baseline', 'corrected']
               for entry in data[group] if entry['identity'] == identity and entry.get('candidateSha256') == row['sha256']]
    assert len(choices) == 1, f'Expected one source-matched current review: {identity}'
    reviewer_file, review = choices[0]
    assert review['status'] in positive, f'Uncleared engineering review: {identity}: {review["status"]}'
    assert not any(review.get(key) for key in ['blockers', 'unresolvedBlockers', 'remainingHolds']), identity
    assert review['originalSha256'] == movie['original']['sha256']
    candidate, receipt_file = ROOT / row['file'], ROOT / row['receipt']
    receipt = json.loads(receipt_file.read_text())
    assert sha(candidate) == row['sha256'] == checks[identity]['candidateSha256'] == screens[identity]['candidateSha256']
    assert sha(receipt_file) == checks[identity]['productionReceiptSha256']
    paths = review.get('evidencePaths', {})
    context_file = local(review.get('contextFile') or paths.get('context')
        or f'.artifacts/hd-movies/final-qa/{identity.replace(":", "-")}/context.json')
    context = json.loads(context_file.read_text())
    audit_file = local(review.get('auditFile') or paths.get('audit') or context['auditFile'])
    audit = json.loads(audit_file.read_text())
    assert context['candidateSha256'] == audit['candidateSha256'] == row['sha256']
    assert context['originalSha256'] == audit['originalSha256'] == movie['original']['sha256']
    assert audit.get('referenceInput') == receipt['recipe'].get('sourceVideoInput')
    for name in ['receipt', 'context', 'audit', 'scan', 'contact']:
        if review.get(name + 'File') and review.get(name + 'Sha256'):
            assert sha(local(review[name + 'File'])) == review[name + 'Sha256'], identity + ':' + name
    if screens[identity]['flaggedFrames']:
        note = color_reviews.get(identity)
        assert note and note['candidateSha256'] == row['sha256'] and note['status'] == 'SOURCE_COLOR_FLAGS_REVIEWED_NO_NEW_BLOCKER', \
            f'Post-repair color flags need native-source review: {identity}'
    qualifications = ['Engineering evidence covers source-matched selected stills, cut checkpoints and full automatic file/audio/clock checks; user complete-film acceptance remains pending.',
        'Very small source details and continuous motion/comprehension are not certified by still inspection.']
    for key in ['remainingQualifications', 'remainingLimitations', 'qualifications']:
        value = review.get(key)
        if isinstance(value, list):
            qualifications.extend(item if isinstance(item, str) else json.dumps(item, sort_keys=True) for item in value)
        elif isinstance(value, str):
            qualifications.append(value)
    if identity in color_reviews:
        qualifications.extend(color_reviews[identity].get('qualifications', []))
    if movie['subtitles']['sourceCueCount'] and not movie['subtitles']['runtimeCueCount']:
        qualifications.append('Source cues exist but this unbound library clip has no existing runtime caption track; none is invented.')
    if identity == 'ra2:s10_f00e':
        qualifications.append('Documented localized author-assisted video recovery; retail audio, source identity and exact clock retained.')
    if receipt['recipe']['detailGain'] != .5:
        qualifications.append(f'Source-sensitive detail gain {receipt["recipe"]["detailGain"]} stays below the accepted maximum 0.5 to reduce structured facial texture.')
    evidence = dict(reviewer=str(reviewer_file.resolve().relative_to(ROOT)), reviewerSha256=sha(reviewer_file),
        reviewEntrySha256=canonical(review), context=str(context_file.relative_to(ROOT)), contextSha256=sha(context_file),
        audit=str(audit_file.relative_to(ROOT)), auditSha256=sha(audit_file),
        productionReceipt=str(receipt_file.relative_to(ROOT)), productionReceiptSha256=sha(receipt_file),
        automaticVerificationSha256=canonical(checks[identity]), colorScreenSha256=canonical(screens[identity]))
    if identity in color_reviews:
        evidence['colorReviewSha256'] = canonical(color_reviews[identity])
    native_frames = review.get('nativeFrames') or review.get('nativeEvidence') or []
    entries.append(dict(identity=identity, status='SOURCE_FIDELITY_REVIEWED', candidateSha256=row['sha256'],
        originalSha256=movie['original']['sha256'], evidence=evidence, evidenceSha256=canonical(evidence),
        reviewedNativeCheckpoints=len(native_frames), sourceAuditCheckpoints=len(audit['checkpoints']),
        reviewStatus=review['status'], qualifications=qualifications, unresolvedBlockers=[]))
record = dict(schema='hd-movie-source-matched-engineering-review-v1',
    status='PASS_ALL_136_SOURCE_MATCHED_ENGINEERING_AUDITS', entries=entries,
    coverage=dict(ra2=80, yr=56, fullscreen=53, radar=83, sourceFrames=69622, mapUsedIdentities=125),
    ledgerSha256=sha(args.ledger), automaticVerificationSha256=sha(args.technical), colorScreenSha256=sha(args.color_screen),
    userAcceptance=dict(representativeDirection='accepted-natural-settings', completeFilmReview='pending-final-delivery-review'),
    scope='Every identity has pinned independent selected-still engineering evidence and fresh complete automatic audio/video/clock checks. This seal does not claim that every source frame was visually inspected, every dialogue word was transcribed, or that the user accepted complete films. Native runtime/package/platform checks have separate receipts.')
args.output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(status=record['status'], identities=len(entries), sha256=sha(args.output))))
