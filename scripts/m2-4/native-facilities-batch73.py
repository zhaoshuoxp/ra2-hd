"""Verify all 19 NewUrban facilities on three unchanged official maps."""
import json
import subprocess
import sys
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


native = Path('.artifacts/m2-4/newurban-facilities-native-batch73-v1')
stage = native / 'active-stage-v2.json'
contract = read(Path('desktop/environment-newurban-hd-contract.json'))
source = read(native / 'source.json')
covered, cases = set(), []
for map_name, stem, actions in [('downtown.map', 'downtown', ['LT_SGN01', 'TRFF01']),
        ('groundze.map', 'groundze', ['LT_GEN01', 'SIGN01']),
        ('turfwar.map', 'turf', ['POLE01', 'SIGN05'])]:
    names = {binding['id'] for member in source['sources'] for binding in member['bindings']
        if 'yr:' + map_name in binding['mapIds']} - covered
    assert set(actions) <= names and len(names) <= 8
    covered.update(names)
    families = sorted(contract['identities']['yr'][name] for name in names)
    for density in [2, 4]:
        output = native / f'native-{stem}-{density}x-v2'
        command = ['node', 'scripts/m2/official-maps/native-coverage.mjs', str(stage), str(output),
            '--edition=yr', '--theater=NEWURBAN', '--map=' + map_name, '--bot-slot=1',
            '--density=' + str(density), '--families=' + ','.join(families), '--capture-objects-only',
            '--capture-object-names=' + ','.join(sorted(names)), '--urban-prop-actions=' + ','.join(actions),
            '--render-resolution=1080p']
        if density == 4:
            command.append('--capture-reference=' + str(native / f'native-{stem}-2x-v2/report.json'))
            if stem == 'downtown':
                command.extend(['--release', '--next-map=pcofdune.map'])
        cases.append(dict(map=map_name, density=density, names=sorted(names), actions=actions,
            output=str(output), command=command))
    if stem == 'downtown':
        output = native / f'native-{stem}-original-v2'
        cases.append(dict(map=map_name, density='Original', output=str(output), command=[
            'node', 'scripts/m2-4/native-original-review.mjs', str(stage),
            str(native / f'native-{stem}-2x-v2/report.json'), str(output)]))
assert len(covered) == 19
plan = dict(status='PREPARED_ORIGINAL_MAP_COVER_ONLY', cases=cases, names=sorted(covered),
    disclosure='Original placements, disclosed native-warhead action duplicates, matched Original on '
        'downtown.map; no source-map, gameplay, frame, timing or owner edits.', windows='NOT_RUN')
plan_file = native / 'native-plan-v2.json'
if '--prepare-only' in sys.argv:
    with plan_file.open('x') as stream:
        stream.write(json.dumps(plan, indent=2) + '\n')
else:
    assert read(plan_file) == plan
    assert read(stage)['runtimeSourceHead'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    for case in cases:
        assert not Path(case['output']).exists()
        print(json.dumps({key: value for key, value in case.items() if key != 'command'}), flush=True)
        with Path(case['output'] + '.log').open('x') as stream:
            subprocess.run(case['command'], stdout=stream, stderr=subprocess.STDOUT, check=True)
        report = read(Path(case['output']) / 'report.json')
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        print(json.dumps(dict(output=case['output'], status=report['status'])), flush=True)
