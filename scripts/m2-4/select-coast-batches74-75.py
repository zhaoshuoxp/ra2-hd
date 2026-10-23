"""Select complete source-owned coastal groups without replacing prior terrain."""
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


file = Path('desktop/terrain-theater-hd-contracts.json')
original = read(file)
combined, receipts = dict(original), []
for theater, batch, preserved, added, version in [('NEWURBAN', 74, 12, 4, 3), ('DESERT', 75, 11, 3, 1)]:
    name = theater.lower()
    root = Path(f'.artifacts/m2-4/{name}-coast-authoring-batch{batch}-v1')
    native = Path(f'.artifacts/m2-4/{name}-coast-native-batch{batch}-v1')
    revision = f'{name}-m2-4-coast-batch{batch}-v{version}'
    validation_file = root / revision / 'validation.json'
    validation = read(validation_file)
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    assert validation['newMembers'] == 92
    recipe = read(root / revision / 'recipe.json')
    profile = recipe['materialProfile']
    assert len(profile['nativeTheaterCoastMaterials']) == 92
    for job in read(root / 'imagegen-jobs.json')['jobs']:
        capacity = read(root / (job['id'] + '-capacity-v1.json'))
        assert capacity['status'] == 'PASS' and sha(Path(job['destination'])) == capacity['masterSha256']
    pointer_file = Path(f'.local/terrain-{name}-selection.json')
    old = read(pointer_file)
    assert original[theater] == recipe['acceptedBase'] == old
    old_root, pack_root = Path('.local/terrain-packs') / old['revision'], Path('.local/terrain-packs') / revision
    old_manifest, pack = read(old_root / 'manifest.json'), read(pack_root / 'manifest.json')
    assert len(old_manifest['groups']) == preserved and len(pack['groups']) == preserved + added
    assert pack['groups'][:preserved] == old_manifest['groups']
    assert sha(pack_root / 'manifest.json') == validation['pack']['sha256']
    for group in old_manifest['groups']:
        for variant in group['variants']:
            assert sha(old_root / variant['file']) == sha(pack_root / variant['file']) == variant['sha256']
    receipt = dict(status='STATIC_COMPLETE_GROUPS_AND_NATIVE_WATER_OWNERSHIP_PASS_NATIVE_PENDING',
        theater=theater, batch=batch, priorTerrain=old, selectedTerrain=validation['pack'],
        preservedGroups=preserved, newGroups=added, newMembers=92,
        independentDensityPairs=validation['independentDensityPairs'],
        environmentSelection=read(Path(f'.local/environment-{name}-selection.json')),
        priorTheaterContracts=original, validationSha256=sha(validation_file), windows='NOT_RUN', m24Complete=False)
    assert not (native / 'selection-v1.json').exists()
    receipts.append((native / 'selection-v1.json', receipt, pointer_file))
    combined[theater] = validation['pack']
assert all(combined[key] == value for key, value in original.items() if key not in ('NEWURBAN', 'DESERT'))
for receipt_file, receipt, pointer_file in receipts:
    with receipt_file.open('x') as stream:
        stream.write(json.dumps(receipt, indent=2) + '\n')
    pointer_file.write_text(json.dumps(receipt['selectedTerrain'], indent=2) + '\n')
file.write_text(json.dumps(combined, indent=2) + '\n')
print(json.dumps(dict(selected={key: combined[key] for key in ['NEWURBAN', 'DESERT']},
    preservedTheaters=[key for key in original if key not in ['NEWURBAN', 'DESERT']])))
