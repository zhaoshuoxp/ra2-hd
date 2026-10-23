"""Keep edition-specific rubble and white-house views without repeating proven identical new bodies."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('review', type=Path)
args = parser.parse_args()
file = args.review / 'review-manifest.json'
manifest = json.loads(file.read_text())
parity = Path('.artifacts/m2-4/urban-edition-buildings-native-batch58-v1/shared-body-pixel-parity-v1.json')
assert json.loads(parity.read_text())['status'] == 'PASS_NINE_SHARED_SOURCE_STATES_18_DENSITY_PIXEL_PAIRS'
assert len(manifest['scenes']) == 4 and len(manifest['states']) == 24
omitted, states = [], []
for row in manifest['states']:
    same_body = row['name'].startswith('YR-') and any(f' / {name} / ' in row['name']
        for name in ['CAPARS11', 'CAWASH14', 'CAWASH15'])
    if same_body and row['name'].rsplit(' / ', 1)[-1] in ['building normal', 'building damaged']:
        omitted.append(row)
    else:
        states.append(row)
assert len(omitted) == 6 and len(states) == 18
manifest['states'] = states
used = {file for row in [*manifest['scenes'], *states] for file in row['images'].values()}
used.update(row['image'] for row in manifest['comparisons'])
manifest['files'] = [row for row in manifest['files'] if row['file'] in used]
assert len(manifest['files']) == 64 and len(manifest['comparisons']) == 16
for row in manifest['comparisons']:
    edition = 'YR' if '-group1-' in row['image'] else 'RA2'
    row['name'] = edition + ' / ' + row['name']
manifest['reviewDeduplication'] = dict(status='PASS_EXACT_NEW_BODY_MATERIAL_REUSE_NOT_PRIOR_VISUAL_ACCEPTANCE',
    parityProof=dict(file=str(parity), sha256=hashlib.sha256(parity.read_bytes()).hexdigest()),
    omittedPairedNativeRows=omitted,
    reason='Nine original body states and both density outputs match exactly. Review the six applicable normal/damaged states once in RA2; both editions retain complete separate native state reports and shadows. All eight edition-specific rubble views and both distinct white-house bodies remain visible.')
manifest['disclosure'] += (' Review all four identities and each edition-specific rubble. Proven identical normal/damaged '
    'Arc de Triomphe, Jefferson and Lincoln materials are shown once under RA2; their YR native states remain in the '
    'complete technical reports. This is same-batch material reuse, not an earlier user acceptance. '
    'All eight identities retain their original prohibition on garrison and inactive third source slot. '
    'Seven microscopic original Arc rubble fragments keep their exact source colors and positions without a new-detail claim. '
    'Source atlas labels identify RA2 and YR explicitly.')
snapshot = args.review / 'review-manifest-before-shared-body-deduplication.json'
with snapshot.open('xb') as stream:
    stream.write(file.read_bytes())
file.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(dict(status='PASS_CONSOLIDATED_18_NEW_APPLICABLE_STATE_ROWS', images=64,
    scenes=4, nativeRows=18, omittedIdenticalRows=6, comparisons=16)))
