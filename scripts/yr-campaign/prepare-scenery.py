"""Prepare complete new YR scenery families from pinned original references."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', nargs='+')
parser.add_argument('--revision', type=int, default=1)
parser.add_argument('--inventory', type=Path, default=Path('.artifacts/yr-campaign/art-inventory-r19/inventory.json'))
args = parser.parse_args()
assert args.revision > 0
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/scenery'
read = lambda file: json.loads(Path(file).read_text())
sha = lambda file: hashlib.sha256(Path(file).read_bytes()).hexdigest()
write = lambda file, value: Path(file).open('x').write(json.dumps(value, indent=2) + '\n')
os.chdir(ROOT)
worklist = read(BASE / 'worklist-r1.json')
environment = {**os.environ, 'RA2_TEST_EDITION': 'yr', 'RA2_TEST_RESOURCE_ROOT': str(ROOT / '.local')}
authorization = Path('docs/campaign-art/yr-v1/authorization.json')


def run(command, log):
    with log.open('x') as output:
        subprocess.run(command, check=True, env=environment, stdout=output, stderr=subprocess.STDOUT)


for name in args.jobs:
    job, = [job for job in worklist['jobs'] if job['name'] == name]
    assert job['kind'] == 'terrain' and not job['dependencies'] and not job['linkedSources']
    assert job['originalSource']['shadowMatchesRenderer']
    folder = Path(job['directory'])
    source_file = Path(job['originalSource']['file'])
    assert sha(source_file) == job['originalSource']['sha256']
    original = read(source_file)
    source, = [source for source in original['sources'] if source['identity'] == job['identity']]
    assert source['palette'] == job['expectedPalette'] and source['nativeArt'] == job['expectedArt']
    assert source['bodyFrames'] == 1 and source['totalFrames'] == 2 and source['hasShadow']
    assert not source['remapable'] and not source.get('framePalettes')
    selected = read(folder / f'selected-states-r{args.revision}.json')
    assert selected['sourceSha256'] == source['sha256'] and selected['userVisualAcceptance'] == 'PENDING'
    assert set(selected['masters']) == {'0'}
    assert all(sha(ROOT / master['file']) == master['sha256'] for master in selected['masters'].values())
    family = 'yr-scenery-' + name + '-v1'
    revision = f'yr-scenery-{name}-r{args.revision}'.replace('_', '-')
    recipe = dict(edition='yr', authorization=dict(file=str(authorization), sha256=sha(authorization)),
        source=str(source_file.relative_to(ROOT)), sourceJsonSha256=sha(source_file),
        mission=original['mission'], missionSha256=original['missionSha256'], identity=job['identity'],
        kind='terrain', sourceSha256=source['sha256'], family=family, masters=selected['masters'],
        authoredSceneryContours=dict(schema='yr-source-pinned-authored-scenery-v1',
            alphaCutoff=180, rejectFluorescentFringe=True))
    suffix = '' if args.revision == 1 else f'-r{args.revision}'
    recipe_file = Path(f'docs/campaign-art/yr-v1/scenery-{name}{suffix}.json')
    write(recipe_file, recipe)
    stage = ROOT / f'.artifacts/yr-campaign/scenery-{name}-stage-r{args.revision}'
    run(['python3', 'scripts/campaign-completion/prepare-approved-shp.py', str(recipe_file), str(stage)],
        folder / f'prepare-r{args.revision}.log')
    run(['python3', 'scripts/yr-campaign/expand-family-bindings.py', str(stage), str(args.inventory),
        str(folder / f'bindings-r{args.revision}.json'), '--kind=terrain'], folder / f'bindings-r{args.revision}.log')
    run(['python3', 'scripts/yr-campaign/export-authored-family.py', str(stage), revision], folder / f'export-r{args.revision}.log')
    run(['python3', 'scripts/yr-campaign/verify-authored-family.py', str(stage)], folder / f'verify-r{args.revision}.log')
    print(json.dumps(dict(job=name, family=family, stage=str(stage), verification=read(stage / 'verification.json'))), flush=True)
