"""Select the complete material-only Yuri head revision without changing old payloads."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda v: (json.dumps(v, indent=2) + '\n').encode()
sha = lambda b: hashlib.sha256(b).hexdigest()
stage = root / '.artifacts/yr-campaign/cahead-material-r2-export'
directory = root / '.local/campaign/yr/sov05umd'
manifest_file = directory / 'manifest.json'
contract_file = root / 'desktop/environment-newurban-hd-contract.json'
manifest, contract = read(manifest_file), read(contract_file)
family = 'yr-task-newurban-caeast02-v1'
prior = contract['turretAttachments'][family]
assert prior['variants']['4']['sha256'] == '039619e719b0b98069b5826be3fc1faf70c5ad3e86ebaf40644ea1e7d9ee4fc2'
prior_rows = {row['name']: row for row in manifest['files']}
for name, row in prior_rows.items():
    assert sha((directory / name).read_bytes()) == row['sha256']
payloads, variants, declarations = {}, {}, {}
for density in [2, 4]:
    file = stage / str(density) / 'manifest.json'
    value = read(file)
    assert value['density'] == density and len(value['headings']) == 8
    name = f'yr-cahead-r2-{density}-manifest.json'
    payloads[name] = file.read_bytes()
    files = {}
    for heading in value['headings']:
        for role in ['base', 'mask']:
            original = heading[role]
            data = (file.parent / original).read_bytes()
            assert sha(data) == heading[role + 'Sha256']
            target = f'yr-cahead-r2-{density}-{original}'
            payloads[target] = data
            files[original] = target
    variants[str(density)] = {'manifest': name, 'sha256': sha(payloads[name]), 'files': files}
    width, height = [v * density for v in value['canvas']]
    declarations[str(density)] = {'sha256': sha(payloads[name]),
        'workingBytes': max(h['baseBytes'] for h in value['headings']) * 2 + width * height * 5 + 32768}
bundle = {'schema': 'campaign-environment-turret-v1', 'identity': family, 'family': 'CAEAST02',
    'theater': 'NEWURBAN', 'mission': 'sov05umd.map', 'revision': 'yr-cahead-r2', 'variants': variants}
payloads['environment-turret-yr-cahead-r2.json'] = encode(bundle)
assert len(prior_rows) + len(payloads) <= 256
for name, data in payloads.items():
    assert name not in prior_rows
    (directory / name).open('xb').write(data)
    manifest['files'].append({'name': name, 'bytes': len(data), 'sha256': sha(data),
        'route': f'/local-campaign/yr/sov05umd/{name}'})
contract['turretAttachments'][family] = {**prior, 'variants': declarations}
manifest_file.write_bytes(encode(manifest))
contract_file.write_bytes(encode(contract))
receipt = {'schema': 'yr-yuri-statue-material-r2', 'status': 'SELECTED_COMPLETE_EIGHT_HEADINGS_NATIVE_REVIEW_PENDING',
    'priorAttachment': prior, 'attachment': contract['turretAttachments'][family],
    'independentDensities': [2, 4], 'addedFiles': len(payloads), 'preservedPriorFiles': len(prior_rows),
    'sourceVoxelGeometryPivotsOwnershipAndGameplayUnchanged': True,
    'authoringSelection': '.local/source-art/yr-campaign-v1/building-turrets/cahead/selected-masters-r2.json',
    'exports': str(stage.relative_to(root)), 'userVisualAcceptance': 'PENDING'}
(root / 'docs/yr-campaign-yuri-statue-material-20261108.json').open('xb').write(encode(receipt))
print(json.dumps({'status': receipt['status'], 'addedFiles': len(payloads)}))
