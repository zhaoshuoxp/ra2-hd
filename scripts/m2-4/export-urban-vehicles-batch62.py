"""Export six complete native-body families without changing selected resources."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/urban-actors-voxel-authoring-batch62-v2')
work_file = root / 'selected-worklist-v1.json'
work = json.loads(work_file.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
identities = {'JEEP', 'YCAB', 'BCAB', 'AMBU', 'FTRK', 'CIVP'}
assert len(work['boards']) == 6 and {b['identity'] for b in work['boards']} == identities
assert not work['reused']
contracts, records = {}, []
for board in work['boards']:
    assert board['visualQa'] == 'PASS' and sha(Path(board['selectedArt'])) == board['selectedArtSha256']
    identity = board['identity']
    variants = []
    for density in [2, 4]:
        revision = f'urban-m2-4-actors-batch62-v1-{density}x'
        output = Path('.local/hd-packs') / f'environment-{identity.lower()}-vxl' / revision
        review = root / 'export-v1' / f'{identity}-{density}x'
        manifest = output / 'manifest.json'
        if not manifest.exists():
            subprocess.run(['python3', 'scripts/m1/yuri-units/export-vxl.py', identity,
                str(work_file), revision, str(review), '--ownership-references', work['references'],
                '--output', str(output), '--density', str(density), '--theater', 'URBAN',
                '--acceptance', 'SOURCE_DERIVED_CANDIDATE_VISUAL_REVIEW_PENDING',
                '--inventory', str(root / 'inventory.json'), '--reference-report', 'report.json'], check=True)
        pack = json.loads(manifest.read_text())
        assert pack['identity'] == identity and pack['density'] == density and pack['theater'] == 'URBAN'
        assert len(pack['parts']) == 1 and pack['parts'][0]['provenance']['sha256'] == board['selectedArtSha256']
        variants.append(dict(hash=sha(manifest), density=density, path=str(manifest.relative_to('.local'))))
        records.append(dict(identity=identity, density=density, manifest=str(manifest), sha256=sha(manifest)))
    contracts[identity] = dict(hash=variants[-1]['hash'], path=variants[-1]['path'],
        members=sorted(n for n in pack['sources'] if n.endswith('.vxl')), variants=variants)
receipt = dict(status='EXPORTED_SOURCE_REGISTERED_URBAN_VEHICLES_NATIVE_RUNTIME_PENDING',
    worklist=str(work_file), worklistSha256=sha(work_file), records=records,
    boundary='Six original body sections, native shadows, fixed colors, pivots and logical bounds; gameplay rules remain unchanged.')
for name, value in [('vxl-contract-v1.json', dict(vxl=contracts)), ('export-receipt-v1.json', receipt)]:
    with (root / name).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(identities=sorted(contracts), variants=len(records), selectedResourcesChanged=False)))
