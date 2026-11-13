"""Prepare complete YR building families while preserving pinned accepted bodies."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/task-building-rubble'
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.open('x').write(json.dumps(value, indent=2) + '\n')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('jobs', nargs='+', help='Theater-identity directory names from the pinned source worklist.')
parser.add_argument('--revision', type=int, default=1)
args = parser.parse_args()
assert args.revision > 0
suffix = f'r{args.revision}'
os.chdir(ROOT)
environment = {**os.environ, 'RA2_TEST_EDITION': 'yr', 'RA2_TEST_RESOURCE_ROOT': str(ROOT / '.local')}
worklist = read(BASE / 'worklist-r1.json')
authorization = Path('docs/campaign-art/yr-v1/authorization.json')


def run(command, log):
    with log.open('x') as output:
        subprocess.run(command, check=True, env=environment, stdout=output, stderr=subprocess.STDOUT)


for name in args.jobs:
    job, = [row for row in worklist['jobs'] if Path(row['root']).name == name]
    source_root = ROOT / job['root']
    master = source_root / 'masters-r1/rubble.png'
    assert master.is_file() and (source_root / 'generation-r1.json').is_file()
    family, revision = f'yr-rubble-{name}-v1', f'yr-rubble-{name}-{suffix}'
    stage = ROOT / f'.artifacts/yr-campaign/rubble-{name}-stage-{suffix}'
    assert not stage.exists(), 'Keep every previous stage immutable; use a new revision for corrections.'
    recipes, stages = [], []
    donor_file = source_root / f'accepted-body-proof-{suffix}-declaration.json'
    if not donor_file.exists():
        donor_file = source_root / 'accepted-body-proof-r1-declaration.json'
    members = [(source_root / 'original/source.json', donor_file, master)]
    if job['dependencyMembers']:
        assert job['identity'] == 'CASLAB' and job['dependencyMembers'] == ['cgslab_f.shp']
        active_donor = source_root / f'accepted-active-proof-{suffix}-declaration.json'
        if not active_donor.exists():
            active_donor = source_root / 'accepted-active-proof-r1-declaration.json'
        members.append((source_root / 'original-active-r1/source.json',
            active_donor, None))
    for index, (original_file, donor_file, selected_master) in enumerate(members):
        original, donor = read(original_file), read(donor_file)
        source, = original['sources']
        assert source['identity'] == job['identity'] and original['theater'] == job['theater']
        if index == 0:
            assert source['sha256'] == job['sourceSha256'] and donor['slots'] == [0, 1, 2]
        else:
            assert source['bindingRole'] == 'ACTIVE' and donor['completeOriginalAnimation'] is True
        recipe = dict(edition='yr', authorization=dict(file=str(authorization), sha256=sha(authorization)),
            source=str(original_file.relative_to(ROOT)), sourceJsonSha256=sha(original_file),
            mission=original['mission'], missionSha256=original['missionSha256'],
            identity=job['identity'], kind='building', sourceSha256=source['sha256'], family=family,
            masters={'3': dict(file=str(selected_master.relative_to(ROOT)), sha256=sha(selected_master))}
                if selected_master else {}, acceptedNativeBodyFrames={source['member']: donor})
        recipe_suffix = '' if args.revision == 1 else '-' + suffix
        recipe_file = ROOT / f'docs/campaign-art/yr-v1/rubble-{name}{"-active" if index else ""}{recipe_suffix}.json'
        write(recipe_file, recipe)
        member_stage = stage if len(members) == 1 else stage.with_name(stage.name + f'-member-{index}')
        run(['python3', 'scripts/campaign-completion/prepare-approved-shp.py', str(recipe_file), str(member_stage)],
            source_root / f'prepare-member-{index}-{suffix}.log')
        recipes.append(recipe_file)
        stages.append(member_stage)
    if len(stages) > 1:
        run(['python3', 'scripts/yr-campaign/assemble-shp-family.py', str(stage), *map(str, stages)],
            source_root / f'assemble-{suffix}.log')
    run(['python3', 'scripts/yr-campaign/expand-family-bindings.py', str(stage),
        '.artifacts/yr-campaign/art-inventory-r9/inventory.json', str(source_root / f'bindings-{suffix}.json')],
        source_root / f'bindings-{suffix}.log')
    run(['python3', 'scripts/yr-campaign/export-authored-family.py', str(stage), revision],
        source_root / f'export-{suffix}.log')
    run(['python3', 'scripts/yr-campaign/verify-authored-family.py', str(stage)],
        source_root / f'verify-{suffix}.log')
    print(json.dumps(dict(job=name, family=family, stage=str(stage), verification=read(stage / 'verification.json'))), flush=True)
