"""Select only a complete new pair after preserving every inherited payload hash."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch89_io import logical, pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
exported = read(ROOT / 'civilian-wall-export-v1.json')
contract_file = ROOT / 'civilian-wall-contract-selected-v1.json'
contract = read(contract_file)
baseline = read(ROOT / 'baseline-contract.json')
assert read('desktop/environment-newurban-hd-contract.json') == baseline
assert read('.local/environment-newurban-selection.json') == read(ROOT / 'baseline-selector.json') == baseline['selectedPack']
folder = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(folder / 'manifest.json') == contract['selectedPack']['sha256'] == exported['candidate']['sha256']
pack = read(folder / 'manifest.json')
prior_folder = Path('.local/environment-packs') / baseline['selectedPack']['revision']
prior = read(prior_folder / 'manifest.json')
preserved = []
for identity, family in prior['families'].items():
    assert pack['families'][identity] == family
for file in prior_folder.rglob('*'):
    if file.is_file() and file != prior_folder / 'manifest.json':
        target = folder / file.relative_to(prior_folder)
        assert sha(target) == sha(file)
        preserved.append(dict(relative=str(file.relative_to(prior_folder)), sha256=sha(file), bytes=file.stat().st_size))
assert len(prior['families']) == 221 and preserved
assert all(contract[key] == baseline[key] for key in ['schema', 'theater', 'editions', 'aliases'] if key in baseline)
for key in ['sources', 'families']:
    assert all(contract[key][name] == value for name, value in baseline[key].items())
assert all(contract['identities'][edition][name] == value for edition, identities in baseline['identities'].items()
    for name, value in identities.items())
assert set(pack['families']) - set(prior['families']) == {'newurban-civ1', 'newurban-gafwll'}
sources = {s['member']: s for s in read(ROOT / 'source-v1.json')['sources']}
new_files = []
for family in ['newurban-civ1', 'newurban-gafwll']:
    row = pack['families'][family]
    for member in row['members']:
        source = sources[member['member']]
        metadata_file = folder / member['path']
        assert sha(metadata_file) == member['sha256']
        metadata = read(metadata_file)
        count = contract['sources'][member['member']]['bodyFrames']
        assert metadata['logical'] == dict(canvas=source['canvas'], frames=[logical(f) for f in source['frames'][:count]])
        assert [v['density'] for v in metadata['variants']] == [2, 4]
        for variant in metadata['variants']:
            assert len(variant['frames']) == count
            assert sorted(f['nativeFrame'] for f in variant['frames']) == list(range(count))
            for page in variant['pages']:
                for role in ['base', 'data']:
                    file = metadata_file.parent / str(variant['density']) / page['id'] / (role + '.png')
                    assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
                    pixels = np.array(Image.open(file).convert('RGBA'))
                    assert list(pixels.shape[:2][::-1]) == page['size']
                    if role == 'data':
                        assert not pixels[..., :3].any() and np.all(pixels[..., 3] == 255)
        new_files.extend(pin(file) for file in metadata_file.parent.rglob('*') if file.is_file())
assembly = read(ROOT / 'civilian-wall-assembly-v1.json')
assert len(new_files) + len(preserved) == len(assembly['payloadHashes'])
audit = dict(status='PASS_286_NATIVE_SLOTS_BOTH_DENSITIES_AND_EXACT_ACCEPTED_REUSE',
    selectedContract=pin(contract_file), candidate=contract['selectedPack'],
    preservedFamilies=221, preservedPayloads=len(preserved), preserved=preserved,
    newPayloads=new_files, civilianMotherAudit=pin(ROOT / 'civilian-mother-capacity-v1.json'),
    wallReuseAudit=pin(ROOT / 'original-donor-comparison-v1.json'),
    accountingCorrection=dict(originalReceipt=pin(ROOT / 'civilian-wall-export-v1.json'),
        incorrectlyReportedInheritedPayloads=exported['inheritedPayloads'], correctedInheritedPayloads=len(preserved),
        reason='The first receipt subtracted member count instead of complete new payload count. No pixels, manifests, selections or original inputs changed.',
        firstRecipe=pin(ROOT / 'civilian-wall-first-run-recipe-v1.py')),
    native='NOT_RUN', visual='PENDING_CIV1_ONLY', windows='NOT_RUN', m24Complete=False)
write(ROOT / 'civilian-wall-static-audit-v2.json', audit)
Path('desktop/environment-newurban-hd-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/environment-newurban-selection.json').write_text(json.dumps(contract['selectedPack'], indent=2) + '\n')
write(ROOT / 'civilian-wall-selection-v1.json', dict(status='SELECTED_FOR_NATIVE_REVIEW',
    candidate=contract['selectedPack'], contract=pin('desktop/environment-newurban-hd-contract.json'),
    audit=pin(ROOT / 'civilian-wall-static-audit-v2.json'), priorContract=pin(ROOT / 'baseline-contract.json'),
    priorSelector=pin(ROOT / 'baseline-selector.json'), native='NOT_RUN', visual='PENDING_CIV1_ONLY', m24Complete=False))
print(dict(candidate=contract['selectedPack'], preservedFamilies=221, preservedPayloads=len(preserved), newPayloads=len(new_files)))
