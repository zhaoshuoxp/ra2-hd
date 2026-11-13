"""Stage the full motion-repaired library without admitting or selecting a manifest."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text())


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--revision', default='local-natural-r6')
args = parser.parse_args()
work = args.work.resolve()
assert re.fullmatch('[a-z0-9][a-z0-9_-]{0,79}', args.revision)
baseline_file = ROOT/'.local/media/hd-movies/local-natural-r5/manifest.json'
baseline = read(baseline_file)
assert sha(baseline_file) == 'eeaeeb42ac2297f4b53d60d1308865fd1ed3f0084fdf96a047b103cdb115fb93'
old_ledger = read(ROOT/'.artifacts/hd-movies/final-gates-r5/delivery-ledger.json')
rows = {r['identity']: r for r in old_ledger['completed']}
overrides = read(work/'final-overrides.json') if (work/'final-overrides.json').exists() else {}
pack = ROOT/'.local/media/hd-movies'/args.revision
pack.mkdir(exist_ok=True)
assert not (pack/'manifest.json').exists(), 'Do not mutate an admitted immutable revision'
(work/'final-receipts').mkdir(exist_ok=True)
completed, changed, retained = [], [], []
for entry in baseline['entries']:
    identity = entry['edition']+':'+entry['id']
    name = identity.replace(':', '-')
    old = rows[identity]
    source = baseline_file.parent/entry['file']['path']
    assert sha(source) == entry['file']['sha256'] == old['sha256']
    job_file = work/'local/jobs'/(name+'.json')
    motion = None
    if job_file.exists():
        override = overrides.get(name)
        if override:
            job_file, directory, check_file = [ROOT/override[k] for k in ['job', 'work', 'check']]
        else:
            directory = next(p for p in [work/'local/outputs'/name, work/'returned'/name] if (p/'receipt.json').exists())
            check_file = work/'checks'/name/'check.json'
        job, motion, check = read(job_file), read(directory/'receipt.json'), read(check_file)
        assert check['status'] == 'PASS_COMPLETE_DECODE_EVERY_PTS_AND_IDENTICAL_R5_AUDIO'
        assert check['sourceSha256'] == entry['file']['sha256']
        assert check['jobSha256'] == motion['jobSha256'] == sha(job_file)
        assert check['candidateSha256'] == motion['file']['sha256']
        assert check['productionReceiptSha256'] == sha(directory/'receipt.json')
        assert check['frames'] == entry['video']['frames']
        assert check['audio']['decodedPcmSha256'] == entry['audio']['decodedPcmSha256']
        source = directory/'video.mp4'
        assert sha(source) == check['candidateSha256']
    target = pack/entry['file']['path']
    digest = sha(source)
    if not target.exists() or sha(target) != digest:
        temporary = target.with_suffix('.writing.mp4')
        assert not temporary.exists()
        subprocess.run(['/bin/cp', '-c', str(source), str(temporary)], check=True)
        assert sha(temporary) == digest
        temporary.replace(target)
    row = dict(old, file=str(target.relative_to(ROOT)), bytes=target.stat().st_size, sha256=digest)
    if motion:
        original_receipt = ROOT/old['receipt']
        receipt = copy.deepcopy(read(original_receipt))
        assert receipt['file']['sha256'] == entry['file']['sha256']
        post = {'strategy': 'user-accepted-selective-post-restoration-field-repair',
            'parentRevision': 'local-natural-r5', 'parentManifestSha256': sha(baseline_file),
            'parentPayloadSha256': entry['file']['sha256'], 'jobSha256': sha(job_file),
            'implementationSha256': motion['implementationSha256'], 'fieldGraph': motion['fieldGraph'],
            'mask': motion['mask'], 'geometryJob': str(job_file.relative_to(ROOT)),
            'productionReceipt': str((directory/'receipt.json').relative_to(ROOT)),
            'productionReceiptSha256': sha(directory/'receipt.json'),
            'completeFileCheck': str(check_file.relative_to(ROOT)), 'completeFileCheckSha256': sha(check_file),
            'audioAction': 'Copy verified R5 original-audio AAC packets unchanged',
            'newNeuralInference': bool(motion.get('sourceFieldReference')),
            'newSharpening': False, 'frameInterpolation': False}
        if motion.get('sourceFieldReference'):
            post['sourceFieldReference'] = motion['sourceFieldReference']
        if motion.get('codecMetadataNormalization'):
            post['codecMetadataNormalization'] = motion['codecMetadataNormalization']
        receipt['recipe']['postRestorationMotion'] = post
        receipt['recipeSha256'] = hashlib.sha256(json.dumps(receipt['recipe'], sort_keys=True).encode()).hexdigest()
        receipt['file'] = {'path': str(target.relative_to(ROOT)), 'bytes': target.stat().st_size, 'sha256': digest}
        receipt['decode'] = 'PASS_ALL_VIDEO_AND_AUDIO'
        receipt['packetClock'] = 'PASS_EVERY_PRESENTATION_TIMESTAMP'
        receipt['postRestoration'] = {'parentReceiptSha256': sha(original_receipt), 'motion': post,
            'scope': ('Bounded source-field controls use the same qualified natural neural settings; other regions inherit R5.'
                      if motion.get('sourceFieldReference') else
                      'Original neural restoration is inherited from R5; only the approved selective field reconstruction ran in this stage.')}
        receipt_file = work/'final-receipts'/(name+'.json')
        receipt_file.write_text(json.dumps(receipt, indent=2)+'\n')
        row['receipt'] = str(receipt_file.relative_to(ROOT))
        changed.append(identity)
    else:
        assert digest == entry['file']['sha256']
        retained.append(identity)
    completed.append(row)
record = {'schema': 'hd-movie-production-ledger-v1', 'status': 'PIXEL_PRODUCTION_COMPLETE_AUDITS_PENDING',
    'revision': args.revision, 'total': 136, 'completed': completed,
    'parentManifestSha256': sha(baseline_file), 'changed': changed, 'retained': retained,
    'scope': 'Complete candidate library staged unselected. Unaffected payload bytes are identical to R5; every changed movie passed full decode, every PTS and identical original-audio gates. Source-matched return engineering and final admission remain separate.'}
(work/'delivery-ledger.json').write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps({'status': 'COMPLETE_CANDIDATE_LIBRARY_STAGED_UNSELECTED', 'revision': args.revision,
                  'changed': len(changed), 'retained': len(retained), 'bytes': sum(r['bytes'] for r in completed)}))
