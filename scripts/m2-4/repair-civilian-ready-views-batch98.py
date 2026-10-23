"""Replace only three incorrect Ready views; preserve the other 235 body crops exactly."""
import copy
import json
import shutil
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from final_actor_materials_batch98 import ROOT, material, frame as actor_frame
from newurban_batch89_io import pin, read, sha, write

revision = 'newurban-final-civilian-wall-batch98-v2'
old = read(ROOT / 'civilian-wall-export-v1.json')
old_append = Path('.local/environment-packs/newurban-final-civilian-wall-batch98-v1')
new_append = Path('.local/environment-packs') / revision
new_append.mkdir()
for file in old_append.rglob('*'):
    if file.is_file():
        target = new_append / file.relative_to(old_append)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
pack = read(new_append / 'manifest.json')
pack['revision'] = revision
source = next(s for s in read(ROOT / 'source-v1.json')['sources'] if s['member'] == 'civ1.shp')
palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
job = read(ROOT / 'civilian-ready-repair-jobs-v1.json')['jobs'][0]
replacements = {}
for subject in job['subjects']:
    number = subject['slot']
    frame = source['frames'][number]
    indices = np.fromfile(ROOT / 'native' / frame['indexFile'], np.uint8).reshape(frame['size'][::-1])
    replacements[number] = material(job, subject, indices), indices
changed = []
for family, binding in pack['families'].items():
    for member in binding['members']:
        file = new_append / member['path']
        metadata = read(file)
        metadata['packRevision'] = revision
        if member['member'] == 'civ1.shp':
            for variant in metadata['variants']:
                density = variant['density']
                for page in variant['pages']:
                    target = file.parent / str(density) / page['id'] / 'base.png'
                    pixels = np.array(Image.open(target).convert('RGBA'))
                    before = pixels.copy()
                    allowed = np.zeros(pixels.shape[:2], bool)
                    for descriptor in variant['frames']:
                        number = descriptor['nativeFrame']
                        if number not in replacements or descriptor['page'] != page['id']:
                            continue
                        guide, indices = replacements[number]
                        body, data = actor_frame(guide, indices, palette, density, source['remapable'])
                        x, y, width, height = descriptor['sampleRect']
                        padded_body = np.zeros((height, width, 4), np.uint8)
                        padded_body[:body.shape[0], :body.shape[1]] = body
                        gutter = np.pad(padded_body, ((2, 2), (2, 2), (0, 0)), mode='edge')
                        gutter[..., 3] = 0
                        gutter[2:height + 2, 2:width + 2] = padded_body
                        pixels[y - 2:y + height + 2, x - 2:x + width + 2] = gutter
                        allowed[y - 2:y + height + 2, x - 2:x + width + 2] = True
                        changed.append(dict(slot=number, density=density, mother=guide['evidence']))
                    assert np.array_equal(pixels[~allowed], before[~allowed])
                    Image.fromarray(pixels).save(target)
                    page['baseSha256'], page['baseBytes'] = sha(target), target.stat().st_size
            metadata['readyViewRepair'] = dict(slots=[0, 1, 5], acceptedRig=job['acceptedRigSource'],
                policy='Retain the exact native Ready facing order. The accepted rig supplies camera and posture guidance only; body RGB and continuous contours are new CIV1 material.')
        file.write_text(json.dumps(metadata, indent=2) + '\n')
        member['sha256'] = sha(file)
(new_append / 'manifest.json').write_text(json.dumps(pack, indent=2) + '\n')
assert sorted((r['slot'], r['density']) for r in changed) == [(n, d) for n in [0, 1, 5] for d in [2, 4]]
contract = read(ROOT / 'civilian-wall-contract-selected-v1.json')
assert read('desktop/environment-newurban-hd-contract.json') == contract
write(ROOT / 'civilian-wall-contract-v2.json', contract)
assembly_file = ROOT / 'civilian-wall-assembly-v2.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', revision + '-combined',
    '--contract', str(ROOT / 'civilian-wall-contract-v2.json'), '--base-pointer', str(ROOT / 'baseline-selector.json'),
    '--append', str(new_append), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
prior_audit = read(ROOT / 'civilian-wall-static-audit-v2.json')
assert all(assembly['payloadHashes'][p['relative']] == p['sha256'] for p in prior_audit['preserved'])
old_meta = read(old_append / pack['families']['newurban-civ1']['members'][0]['path'])
new_meta = read(new_append / pack['families']['newurban-civ1']['members'][0]['path'])
preserved_crops = 0
for variant in new_meta['variants']:
    old_variant = next(v for v in old_meta['variants'] if v['density'] == variant['density'])
    for page in variant['pages']:
        file = new_append / 'members/civ1-shp' / str(variant['density']) / page['id'] / 'base.png'
        old_file = old_append / 'members/civ1-shp' / str(variant['density']) / page['id'] / 'base.png'
        current, previous = np.array(Image.open(file)), np.array(Image.open(old_file))
        for frame in variant['frames']:
            if frame['page'] != page['id'] or frame['nativeFrame'] in replacements:
                continue
            x, y, w, h = frame['sampleRect']
            assert np.array_equal(current[y:y + h, x:x + w], previous[y:y + h, x:x + w])
            preserved_crops += 1
        data_file = file.with_name('data.png')
        assert sha(data_file) == sha(old_file.with_name('data.png'))
assert preserved_crops == 470
contract['selectedPack'] = assembly['pack']
write(ROOT / 'civilian-wall-contract-selected-v2.json', contract)
report = copy.deepcopy(old)
report.update(candidate=assembly['pack'], selectedContract=pin(ROOT / 'civilian-wall-contract-selected-v2.json'),
    inheritedPayloads=len(prior_audit['preserved']), newPayloads=10,
    repair=dict(changed=changed, unchangedDensityCrops=470, allWallPixelsExact=True,
        rejectedSource=pin(ROOT / 'civilian-wall-export-v1.json'), native='NOT_RUN', visual='PENDING'))
write(ROOT / 'civilian-wall-export-v2.json', report)
Path('desktop/environment-newurban-hd-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/environment-newurban-selection.json').write_text(json.dumps(assembly['pack'], indent=2) + '\n')
write(ROOT / 'civilian-wall-selection-v2.json', dict(status='SELECTED_FOR_NATIVE_REVIEW',
    candidate=assembly['pack'], contract=pin('desktop/environment-newurban-hd-contract.json'),
    inheritedPayloadEvidence=pin(ROOT / 'civilian-wall-static-audit-v2.json'), repair=pin(ROOT / 'civilian-wall-export-v2.json'),
    native='NOT_RUN', visual='PENDING_CIV1_ONLY', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=assembly['pack'], changedReadyViews=3, exactOtherDensityCrops=470, newWallArt=0))
