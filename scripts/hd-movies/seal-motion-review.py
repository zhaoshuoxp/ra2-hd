"""Seal source-matched motion repair reviews while retaining unchanged R5 evidence."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--plan', type=Path)
args = parser.parse_args()
work = args.work.resolve()


def read(path):
    return json.loads(path.read_text())


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


ledger_file = work/'delivery-ledger.json'
ledger = read(ledger_file)
baseline_file = ROOT/'docs/hd-movies-engineering-20261111.json'
baseline = read(baseline_file)
assert baseline['status'] == 'PASS_ALL_136_SOURCE_MATCHED_ENGINEERING_AUDITS'
old = {r['identity']: r for r in baseline['entries']}
technical_file, audio_file = work/'technical/summary.json', work/'audio-clock.json'
technical, audio = read(technical_file), read(audio_file)
assert technical['status'] == 'PASS_ALL_136_FILES_AUDIO_AND_SOURCE_CLOCKS'
assert audio['status'] == 'PASS_ALL_CHANGED_AAC_PACKET_PTS_DTS_DURATION_AND_PAYLOAD'
checks = {r['identity']: r for r in technical['entries']}
clocks = {r['identity']: r for r in audio['entries']}
positive = {'PASS_RETURNED_OUTPUT_ENGINEERING_REVIEW_WITH_QUALIFICATIONS',
            'PASS_RETURNED_CHECKPOINT_REVIEW_WITH_QUALIFICATIONS', 'QUALIFIED_CHECKED_CANDIDATE',
            'PASS_RESIDUAL_RETURN_ENGINEERING_WITH_R4_QUALIFICATIONS'}
files = set()
for directory in [work/'returned-review', work/'audit-yr/returned-review']:
    files.update(directory.rglob('*decision.json'))
    files.update(directory.rglob('*review.json'))
    files.update(directory.rglob('*final.json'))
files.update((work/'audit-yr/returned-review').glob('yr-*.json'))
reviews = []
for file in sorted(files):
    data = read(file)
    candidates = ([data] if data.get('identity') else
                  [entry for entry in data.get('films', []) if entry.get('findings') or entry.get('assessedFrames')])
    for entry in candidates:
        if entry.get('candidateSha256') and entry.get('status') in positive:
            reviews.append((file, entry))
entries, jobs = [], []
for row in sorted(ledger['completed'], key=lambda r: r['identity']):
    identity = row['identity']
    assert sha(ROOT/row['file']) == row['sha256'] == checks[identity]['candidateSha256']
    receipt_file = ROOT/row['receipt']
    assert sha(receipt_file) == checks[identity]['productionReceiptSha256']
    prior = old[identity]
    if identity in ledger['retained']:
        assert row['sha256'] == prior['candidateSha256']
        entry = copy.deepcopy(prior)
        entry['motionAction'] = 'KEEP_VERIFIED_R5_IDENTICAL_PAYLOAD'
        entry['retainedEngineeringSealSha256'] = sha(baseline_file)
    else:
        assert clocks[identity]['candidateSha256'] == row['sha256']
        receipt = read(receipt_file)
        motion = receipt['postRestoration']['motion']
        normalization = motion.get('codecMetadataNormalization')
        reviewed_sha = row['sha256']
        if normalization:
            proof_file = ROOT/normalization['proofFile']
            assert sha(proof_file) == normalization['proofSha256']
            proof = read(proof_file)
            assert proof['status'] == 'PASS_EVERY_DECODED_YUV_RGB_BYTE_VIDEO_CLOCK_AND_AAC_PACKET_UNCHANGED'
            assert proof['candidateSha256'] == row['sha256']
            assert proof['normalizerSha256'] == sha(ROOT/'scripts/hd-movies/normalize-motion-color.py')
            reviewed_sha = proof['parentCandidateSha256']
        choices = [(file, data) for file, data in reviews
                   if data['identity'] == identity and data['candidateSha256'] == reviewed_sha]
        assert len(choices) == 1, (identity, 'Expected exactly one current positive returned review', len(choices))
        reviewer_file, review = choices[0]
        assert not any(review.get(k) for k in ['blockers', 'unresolvedBlockers', 'remainingHolds'])
        job_file, check_file = ROOT/motion['geometryJob'], ROOT/motion['completeFileCheck']
        assert sha(job_file) == motion['jobSha256'] and sha(check_file) == motion['completeFileCheckSha256']
        jobs.append({'identity': identity, 'jobSha256': sha(job_file), 'job': read(job_file),
                     'codecMetadataNormalization': normalization})
        check = read(check_file)
        assert check['candidateSha256'] == row['sha256']
        evidence = {'reviewer': str(reviewer_file.relative_to(ROOT)), 'reviewerSha256': sha(reviewer_file),
            'reviewEntrySha256': canonical(review), 'parentSourceMatchedReviewSha256': prior['evidenceSha256'],
            'parentEngineeringSealSha256': sha(baseline_file), 'geometryJob': str(job_file.relative_to(ROOT)),
            'geometryJobSha256': sha(job_file), 'completeFileCheckSha256': sha(check_file),
            'productionReceiptSha256': sha(receipt_file), 'automaticVerificationSha256': canonical(checks[identity]),
            'originalAudioPacketClockSha256': clocks[identity]['packetClockAndPayloadSha256']}
        if normalization:
            evidence['decodedPictureNormalizationSha256'] = normalization['proofSha256']
            evidence['reviewedParentCandidateSha256'] = reviewed_sha
        values = prior.get('qualifications', [])+review.get('qualifications', [])
        qualifications = list(dict.fromkeys(value if isinstance(value, str) else json.dumps(value, sort_keys=True)
                                             for value in values))
        qualifications.append('The accepted selective post-restoration correction reduces moving combs. Fine inherited ripple and motion softness can remain; complete-film user acceptance is pending.')
        entry = {'identity': identity, 'status': 'SOURCE_FIDELITY_REVIEWED', 'candidateSha256': row['sha256'],
            'originalSha256': prior['originalSha256'], 'motionAction': 'SELECTIVE_MOTION_REPAIR',
            'evidence': evidence, 'evidenceSha256': canonical(evidence), 'reviewStatus': review['status'],
            'qualifications': qualifications, 'unresolvedBlockers': []}
    entries.append(entry)
assert len(entries) == 136 and len(ledger['changed']) == 44 and len(ledger['retained']) == 92
if args.plan:
    assert not args.plan.exists(), 'Use a fresh versioned production plan after changing admitted geometry'
    args.plan.write_text(json.dumps({'schema': 'hd-movie-motion-plan-v1', 'revision': ledger['revision'],
        'parentRevision': 'local-natural-r5', 'changedJobs': jobs, 'retained': ledger['retained'],
        'scope': 'Complete normalized source geometry and pinned jobs for all 44 changed movies. '
                 'Per-frame RGB production records remain in compact local receipts. '
                 'Unchanged payloads retain the exact R5 masters and source-matched reviews.'}, indent=2)+'\n')
seal = {'schema': 'hd-movie-engineering-acceptance-v1', 'status': 'PASS_ALL_136_SOURCE_MATCHED_ENGINEERING_AUDITS',
    'entries': entries, 'coverage': {'identities': 136, 'changed': 44, 'retained': 92,
        'fullscreen': 53, 'radar': 83, 'sourceFrames': 69622},
    'ledgerSha256': sha(ledger_file), 'automaticVerificationSha256': sha(technical_file),
    'audioPacketClockSha256': sha(audio_file), 'parentEngineeringSealSha256': sha(baseline_file),
    'userAcceptance': {'representativeMotionDirection': 'USER_ACCEPTED_R4_FULL_BATCH_AUTHORIZED',
                       'completeFilmReview': 'PENDING_FINAL_DELIVERY_REVIEW'},
    'scope': 'Every changed master has a matching independent returned-output selected-still review and full automatic audio/video/clock checks. Unchanged payloads retain their exact R5 source-matched engineering evidence. No continuous every-frame human review or complete-film user acceptance is implied.'}
if args.plan:
    seal['versionedGeometryPlanSha256'] = sha(args.plan)
assert not args.output.exists(), 'Use a fresh engineering seal after changing admitted evidence'
args.output.write_text(json.dumps(seal, indent=2)+'\n')
print(json.dumps({'status': seal['status'], 'identities': len(entries), 'changed': 44}))
