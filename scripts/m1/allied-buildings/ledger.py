"""Validate unique decoded members once and record cheap per-cell coverage."""
import hashlib
import json
from pathlib import Path

ROOT = Path('.artifacts/allied-buildings')
SOURCE = ROOT / 'source-v2'
inventory = json.loads((SOURCE / 'inventory.json').read_text())
dependencies = json.loads((ROOT / 'dependencies-v1.json').read_text())
review = json.loads((ROOT / 'review-v1/review.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
key = lambda row: (row['edition'], row['theater'], row['id'])
deps = {key(row): row for row in dependencies['rows']}
members = {}
frame_count = 0
for digest, entry in inventory['uniqueMembers'].items():
    path = SOURCE / entry['path']
    member = json.loads(path.read_text())
    assert member['source']['sha256'] == digest
    assert len(member['frames']) == entry['totalFrames']
    assert member['canvas'] == entry['canvas']
    used = set()
    for frame in member['frames']:
        pixels = bytes(frame['pixels'])
        assert len(pixels) == frame['width'] * frame['height']
        assert sha(pixels) == frame['pixelHash']
        used.update(pixels)
        frame_count += 1
    members[digest] = {**entry, 'decodedSha256': sha(path.read_bytes()),
                       'usedPaletteIndices': sorted(used), 'structuralCheck': 'PASS'}

family_path = Path('.local/hd-packs/power-plant-authored/1/family.json')
accepted = json.loads(family_path.read_text())
accepted['manifestSha256'] = sha(family_path.read_bytes())
accepted['path'] = str(family_path)
groups, rows = {}, []
for cell in inventory['matrix']:
    cell_key = key(cell)
    dep = deps[cell_key]
    declared_missing = [m for m in inventory['missingMembers'] if key(m) == cell_key]
    source_members = []
    for member in cell['members']:
        digest = member['source']['sha256']
        assert digest in members
        assert len(member['frames']) == members[digest]['totalFrames']
        used = members[digest]['usedPaletteIndices']
        colors = [cell['palette']['colors'][i] for i in used]
        source_members.append({k: v for k, v in member.items() if k != 'frames'} | {
            'usedPaletteSha256': sha(json.dumps(colors).encode()),
            'decodedMember': members[digest]['path']})
    # Include sequence/offset and voxel dependencies: identical SHP bytes alone
    # do not prove that two edition/theater families are interchangeable.
    signature = {'members': source_members, 'animations': cell['animations'],
                 'art': cell['art'], 'voxelParts': dep['voxelParts']}
    group = sha(json.dumps(signature, sort_keys=True).encode())
    groups.setdefault(group, []).append('/'.join(cell_key))
    reused = cell['id'] == 'GAPOWR' and cell['theater'] == 'TEMPERATE'
    rows.append({'edition': cell['edition'], 'theater': cell['theater'], 'id': cell['id'],
        'image': cell['imageName'], 'sourceMappingGroup': group,
        'members': source_members, 'animations': cell['animations'],
        'dependencyEvidence': 'dependencies-v1.json', 'missingMembers': declared_missing,
        'paletteSemantics': dep['paletteSemantics'],
        'representative': 'GAAIRC' if cell['id'] == 'AMRADR' else cell['id'],
        'selectedPacks': accepted['members'] if reused else [],
        'status': 'REUSED_ACCEPTED_EVIDENCE' if reused else 'COMPLETE_FAMILY_PENDING',
        'runtimeBinding': 'ACCEPTED_BASELINE_UNCHANGED' if reused else 'NOT_ACTIVATED',
        'acceptance': 'REUSED_ACCEPTED' if reused else 'PENDING',
        'structuralCheck': 'PASS_WITH_DECLARED_GAPS' if declared_missing else 'PASS'})

assert len(rows) == len(deps) == 186
assert len({key(r) for r in rows}) == 186
assert len(inventory['catalogs']['ra2']) == 20
assert len(inventory['catalogs']['yr']) == 21
assert len(members) == 159
for r in review['records']:
    assert sha(Path(r['raw']).read_bytes()) == r['rawSha256']
    assert sha((ROOT / 'review-v1' / r['candidate']).read_bytes()) == r['candidateSha256']

result = {'schemaVersion': 1, 'baseline': inventory['baseline'],
    'status': 'REPRESENTATIVE_REVIEW_PENDING', 'completeNewFamilies': 0,
    'catalogs': inventory['catalogs'], 'acceptedReuse': accepted,
    'uniqueMembers': members, 'sourceMappingGroups': groups, 'cells': rows,
    'checks': {'uniqueMembers': len(members), 'decodedFrames': frame_count,
               'cells': len(rows), 'representatives': len(review['records'])},
    'allocationBytes': None, 'allocationStatus': 'NOT_MEASURED'}
out = ROOT / 'coverage-ledger-v1.json'
with out.open('x') as f:
    json.dump(result, f, indent=2)
    f.write('\n')
print(json.dumps(result['checks'] | {'mappingGroups': len(groups), 'ledger': str(out)}))
