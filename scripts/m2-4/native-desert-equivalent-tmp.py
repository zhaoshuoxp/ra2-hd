"""Check five accepted-pixel terrain families on two unchanged Desert maps."""
import json
import subprocess
import sys
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


root = Path('.artifacts/m2-4/desert-equivalent-tmp-reuse-v1')
stage = root / 'active-stage-v1.json'
cases = []
for map_name, stem, sets, family in [('pcofdune.map', 'dune', [35, 38, 76], 'desert-ctoild'),
        ('saharami.map', 'sahara', [40, 47], 'desert-ctoild')]:
    attempt = 1 if stem == 'dune' else 2
    for density in [2, 4]:
        output = root / f'native-{stem}-{density}x-v{attempt}'
        command = ['node', 'scripts/m2/official-maps/native-coverage.mjs', str(stage), str(output),
            '--edition=yr', '--theater=DESERT', '--map=' + map_name, '--bot-slot=1', '--density=' + str(density),
            '--families=' + family, '--terrain-groups=' + ','.join(f'm2-4-desert-equivalent-set{number}' for number in sets),
            '--capture-requested-only', '--capture-terrain-only', '--capture-central-tiles', '--render-resolution=1080p']
        if density == 4:
            command.append('--capture-reference=' + str(root / f'native-{stem}-2x-v{attempt}/report.json'))
        cases.append(dict(map=map_name, density=density, sets=sets, output=str(output), command=command))
    if stem == 'sahara':
        output = root / 'native-sahara-original-v2'
        cases.append(dict(map=map_name, density='Original', output=str(output), command=[
            'node', 'scripts/m2-4/native-original-review.mjs', str(stage),
            str(root / 'native-sahara-2x-v2/report.json'), str(output)]))
plan = dict(status='PREPARED_MINIMAL_ORIGINAL_MAP_GROUP_COVER', cases=cases,
    disclosure='Unchanged official maps. Two maps are required for the five complete source families; '
        'matched Original on Sahara. Coast batch75 release/reentry and cross-theater evidence is reused. '
        'Controlled reveal/stopped AI are disclosed. Accepted donor pixels are unchanged; no new art.', windows='NOT_RUN')
file = root / 'native-plan-v2.json'
if '--prepare-only' in sys.argv:
    with file.open('x') as stream:
        stream.write(json.dumps(plan, indent=2) + '\n')
else:
    assert read(file) == plan
    runtime = read(stage)['runtimeSourceHead']
    assert not subprocess.run(['git', 'diff', '--quiet', runtime, '--', 'src', 'desktop', 'public']).returncode
    for case in cases:
        if Path(case['output']).exists():
            assert '--resume-passed' in sys.argv
            previous = read(Path(case['output']) / 'report.json')
            assert previous['status'] == 'PASS_SELECTED_NATIVE_CASES' and not previous['errors']
            print(json.dumps(dict(reused=case['output'], status=previous['status'])), flush=True)
            continue
        print(json.dumps({key: value for key, value in case.items() if key != 'command'}), flush=True)
        with Path(case['output'] + '.log').open('x') as stream:
            subprocess.run(case['command'], stdout=stream, stderr=subprocess.STDOUT, check=True)
        report = read(Path(case['output']) / 'report.json')
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        print(json.dumps(dict(output=case['output'], status=report['status'])), flush=True)
