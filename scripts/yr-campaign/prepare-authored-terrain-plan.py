"""Pin complete new terrain groups to every original campaign map using them."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('registration', type=Path)
parser.add_argument('inventory', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
registration, inventory = read(args.registration), read(args.inventory)
assert registration['schema'] == 'yr-authored-complete-terrain-registration-v1'
assert inventory['schema'] == 'yr-campaign-art-inventory-v1'
assert registration['acceptedPayloadsReplaced'] == 0
assert registration['originalGeometryDepthRulesUnchanged']
pack = Path('.local/terrain-packs') / registration['selectedPack']['revision']
assert sha(pack / 'manifest.json') == registration['selectedPack']['sha256']
manifest = read(pack / 'manifest.json')
assert manifest['theater'] == registration['theater']
groups = [group for group in manifest['groups'] if group['id'] in registration['addedGroups']]
assert len(groups) == len(registration['addedGroups'])
members = {member['member'] for group in groups for member in group['members']}
assert members == set(registration['members'])
maps = {row['mission']: row for row in inventory['maps']}
rows = {row['key']: row for row in inventory['rows']}
closures = {}
for name in registration['missions']:
    original = maps[name]
    assert original['theater'] == registration['theater'] and not original['issues']
    used = {rows[key]['source']['member'] for key in original['dependencyKeys']
            if rows[key]['kind'] == 'tmp'}
    selected = [group for group in groups
                if any(member['member'] in used for member in group['members'])]
    assert selected, f'No original placement uses a new group: {name}'
    closures[name] = dict(groups=[group['id'] for group in selected],
        subtiles=sum(len(member['images']) for group in selected for member in group['members']),
        sourceSha256=original['sourceSha256'])
variants = {group['id']: {str(variant['density']): variant['sha256']
                          for variant in group['variants']} for group in groups}
assert all(set(value) == {'2', '4'} for value in variants.values())
args.output.mkdir(exist_ok=False)
receipt = args.output / 'receipt.json'
write(receipt, dict(registration, mapClosures=closures, variants=variants,
    planInputs=dict(registration=dict(file=str(args.registration.resolve()), sha256=sha(args.registration)),
        inventory=dict(file=str(args.inventory.resolve()), sha256=sha(args.inventory)))))
write(args.output / 'index.json', dict(schema='yr-authored-source-map-density-plan-v1',
    plans=[dict(file=str(receipt.resolve()), edition='yr', theater=registration['theater'])]))
print(json.dumps(dict(maps=len(closures), groups=len(groups), members=len(members), output=str(args.output))))
