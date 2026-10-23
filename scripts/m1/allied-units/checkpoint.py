"""Verify immutable representative evidence and write compact tracked receipts."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / '.artifacts/allied-units'


def read(name):
    return json.loads((ART / name).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(name, value):
    with (ROOT / 'docs' / name).open('w') as out:
        out.write(json.dumps(value, indent=2) + '\n')


ledger = read('coverage-ledger-v1.json')
review = read('review-v1/receipt.json')
qa = read('review-v1/html-check.json')
dependencies = {(r['edition'], r['id']): r for r in read('dependencies-v1.json')['rows']}
assert qa['status'] == 'PASS_OFFLINE_REPRESENTATIVE_REVIEW'
assert (qa['articles'], qa['comparisons'], qa['images']) == (29, 103, 235)
assert len(read('imagegen-prompts-v2.json')['prompts']) == 32
assert len(ledger['protectedFiles']) == 46
for pin in ledger['protectedFiles']:
    assert digest(ROOT / pin['path']) == pin['sha256'], pin['path']
for entry in review['entries']:
    assert digest(ROOT / entry['raw']) == entry['rawSha256'], entry['id']
    for sample in entry['samples']:
        for kind in ('hd', 'original'):
            assert digest(ROOT / sample[kind]) == sample[kind + 'Sha256']
roots = {r['id'] for r in ledger['rows']}
reuse = {r['id'] for r in ledger['rows'] if r['acceptedReuseCandidate']}
assert len(roots) == 30 and len(reuse) == 4
assert {e['id'] for e in review['entries']} == (roots - reuse) | {'CMON', 'HORNET', 'ASW'}
fields = ('edition', 'id', 'houses', 'image', 'resolvedStem', 'representation',
          'source', 'sourceGroup', 'mappingGroup', 'acceptedReuseCandidate',
          'reuseStatus', 'plannedDensity', 'producedDensities', 'selectedResource',
          'review', 'nativeRuntime', 'complete', 'theaters')
rows = []
for row in ledger['rows']:
    compact = {key: row[key] for key in fields}
    compact['source'] = [{k: v for k, v in member.items() if k not in ('frames', 'sections')}
                         for member in row['source']]
    dep = dependencies[row['edition'], row['id']]
    for key in ('requiredActions', 'requiredChildren', 'requiredAttachments'):
        compact[key] = dep[key]
    rows.append(compact)
write('allied-units-hd-coverage.json', {
    'schemaVersion': 1, 'baseline': ledger['baseline'], 'status': review['status'],
    'counts': ledger['counts'], 'rows': rows, 'excluded': ledger['excluded'],
})
evidence = ['coverage-ledger-v1.json', 'source-verification-v1.json', 'dependencies-v1.json',
            'reuse-audit-v1.json', 'imagegen-prompts-v2.json', 'review-v1/receipt.json',
            'review-v1/html-check.json', 'review-v1/Allied-Units-Representative-Review.html']
write('allied-units-hd-review.json', {
    'schemaVersion': 1, 'baseline': ledger['baseline'], 'status': review['status'],
    'completeNewRuntimeFamilies': 0, 'app': None, 'approval': None,
    'qa': qa, 'protectedFiles': ledger['protectedFiles'],
    'evidence': [{'path': str((ART / name).relative_to(ROOT)),
                  'sha256': digest(ART / name)} for name in evidence],
    'representatives': [{k: e[k] for k in ('id', 'raw', 'rawSha256', 'status')}
                        for e in review['entries']],
})
print('PASS_REPRESENTATIVE_CHECKPOINT: 29 masters, 103 pairs, 46 preserved identities')
