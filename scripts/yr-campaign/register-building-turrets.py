"""Register source-scoped complete turrets while retaining accepted pedestal payloads."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.local/source-art/yr-campaign-v1/building-turrets'
read = lambda file: json.loads(file.read_text())
encode = lambda value: (json.dumps(value, indent=2) + '\n').encode()
sha = lambda payload: hashlib.sha256(payload).hexdigest()
receipt_file = ROOT / 'docs/campaign-art/yr-v1/building-turrets-registration-r1.json'
assert not receipt_file.exists()
worklist = read(BASE / 'worklist-r1.json')
inventory = read(ROOT / '.artifacts/yr-campaign/art-inventory-r16/inventory.json')
rows = []

for name, family in [('cahead', 'yr-task-newurban-caeast02-v1'), ('outp', 'snow-caoutp')]:
    selection_file = BASE / name / 'selected-masters-r1.json'
    selection = read(selection_file)
    identity = selection['identity']
    job, = [job for job in worklist['candidates'] if job['id'] == identity]
    theater = job['theater']
    scope = {'campaignSources': [dict(edition='yr', mission=mission,
        sha256=next(row['sourceSha256'] for row in inventory['maps'] if row['mission'] == mission))
        for mission in sorted(job['usage'])]}
    source, = scope['campaignSources']
    directory = ROOT / '.local/campaign/yr' / source['mission'][:-4]
    campaign_file = directory / 'manifest.json'
    campaign = read(campaign_file)
    assert sha((directory / source['mission']).read_bytes()) == source['sha256']
    contract_file = ROOT / f'desktop/environment-{theater.lower()}-hd-contract.json'
    contract = read(contract_file)
    previous_contract = copy.deepcopy(contract)
    if name == 'cahead':
        pending = read(ROOT / '.artifacts/yr-campaign/task-newurban-caeast02-stage-r1/contract.json')
        assert family not in contract['families']
        contract['sources'].update(pending['sources'])
        contract['families'][family] = {**pending['families'][family], 'requiredTurret': True}
        contract['identities']['yr'][identity] = family
    else:
        assert contract['identities']['yr'][identity] == family
    assert family not in contract.get('turretAttachments', {})
    stage = ROOT / f'.artifacts/yr-campaign/{name}-turret-stage-r1'
    exported = read(stage / 'export.json')
    assert exported['registered'] is False and exported['independentDensities'] == [2, 4]
    variants, payloads, declarations = {}, {}, {}
    for density in [2, 4]:
        manifest_file = stage / str(density) / 'manifest.json'
        payload = manifest_file.read_bytes(); manifest = json.loads(payload)
        assert manifest['family'] == identity and manifest['theater'] == theater and manifest['density'] == density
        revision = manifest['revision']
        manifest_name = f'{revision}-{density}-manifest.json'
        payloads[manifest_name] = payload
        files = {}
        for heading in manifest['headings']:
            for role in ['base', 'mask']:
                original = heading[role]
                payload = (manifest_file.parent / original).read_bytes()
                assert sha(payload) == heading[role + 'Sha256'] and len(payload) == heading[role + 'Bytes']
                name_on_disk = f'{revision}-{density}-{original}'
                payloads[name_on_disk] = payload
                files[original] = name_on_disk
        variants[str(density)] = dict(sha256=sha(manifest_file.read_bytes()), manifest=manifest_name, files=files)
        width, height = [value * density for value in manifest['canvas']]
        declarations[str(density)] = dict(sha256=variants[str(density)]['sha256'],
            workingBytes=max(row['baseBytes'] for row in manifest['headings']) * 2 + width * height * 5 + 32768)
    attachment = dict(family=identity, sources=manifest['sources'],
        palette={key: manifest['palette'][key] for key in ['member', 'sha256']},
        variants=declarations, sourceScope=scope)
    contract.setdefault('turretAttachments', {})[family] = attachment
    bundle = dict(schema='campaign-environment-turret-v1', identity=family, family=identity,
        theater=theater, mission=source['mission'], revision=revision, variants=variants)
    payloads[f'environment-turret-{revision}.json'] = encode(bundle)
    additions = []
    for filename, payload in payloads.items():
        assert not (directory / filename).exists() and not any(row['name'] == filename for row in campaign['files'])
        additions.append(dict(name=filename, bytes=len(payload), sha256=sha(payload),
            route=f'/local-campaign/yr/{source["mission"][:-4]}/{filename}'))
    assert len(campaign['files']) + len(additions) <= 256
    for filename, payload in payloads.items():
        (directory / filename).open('xb').write(payload)
    campaign['files'] += additions
    campaign_file.write_bytes(encode(campaign))
    contract_file.write_bytes(encode(contract))
    for key in ['sources', 'families']:
        for identifier, value in previous_contract[key].items():
            assert contract[key][identifier] == value, 'Previously registered source and family entries must remain identical'
    for edition, identities in previous_contract['identities'].items():
        assert all(contract['identities'][edition][identity] == family for identity, family in identities.items())
    rows.append(dict(identity=identity, environmentFamily=family, theater=theater, attachment=attachment,
        selection=str(selection_file.relative_to(ROOT)), selectionSha256=sha(selection_file.read_bytes()),
        exports=str((stage / 'export.json').relative_to(ROOT)), bundle=bundle, addedFiles=additions,
        preservedAcceptedPedestal=(name == 'outp'), copiedAcceptedPngFiles=0, replacedAcceptedPayloads=0,
        nativeRuntime='PENDING', userVisualAcceptance='PENDING'))

receipt_file.open('xb').write(encode(dict(schema='yr-complete-building-turret-registration-v1',
    status='REGISTERED_COMPLETE_BODY_AND_TURRET_TRANSACTION_NATIVE_PENDING', families=rows,
    userVisualAcceptance='PENDING', windows='NOT_RUN_ON_THIS_MAC')))
print(json.dumps(dict(status='REGISTERED_NATIVE_PENDING', identities=[row['identity'] for row in rows],
    addedFiles=sum(len(row['addedFiles']) for row in rows), copiedAcceptedPngFiles=0)))
