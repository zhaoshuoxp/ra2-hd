"""Pin all Snow bridge body, shadow, empty and duplicate states before authoring."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from snow_bridge_scope import UNUSED_ENDS, verified_unused_ends


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('prepared', type=Path)
parser.add_argument('authoring', type=Path)
parser.add_argument('contract', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--source-usage', type=Path)
args = parser.parse_args()
native = read(args.prepared / 'source.json')
work = read(args.authoring / 'worklist.json')
contract = read(args.contract)
assert sha(args.prepared / 'source.json') == work['preparedSourceSha256']
assert native['inventorySha256'] == contract['extensions']['inventorySha256']
assert len(native['sources']) == len(work['members']) == 58 and len(work['slots']) == 92
members = {row['member']: row for row in work['members']}
unused = verified_unused_ends(args.source_usage, native['inventorySha256']) if args.source_usage else None
excluded = UNUSED_ENDS if unused else set()
if unused:
    assert all(not set(identities).intersection({name.split('.')[0].upper() for name in excluded})
               for identities in contract['identities'].values())
states, rows = Counter(), []
for source in native['sources']:
    name, member = source['member'], members[source['member']]
    assert source['hasShadow'] and not source['remapable'] and source['totalFrames'] % 2 == 0
    if name in excluded:
        assert name not in contract['sources']
        assert source['sha256'] == next(row['sha256'] for row in unused['excludedSourceGroups'] if row['member'] == name)
        assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
        continue
    assert member['bodyCount'] == contract['sources'][name]['bodyFrames'] == source['totalFrames'] // 2
    assert source['sha256'] == member['sourceSha256'] == contract['sources'][name]['sha256']
    assert sha(args.prepared / 'native' / source['nativeFile']) == source['sha256']
    assert len(source['frames']) == source['totalFrames']
    assert len(member['slots']) == member['bodyCount']
    for frame in source['frames']:
        assert sha(args.prepared / 'native' / frame['file']) == frame['rgbaSha256']
        assert sha(args.prepared / 'native' / frame['indexFile']) == frame['indexSha256']
    for slot in member['slots']:
        frame = source['frames'][slot['slot']]
        assert slot['status'] in ('EXACT_NATIVE_EMPTY', 'AWAITING_AUTHORED_SLOT')
        if slot['status'] == 'EXACT_NATIVE_EMPTY':
            assert frame['empty'] and frame['size'] == [0, 0] and not slot.get('key')
        else:
            assert not frame['empty'] and slot.get('key')
        if slot.get('key'):
            authored = work['slots'][slot['key']]
            assert authored['sourceSha256'] == source['sha256']
            assert authored['referenceCapacity'] >= 4.5
        palette = contract['sources'][name]['framePalettes'][str(slot['slot'])]
        assert not palette['remapable'] and palette['sha256'] == source['palette']['sha256']
        states[slot['status']] += 1
    rows.append(dict(member=name, sourceSha256=source['sha256'], bodyFrames=member['bodyCount'],
        shadowFrames=member['bodyCount'], slots=member['slots'], paletteSha256=source['palette']['sha256']))
assert sum(states.values()) == 196 - len(excluded)
families = {name: contract['families'][name]['members'] for name in contract['extensions']['newFamilies']}
assert sorted(name for values in families.values() for name in values) == sorted(set(members) - excluded)
for name, required in families.items():
    family = contract['families'][name]
    basis = dict(theater='SNOW', members={member: contract['sources'][member] for member in required},
                 identities=family['identities'])
    assert hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == family['familyHash']
    assert not set(family['identities']).intersection({member.split('.')[0].upper() for member in excluded})
receipt = dict(schema='m2-4-snow-bridge-native-state-audit-v1',
    status=f'PASS_{len(rows)}_REQUIRED_SOURCES_{sum(states.values())}_BODY_STATES_EXACT_SHADOWS_AND_PALETTES',
    sourceSha256=sha(args.prepared / 'source.json'), contractSha256=sha(args.contract),
    worklistSha256=sha(args.authoring / 'worklist.json'), members=rows, families=families,
    states=dict(states), authoredUniqueSlots=states['AWAITING_AUTHORED_SLOT'],
    unusedSourceProof=dict(path=str(args.source_usage), sha256=sha(args.source_usage),
                          members=sorted(excluded), status='UNUSED_NOT_HD_COVERED') if unused else None,
    policy='Every source state and shadow stays indexed. Native invisible LOBRDG27/28 are not authored or renumbered.',
    technicalStatus='SOURCE_STATE_AUDIT_ONLY', visualStatus='NOT_REVIEWED', runtimeStatus='NOT_RUN')
with args.output.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], states=receipt['states'], families=len(families))))
