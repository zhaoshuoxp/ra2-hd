"""Omit four unchanged material views while retaining complete native state evidence."""
import hashlib
import json
from pathlib import Path

root = Path('.artifacts/m2-4/urban-buildings-review-batch59-v1')
file = root / 'review-manifest.json'
data = json.loads(file.read_text())
assert len(data['states']) == 43 and len(data['files']) == 129
names = ['CAPARK04', 'CAPARK05', 'CAPARK06', 'CAMISC06']
removed = [r for r in data['states'] if r['name'].endswith('building damaged')
    and r['name'].split(' / ')[1] in names]
assert len(removed) == 4
source_file = Path('.artifacts/m2-4/urban-buildings-native-batch59-v1/source.json')
sources = json.loads(source_file.read_text())['sources']
for name in names:
    source, = [s for s in sources if s['bindings'][0]['id'] == name]
    count = source['totalFrames'] // 2
    if name.startswith('CAPARK'):
        assert count == 1
    else:
        a, b = source['frames'][:2]
        assert all(a[k] == b[k] for k in ['origin', 'size', 'indexSha256', 'rgbaSha256'])
with (root / 'review-manifest-before-identical-state-deduplication.json').open('xb') as f:
    f.write(file.read_bytes())
data['states'] = [r for r in data['states'] if r not in removed]
used = {p for r in data['scenes'] + data['states'] for p in r['images'].values()}
used.update(r['image'] for r in data['comparisons'])
data['files'] = [r for r in data['files'] if r['file'] in used]
assert len(data['states']) == 39 and len(data['files']) == 121
data['reviewDeduplication'] = dict(status='PASS_FOUR_EXACT_NATIVE_MATERIAL_REPEATS_OMITTED_ONLY_FROM_REVIEW',
    sourceFile=str(source_file), sourceSha256=hashlib.sha256(source_file.read_bytes()).hexdigest(), omittedRows=removed,
    reason='Park benches have one original body frame even when damaged. CAMISC06 normal and damaged original pixels, origin and size are identical. Full native state reports remain preserved; review each material once.')
data['disclosure'] += (' Four identical damaged material views are omitted: the three one-frame park benches and '
    'CAMISC06, whose normal/damaged source pixels are exact duplicates. All full native health and destruction '
    'checks remain pinned. CARUS02A/B and CAMISC06 retain unused third source slots without inventing garrison. '
    'Three park facilities retain their sole original frame. Two separate original facilities contain source '
    'replace boards and remain explicitly uncovered; they are not part of this art review. Earlier accepted artwork needs no repeat review.')
file.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps(dict(images=121, scenes=5, newNativeStateRows=39, sourceBoards=28, omittedExactMaterialRows=4)))
