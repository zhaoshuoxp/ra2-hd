"""Append verified accepted reuse and new complete decals without replacing prior art."""
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


base = Path('.artifacts/m2-4')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--theater', choices=['NEWURBAN', 'DESERT'])
args = parser.parse_args()
for theater, batch, preserved, reused in [('NEWURBAN', 67, 42, 3), ('DESERT', 68, 46, 1)]:
    if args.theater and args.theater != theater:
        continue
    name = theater.lower()
    native = base / f'{name}-smudge-native-batch{batch}-v1'
    author = base / f'{name}-smudge-authoring-batch{batch}-v1'
    reuse = base / f'{name}-urban-accepted-reuse-batch66-v1'
    contract_file = Path(f'desktop/environment-{name}-hd-contract.json')
    pointer_file = Path(f'.local/environment-{name}-selection.json')
    prior = read(contract_file)
    assert prior['selectedPack'] == read(pointer_file) and len(prior['families']) == preserved
    verification = read(author / 'verification-v1.json')
    assert verification['status'] == 'PASS'
    assert read(author / 'loading-v1.json')['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
    assert read(reuse / 'reuse-receipt.json')['status'] == 'PASS_COMPLETE_ACCEPTED_FAMILY_REUSE_PAYLOAD_AND_MASKS'
    assert read(reuse / 'loading-v1.json')['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
    for job in read(author / 'imagegen-jobs.json')['jobs']:
        capacity = read(author / (job['id'] + '-capacity-v1.json'))
        assert capacity['status'] == 'PASS' and sha(Path(job['destination'])) == capacity['masterSha256']
    full = copy.deepcopy(read(native / 'contract-full.json'))
    addition = read(reuse / 'contract.json')
    if theater == 'DESERT':
        for field in ('sources', 'families'):
            assert not full[field].keys() & addition[field].keys()
            full[field].update(addition[field])
        for edition, identities in addition['identities'].items():
            assert not full['identities'][edition].keys() & identities.keys()
            full['identities'][edition].update(identities)
    for field in ('sources', 'families'):
        assert all(full[field][key] == value for key, value in prior[field].items())
    assert full.get('vxl') == prior.get('vxl')
    assert len(full['families']) == preserved + reused + verification['counts']['families']
    candidate = native / 'contract-selected-candidate.json'
    with candidate.open('x') as stream:
        stream.write(encode(full))
    assembly_file = native / 'assembly-v1.json'
    revision = f'{name}-environment-ground-effects-batch{batch}-v1-combined'
    subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', revision,
        '--contract', str(candidate), '--base-pointer', str(pointer_file), '--append',
        str(Path('.local/environment-packs') / addition['selectedPack']['revision']),
        verification['pack'], '--receipt', str(assembly_file)], check=True)
    assembly = read(assembly_file)
    assert len(assembly['preservedFamilies']) == preserved
    assert len(assembly['appendedFamilies']) == reused + verification['counts']['families']
    full['selectedPack'] = assembly['pack']
    full['extensions'] = dict(milestone='M2.4', batch=batch, acceptedReuseBatch=66,
        acceptedReuseAuditSha256=sha(Path(read(reuse / 'reuse-receipt.json')['audit'])),
        priorContractSha256=sha(contract_file), priorPack=prior['selectedPack'],
        freshIndependentExportSha256=sha(author / 'verification-v1.json'),
        state='STATIC_AND_LOADER_PASS_NATIVE_AND_NEW_ART_VISUAL_PENDING')
    receipt = dict(status='STATIC_AND_LOADER_PASS_NATIVE_PENDING', theater=theater,
        priorContract=prior, selectedPack=assembly['pack'], preservedFamilies=preserved,
        exactAcceptedReuseFamilies=reused, newAuthoredFamilies=verification['counts']['families'],
        assemblySha256=sha(assembly_file), windows='NOT_RUN', milestone='INCOMPLETE')
    with (native / 'selection-v1.json').open('x') as stream:
        stream.write(encode(receipt))
    contract_file.write_text(encode(full))
    pointer_file.write_text(encode(assembly['pack']))
    print(json.dumps(dict(theater=theater, families=len(full['families']), pack=assembly['pack'])))
