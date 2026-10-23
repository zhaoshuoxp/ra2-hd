"""Render every new source pose at both actual densities, excluding accepted flag reuse."""
import concurrent.futures
import json
import subprocess
from pathlib import Path

base = Path('.artifacts/m2-4')
native = base / 'urban-linked-native-batch61-v1'
root = base / 'urban-linked-comparisons-batch61-v1'
root.mkdir()
sources = json.loads((native / 'source.json').read_text())['sources']
bodies = [s['member'] for s in sources if all(b['role'] == 'body' for b in s['bindings'])]
groups = [dict(id='bodies', members=bodies, frames=[0, 1, 2, 3])]
for source in sources:
    if source['member'] in bodies or source['member'] == 'cugrd1_a.shp':
        continue
    for start in range(0, source['totalFrames'] // 2, 6):
        groups.append(dict(id=f'{source["member"]}-from-{start:03d}', members=[source['member']],
            frames=list(range(start, min(start + 6, source['totalFrames'] // 2)))))


def render(task):
    group, density = task
    output = root / f'{group["id"]}-{density}x'
    command = ['python3', 'scripts/m2/official-maps/review-exported-shp.py',
        '.local/environment-packs/urban-linked-m2-4-batch61-r1', str(output),
        '--prepared', str(native), '--contract', str(native / 'contract.json'),
        '--members', *group['members'], '--frames', *map(str, group['frames']), '--density', str(density)]
    with (root / f'{output.name}.log').open('x') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    return dict(group=group['id'], density=density, output=str(output))


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
    reports = list(workers.map(render, [(group, density) for group in groups for density in [2, 4]]))
with (root / 'index.json').open('x') as stream:
    json.dump(dict(status='PASS_ALL_NEW_SOURCE_POSES_PREPARED_FOR_VISUAL_QA',
        originalSlots=214, densities=[2, 4], groups=groups, outputs=reports,
        reusedAcceptedAnimation='Nine exact guard flag slots are technically verified and omitted from new-art review.'),
        stream, indent=2)
    stream.write('\n')
print(json.dumps(dict(groups=len(groups), densityGroups=len(reports), originalSlots=214)))
