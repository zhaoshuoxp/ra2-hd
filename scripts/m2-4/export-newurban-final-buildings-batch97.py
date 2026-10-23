"""Export complete native-headed building families from retained true-resolution mothers."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from newurban_batch89_io import logical, pin, read, sha, write
from newurban_batch91_materials import authored_frame
from newurban_batch97_materials import ROOT, continuous_frame, materials, stabilize_flag

VERSION = sys.argv[1] if len(sys.argv) > 1 else 'v2'
REVISION = f'newurban-environment-final-buildings-batch97-{VERSION}-combined'
source_file = ROOT / 'source-v1.json'
sources = read(source_file)['sources']
baseline = read(ROOT / 'baseline-contract.json')
selected = read('.local/environment-newurban-selection.json')
assert selected == baseline['selectedPack'] or selected in [read(file)['candidate']
    for file in ROOT.glob('export-and-preservation-v*.json')]
assert read('desktop/environment-newurban-hd-contract.json')['selectedPack'] == selected
mother, mother_rows, missing = materials()
assert not missing, missing
assert min(r['availableDensity'] for r in mother_rows) >= 4
base = Path('.local/environment-packs') / baseline['selectedPack']['revision']
assert sha(base / 'manifest.json') == baseline['selectedPack']['sha256']
destination = Path('.local/environment-packs') / REVISION
destination.mkdir(exist_ok=False)
manifest = read(base / 'manifest.json')
preserved = {}
for file in sorted(base.rglob('*')):
    if file.is_file() and file != base / 'manifest.json':
        target = destination / file.relative_to(base)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.link(file, target)
        preserved[str(file.relative_to(base))] = sha(file)
contract = copy.deepcopy(baseline)
iso = dict(member='isoubn.pal', archive='ra2md.mix/cachemd.mix',
    sha256='1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676', bytes=768)
records, originals = [], {}


def atlas(folder, frames, images, density):
    """Deduplicate identical full RGBA/auxiliary states, retaining all native indices."""
    pages, declarations, unique, shared = [], [], [], {}
    width = (max(frame['legacyRenderSize'][0] for frame in frames) * density + 4 + 3) // 4 * 4
    page_index, y, placements = 0, 2, []

    def flush():
        height = max(py + images[number][0].shape[0] + 2 for number, py in placements)
        b = np.zeros((height, width, 4), np.uint8)
        d = np.zeros_like(b)
        d[..., 3] = 255
        for number, py in placements:
            body, data = images[number]
            h, w = body.shape[:2]
            if not w or not h:
                continue
            padded = np.pad(body, ((2, 2), (2, 2), (0, 0)), mode='edge')
            padded[..., 3] = 0
            padded[2:h + 2, 2:w + 2] = body
            b[py - 2:py + h + 2, :w + 4] = padded
            d[py:py + h, 2:w + 2] = data
        directory = folder / str(density) / f'p{page_index}'
        directory.mkdir(parents=True)
        page = dict(id=f'p{page_index}', size=[width, height])
        for role, pixels in [('base', b), ('data', d)]:
            file = directory / (role + '.png')
            Image.fromarray(pixels).save(file)
            page.update({role: f'{density}-p{page_index}-{role}.png', role + 'Sha256': sha(file),
                role + 'Bytes': file.stat().st_size})
        pages.append(page)

    for number, frame in enumerate(frames):
        body, data = images[number]
        h, w = body.shape[:2]
        assert w + 4 <= 2048 and h + 4 <= 2048
        key = body.shape, hashlib.sha256(body.tobytes() + data.tobytes()).hexdigest(), frame['empty']
        if key in shared:
            previous = declarations[shared[key]]
            declarations.append(dict(previous, nativeFrame=number, sharedWith=shared[key]))
            continue
        shared[key] = number
        if y + h + 2 > 2048:
            flush()
            page_index, y, placements = page_index + 1, 2, []
        declarations.append(dict(nativeFrame=number, page=f'p{page_index}', sampleRect=[2, y, w, h],
            contentRect=[2, y, *[n * density for n in frame['trimSize']]]))
        placements.append((number, y))
        y += h + 4
    flush()
    assert len(pages) <= 8
    return dict(density=density, pages=pages, frames=declarations)


for source in sources:
    name = source['member']
    linked = name == 'cgslab_f.shp'
    count = source['totalFrames'] // (2 if source['hasShadow'] else 1)
    frames = [logical(frame) for frame in source['frames'][:count]]
    descriptor = {key: copy.deepcopy(source[key]) for key in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor.update(bodyFrames=count, framePalettes={str(slot): dict(**source['palette'],
        role='linked' if linked else 'body', remapable=source['remapable'], runtimeUsed=True) for slot in range(count)})
    if not linked and count == 4:
        descriptor['framePalettes']['3'] = dict(**iso, role='rubble', remapable=False, runtimeUsed=True)
    ids = sorted({b['id'] for b in source['bindings']})
    assert len(ids) == 1
    family = 'newurban-' + ids[0].lower()
    assert name not in contract['sources']
    contract['sources'][name] = descriptor
    folder = destination / 'members' / name.replace('.', '-').replace('_', '-')
    folder.mkdir(parents=True)
    row = dict(member=name, sourceSha256=source['sha256'], family=family,
        bodySlots=count, originalSeparateShadowSlots=source['totalFrames'] - count,
        compatibilityOnlySlots=list(range(16, 32)) if linked else [], frames=[])
    variants, coverage = [], {}
    for density in [2, 4]:
        images = {}
        by_native = {}
        for slot, frame in enumerate(source['frames'][:count]):
            index_file = ROOT / 'native' / frame['indexFile']
            assert sha(index_file) == frame['indexSha256']
            indices = np.fromfile(index_file, np.uint8).reshape(frame['size'][::-1])
            palette_info = iso if not linked and slot == 3 else source['palette']
            palette_file = ROOT / 'native' / (palette_info['sha256'] + '.pal')
            assert sha(palette_file) == palette_info['sha256']
            originals[str(index_file)] = pin(index_file)
            originals[str(palette_file)] = pin(palette_file)
            palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.uint16) * 4
            width, height = [n * density for n in frames[slot]['legacyRenderSize']]
            body, data = np.zeros((height, width, 4), np.uint8), np.zeros((height, width, 4), np.uint8)
            data[..., 3] = 255
            key = frame['indexSha256'], tuple(frame['size']), palette_info['sha256']
            if key in by_native:
                body, data = [value.copy() for value in images[by_native[key]]]
                detail = dict(policy='BYTE_IDENTICAL_NATIVE_STATE_REUSES_SAME_AUTHORED_RGBA_PAIR',
                    sharedNativeSlot=by_native[key], nativeRgbBodyPixelsCopied=0)
            elif linked and slot >= 16:
                # The original loop is [0, 16); preserve all unused trailing source data.
                rgba = np.dstack((palette[indices], (indices != 0).astype(np.uint8) * 255)).astype(np.uint8)
                body[:indices.shape[0] * density, :indices.shape[1] * density] = rgba.repeat(density, 0).repeat(density, 1)
                detail = dict(policy='ORIGINAL_UNUSED_TRAILING_COMPATIBILITY_SLOT_NO_HD_CREDIT',
                    nativeLoopStart=0, nativeLoopEndExclusive=16, sourceFrame=slot)
            else:
                material = mother[name, slot]
                b, d, detail = continuous_frame(material, indices, palette, density,
                    remapable=source['remapable'] and not (not linked and slot == 3),
                    authored_owner=name == 'cnla05.shp' and slot in [0, 2])
                body[:b.shape[0], :b.shape[1]], data[:d.shape[0], :d.shape[1]] = b, d
                detail.update(mother=material['mother'], actualAvailableDensity=material['availableDensity'])
                coverage[str(slot)] = dict(schema='registered-authored-sprite-coverage-v1',
                    sourceSha256=source['sha256'], sourceIndexSha256=frame['indexSha256'],
                    mother=material['mother'], logicalBounds=frame['size'], nativeOrigin=frame['origin'],
                    alphaCutoff=180, pixelMaskPolicy='Continuous authored contours and uniform frame tone, with bounded original owner semantics. Native dark architecture cells are not pasted over HD surfaces. Native RGB supplies no new surface detail.',
                    unchanged='Native canvas, trim, separate shadows, timing, source bytes, collision and gameplay.')
                by_native[key] = slot
            images[slot] = body, data
            row['frames'].append(dict(slot=slot, density=density, **detail))
        if linked:
            row.setdefault('fixedPoleRegistration', []).append(stabilize_flag(images, source, density))
        variants.append(atlas(folder, frames, images, density))
    metadata = dict(schemaVersion=2, packId='environment-' + name.replace('.', '-').replace('_', '-'),
        packRevision=REVISION, source=dict(member=name, sha256=source['sha256'], theater='NEWURBAN', kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=frames),
        color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data', authoredFrameCoverage=coverage),
        variants=variants, authored=dict(batch97Source=pin(source_file), motherJobs=pin(ROOT / 'mother-jobs-v3.json'),
            originalRgbUsedAsNewDetail=False, targetNativeHeadersAuthoritative=True,
            acceptedSnowStructuralEdit=name in {'cnbunk03.shp', 'cnbunk04.shp', 'cnrus08.shp', 'cnrus10.shp'},
            linkedOriginalUnusedSlots=list(range(16, 32)) if linked else []))
    file = folder / 'manifest.json'
    write(file, metadata)
    row['metadata'] = pin(file)
    records.append(row)

for identity in sorted({b['id'] for s in sources for b in s['bindings']}):
    names = sorted(s['member'] for s in sources if any(b['id'] == identity for b in s['bindings']))
    family = 'newurban-' + identity.lower()
    assert family not in contract['families'] and identity not in contract['identities']['yr']
    basis = dict(theater='NEWURBAN', members={name: contract['sources'][name] for name in names}, identities=[identity])
    definition = dict(members=names, identities=[identity], editions=['yr'], kinds=['building'],
        familyHash=hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest())
    contract['families'][family] = definition
    contract['identities']['yr'][identity] = family
    manifest['families'][family] = dict(familyHash=definition['familyHash'], members=[dict(member=row['member'],
        path=str(Path(row['metadata']['file']).relative_to(destination)), sha256=row['metadata']['sha256'])
        for row in records if row['member'] in names])
manifest['revision'] = REVISION
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=REVISION, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = candidate
contract['extensions']['newurbanFinalBuildingsBatch97'] = dict(source=pin(source_file),
    completeFamilies=13, sourceMembers=14, newMothers=21, inheritedSnowStructuralEdits=4,
    actualMinimumMotherDensity=min(r['availableDensity'] for r in mother_rows))
write(ROOT / f'contract-candidate-{VERSION}.json', contract)
write(ROOT / f'export-and-preservation-{VERSION}.json', dict(status='EXPORTED_13_COMPLETE_BUILDING_FAMILIES_NOT_SELECTED',
    baseline=baseline['selectedPack'], candidate=candidate, completeFamilies=13, sourceMembers=14,
    sourceDensitySlots=sum(r['bodySlots'] for r in records) * 2,
    originalSeparateShadowSlots=sum(r['originalSeparateShadowSlots'] for r in records),
    unusedOriginalCompatibilitySlots=16, motherRows=mother_rows, records=records,
    unchangedPriorFamilies=len(baseline['families']), preservedPayloadHashes=preserved,
    originalFiles=list(originals.values()), native='NOT_RUN', visual='PENDING_CONSOLIDATED_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(candidate=candidate, families=13, members=14, densitySlots=sum(r['bodySlots'] for r in records) * 2,
    minimumMotherDensity=min(r['availableDensity'] for r in mother_rows)))
