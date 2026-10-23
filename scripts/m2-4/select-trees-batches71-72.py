"""Select verified tree or facility batches while preserving prior environment payloads."""
import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--theater', required=True, choices=['NEWURBAN', 'DESERT'])
parser.add_argument('--batch', type=int, choices=[71, 72, 73])
args = parser.parse_args()
name = args.theater.lower()
batch, prior_count, new_count = (71, 69, 23) if name == 'newurban' else (72, 62, 16)
if args.batch is not None:
    assert args.batch == batch or args.batch == 73 and name == 'newurban'
    if args.batch == 73:
        batch, prior_count, new_count = 73, 92, 19
kind = 'facilities' if batch == 73 else 'tree'
native = Path(f'.artifacts/m2-4/{name}-{kind}-native-batch{batch}-v1')
author = Path(f'.artifacts/m2-4/{name}-{kind}-authoring-batch{batch}-v1')
contract_file = Path(f'desktop/environment-{name}-hd-contract.json')
pointer_file = Path(f'.local/environment-{name}-selection.json')
prior = read(contract_file)
assert prior['selectedPack'] == read(pointer_file) and len(prior['families']) == prior_count
verification = read(author / 'verification-v1.json')
assert verification['status'] == 'PASS' and verification['counts']['families'] == new_count
assert read(author / 'loading-v1.json')['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
for job in read(author / 'imagegen-jobs.json')['jobs']:
    capacity = read(author / (job['id'] + '-capacity-v1.json'))
    assert capacity['status'] == 'PASS' and sha(Path(job['destination'])) == capacity['masterSha256']
full = copy.deepcopy(read(native / 'contract-full.json'))
for field in ('sources', 'families'):
    assert all(full[field][key] == value for key, value in prior[field].items())
assert full.get('vxl') == prior.get('vxl')
assert len(full['families']) == prior_count + new_count
assembly_file = native / 'assembly-v1.json'
revision = f'{name}-environment-{"facilities" if batch == 73 else "trees"}-batch{batch}-v1-combined'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', revision,
    '--contract', str(native / 'contract-full.json'), '--base-pointer', str(pointer_file),
    '--append', verification['pack'], '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == prior_count and len(assembly['appendedFamilies']) == new_count
full['selectedPack'] = assembly['pack']
full['extensions'] = dict(milestone='M2.4', batch=batch, priorContractSha256=sha(contract_file),
    priorPack=prior['selectedPack'], freshIndependentExportSha256=sha(author / 'verification-v1.json'),
    state='STATIC_AND_LOADER_PASS_NATIVE_AND_NEW_ART_VISUAL_PENDING')
receipt = dict(status='STATIC_AND_LOADER_PASS_NATIVE_PENDING', theater=args.theater, priorContract=prior,
    selectedPack=assembly['pack'], preservedFamilies=prior_count, newAuthoredFamilies=new_count,
    assemblySha256=sha(assembly_file),
    unchangedTerrainSelection=read(Path(f'.local/terrain-{name}-selection.json')),
    windows='NOT_RUN', milestone='INCOMPLETE')
with (native / 'selection-v1.json').open('x') as stream:
    stream.write(encode(receipt))
contract_file.write_text(encode(full))
pointer_file.write_text(encode(assembly['pack']))
print(json.dumps(dict(theater=args.theater, families=len(full['families']), selected=assembly['pack'])))
