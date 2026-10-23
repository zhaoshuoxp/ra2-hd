"""Select only the statically verified R4 families in the isolated task worktree."""
import hashlib
import json
import shutil
from pathlib import Path


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def read(file):
    return json.loads(file.read_text())


root = Path('.artifacts/m2-3/feedback-r4-v1')
receipt = root / 'selection-v1.json'
assert not receipt.exists(), 'Preserve previous selection receipts.'
for name in ['environment-assembly-v1.json', 'environment-owner-audit-v3.json',
             'material-static-qa-v1.json', 'bridge-static-qa-v1.json']:
    assert read(root / name)['status'].startswith('PASS_'), name
old_env = read(Path('.local/environment-selection.json'))
old_terrain = read(Path('.local/terrain-selection.json'))
assert old_env['revision'] == 'environment-m2-3-complete-v1'
assert old_terrain['revision'] == 'temperate-m2-3-complete-v2'
new_env = dict(schemaVersion=1, revision='environment-m2-3-material-feedback-complete-v4',
               sha256=sha(Path('.local/environment-packs/environment-m2-3-material-feedback-complete-v4/manifest.json')))
new_terrain = dict(schemaVersion=1, revision='temperate-m2-3-material-feedback-v3',
                   sha256=sha(Path('.local/terrain-packs/temperate-m2-3-material-feedback-v3/manifest.json')))
assert new_terrain['sha256'] == read(root / 'bridge-static-qa-v1.json')['manifestSha256']
contract_file = Path('desktop/environment-hd-contract.json')
contract = read(contract_file)
assert contract['selectedPack'] == old_env
terrain_file = Path('desktop/terrain-hd-contract.json')
assert read(terrain_file) == old_terrain
catalog_file = Path('desktop/yuri-building-coverage.json')
old_catalog = read(catalog_file)
candidate = root / 'genetic-owner-correction-v4'
correction = read(candidate / 'report.json')
assert sha(catalog_file) == correction['originalCatalogSha256']
new_catalog = read(candidate / catalog_file.name)
changed = [key for key in old_catalog if old_catalog[key] != new_catalog[key]]
assert set(changed) == {'yuri-yagntc-temperate', 'yuri-yagntc-snow'}
for record in correction['records']:
    assert sha(Path(record['previous'])) == record['previousSha256']
    assert sha(Path(record['file'])) == record['sha256']
snapshot = root / 'selection-before-v1'
snapshot.mkdir()
files = [contract_file, terrain_file, catalog_file, Path('.local/environment-selection.json'),
         Path('.local/terrain-selection.json')]
before = {}
for file in files:
    before[str(file)] = sha(file)
    shutil.copyfile(file, snapshot / str(file).replace('/', '--'))
contract['selectedPack'] = new_env
for file, data in [(contract_file, contract), (terrain_file, new_terrain), (catalog_file, new_catalog),
                   (files[3], new_env), (files[4], new_terrain)]:
    file.write_text(json.dumps(data, indent=2) + '\n')
selection_file = root / 'selected-world-buildings-v2.json'
selection = read(selection_file)
replacements = {record['previous']: record for record in correction['records']}
replaced = 0
for member in selection['members']:
    if member['file'] in replacements:
        record = replacements[member['file']]
        assert member['sha256'] == record['previousSha256']
        member.update(file=record['file'], sha256=record['sha256'])
        replaced += 1
assert replaced == 10
selection['previousSelectionSha256'] = sha(selection_file)
(root / 'selected-world-buildings-v3.json').write_text(json.dumps(selection, indent=2) + '\n')
receipt.write_text(json.dumps(dict(status='SELECTED_STATIC_VERIFIED_PENDING_COPIED_APP',
    before=before, after={str(file): sha(file) for file in files}, environment=new_env,
    terrain=new_terrain, changedFactionFamilies=changed, replacedFactionMembers=replaced,
    mainPromotion=False, userAcceptance=False), indent=2) + '\n')
print(json.dumps(dict(environment=new_env, terrain=new_terrain, changedFactionFamilies=changed)))
