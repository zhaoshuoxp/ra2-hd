"""Validate the complete final actor append and select only its isolated resources."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from final_actor_materials_batch98 import ROOT
from newurban_batch89_io import logical, pin, read, sha, write

prior = read(ROOT / 'civilian-wall-contract-selected-v2.json')
contract_file = ROOT / 'final-actors-contract-selected-v4.json'
contract = read(contract_file)
assert read('desktop/environment-newurban-hd-contract.json') == prior
assert read('.local/environment-newurban-selection.json') == prior['selectedPack']
folder = Path('.local/environment-packs') / contract['selectedPack']['revision']
prior_folder = Path('.local/environment-packs') / prior['selectedPack']['revision']
pack, previous = read(folder / 'manifest.json'), read(prior_folder / 'manifest.json')
assert sha(folder / 'manifest.json') == contract['selectedPack']['sha256']
assert len(pack['families']) == 224 and len(previous['families']) == 223
assert set(pack['families']) - set(previous['families']) == {'newurban-dnoa'}
assert all(pack['families'][key] == value for key, value in previous['families'].items())
preserved = []
for file in sorted(prior_folder.rglob('*')):
    if not file.is_file() or file == prior_folder / 'manifest.json':
        continue
    target = folder / file.relative_to(prior_folder)
    assert sha(target) == sha(file)
    preserved.append(dict(relative=str(file.relative_to(prior_folder)), sha256=sha(file), bytes=file.stat().st_size))
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in prior[key].items())
assert all(contract['identities'][edition][name] == value for edition, identities in prior['identities'].items()
    for name, value in identities.items())
source, = [s for s in read(ROOT / 'source-v1.json')['sources'] if s['member'] == 'dnoa.shp']
member, = pack['families']['newurban-dnoa']['members']
metadata_file = folder / member['path']
metadata = read(metadata_file)
assert sha(metadata_file) == member['sha256']
assert metadata['logical'] == dict(canvas=source['canvas'], frames=[logical(f) for f in source['frames']])
assert metadata['provenance']['authoredNativeFrames'] == [0, 211]
assert metadata['provenance']['unusedNativeCompatibilityFrames'] == [212, 423]
assert metadata['provenance']['compatibilityHdArtworkCredit'] is False
assert [v['density'] for v in metadata['variants']] == [2, 4]
pages = []
for variant in metadata['variants']:
    assert len(variant['frames']) == 424
    assert sorted(f['nativeFrame'] for f in variant['frames']) == list(range(424))
    assert len(variant['pages']) <= (10 if variant['density'] == 4 else 8)
    for page in variant['pages']:
        for role in ['base', 'data']:
            file = metadata_file.parent / str(variant['density']) / page['id'] / (role + '.png')
            assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
            with Image.open(file) as im:
                assert list(im.size) == page['size']
                pixels = np.asarray(im.convert('RGBA'))
                if role == 'data':
                    assert not pixels[..., 2].any() and np.all(pixels[..., 1] <= 15) and np.all(pixels[..., 3] == 255)
            pages.append(pin(file))
capacity = read(ROOT / 'dinosaur-mother-capacity-v5.json')
assert capacity['status'] == 'PASS_ALL_212_ACTUAL_POSE_CROPS' and capacity['minimumCapacity'] >= 4
repair = read(ROOT / 'civilian-ready-repair-material-audit-v1.json')
write(ROOT / 'final-actors-static-audit-v4.json', dict(status='PASS_224_COMPLETE_FAMILIES_WITH_EXPLICIT_UNUSED_COMPATIBILITY',
    selectedContract=pin(contract_file), candidate=contract['selectedPack'], preservedFamilies=223,
    preservedPayloads=len(preserved), preserved=preserved, dinosaurPayloads=pages,
    dinosaurAuthoredPoses=212, unusedUncreditedSlots=212, dinosaurMotherCapacity=pin(ROOT / 'dinosaur-mother-capacity-v5.json'),
    civilianReadyRepair=pin(ROOT / 'civilian-ready-repair-material-audit-v1.json'),
    native='NOT_RUN', visual='PENDING_CIV1_AND_DNOA', windows='NOT_RUN', m24Complete=False))
Path('desktop/environment-newurban-hd-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/environment-newurban-selection.json').write_text(json.dumps(contract['selectedPack'], indent=2) + '\n')
print(dict(selected=contract['selectedPack'], families=224, preservedPayloads=len(preserved), newPayloads=len(pages) + 1))
