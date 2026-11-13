"""Export new source-pinned YR families with continuous authored body contours."""
import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from pyramid_art import read_spec as pyramid_spec, render as render_pyramid
from bridge_cables import render_cables
from owner_paint import owner_paint_declaration, owner_red_candidates, limit_owner_region

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_body_reuse import accepted_body_frames
from scenery_art import authored_scenery

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
assert re.fullmatch(r'[a-zA-Z0-9.-]+', args.revision), 'Use the runtime metadata revision alphabet'
stage = args.stage.resolve()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
write = lambda file, value: file.write_text(json.dumps(value, indent=2) + '\n')
original = read(stage / 'prepared/source.json')
assert original['edition'] == 'yr'
prepared, contract = read(stage / 'preparation.json'), read(stage / 'contract.json')
family, declared = next(iter(contract['families'].items()))
assert len(contract['families']) == 1 and declared['editions'] == ['yr']
masters = {}
for item in prepared.get('stages', [dict(preparation=prepared)]):
    receipt = item['preparation']
    assert receipt['userVisualAcceptance'] == 'PENDING'
    for row in receipt['masters']:
        masters[receipt['sourceSha256'], row['slot']] = row
profile = read(stage / 'material-profile.json')
bridge_cables = None
if profile.get('sourcePinnedBridgeCables'):
    reference = profile['sourcePinnedBridgeCables']
    cable_file = Path(reference['file'])
    assert sha(cable_file) == reference['sha256']
    bridge_cables = read(cable_file)
    assert bridge_cables['missionSha256'] == original['missionSha256']
markers = profile.get('nativePaletteMarkerFrames', {})
scenery = profile.get('sourcePinnedAuthoredScenery', {})
accepted = accepted_body_frames(profile, {source['member']: source for source in original['sources']})
pack_root = stage / 'pack'
pack_root.mkdir(exist_ok=False)
members, checks, allocation = [], [], {2: 0, 4: 0}


def classify_paint(rgba, indices, palette, density, remapable, declaration=None):
    """Follow authored paint contours and the nearest original material identity."""
    owner = (indices >= 16) & (indices <= 31)
    red, green, blue = [rgba[..., channel].astype(float) for channel in range(3)]
    paint = (rgba[..., 3] > 0) & (red > 35) & (red > green * 1.5) & (red > blue * 1.5)
    paint &= green - blue < (red - blue) * .25
    if declaration:
        paint &= owner_red_candidates(rgba, declaration)
    if not remapable or not owner.any():
        return np.zeros_like(paint)
    native = palette[indices]
    r, g, b = [native[..., channel] for channel in range(3)]
    neutral = (r > 35) & (r > g * 1.5) & (r > b * 1.5) & (g - b < (r - b) * .25) & ~owner
    if neutral.any():
        house = np.argwhere(owner).astype(float) + .5
        fixed = np.argwhere(neutral).astype(float) + .5
        pixels = np.argwhere(paint)
        for offset in range(0, len(pixels), 256):
            block = pixels[offset:offset + 256]
            points = (block.astype(float) + .5) / density
            a = ((points[:, None] - house[None]) ** 2).sum(2).min(1)
            b = ((points[:, None] - fixed[None]) ** 2).sum(2).min(1)
            paint[block[:, 0], block[:, 1]] = a < b
    if declaration:
        paint = limit_owner_region(paint, indices, density, declaration)
    assert paint.any(), 'Original house paint requires authored material'
    return paint


