"""Append pinned native families and exact-source aliases without changing accepted families."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('inventory', type=Path)
parser.add_argument('prepared', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
baseline_path = Path('desktop/environment-hd-contract.json')
baseline = json.loads(baseline_path.read_text())
contract = copy.deepcopy(baseline)
native = json.loads((args.prepared / 'source.json').read_text())
inventory = json.loads(args.inventory.read_text())
rows = [r for r in inventory['rows'] if r['theater'] == 'TEMPERATE']
canonical = {}
for source in native['sources']:
    if source['format'] != 'shp':
        continue
    name = source['member']
    frames = len(source['frames'])
    value = dict(sha256=source['sha256'], canvas=source['canvas'], totalFrames=frames,
                 bodyFrames=frames // 2 if source.get('hasShadow') else frames,
                 palette=source['palette'], hasShadow=bool(source.get('hasShadow')),
                 remapable=bool(source.get('remapable')))
    if any(b['kind'] == 'building' and b['role'] == 'body' for b in source['bindings']) and value['bodyFrames'] >= 4:
        palette = next(r['palette'] for r in rows if r.get('palette', {}).get('member') == 'isotem.pal')
        value['framePalettes'] = {'3': dict(member=palette['member'], sha256=palette['sha256'],
            remapable=False, role='rubble', runtimeUsed=str(source['nativeRules'].get('LeaveRubble', '')).lower()
            in ['yes', 'true', '1'])}
    previous = contract['sources'].get(name)
    assert previous is None or previous == value, f'Conflicting native member contract: {name}'
    contract['sources'][name] = value
    canonical[name] = name

new_families = {}
bindings = []
for row in rows:
    if row['decision'] not in ['MISSING_AUTHORED_FAMILY', 'EXISTING_HD_BINDING_OR_REGISTRATION_PROBLEM']:
        continue
    source = row.get('source', {})
    if not source.get('member', '').endswith(('.shp', '.tem')) or row['kind'] == 'tmp':
        continue
    name = source['member']
    if name not in contract['sources']:
        matches = [n for n, v in contract['sources'].items() if v['sha256'] == source['sha256']]
        if not matches:
            continue  # Accepted M1 unit aliases belong to the unit loader.
        assert len(matches) == 1, (name, matches)
        canonical[name] = matches[0]
        contract['aliases'][name] = matches[0]
    else:
        canonical[name] = name
    body = canonical[name]
    members = {body}
    for child in row.get('dependencies', []):
        child_source = child.get('source') or {}
        member = child_source.get('member')
        if member in contract['sources']:
            assert contract['sources'][member]['sha256'] == child_source['sha256']
            members.add(member)
    accepted = [family for family, declared in baseline['families'].items()
                if members.issubset(declared['members'])]
    if accepted:
        assert len(accepted) == 1, (row['id'], accepted)
        family = accepted[0]
    else:
        family = 'environment-' + body.split('.')[0]
        entry = new_families.setdefault(family, dict(members=set(), identities=set(), editions=set(), kinds=set()))
        entry['members'].update(members)
        entry['identities'].add(row['id'])
        entry['editions'].add(row['edition'])
        entry['kinds'].add(row['kind'])
    old = contract['identities'].setdefault(row['edition'], {}).get(row['id'])
    assert old in [None, family], f'Identity contract collision: {row["id"]}'
    contract['identities'][row['edition']][row['id']] = family
    bindings.append(dict(edition=row['edition'], identity=row['id'], nativeMember=name,
                         canonicalMember=body, sourceSha256=source['sha256'], family=family))

for family, entry in new_families.items():
    for key in entry:
        entry[key] = sorted(entry[key])
    entry['familyHash'] = hashlib.sha256(json.dumps(dict(theater='TEMPERATE',
        members={name: contract['sources'][name] for name in entry['members']}, identities=entry['identities']),
        separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    assert family not in contract['families']
    contract['families'][family] = entry
assert all(contract['families'][k] == v for k, v in baseline['families'].items())
assert all(contract['sources'][k] == v for k, v in baseline['sources'].items())
contract['extensions'] = dict(milestone='M2.3', baselineContractSha256=sha(baseline_path),
    inventorySha256=sha(args.inventory), nativeGuideSha256=sha(args.prepared / 'source.json'),
    newFamilies=sorted(new_families), bindings=bindings,
    state='DECLARED_SOURCE_CONTRACT_EXPORT_AND_RUNTIME_PENDING')
with args.output.open('x') as stream:
    stream.write(json.dumps(contract, indent=2) + '\n')
print(json.dumps(dict(newSources=len(contract['sources']) - len(baseline['sources']),
    newFamilies=len(new_families), exactBindings=len(bindings))))
