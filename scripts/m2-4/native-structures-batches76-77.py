"""Run the minimal official-map placement cover through the existing Mac host."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('.artifacts/m2-4/structures-batches76-77-v1')
stage = root / 'active-stage-v1.json'
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
cases = [
    ('fight', 'NEWURBAN', 'fight.map', 'newurban-tree04', [19], ['ovrps02.ubn'], None),
    ('downtown', 'NEWURBAN', 'downtown.map', 'newurban-tree04', [25, 117, 119], None, None),
    ('manhattan', 'NEWURBAN', 'manhatta.map', 'newurban-tree04', [19], ['ovrps05.ubn'], 'dryheat.map'),
    ('rush', 'NEWURBAN', 'rushhr.map', 'newurban-tree04', [115], None, None),
    ('dryheat', 'DESERT', 'dryheat.map', 'desert-ctoild', [25], None, 'manhatta.map'),
]
assert read(stage)['status'] == 'STAGED_INTERNAL_MAC_VALIDATION_HOST'
records = []
for stem, theater, member, family, sets, members, next_map in cases:
    for density in [2, 4, 'original']:
        suffix = str(density) + 'x' if isinstance(density, int) else density
        output = root / f'native-{stem}-{suffix}-v1'
        report_file = output / 'report.json'
        if not report_file.exists():
            if density == 'original':
                command = ['node', 'scripts/m2-4/native-original-review.mjs', str(stage),
                    str(root / f'native-{stem}-2x-v1/report.json'), str(output)]
            else:
                groups = ','.join(f'm2-4-{theater.lower()}-structures-set{number}' for number in sets)
                command = ['node', 'scripts/m2/official-maps/native-coverage.mjs', str(stage), str(output),
                    '--edition=yr', f'--theater={theater}', f'--map={member}', '--bot-slot=1',
                    f'--density={density}', f'--families={family}', f'--terrain-groups={groups}',
                    '--capture-requested-only', '--capture-terrain-only', '--capture-central-tiles',
                    '--render-resolution=1080p']
                if members:
                    command.append('--terrain-members=' + ','.join(members))
                if density == 4:
                    command.append(f'--capture-reference={root}/native-{stem}-2x-v1/report.json')
                    if next_map:
                        command += ['--release', '--next-map=' + next_map]
            with (root / f'native-{stem}-{suffix}-v1.log').open('x') as log:
                subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
        report = read(report_file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        records.append(dict(stem=stem, theater=theater, map=member, density=density,
            file=str(report_file), sha256=sha(report_file)))
        print(json.dumps(dict(stem=stem, density=density, status=report['status'])), flush=True)
with (root / 'native-suite-v1.json').open('x') as stream:
    stream.write(json.dumps(dict(status='PASS_FIVE_NATIVE_MAPS_ORIGINAL_2X_4X', cases=records,
        stage=str(stage), stageSha256=sha(stage), runtimeSourceHead=read(stage)['runtimeSourceHead'],
        policy='Unchanged official maps and source placements; 2X/4X share camera routes. '
            'Both cross-theater directions, Original reset, reentry and disposal are included. '
            'Technical fixtures do not establish user artwork acceptance.',
        windows='NOT_RUN', m24Complete=False), indent=2) + '\n')