for source in original['sources']:
    name = source['member']
    assert name in declared['members'] and source['bindings']
    if name in scenery:
        allowed = ['terrain']
        if source['identity'] in ['TROCK03', 'SROCK05'] and source.get('nativeObjectType') == 4:
            allowed.append('overlay')
        assert all(binding['kind'] in allowed for binding in source['bindings'])
    else:
        assert all(binding['kind'] == 'building' for binding in source['bindings'])
    assert contract['sources'][name]['sha256'] == source['sha256']
    folder = pack_root / 'members' / name.replace('.', '-')
    folder.mkdir(parents=True)
    logical = [dict(nativeFrame=frame['slot'], trimOrigin=frame['origin'], trimSize=frame['size'],
        legacyRenderSize=[value + value % 2 for value in frame['size']], empty=frame['empty'])
        for frame in source['frames'][:source['bodyFrames']]]
    details, canonical, scenery_proof = {}, {}, None
    architecture = profile.get('sourcePinnedPyramid', {}).get(name)
    pyramid = pyramid_spec(architecture, source) if architecture else None
    for frame in source['frames'][:source['bodyFrames']]:
        slot = frame['slot']
        if pyramid and slot < 3:
            checks.append(dict(member=name, frame=slot, architecture=architecture,
                independentDensityCapacity=pyramid['independentPaintCapacity'],
                representation='Original projected vector masonry with independently authored HD damage.'))
            continue
        if (slot, 2) in accepted.get(name, {}):
            continue
        if str(slot) in markers.get(name, {}).get('frames', {}):
            assert frame['indexSha256'] == markers[name]['frames'][str(slot)]
            assert source.get('bindingRole') == 'ACTIVE'
            assert int(source['nativeArt']['LoopCount']) == -1 and slot >= int(source['nativeArt']['LoopEnd'])
            continue
        palette = source.get('framePalettes', {}).get(str(slot), source['palette'])
        signature = (frame['indexSha256'], *frame['size'], palette['sha256'],
            palette.get('remapable', source['remapable']))
        if signature in canonical:
            details[slot] = details[canonical[signature]]
            continue
        canonical[signature] = slot
        master = masters[source['sha256'], slot]
        file = Path(master['file'])
        assert sha(file) == master['sha256']
        image = Image.open(file).convert('RGBA')
        # Ignore invisible encoder residue when measuring the authored subject.
        bounds = image.getchannel('A').point(lambda value: 255 if value >= 4 else 0).getbbox()
        assert bounds and image.getchannel('A').getextrema()[0] == 0
        detail = image.crop(bounds)
        native_file = stage / 'prepared/native' / frame['indexFile']
        assert sha(native_file) == frame['indexSha256']
        indices = np.frombuffer(native_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
        native_bounds = Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox()
        if name in scenery:
            assert scenery[name]['master'] == str(file) and scenery[name]['masterSha256'] == sha(file)
            detail, native_bounds, scenery_proof = authored_scenery(scenery[name], source, frame, image, indices)
        left, top, right, bottom = native_bounds
        capacity = min(detail.width / (right - left), detail.height / (bottom - top))
        assert capacity >= 4, (name, slot, capacity)
        cable_spec = bridge_cables and bridge_cables['members'].get(name)
        if cable_spec:
            assert cable_spec['sourceSha256'] == source['sha256']
            cable_spec = cable_spec['frames'].get(str(slot))
            if cable_spec:
                assert cable_spec['masterSha256'] == master['sha256']
                assert cable_spec['nativeIndexSha256'] == frame['indexSha256']
        details[slot] = detail, native_bounds, cable_spec
        checks.append(dict(member=name, frame=slot, master=str(file), masterSha256=sha(file),
            independentDensityCapacity=capacity, nativeBodyBounds=native_bounds))
    metadata = dict(schemaVersion=2, packId='environment-' + name.replace('.', '-').replace('_', '-'), packRevision=args.revision,
        source=dict(member=name, sha256=source['sha256'], theater=original['theater'], kind='resolved-shp-member'),
        logical=dict(canvas=source['canvas'], frames=logical),
        color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data', authoredBody=dict(
            schema='yr-source-pinned-authored-body-v1', sourceSha256=source['sha256'],
            originalIndices=[frame['indexSha256'] for frame in source['frames'][:source['bodyFrames']]],
            contours='Continuous authored alpha independently sampled at the original trim and pivot.',
            owner='Authored red contours classified by original owner and neutral-red material seeds.',
            shadows='Original separate shadows are unchanged.', unusedMarkers=markers.get(name))), variants=[])
    owner_paint = profile.get('sourcePinnedAuthoredOwnerPaint', {}).get(name)
    if owner_paint:
        declaration = owner_paint if owner_paint['schema'] == 'yr-source-pinned-owner-region-v2' else {
            key: owner_paint[key] for key in ['schema', 'maximumNeutralChannelFraction']}
        assert owner_paint == owner_paint_declaration(source, declaration)
        metadata['color']['authoredBody']['ownerPaint'] = owner_paint
    if bridge_cables and name in bridge_cables['members']:
        metadata['color']['authoredBody']['vectorCableJoins'] = {
            'definition': profile['sourcePinnedBridgeCables'],
            'representation': 'New source-pinned vector cable tips with retained independent HD column, beam and deck paint.'}
    if scenery_proof:
        metadata['color']['authoredScenery'] = dict(declaration=scenery[name], inspection=scenery_proof)
    if name in accepted:
        metadata['color']['authoredBody']['preservedAcceptedStates'] = {
            key: value for key, value in profile['acceptedNativeBodyFrames'][name].items()
            if key in ['donorMember', 'manifestSha256', 'proofSha256', 'slots']}
    if pyramid:
        metadata['color']['authoredBody']['architecture'] = dict(architecture,
            schema='yr-pyramid-authored-courses-v1', courseCount=pyramid['courseCount'],
            projectedRise=pyramid['projectedRise'], independentPaintCapacity=pyramid['independentPaintCapacity'])
    for density in [2, 4]:
        full_folder = stage / f'frames-{density}x' / name
        full_folder.mkdir(parents=True)
        sizes = [[value * density for value in frame['legacyRenderSize']] for frame in logical]
        wanted = max(max(width for width, _ in sizes) + 4, math.sqrt(sum(w * h for w, h in sizes)))
        page_width = min(2048, 2 ** math.ceil(math.log2(wanted)))
        layouts, frames = [[]], []
        x, y, row_height = 2, 2, 0
        for slot, geometry in enumerate(logical):
            frame = source['frames'][slot]
            width, height = sizes[slot]
            base = Image.new('RGBA', (width, height))
            indices = np.frombuffer((stage / 'prepared/native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
            marker = str(slot) in markers.get(name, {}).get('frames', {})
            retained = accepted.get(name, {}).get((slot, density))
            if retained is not None:
                base = Image.fromarray(retained[0])
            elif pyramid and slot < 3:
                base.alpha_composite(render_pyramid(pyramid, slot, density))
            elif marker:
                assert set(indices.ravel()).issubset({0, 1})
                base.paste(Image.frombytes('RGBA', tuple(frame['size']),
                    (stage / 'prepared/native' / frame['file']).read_bytes()).resize(
                    tuple(value * density for value in frame['size']), Image.Resampling.NEAREST))
            else:
                detail, (left, top, right, bottom), cable_spec = details[slot]
                sprite = render_cables(detail, (left, top, right, bottom), cable_spec, density) if cable_spec else \
                    detail.convert('RGBa').resize(((right - left) * density, (bottom - top) * density),
                        Image.Resampling.LANCZOS).convert('RGBA')
                base.alpha_composite(sprite, (left * density, top * density))
            rgba = np.array(base)
            pal = source.get('framePalettes', {}).get(str(slot), source['palette'])
            palette = np.frombuffer((stage / 'prepared/native' / pal['member']).read_bytes(), np.uint8).reshape(256, 3).astype(float) * 4
            if retained is not None:
                data = retained[1]
            else:
                paint = classify_paint(rgba, indices, palette, density,
                    pal.get('remapable', source['remapable']), owner_paint)
                shades = np.abs(rgba[..., 0, None].astype(float) - palette[16:32, 0]).argmin(2).astype(np.uint8)
                data = np.zeros_like(rgba)
                data[..., 3] = 255
                data[..., 0] = paint * 255
                data[..., 1] = np.where(paint, shades, 0)
            full = Image.new('RGBA', tuple(value * density for value in source['canvas']))
            full.paste(base, tuple(value * density for value in geometry['trimOrigin']))
            full.save(full_folder / f'{slot:03d}.png')
            if x + width + 2 > page_width:
                x, y, row_height = 2, y + row_height + 4, 0
            if y + height + 2 > 2048:
                layouts.append([])
                x, y, row_height = 2, 2, 0
            packed = dict(nativeFrame=slot, page=f'p{len(layouts) - 1}', sampleRect=[x, y, width, height],
                contentRect=[x, y, *[value * density for value in geometry['trimSize']]])
            layouts[-1].append((packed, base, Image.fromarray(data)))
            frames.append(packed)
            x += width + 4
            row_height = max(row_height, height)
        pages = []
        for number, layout in enumerate(layouts):
            height = max(frame['sampleRect'][1] + frame['sampleRect'][3] + 2 for frame, _, _ in layout)
            target = folder / str(density) / f'p{number}'
            target.mkdir(parents=True)
            base = Image.new('RGBA', (page_width, height))
            data = Image.new('RGBA', base.size, (0, 0, 0, 255))
            for frame, image, material in layout:
                base.paste(image, tuple(frame['sampleRect'][:2]))
                data.paste(material, tuple(frame['sampleRect'][:2]))
            page = dict(id=f'p{number}', size=list(base.size))
            for role, image in [('base', base), ('data', data)]:
                file = target / (role + '.png')
                image.save(file)
                page.update({role: f'{density}-p{number}-{role}.png', role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
            pages.append(page)
            allocation[density] += page_width * height * 8
        assert len(pages) <= 8
        metadata['variants'].append(dict(density=density, pages=pages, frames=frames))
    write(folder / 'manifest.json', metadata)
    members.append(dict(member=name, sha256=sha(folder / 'manifest.json'), path=str((folder / 'manifest.json').relative_to(pack_root))))
write(pack_root / 'manifest.json', dict(schema='environment-shp-pack-v1', theater=original['theater'], editions=['yr'],
    revision=args.revision, families={family: dict(familyHash=declared['familyHash'], members=members)}))
write(stage / 'sampling-audit.json', dict(status='PASS_COMPLETE_INDEPENDENT_AUTHORED_2X_4X_BODIES', frames=checks,
    unpooledRgbaBytes=allocation, originalSeparateShadowsUnchanged=True, userVisualAcceptance='PENDING'))
print(json.dumps(dict(family=family, members=len(members), authoredStates=len(checks), unpooledRgbaBytes=allocation)))
