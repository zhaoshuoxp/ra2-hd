"""Export original YR building or scenery references without changing selections."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('inventory', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--kind', action='append', choices=['building', 'terrain'])
args = parser.parse_args()
kinds = set(args.kind or ['building'])
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.open('x').write(json.dumps(value, indent=2) + '\n')
root = args.output.resolve()
root.mkdir(exist_ok=False)
inventory = read(args.inventory)
assert inventory['schema'] == 'yr-campaign-art-inventory-v1'
environment = {**os.environ, 'RA2_TEST_EDITION': 'yr', 'RA2_TEST_RESOURCE_ROOT': str(Path('.local').resolve())}
base_command = ['bun', '--preload', './scripts/windows-hd/browser-test-setup.ts',
    'scripts/campaign-completion/export-mission-art.ts']
jobs = {}
for row in inventory['rows']:
    if row['kind'] not in kinds or row['decision'] != 'MISSING_AUTHORED_FAMILY':
        continue
    signature = json.dumps([row['theater'], row['id'], row['source'], row['nativeArt'], row['dependencies']], sort_keys=True)
    if signature in jobs:
        jobs[signature]['missions'] = sorted(set(jobs[signature]['missions']).union(row['usage']))
        continue
    name = row['theater'].lower() + '-' + row['id'].lower()
    if any(job['name'] == name for job in jobs.values()):
        name += '-' + hashlib.sha256(signature.encode()).hexdigest()[:8]
    folder = root / name
    folder.mkdir()
    jobs[signature] = dict(name=name, kind=row['kind'], identity=row['id'], theater=row['theater'], member=row['source']['member'],
        sourceSha256=row['source']['sha256'], mission=sorted(row['usage'])[0], missions=sorted(row['usage']),
        expectedPalette=row['palette'], expectedShadow=row['hasShadow'], expectedArt=row['nativeArt'],
        dependencies=row['dependencies'], directory=str(folder), originalSource=None, linkedSources=[])
batches = []
for job in jobs.values():
    batch = next((batch for batch in batches if batch['mission'] == job['mission']
        and job['member'] not in {item['member'] for item in batch['jobs']}), None)
    if batch is None:
        batch = dict(mission=job['mission'], jobs=[])
        batches.append(batch)
    batch['jobs'].append(job)


def export(directory, mission, requests, flags, log):
    with log.open('x') as output:
        subprocess.run(base_command + [str(directory), mission, *requests, '--edition=yr', *flags],
            check=True, env=environment, stdout=output, stderr=subprocess.STDOUT)
    return directory / 'source.json'


for index, batch in enumerate(batches):
    directory = root / f'original-batch-{index + 1}-{batch["mission"][:-4]}'
    source_file = export(directory, batch['mission'], [job['identity'] + ':' + job['member'] for job in batch['jobs']],
        [], root / f'original-batch-{index + 1}.log')
    original = read(source_file)
    for job in batch['jobs']:
        source, = [source for source in original['sources'] if source['identity'] == job['identity']]
        assert source['sha256'] == job['sourceSha256'] and source['palette'] == job['expectedPalette']
        assert source['nativeArt'] == job['expectedArt'] and sha(directory / 'native' / source['member']) == source['sha256']
        job['originalSource'] = dict(file=str(source_file), sha256=sha(source_file),
            canvas=source['canvas'], bodyFrames=source['bodyFrames'], totalFrames=source['totalFrames'],
            shadowMatchesRenderer=source['hasShadow'] == job['expectedShadow'])
        for dependency in job['dependencies']:
            role = dependency['role']
            if role not in ['ACTIVE', 'RULES_DESTROY_ANIMATION']:
                job['linkedSources'].append(dict(role=role, status='ORIGINAL_RENDERER_ROLE_QUALIFICATION_PENDING',
                    source=dependency['source']))
                continue
            linked = Path(job['directory']) / ('original-' + role.lower())
            flag = '--animation=' if role == 'ACTIVE' else '--destroy-animation='
            linked_file = export(linked, job['mission'], [job['identity'] + ':' + dependency['source']['member']],
                [flag + dependency['animation']], Path(job['directory']) / ('source-' + role.lower() + '.log'))
            source, = read(linked_file)['sources']
            assert source['sha256'] == dependency['source']['sha256']
            job['linkedSources'].append(dict(role=role, status='ORIGINAL_SOURCE_EXPORTED_NOT_HD', file=str(linked_file),
                sha256=sha(linked_file), member=source['member'], bodyFrames=source['bodyFrames']))
    print(json.dumps(dict(batch=index + 1, mission=batch['mission'], objects=len(batch['jobs']))), flush=True)
worklist = dict(schema='yr-missing-original-building-source-worklist-v1' if kinds == {'building'}
        else 'yr-missing-original-scenery-source-worklist-v1',
    status='ORIGINAL_SOURCE_REFERENCES_ONLY_AUTHORING_AND_RUNTIME_PENDING',
    inventory=dict(file=str(args.inventory.resolve()), sha256=sha(args.inventory)), jobs=list(jobs.values()),
    runtimeSelectionsChanged=0, acceptedPayloadsReplaced=0, userVisualAcceptance='PENDING')
write(root / 'worklist-r1.json', worklist)
print(json.dumps(dict(jobs=len(jobs), bodyBatches=len(batches), output=str(root))))
