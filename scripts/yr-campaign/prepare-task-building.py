"""Prepare selected complete authored building states against their original sources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', nargs='+')
parser.add_argument('--revision', type=int, default=1)
parser.add_argument('--inventory', type=Path, default=Path('.artifacts/yr-campaign/art-inventory-r21/inventory.json'))
args = parser.parse_args()
assert args.revision > 0
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-buildings'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.open('x').write(json.dumps(value, indent=2) + '\n')
os.chdir(ROOT)
worklist = read(BASE / 'worklist-r1.json')
environment = {**os.environ, 'RA2_TEST_EDITION': 'yr', 'RA2_TEST_RESOURCE_ROOT': str(ROOT / '.local')}
authorization = Path('docs/campaign-art/yr-v1/authorization.json')


def run(command, log):
    with log.open('x') as output:
        subprocess.run(command, check=True, env=environment, stdout=output, stderr=subprocess.STDOUT)


for name in args.jobs:
    job, = [job for job in worklist['jobs'] if job['name'] == name]
    folder = Path(job['directory'])
    assert not job['linkedSources'], 'Linked native members require complete role qualification and family assembly.'
    assert job['originalSource']['shadowMatchesRenderer']
    source_file = Path(job['originalSource']['file'])
    assert sha(source_file) == job['originalSource']['sha256']
    original = read(source_file)
    source, = [source for source in original['sources'] if source['identity'] == job['identity']]
    plan = read(folder / 'original-state-plan-r1.json')
    selected = read(folder / f'selected-states-r{args.revision}.json')
    assert selected['sourceSha256'] == source['sha256'] == plan['sourceSha256']
    assert selected['userVisualAcceptance'] == 'PENDING'
    required = {str(row['canonical']) for row in plan['states']}
    assert set(selected['masters']) == required
    for master in selected['masters'].values():
        assert sha(ROOT / master['file']) == master['sha256']
    family, revision = 'yr-task-' + name + '-v1', f'yr-task-{name}-r{args.revision}'
    recipe = dict(edition='yr', authorization=dict(file=str(authorization), sha256=sha(authorization)),
        source=str(source_file.relative_to(ROOT)), sourceJsonSha256=sha(source_file),
        mission=original['mission'], missionSha256=original['missionSha256'], identity=job['identity'],
        kind='building', sourceSha256=source['sha256'], family=family, masters=selected['masters'])
    if selected.get('sourcePinnedPyramid'):
        recipe['sourcePinnedPyramid'] = selected['sourcePinnedPyramid']
    if selected.get('authoredOwnerPaint'):
        recipe['authoredOwnerPaint'] = selected['authoredOwnerPaint']
    suffix = '' if args.revision == 1 else f'-r{args.revision}'
    recipe_file = ROOT / f'docs/campaign-art/yr-v1/task-{name}{suffix}.json'
    write(recipe_file, recipe)
    stage = ROOT / f'.artifacts/yr-campaign/task-{name}-stage-r{args.revision}'
    run(['python3', 'scripts/campaign-completion/prepare-approved-shp.py', str(recipe_file), str(stage)],
        folder / f'prepare-r{args.revision}.log')
    run(['python3', 'scripts/yr-campaign/expand-family-bindings.py', str(stage),
        str(args.inventory), str(folder / f'bindings-r{args.revision}.json')],
        folder / f'bindings-r{args.revision}.log')
    run(['python3', 'scripts/yr-campaign/export-authored-family.py', str(stage), revision], folder / f'export-r{args.revision}.log')
    run(['python3', 'scripts/yr-campaign/verify-authored-family.py', str(stage)], folder / f'verify-r{args.revision}.log')
    print(json.dumps(dict(job=name, family=family, stage=str(stage), verification=read(stage / 'verification.json'))), flush=True)
