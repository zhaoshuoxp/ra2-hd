"""Check complete coastal loading and reefs on two unchanged official maps."""
import json
import subprocess
import sys
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


base = Path('.artifacts/m2-4')
stage = base / 'newurban-coast-native-batch74-v1/active-stage-v1.json'
cases = []
for theater, batch, map_name, stem, family, sets, next_map in [
        ('NEWURBAN', 74, 'manhatta.map', 'manhattan', 'newurban-lt-gen01', [10, 12, 15, 21], 'pcofdune.map'),
        ('DESERT', 75, 'pcofdune.map', 'dune', 'desert-ctoild', [10, 12, 21], 'manhatta.map')]:
    native = base / f'{theater.lower()}-coast-native-batch{batch}-v1'
    for density in [2, 4]:
        output = native / f'native-{stem}-{density}x-v1'
        command = ['node', 'scripts/m2/official-maps/native-coverage.mjs', str(stage), str(output),
            '--edition=yr', '--theater=' + theater, '--map=' + map_name, '--bot-slot=1',
            '--density=' + str(density), '--families=' + family,
            '--terrain-groups=' + ','.join(f'm2-4-{theater.lower()}-coast-set{number}' for number in sets),
            '--capture-requested-only', '--capture-terrain-only', '--capture-central-tiles',
            '--render-resolution=1080p']
        if theater == 'NEWURBAN':
            command.append('--terrain-members=water07.ubn,water08.ubn,water14.ubn')
        if density == 4:
            command.extend(['--capture-reference=' + str(native / f'native-{stem}-2x-v1/report.json'),
                '--release', '--next-map=' + next_map])
        cases.append(dict(theater=theater, map=map_name, density=density, output=str(output), command=command))
    output = native / f'native-{stem}-original-v1'
    cases.append(dict(theater=theater, map=map_name, density='Original', output=str(output), command=[
        'node', 'scripts/m2-4/native-original-review.mjs', str(stage),
        str(native / f'native-{stem}-2x-v1/report.json'), str(output)]))
plan = dict(status='PREPARED_UNCHANGED_MAP_TERRAIN_PATH_COVER', cases=cases,
    disclosure='Original maps and geometry. One map covers every new group per theater; Manhattan alone '
        'covers all three original NewUrban reefs. Every source member separately passes static verification. '
        'Controlled reveal and stopped AI are disclosed. No source-map, gameplay, owner or timing edits.',
    windows='NOT_RUN', m24Complete=False)
file = base / 'coast-batches74-75-native-plan-v1.json'
if '--prepare-only' in sys.argv:
    with file.open('x') as stream:
        stream.write(json.dumps(plan, indent=2) + '\n')
else:
    assert read(file) == plan
    assert read(stage)['runtimeSourceHead'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    for case in cases:
        assert not Path(case['output']).exists()
        print(json.dumps({key: value for key, value in case.items() if key != 'command'}), flush=True)
        with Path(case['output'] + '.log').open('x') as stream:
            subprocess.run(case['command'], stdout=stream, stderr=subprocess.STDOUT, check=True)
        report = read(Path(case['output']) / 'report.json')
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        print(json.dumps(dict(output=case['output'], status=report['status'])), flush=True)
