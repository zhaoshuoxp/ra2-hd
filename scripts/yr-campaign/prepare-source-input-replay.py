"""Verify retained ordinary inputs and prepare a source-constructor replay seed."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('checkpoint', type=Path)
parser.add_argument('journal', type=Path)
parser.add_argument('--source-victory-report', type=Path, required=True)
parser.add_argument('--required-own', nargs='+', required=True)
parser.add_argument('--milestone', type=int)
args = parser.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
out = args.output.resolve()
assert out.is_relative_to(ROOT / '.artifacts/yr-campaign') and not out.exists()
checkpoint_file, journal_file = args.checkpoint.resolve(), args.journal.resolve()
checkpoint_bytes, compressed = checkpoint_file.read_bytes(), journal_file.read_bytes()
checkpoint = json.loads(checkpoint_bytes)
raw = gzip.decompress(compressed) if journal_file.suffix == '.gz' else compressed
original = json.loads(raw)
identity = checkpoint['identity']
assert identity['edition'] == 'yr' and not checkpoint.get('trainer')
assert checkpoint['gameId'] == original['gameId']
assert checkpoint['commands'] == original['commands'][:len(checkpoint['commands'])]
assert original['launch']['sourceSha256'] == identity['sourceSha256']
assert original['launch']['provenanceDigest'] == identity['provenanceDigest']
assert original['launch']['difficulty'] == checkpoint['options']['campaign']['difficulty']
source = ROOT / '.local/campaign/yr' / Path(identity['mission']).stem / identity['mission']
assert sha(source.read_bytes()) == identity['sourceSha256'], 'Original source map changed'
commands = original['commands']
assert all(type(command['tick']) is int and 0 <= command['tick'] < original['tick'] for command in commands)
assert all(a['tick'] <= b['tick'] for a, b in zip(commands, commands[1:]))
milestone = args.milestone if args.milestone is not None else checkpoint['tick']
assert checkpoint['tick'] <= milestone < original['tick'] - 180
assert not any(milestone <= command['tick'] < milestone + 180 for command in commands), \
    'The named-save verification interval must contain no recorded player input'
victory_file = args.source_victory_report.resolve()
victory_bytes = victory_file.read_bytes()
victory_raw = gzip.decompress(victory_bytes) if victory_file.suffix == '.gz' else victory_bytes
victory = json.loads(victory_raw)
assert victory['status'].startswith('PASS_')
results = [original.get('result'), (victory.get('victory') or {}).get('result'),
    (victory.get('finalWorld') or {}).get('result'), *[row.get('result') for row in victory.get('samples', [])]]
assert 'victory' in results, 'Retain an original source victory, not a load-only probe'
proof = dict(checkpoint=dict(file=str(checkpoint_file), sha256=sha(checkpoint_bytes),
    tick=checkpoint['tick'], commands=len(checkpoint['commands'])),
    sourceVictory=dict(file=str(victory_file), sha256=sha(victory_bytes), rawSha256=sha(victory_raw),
        tick=original['tick'], semanticsVersion=original['launch']['semanticsVersion']))
timestamp = checkpoint['timestamp']
assert type(timestamp) is int and timestamp > 0
derived = 'timestamp' not in original
if not derived:
    assert original['timestamp'] == timestamp
else:
    proof['creationMetadataDerivation'] = dict(
        originalJournal=dict(file=str(journal_file), sha256=sha(compressed), rawSha256=sha(raw)),
        creationTimestampSource=str(checkpoint_file), gameIdAndAllCheckpointInputPrefixExact=True,
        changedField='timestamp', value=timestamp, originalJournalModified=False)
out.mkdir()
if derived:
    raw = encode({**original, 'timestamp': timestamp})
    journal_file = out / 'source-journal-with-creation-metadata.json.gz'
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    journal_file.write_bytes(compressed)
proof['journal'] = dict(file=str(journal_file), sha256=sha(compressed), rawSha256=sha(raw))
seed = dict(schema='yr-original-input-replay-seed-v1', identity=identity, gameId=original['gameId'],
    timestamp=timestamp, options=checkpoint['options'], tick=original['tick'], commands=commands,
    meaningfulMilestone=dict(tick=milestone, requiredOwn=args.required_own, inputFreeUntil=milestone + 180),
    proof=proof)
(out / 'input-seed.json').write_bytes(encode(seed))
report = dict(schema='yr-original-input-provenance-qualification-v1',
    status='VERIFIED_ORDINARY_INPUT_REPLAY_PROVENANCE_SOURCE_EXECUTION_PENDING',
    identity=identity, tick=original['tick'], commands=len(commands), meaningfulMilestone=seed['meaningfulMilestone'],
    historicalPolicy=original['launch']['semanticsVersion'], proof=proof,
    worldAssigned=False, runningRngAssigned=False, originalJournalModified=False, publicAvailabilityChanged=False)
(out / 'report.json').write_bytes(encode(report))
print(json.dumps(dict(status=report['status'], output=str(out), commands=len(commands), milestone=milestone)))
