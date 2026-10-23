"""Provide every original actor pose beside its independently sampled HD pixels."""
import concurrent.futures
import json
import subprocess
from pathlib import Path

base = Path('.artifacts/m2-4')
native = base / 'urban-actors-native-batch62-v1'
root = base / 'urban-actors-comparisons-batch62-v1'
root.mkdir()
sources = json.loads((native / 'source.json').read_text())['sources']
groups = [dict(id=f'{source["member"]}-{start:03d}', member=source['member'],
    frames=list(range(start, min(start + 12, source['totalFrames'] // 2))))
    for source in sources if source['format'] == 'shp' for start in range(0, source['totalFrames'] // 2, 12)]


def render(task):
    group, density = task
    output = root / f'{group["id"]}-{density}x'
    command = ['python3', 'scripts/m2/official-maps/review-exported-shp.py',
        '.local/environment-packs/urban-environment-m2-4-actors-batch62-v1', str(output),
        '--prepared', str(native), '--contract', str(native / 'infantry-contract.json'),
        '--members', group['member'], '--frames', *map(str, group['frames']), '--density', str(density)]
    with (root / f'{output.name}.log').open('x') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    return dict(group=group['id'], density=density, output=str(output))


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
    outputs = list(workers.map(render, [(group, density) for group in groups for density in [2, 4]]))
with (root / 'index.json').open('x') as stream:
    stream.write(json.dumps(dict(status='PASS_ALL_602_NEW_NATIVE_POSES_PREPARED_FOR_VISUAL_QA',
        originalSlots=602, densities=[2, 4], groups=groups, outputs=outputs), indent=2) + '\n')
print(json.dumps(dict(groups=len(groups), boards=len(outputs), originalSlots=602)))
