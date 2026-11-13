"""Record original placements and direct trigger-to-team NPC source links."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
identities = {'CAML', 'EINS', 'MUMY', 'PENTGEN', 'RMNV', 'DNOB'}
inventory = ROOT / '.artifacts/yr-campaign/art-inventory-r31/inventory.json'
rows = [row for row in json.loads(inventory.read_text())['rows']
    if row['kind'] == 'infantry' and row['id'] in identities]
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()


def sections(file):
    result, section = {}, ''
    for line in file.read_text(errors='strict').splitlines():
        line = line.strip()
        if line.startswith('[') and line.endswith(']'):
            section = line[1:-1]
            result.setdefault(section, {})
        elif '=' in line and not line.startswith(';'):
            key, value = line.split('=', 1)
            result[section][key] = value
    return result


contexts = []
for row in rows:
    for mission in row['usage']:
        file = ROOT / '.local/campaign/yr' / Path(mission).stem / mission
        ini = sections(file)
        identity = row['id']
        placed = [{'key': key, 'source': value} for key, value in ini.get('Infantry', {}).items()
            if value.split(',')[1] == identity]
        forces = {key: value for key, value in ini.items()
            if any(entry.split(',')[-1] == identity and name.isdigit()
                for name, entry in value.items()) and 'Group' in value}
        teams = {key: value for key, value in ini.items()
            if value.get('TaskForce') in forces}
        links = []
        for trigger, value in ini.get('Actions', {}).items():
            fields = value.split(',')
            assert len(fields) == 1 + int(fields[0]) * 8
            for index in range(int(fields[0])):
                action = fields[1+index*8:1+(index+1)*8]
                if action[2] not in teams or int(action[0]) not in [4, 5, 7, 80, 107]:
                    continue
                team = teams[action[2]]
                links.append({'trigger': trigger, 'triggerDefinition': ini['Triggers'][trigger],
                    'events': ini['Events'][trigger], 'actionIndex': index, 'action': action,
                    'team': action[2], 'teamName': team['Name'], 'taskForce': team['TaskForce'],
                    'taskForceDefinition': forces[team['TaskForce']], 'script': team['Script']})
        assert placed or links, (mission, identity)
        contexts.append({'identity': identity, 'theater': row['theater'], 'mission': mission,
            'sourceFile': str(file.relative_to(ROOT)), 'sourceSha256': sha(file),
            'placements': placed, 'directSourceTeamActions': links})
report = {'schema': 'yr-task-npc-source-demand-v1',
    'status': 'PASS_STATIC_ORIGINAL_PLACEMENT_AND_DIRECT_TEAM_ACTION_LINKS',
    'inventory': str(inventory.relative_to(ROOT)), 'inventorySha256': sha(inventory),
    'uniqueFamilies': len(identities), 'sourceRows': len(rows), 'contexts': contexts,
    'scope': 'Source-demand proof only. Actual trigger conditions, action playback, HD registration and user visual acceptance remain separate.',
    'selectedResourcesChanged': 0, 'nativeRuntimeCredit': False}
args.output.parent.mkdir(parents=True, exist_ok=True)
assert not args.output.exists(), 'Preserve finalized source-demand evidence'
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'contexts': len(contexts),
    'placements': sum(len(item['placements']) for item in contexts),
    'directTeamActions': sum(len(item['directSourceTeamActions']) for item in contexts)}))
