"""Run a minimal official-map cover for all 39 new tree source bindings."""
import argparse
import json
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('--prepare-only', action='store_true')
args = parser.parse_args()
base = Path('.artifacts/m2-4')
plan_file = base / 'trees-batches71-72-native-plan-v2.json'
configurations = [
    ('NEWURBAN', 71, 'rushhr.map', 'rush',
        ['TREE02', 'TREE04', 'TREE09', 'TREE13', 'TREE20', 'TREE22', 'TREE31', 'TREE32'],
        ['TREE13', 'TREE23', 'TREE31'], 'pcofdune.map', True),
    ('DESERT', 72, 'pcofdune.map', 'dune',
        ['TREE02', 'TREE04', 'TREE07', 'TREE10', 'TREE19', 'TREE20', 'TREE23', 'TREE31'],
        ['TREE02', 'TREE31'], 'rushhr.map', True),
    ('DESERT', 72, 'saharami.map', 'sahara', ['TREE28', 'TREE29', 'TREE30'],
        ['TREE28'], None, False),
    ('DESERT', 72, 'dryheat.map', 'dry', ['TREE34', 'TREE35', 'TREE36'],
        ['TREE36'], None, False),
]
cases, covered = [], {'NEWURBAN': set(), 'DESERT': set()}
for theater, batch, map_name, stem, captures, actions, next_map, original in configurations:
    native = base / f'{theater.lower()}-tree-native-batch{batch}-v1'
    source = read(native / 'source.json')
    names = sorted({binding['id'] for member in source['sources'] for binding in member['bindings']
        if 'yr:' + map_name in binding['mapIds']})
    # The second and third Desert sources contribute only their previously uncovered species.
    names = sorted(set(names) - covered[theater])
    covered[theater].update(names)
    assert set(captures) <= set(names) and set(actions) <= set(names)
    contract = read(Path(f'desktop/environment-{theater.lower()}-hd-contract.json'))
    families = sorted(contract['identities']['yr'][name] for name in names)
    for density in [2, 4]:
        output = native / f'native-{stem}-{density}x-v1'
        command = ['node', 'scripts/m2/official-maps/native-coverage.mjs', str(args.stage), str(output),
            '--edition=yr', f'--theater={theater}', f'--map={map_name}', '--bot-slot=1',
            f'--density={density}', '--families=' + ','.join(families),
            '--capture-objects-only',
            '--capture-object-names=' + ','.join(captures), '--urban-tree-actions=' + ','.join(actions),
            '--render-resolution=1080p']
        if density == 4:
            command.append('--capture-reference=' + str(native / f'native-{stem}-2x-v1/report.json'))
            if next_map:
                command.extend(['--release', '--next-map=' + next_map])
        cases.append(dict(theater=theater, map=map_name, density=density, families=families,
            names=names, actions=actions, output=str(output), command=command))
    if original:
        output = native / f'native-{stem}-original-v1'
        command = ['node', 'scripts/m2-4/native-original-review.mjs', str(args.stage),
            str(native / f'native-{stem}-2x-v1/report.json'), str(output)]
        cases.append(dict(theater=theater, map=map_name, density='Original',
            output=str(output), command=command))
assert len(covered['NEWURBAN']) == 23 and len(covered['DESERT']) == 16
plan = dict(status='PREPARED_OFFICIAL_SOURCE_COVER_ONLY', cases=cases,
    coveredNames={key: sorted(value) for key, value in covered.items()}, windows='NOT_RUN',
    disclosure='Four unmodified YR maps cover all 39 actual native source placements. One representative '
        'per major tree geometry uses disclosed duplicates and stock native warheads. Existing mode/source '
        'simulation and accepted object states are reused. Original controls match one map per theater.')
if args.prepare_only:
    with plan_file.open('x') as stream:
        stream.write(json.dumps(plan, indent=2) + '\n')
else:
    assert read(plan_file) == plan, 'Run exactly the reviewed pinned source plan'
    assert read(args.stage)['runtimeSourceHead'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    for case in cases:
        assert not Path(case['output']).exists(), 'Preserve prior attempts; use versioned output paths'
        log_file = Path(case['output'] + '.log')
        print(json.dumps({key: value for key, value in case.items() if key != 'command'}), flush=True)
        with log_file.open('x') as stream:
            subprocess.run(case['command'], stdout=stream, stderr=subprocess.STDOUT, check=True)
        report = read(Path(case['output']) / 'report.json')
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        print(json.dumps(dict(output=case['output'], status=report['status'])), flush=True)
