"""Export the complete civilian and reuse the exact accepted fortress-wall pixels."""
import copy
import hashlib
import math
import shutil
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from final_actor_materials_batch98 import ROOT, frame as actor_frame, material
from newurban_batch89_io import logical, pin, read, sha, write

VERSION = 'v1'
REVISION = 'newurban-final-civilian-wall-batch98-v1'
destination = Path('.local/environment-packs') / REVISION
destination.mkdir()
baseline = read(ROOT / 'baseline-contract.json')
contract = copy.deepcopy(baseline)
sources = {s['member']: s for s in read(ROOT / 'source-v1.json')['sources']}
pack = dict(schema='environment-shp-pack-v1', theater='NEWURBAN', revision=REVISION,
    editions=['yr'], families={})
records = []


def atlas(folder, frames, images, density):
    sizes = [tuple(n * density for n in f['legacyRenderSize']) for f in frames]
    area = sum((w + 4) * (h + 4) for w, h in sizes)
    width = min(2048, max(256, 2 ** math.ceil(math.log2(math.sqrt(area)))))
    order = sorted(range(len(frames)), key=lambda n: (-sizes[n][1], -sizes[n][0], n))
    pages, entries, layout = [], [None] * len(frames), []
    x = y = 2
    row_height = 0

    def flush():
        height = max(py + sizes[n][1] + 2 for n, px, py in layout)
        base = np.zeros((height, width, 4), np.uint8)
        data = np.zeros_like(base)
        data[..., 3] = 255
        page_id = f'p{len(pages)}'
        for n, px, py in layout:
            b, d = images[n]
            h, w = b.shape[:2]
            padded = np.pad(b, ((2, 2), (2, 2), (0, 0)), mode='edge')
            padded[..., 3] = 0
            padded[2:h + 2, 2:w + 2] = b
            base[py - 2:py + h + 2, px - 2:px + w + 2] = padded
            data[py:py + h, px:px + w] = d
            entries[n] = dict(nativeFrame=n, page=page_id, sampleRect=[px, py, w, h],
                contentRect=[px, py, *[v * density for v in frames[n]['trimSize']]])
        target = folder / str(density) / page_id
        target.mkdir(parents=True)
        page = dict(id=page_id, size=[width, height])
        for role, pixels in [('base', base), ('data', data)]:
            file = target / (role + '.png')
            Image.fromarray(pixels).save(file)
            page.update({role: f'{density}-{page_id}-{role}.png', role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
        pages.append(page)

    for n in order:
        w, h = sizes[n]
        assert w + 4 <= width and h + 4 <= 2048
        if x + w + 2 > width:
            x, y, row_height = 2, y + row_height + 4, 0
        if y + h + 2 > 2048:
            flush()
            x = y = 2
            row_height = 0
            layout = []
        layout.append((n, x, y))
        x += w + 4
        row_height = max(row_height, h)
    flush()
    assert len(pages) <= 8
    return dict(density=density, pages=pages, frames=entries)


for name in ['civ1.shp', 'ggfwll.shp']:
    source = sources[name]
    count = 238 if name == 'civ1.shp' else 48
    descriptor = {key: copy.deepcopy(source[key]) for key in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = count
    identity = source['bindings'][0]['id']
    family = 'newurban-' + identity.lower()
    assert name not in contract['sources'] and identity not in contract['identities']['yr']
    contract['sources'][name] = descriptor
    basis = dict(theater='NEWURBAN', members={name: descriptor}, identities=[identity])
    declared = dict(members=[name], identities=[identity], editions=['yr'],
        kinds=['infantry'] if name == 'civ1.shp' else ['building', 'overlay'],
        familyHash=hashlib.sha256(__import__('json').dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    contract['families'][family] = declared
    contract['identities']['yr'][identity] = family
    folder = destination / 'members' / name.replace('.', '-')
    folder.mkdir(parents=True)
    frames = [logical(f) for f in source['frames'][:count]]
    if name == 'ggfwll.shp':
        donor = Path('.local/hd-packs/yuri-coverage-gafwll-temperate-ggfwll/c1/manifest.json')
        metadata = read(donor)
        assert metadata['source']['sha256'] == source['sha256']
        assert metadata['logical'] == dict(canvas=source['canvas'], frames=frames)
        proof = read(ROOT / 'original-donor-comparison-v1.json')['wall']
        assert proof['sourceExact'] and all(not row['differences'] and not row['ownerPixels'] for row in proof['wallColorDifferences'])
        reused = []
        for variant in metadata['variants']:
            for page in variant['pages']:
                target = folder / str(variant['density']) / page['id']
                target.mkdir(parents=True)
                for role in ['base', 'data']:
                    old = donor.parent / page[role]
                    assert sha(old) == page[role + 'Sha256']
                    new = target / (role + '.png')
                    shutil.copyfile(old, new)
                    assert sha(new) == sha(old)
                    reused.append(dict(donor=pin(old), target=str(new), sha256=sha(new)))
        metadata.update(packId='environment-newurban-gafwll', packRevision=REVISION)
        metadata['source']['theater'] = 'NEWURBAN'
        metadata['purpose'] = 'Exact accepted Yuri wall pixels; native source and all used fixed palette colors are identical. No new wall artwork.'
        record = dict(member=name, family=family, bodySlots=count, mode='EXACT_ACCEPTED_FAMILY_PIXEL_REUSE',
            originalSeparateShadowSlots=48, acceptedManifest=pin(donor), payloads=reused)
    else:
        jobs = [j for j in read(ROOT / 'mother-jobs-v2.json')['jobs'] if j['member'] == name]
        palette_file = ROOT / 'native' / (source['palette']['sha256'] + '.pal')
        palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
        materials, indices = {}, {}
        for job in jobs:
            for subject in job['subjects']:
                number = subject['slot']
                f = source['frames'][number]
                indices[number] = np.fromfile(ROOT / 'native' / f['indexFile'], np.uint8).reshape(f['size'][::-1])
                materials[number] = material(job, subject, indices[number])
        assert len(materials) == count
        variants = []
        for density in [2, 4]:
            images = {}
            for number, f in enumerate(frames):
                b, d = actor_frame(materials[number], indices[number], palette, density, source['remapable'])
                w, h = [n * density for n in f['legacyRenderSize']]
                base, data = np.zeros((h, w, 4), np.uint8), np.zeros((h, w, 4), np.uint8)
                data[..., 3] = 255
                base[:b.shape[0], :b.shape[1]], data[:d.shape[0], :d.shape[1]] = b, d
                images[number] = base, data
            variants.append(atlas(folder, frames, images, density))
        metadata = dict(schemaVersion=2, packId='environment-newurban-civ1', packRevision=REVISION,
            source=dict(kind='resolved-shp-member', member=name, theater='NEWURBAN', sha256=source['sha256']),
            logical=dict(canvas=source['canvas'], frames=frames),
            color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'), variants=variants,
            purpose='All 238 original civilian poses rebuilt from continuous generated detail, with exact native anchors, untouched separate shadows and accepted small ejected materials.')
        record = dict(member=name, family=family, bodySlots=count, mode='NEW_CONTINUOUS_BODY_WITH_ACCEPTED_SMALL_PART_MATERIAL',
            originalSeparateShadowSlots=238, frames=[materials[n]['evidence'] for n in range(count)],
            minimumActualMotherCapacity=min(materials[n]['evidence']['capacity'] for n in range(count)),
            acceptedSmallMaterials=pin('.artifacts/m2-4/urban-actors-authoring-batch62-v1/material-profile-v2.json'))
    file = folder / 'manifest.json'
    write(file, metadata)
    pack['families'][family] = dict(familyHash=declared['familyHash'],
        members=[dict(member=name, path=str(file.relative_to(destination)), sha256=sha(file))])
    records.append(record)
write(destination / 'manifest.json', pack)
contract_file = ROOT / 'civilian-wall-contract-v1.json'
write(contract_file, contract)
assembly_file = ROOT / 'civilian-wall-assembly-v1.json'
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', REVISION + '-combined',
    '--contract', str(contract_file), '--base-pointer', str(ROOT / 'baseline-selector.json'),
    '--append', str(destination), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 221 and len(assembly['appendedFamilies']) == 2
new_payloads = {file.relative_to(destination).as_posix() for file in destination.rglob('*')
    if file.is_file() and file != destination / 'manifest.json'}
protected_payloads = set(assembly['payloadHashes']) - new_payloads
contract['selectedPack'] = assembly['pack']
write(ROOT / 'civilian-wall-contract-selected-v1.json', contract)
write(ROOT / 'civilian-wall-export-v1.json', dict(status='STATIC_EXPORT_NATIVE_AND_VISUAL_PENDING',
    candidate=assembly['pack'], selectedContract=pin(ROOT / 'civilian-wall-contract-selected-v1.json'), records=records,
    inheritedFamilies=221, inheritedPayloads=len(protected_payloads), newPayloads=len(new_payloads),
    native='NOT_RUN', visual='PENDING_CIV1_ONLY_WALL_PIXELS_ALREADY_ACCEPTED', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=assembly['pack'], families=2, bodySlots=286, native='NOT_RUN', visual='PENDING'))
