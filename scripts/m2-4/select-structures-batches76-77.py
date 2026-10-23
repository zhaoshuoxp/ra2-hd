"""Select six additive verified structures groups without altering accepted packs."""
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


contract_file = Path('desktop/terrain-theater-hd-contracts.json')
before = read(contract_file)
after, changes = dict(before), []
for theater, batch, version, prior_count, added, count in [
        ('NEWURBAN', 76, 1, 16, 5, 54), ('DESERT', 77, 2, 19, 1, 10)]:
    name = theater.lower()
    root = Path(f'.artifacts/m2-4/{name}-structures-authoring-batch{batch}-v{version}')
    revision = f'{name}-m2-4-structures-batch{batch}-v{4 if name == "newurban" else 1}'
    validation = read(root / revision / 'validation.json')
    recipe = read(root / revision / 'recipe.json')
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    assert validation['newMembers'] == recipe['newMembers'] == count
    assert len(recipe['materialProfile']['authoredSurfaceReconstruction']) == count
    assert len(recipe['materialProfile']['nativeTheaterStructureMaterials']) == count
    pointer = Path(f'.local/terrain-{name}-selection.json')
    old = read(pointer)
    assert old == before[theater] == recipe['acceptedBase']
    old_root = Path('.local/terrain-packs') / old['revision']
    new_root = Path('.local/terrain-packs') / revision
    old_manifest, new_manifest = read(old_root / 'manifest.json'), read(new_root / 'manifest.json')
    assert len(old_manifest['groups']) == prior_count and len(new_manifest['groups']) == prior_count + added
    assert new_manifest['groups'][:prior_count] == old_manifest['groups']
    assert sha(new_root / 'manifest.json') == validation['pack']['sha256']
    for group in old_manifest['groups']:
        for variant in group['variants']:
            assert sha(old_root / variant['file']) == sha(new_root / variant['file']) == variant['sha256']
    assert all(group['contourReconstruction']['schema'] == 'hd-extra-contours-v1'
        for group in new_manifest['groups'][prior_count:])
    after[theater] = validation['pack']
    receipt = dict(status='STATIC_PASS_NATIVE_AND_VISUAL_PENDING', theater=theater, batch=batch,
        priorTerrain=old, selectedTerrain=after[theater], preservedGroups=prior_count,
        addedGroups=added, newMembers=count, originalContract=before, validationSha256=sha(root / revision / 'validation.json'),
        environmentSelection=read(Path(f'.local/environment-{name}-selection.json')),
        windows='NOT_RUN', m24Complete=False)
    receipt_file = root / revision / 'selection-v1.json'
    assert not receipt_file.exists()
    changes.append((pointer, receipt_file, receipt))
assert all(after[key] == value for key, value in before.items() if key not in ('NEWURBAN', 'DESERT'))
for pointer, receipt_file, receipt in changes:
    with receipt_file.open('x') as stream:
        stream.write(json.dumps(receipt, indent=2) + '\n')
    pointer.write_text(json.dumps(receipt['selectedTerrain'], indent=2) + '\n')
contract_file.write_text(json.dumps(after, indent=2) + '\n')
print(json.dumps(dict(selected={key: after[key] for key in ['NEWURBAN', 'DESERT']},
    preservedTheaters=[key for key in before if key not in ['NEWURBAN', 'DESERT']])))
