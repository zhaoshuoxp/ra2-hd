"""Keep laboratory paint exact and make its stripe material follow the house in every live state."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
encode = lambda v: (json.dumps(v, indent=2) + '\n').encode()
sha = lambda b: hashlib.sha256(b).hexdigest()
rows = []
jobs = [('all01umd', 'NEWURBAN', 'yr-allied01-einstein-laboratory-v1',
         'yr-einstein-lab-r1-cnlab-shp.json', 'yr-feedback-lab-newurban-owner-r2'),
        ('sov02smd', 'SNOW', 'yr-reuse-snow-calab-v1',
         'yr-reuse-snow-calab-v1-calab-shp.json', 'yr-feedback-lab-snow-owner-r2')]
for mission, theater, old_family, filename, revision in jobs:
    directory = root / '.local/campaign/yr' / mission
    campaign_file = directory / 'manifest.json'
    contract_file = root / f'desktop/environment-{theater.lower()}-hd-contract.json'
    campaign, contract = read(campaign_file), read(contract_file)
    old = read(directory / filename)
    metadata = copy.deepcopy(old)
    metadata.pop('reuse', None)
    metadata['schemaVersion'] = 1
    metadata['packId'], metadata['packRevision'] = revision, '1'
    payloads, frames = {}, []
    donor = root / '.local/campaign/ra2/all10s' if theater == 'SNOW' else directory
    for variant in metadata['variants']:
        density = variant['density']
        for page in variant['pages']:
            base_bytes = (donor / page['base']).read_bytes()
            data_bytes = (donor / page['data']).read_bytes()
            assert sha(base_bytes) == page['baseSha256'] and sha(data_bytes) == page['dataSha256']
            base = np.array(Image.open(donor / page['base']).convert('RGBA'))
            data = np.array(Image.open(donor / page['data']).convert('RGBA'))
            for frame in [f for f in variant['frames'] if f['page'] == page['id'] and f['nativeFrame'] in [0, 1, 2]]:
                x, y, width, height = frame['sampleRect']
                rgba = base[y:y+height, x:x+width].astype(float)
                red, green, blue, alpha = [rgba[..., i] for i in range(4)]
                stripe = (alpha > 0) & (red > 24) & (green < red * .67) & (blue < red * .67)
                stripe &= green - blue < (red - blue) * .25
                material = data[y:y+height, x:x+width]
                before = material.copy()
                # Match the existing red ownership ramp by its authored value.
                palette_file = root / '.artifacts/yr-campaign/building-faction-source-palettes-r1' / ('unitsno.pal' if theater == 'SNOW' else 'unitubn.pal')
                palette_bytes = palette_file.read_bytes()
                descriptor = contract['families'][old_family].get('sourceOverrides', {}).get(
                    old['source']['member'], contract['sources'][old['source']['member']])
                assert sha(palette_bytes) == descriptor['palette']['sha256']
                palette = np.frombuffer(palette_bytes, np.uint8).reshape(256, 3)[16:32, 0].astype(float) * 4
                material[..., 0][stripe] = 255
                material[..., 1][stripe] = np.abs(red[..., None] - palette).argmin(2).astype(np.uint8)[stripe]
                frames.append({'density': density, 'frame': frame['nativeFrame'],
                    'stripePixels': int(stripe.sum()), 'priorOwnerPixels': int((before[..., 0] > 0).sum()),
                    'changedDataPixels': int(np.any(material != before, axis=2).sum())})
            base_name = page['base'] if theater == 'NEWURBAN' else f'{revision}-{density}-{page["id"]}-base.png'
            data_name = f'{revision}-{density}-{page["id"]}-data.png'
            if theater == 'SNOW': payloads[base_name] = base_bytes
            output = directory / data_name
            assert not output.exists()
            Image.fromarray(data).save(output)
            payloads[data_name] = output.read_bytes()
            page.update(base=base_name, data=data_name, dataSha256=sha(payloads[data_name]), dataBytes=len(payloads[data_name]))
    prior = contract['families'][old_family]
    family = revision
    assert family not in contract['families'] and contract['identities']['yr']['CALAB'] == old_family
    declared = copy.deepcopy(prior)
    declared['familyHash'] = sha(encode({'family': family, 'sourceFamilyHash': prior['familyHash'],
        'material': 'house-consistent-live-laboratory-stripes-v1'}))
    contract['families'][family] = declared
    contract['identities']['yr']['CALAB'] = family
    meta_name = revision + '-member.json'
    payloads[meta_name] = encode(metadata)
    bundle = {'schema': 'campaign-environment-extension-v1', 'identity': family,
        'familyHash': declared['familyHash'], 'mission': mission + '.map', 'theater': theater,
        'edition': 'yr', 'revision': revision, 'members': [{'member': metadata['source']['member'],
            'manifest': meta_name, 'sha256': sha(payloads[meta_name])}],
        'acceptance': 'USER_REQUESTED_FACTION_CONSISTENCY_REPAIR_NATIVE_AND_VISUAL_REVIEW_PENDING'}
    payloads['environment-family-' + revision + '.json'] = encode(bundle)
    assert len(campaign['files']) + len(payloads) <= 256
    prior_names = {row['name'] for row in campaign['files']}
    for name, data in payloads.items():
        assert name not in prior_names
        file = directory / name
        if file.exists(): assert file.read_bytes() == data
        else: file.open('xb').write(data)
        campaign['files'].append({'name': name, 'bytes': len(data), 'sha256': sha(data),
            'route': f'/local-campaign/yr/{mission}/{name}'})
    campaign_file.write_bytes(encode(campaign)); contract_file.write_bytes(encode(contract))
    rows.append({'mission': mission + '.map', 'theater': theater, 'sourceFamily': old_family,
        'selectedFamily': family, 'selectedHash': declared['familyHash'], 'basePaintBytesUnchanged': True,
        'originalSourceQuirk': 'The original damaged CALAB/CNLAB slot has no ownership indices and paints its stripes fixed red. The user requested consistent faction coverage across damage states.',
        'nativeGeometryShadowsRubbleAndAnimationTimingUnchanged': True, 'frames': frames})
receipt = {'schema': 'yr-laboratory-faction-material-repair-v1', 'status': 'SELECTED_NATIVE_REVIEW_PENDING',
    'families': rows, 'oldPayloadsChanged': 0, 'acceptedSnowPaintAndConstructionResourcesChanged': 0,
    'userVisualAcceptance': 'PENDING'}
(root / 'docs/yr-campaign-laboratory-faction-material-20261108.json').open('xb').write(encode(receipt))
print(json.dumps({'status': receipt['status'], 'families': len(rows)}))
