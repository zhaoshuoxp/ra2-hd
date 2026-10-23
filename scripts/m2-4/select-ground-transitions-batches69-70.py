"""Select verified complete ground groups while preserving every accepted theater."""
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


file = Path('desktop/terrain-theater-hd-contracts.json')
original = read(file)
combined = dict(original)
receipts = []
for theater, batch, preserved in [('NEWURBAN', 69, 4), ('DESERT', 70, 3)]:
    name = theater.lower()
    root = Path(f'.artifacts/m2-4/{name}-ground-transitions-authoring-batch{batch}-v1')
    native = Path(f'.artifacts/m2-4/{name}-ground-transitions-native-batch{batch}-v1')
    revision = f'{name}-m2-4-ground-transitions-batch{batch}-v1'
    validation = read(root / revision / 'validation.json')
    quality = read(root / 'form-quality-v1.json')
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    assert validation['newMembers'] == 152 and validation['independentDensityPairs'] == 304
    assert quality['status'] == 'PASS_SOURCE_FORMS_AND_AUTHORED_VARIATION'
    recipe = read(root / revision / 'recipe.json')
    pointer_file = Path(f'.local/terrain-{name}-selection.json')
    old = read(pointer_file)
    assert original[theater] == recipe['acceptedBase'] == old
    old_root = Path('.local/terrain-packs') / old['revision']
    pack_root = Path('.local/terrain-packs') / revision
    pack = read(pack_root / 'manifest.json')
    old_manifest = read(old_root / 'manifest.json')
    assert len(old_manifest['groups']) == preserved and len(pack['groups']) == preserved + 8
    assert pack['groups'][:preserved] == old_manifest['groups']
    assert sha(pack_root / 'manifest.json') == validation['pack']['sha256'] == quality['packSha256']
    for group in old_manifest['groups']:
        for variant in group['variants']:
            assert sha(old_root / variant['file']) == sha(pack_root / variant['file']) == variant['sha256']
    receipt = dict(status='STATIC_COMPLETE_GROUPS_AND_FORM_QUALITY_PASS_NATIVE_PENDING',
        theater=theater, batch=batch, priorTerrain=old, selectedTerrain=validation['pack'],
        preservedGroups=preserved, newGroups=8, newMembers=152, independentDensityPairs=304,
        environmentSelection=read(Path(f'.local/environment-{name}-selection.json')),
        priorTheaterContracts=original, qualitySha256=sha(root / 'form-quality-v1.json'),
        validationSha256=sha(root / revision / 'validation.json'), windows='NOT_RUN', m24Complete=False)
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
