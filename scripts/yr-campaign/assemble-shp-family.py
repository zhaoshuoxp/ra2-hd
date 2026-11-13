"""Join independently prepared original members into one complete SHP family."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('stages', nargs='+', type=Path)
parser.add_argument('--combine-building-identities', metavar='FAMILY')
parser.add_argument('--link-building-destruction', metavar='PARENT',
    help='Join one original building body and its source-declared destruction animation.')
args = parser.parse_args()
assert not (args.combine_building_identities and args.link_building_destruction)
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
output = args.output.resolve()
output.mkdir(exist_ok=False)
prepared, authoring = output / 'prepared', output / 'authoring'
(prepared / 'native').mkdir(parents=True)
authoring.mkdir()
sources, descriptors, slots, members, profile, receipts = {}, {}, {}, [], {}, []
identities = set()
original = contract = family = family_name = None
for stage in args.stages:
    source = read(stage / 'prepared/source.json')
    current_contract = read(stage / 'contract.json')
    name, current_family = next(iter(current_contract['families'].items()))
    assert len(current_contract['families']) == 1
    if original is None:
        original, contract, family_name, family = source, current_contract, name, current_family
    else:
        assert (args.combine_building_identities or name == family_name) and current_contract['theater'] == contract['theater']
        assert all(source[key] == original[key] for key in ['edition', 'mission', 'missionSha256', 'theater'])
        keys = ['editions', 'sourceScope'] if args.link_building_destruction else \
            ['editions', 'kinds', 'sourceScope'] if args.combine_building_identities else \
            ['identities', 'editions', 'kinds', 'sourceScope']
        assert all(current_family[key] == family[key] for key in keys)
    if args.combine_building_identities:
        assert source['edition'] == 'yr' and current_family['kinds'] == ['building']
        assert all(not item.get('bindingRole') for item in source['sources'])
    identities.update(current_family['identities'])
    for item in source['sources']:
        assert item['member'] not in sources, 'A family member must be prepared once'
        sources[item['member']] = item
        descriptors[item['member']] = current_contract['sources'][item['member']]
    for file in (stage / 'prepared/native').iterdir():
        destination = prepared / 'native' / file.name
        if destination.exists():
            assert sha(destination) == sha(file), 'Native file collision'
        else:
            shutil.copyfile(file, destination)
    work = read(stage / 'authoring/worklist.json')
    assert not set(slots).intersection(work['slots']) and not work['batches']
    slots.update(work['slots'])
    members.extend(work['members'])
    for key, value in read(stage / 'material-profile.json').items():
        if key in profile and profile[key] != value:
            assert isinstance(value, dict) and isinstance(profile[key], dict)
            assert not set(profile[key]).intersection(value), 'Conflicting material declarations'
            profile[key].update(value)
        else:
            profile[key] = value
    receipts.append(dict(stage=str(stage.resolve()), preparation=read(stage / 'preparation.json')))
if args.combine_building_identities:
    family_name = args.combine_building_identities
    assert family_name and all(char in 'abcdefghijklmnopqrstuvwxyz0123456789-' for char in family_name)
    family['identities'] = sorted(identities)
    contract['identities'] = {'ra2': {}, 'yr': {identity: family_name for identity in sorted(identities)}}
if args.link_building_destruction:
    parent, = [source for source in sources.values() if not source.get('bindingRole')]
    animations = [source for source in sources.values() if source.get('bindingRole')]
    assert original['edition'] == 'yr' and parent['identity'] == args.link_building_destruction
    assert parent['bindings'] and all(binding['kind'] == 'building' for binding in parent['bindings'])
    assert animations and len(animations) + 1 == len(sources)
    for animation in animations:
        assert animation['bindingRole'] == 'DESTROY_ANIMATION'
        assert animation['identity'] in parent['nativeRules']['DestroyAnim'].split(',')
        assert animation['parentRules'] == parent['nativeRules']
        assert animation['bindings'] and all(binding['kind'] == 'animation'
            and binding['identity'] == animation['identity'] for binding in animation['bindings'])
        animation['bindings'] = [dict(identity=parent['identity'], kind='building',
            role='RULES_DESTROY_ANIMATION', nativeRules=parent['nativeRules'], nativeArt=animation['nativeArt'])]
    family['identities'], family['kinds'] = [parent['identity']], ['building']
    contract['identities'] = {'ra2': {}, 'yr': {parent['identity']: family_name}}
basis = dict(theater=contract['theater'], members=descriptors, identities=family['identities'])
family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
family = {**family, 'members': sorted(sources), 'familyHash': family_hash}
write(prepared / 'source.json', {**original, 'sources': [sources[name] for name in sorted(sources)]})
write(output / 'contract.json', {**contract, 'sources': descriptors, 'families': {family_name: family}})
write(authoring / 'worklist.json', dict(schema='m2-2-shp-native-slot-worklist-v1',
    preparedSourceSha256=sha(prepared / 'source.json'), slots=slots, members=members, batches=[]))
write(output / 'material-profile.json', profile)
write(output / 'preparation.json', dict(status='COMPLETE_FAMILY_ASSEMBLED_EXPORT_AND_RUNTIME_PENDING',
    family=family_name, members=list(sources), familyHash=family_hash, stages=receipts,
    sourceSha256=next(iter(sources.values()))['sha256'],
    userVisualAcceptance='PENDING'))
print(json.dumps(dict(family=family_name, members=len(sources), authoredStates=len(slots), output=str(output))))
