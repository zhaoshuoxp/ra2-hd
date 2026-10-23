"""Append all used T-Rex poses without crediting unused native compatibility slots."""
import copy
import hashlib
import json
import math
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from final_actor_materials_batch98 import ROOT, frame as actor_frame, material
from newurban_batch89_io import logical, pin, read, sha, write

VERSION = 'v4'
REVISION = 'newurban-final-actors-batch98-' + VERSION
destination = Path('.local/environment-packs') / REVISION
destination.mkdir()
source, = [s for s in read(ROOT / 'source-v1.json')['sources'] if s['member'] == 'dnoa.shp']
assert source['sha256'] == 'f2ae766af30316eb86135cc2ba87c890238f0f43526567f041e2d6a6cad6f7fe'
assert source['totalFrames'] == 424 and not source['hasShadow']
contract = copy.deepcopy(read(ROOT / 'civilian-wall-contract-selected-v2.json'))
descriptor = {key: copy.deepcopy(source[key]) for key in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
descriptor['bodyFrames'] = 424
family = 'newurban-dnoa'
basis = dict(theater='NEWURBAN', members={'dnoa.shp': descriptor}, identities=['DNOA'])
declared = dict(members=['dnoa.shp'], identities=['DNOA'], editions=['yr'], kinds=['infantry'],
    familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
assert 'dnoa.shp' not in contract['sources'] and 'DNOA' not in contract['identities']['yr']
contract['sources']['dnoa.shp'] = descriptor
contract['families'][family] = declared
contract['identities']['yr']['DNOA'] = family
folder = destination / 'members/dnoa-shp'
folder.mkdir(parents=True)
frames = [logical(f) for f in source['frames']]
palette = np.fromfile(ROOT / 'native' / (source['palette']['sha256'] + '.pal'), np.uint8).reshape(256, 3).astype(np.uint16) * 4
jobs = read(ROOT / 'dinosaur-filled-jobs-v4.json')['jobs']
assert len(jobs) == 49
materials, indices = {}, {}
for number, f in enumerate(source['frames']):
    indices[number] = np.fromfile(ROOT / 'native' / f['indexFile'], np.uint8).reshape(f['size'][::-1])
for job in jobs:
    for subject in job['subjects']:
        number = subject['slot']
        assert number not in materials and 0 <= number < 212
        materials[number] = material(job, subject, indices[number])
assert set(materials) == set(range(212))


def atlas(images, density):
    sizes = [tuple(n * density for n in f['legacyRenderSize']) for f in frames]
    area = sum((w + 4) * (h + 4) for w, h in sizes)
    width = min(2048, max(256, 2 ** math.ceil(math.log2(math.sqrt(area)))))
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
            padded = np.pad(b, ((2, 2), (2, 2), (0, 0)), mode='edge' if w and h else 'constant')
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

    for n in sorted(range(len(frames)), key=lambda n: (-sizes[n][1], -sizes[n][0], n)):
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
    assert len(pages) <= (10 if density == 4 else 8)
    return dict(density=density, pages=pages, frames=entries)


variants, compatibility = [], []
for density in [2, 4]:
    images = {}
    for number, f in enumerate(frames):
        if number < 212:
            b, d = actor_frame(materials[number], indices[number], palette, density, source['remapable'])
        else:
            # TrexSequence never reaches these physical source slots. Retain their
            # exact indexed appearance as explicitly uncredited compatibility data.
            ix = indices[number]
            b = np.dstack((palette[ix].astype(np.uint8), np.uint8(ix != 0) * 255)).repeat(density, 0).repeat(density, 1)
            d = np.zeros_like(b)
            d[..., 3] = 255
            if source['remapable']:
                owner = ((ix >= 16) & (ix <= 31)).repeat(density, 0).repeat(density, 1)
                shades = np.uint8(np.maximum(ix.astype(int) - 16, 0)).repeat(density, 0).repeat(density, 1)
                d[..., 0] = owner * 255
                d[..., 1] = np.where(owner, shades, 0)
            b[..., :3][b[..., 3] == 0] = 0
            if density == 2:
                compatibility.append(dict(nativeFrame=number, nativeIndex=pin(ROOT / 'native' / source['frames'][number]['indexFile']),
                    empty=f['empty'], runtimeSequenceReferenced=False, hdArtworkCredit=False))
        w, h = [n * density for n in f['legacyRenderSize']]
        base, data = np.zeros((h, w, 4), np.uint8), np.zeros((h, w, 4), np.uint8)
        data[..., 3] = 255
        base[:b.shape[0], :b.shape[1]], data[:d.shape[0], :d.shape[1]] = b, d
        images[number] = base, data
    variants.append(atlas(images, density))
    print(dict(density=density, pages=len(variants[-1]['pages']), slots=len(images)), flush=True)

metadata = dict(schemaVersion=2, packId='environment-newurban-dnoa', packRevision=REVISION,
    source=dict(kind='resolved-shp-member', member=source['member'], theater='NEWURBAN', sha256=source['sha256']),
    logical=dict(canvas=source['canvas'], frames=frames),
    color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'), variants=variants,
    provenance=dict(authoredNativeFrames=[0, 211], unusedNativeCompatibilityFrames=[212, 423],
        compatibilityHdArtworkCredit=False, sourceSequence='TrexSequence'),
    purpose='All 212 native sequence poses rebuilt from continuous authored detail. Untouched NoShadow, anchors, owner regions and sequence timing; 212 unused physical slots are uncredited original compatibility data.')
file = folder / 'manifest.json'
write(file, metadata)
pack = dict(schema='environment-shp-pack-v1', theater='NEWURBAN', revision=REVISION, editions=['yr'],
    families={family: dict(familyHash=declared['familyHash'],
        members=[dict(member=source['member'], path=str(file.relative_to(destination)), sha256=sha(file))])})
write(destination / 'manifest.json', pack)
contract_file = ROOT / ('final-actors-contract-' + VERSION + '.json')
write(contract_file, contract)
base_pointer = ROOT / ('dinosaur-base-pointer-' + VERSION + '.json')
write(base_pointer, contract['selectedPack'])
assembly_file = ROOT / ('final-actors-assembly-' + VERSION + '.json')
subprocess.run(['python3', 'scripts/m2/official-maps/combine-environment.py', REVISION + '-combined',
    '--contract', str(contract_file), '--base-pointer', str(base_pointer),
    '--append', str(destination), '--receipt', str(assembly_file)], check=True)
assembly = read(assembly_file)
assert len(assembly['preservedFamilies']) == 223 and len(assembly['appendedFamilies']) == 1
contract['selectedPack'] = assembly['pack']
write(ROOT / ('final-actors-contract-selected-' + VERSION + '.json'), contract)
write(ROOT / ('dinosaur-export-' + VERSION + '.json'), dict(status='STATIC_EXPORT_NATIVE_AND_VISUAL_PENDING',
    candidate=assembly['pack'], selectedContract=pin(ROOT / ('final-actors-contract-selected-' + VERSION + '.json')),
    authoredPoses=212, densityFrames=424, physicalSlots=424, unusedUncreditedCompatibilitySlots=212,
    frames=[materials[n]['evidence'] for n in range(212)], compatibility=compatibility,
    minimumActualMotherCapacity=min(materials[n]['evidence']['capacity'] for n in range(212)),
    inheritedFamilies=223, native='NOT_RUN', visual='PENDING_CIV1_AND_DNOA', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=assembly['pack'], families=len(contract['families']), native='NOT_RUN', visual='PENDING'))
