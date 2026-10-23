"""Repack accepted road geometry and share the accepted bridge-contact asphalt."""
import hashlib
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from newurban_batch93_io import ROOT, GUIDE, crop, native, pin, read, sha, write

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from shared_road_network import asphalt_pixels, periodic_material, project_road_material

proof = read(ROOT / 'urban-road-reuse-preparation-v3.json')
baseline = proof['baselineNewUrban']
assert read('.local/terrain-newurban-selection.json') == baseline
base = Path('.local/terrain-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
contract_file = Path('desktop/terrain-theater-hd-contracts.json')
assert (ROOT / 'baseline-contract.json').read_bytes() == contract_file.read_bytes()
assert read(ROOT / 'baseline-selector.json') == baseline
guide = read(GUIDE / 'source.json')
sources = {s['member']: s for s in guide['sources']}
inventory = read('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020/inventory-newurban-v1/inventory.json')
revision = 'newurban-m2-4-accepted-road-network-batch93-v4'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
core = next(g for g in manifest['groups'] if g['id'] == 'm2-4-newurban-bridge-road-set20')
assert {m['member'] for m in core['members']} == {'proad02.ubn', 'proad02a.ubn', 'proad02b.ubn', 'proad02c.ubn'}
preserved = []
for group in manifest['groups']:
    for variant in group['variants']:
        file = base / variant['file']
        assert sha(file) == variant['sha256']
        os.link(file, destination / variant['file'])
        preserved.append(pin(file))
assert read(ROOT / 'source.json') == dict(schema=guide['schema'], theater='NEWURBAN', originalGuide=pin(GUIDE / 'source.json'),
    sources=[sources[row['targetMember']] for row in proof['records']])
materials = {}
for density in [2, 4]:
    controls = [crop(baseline, 'proad02.ubn', slot, density) for slot in range(3)]
    colors = np.concatenate([p[..., :3][asphalt_pixels(p)] for p in controls]).mean(0)
    material = periodic_material(controls[1], density, colors)
    broad = ndimage.gaussian_filter(material, (6 * density, 6 * density, 0), mode='wrap')
    medium = ndimage.gaussian_filter(material, (1.5 * density, 1.5 * density, 0), mode='wrap')
    materials[density] = colors + np.clip(material - medium + (medium - broad) * .25, -18, 18)
flat = np.concatenate([native(sources['proad02.ubn'], i)[..., :3][asphalt_pixels(native(sources['proad02.ubn'], i))]
                       for i in sources['proad02.ubn']['images']]).mean()


def pack(group, density, pieces):
    # Identical samples may share a rectangle; every source/slot declaration remains present.
    unique, lookup, indices = [], {}, []
    for piece in pieces:
        key = piece.shape, hashlib.sha256(piece.tobytes()).hexdigest()
        if key not in lookup:
            lookup[key] = len(unique)
            unique.append(piece)
        indices.append(lookup[key])
    choices = []
    for width in range(256, 2049, 64):
        x, y, height, rects = 2, 2, 0, []
        if any(p.shape[1] + 4 > width for p in unique):
            continue
        for piece in unique:
            h, w = piece.shape[:2]
            if x + w + 2 > width:
                x, y, height = 2, y + height + 4, 0
            rects.append([x, y, w, h])
            x += w + 4
            height = max(height, h)
        size = [width, y + height + 2]
        if size[1] <= 2048:
            choices.append((size[0] * size[1], size, rects))
    assert choices, (group['id'], density)
    _, size, rects = min(choices)
    atlas = np.zeros((*reversed(size), 4), np.uint8)
    for piece, (x, y, w, h) in zip(unique, rects, strict=True):
        # Match the accepted shared-road edge extrusion; native rect alpha remains exact.
        atlas[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(piece, ((2, 2), (2, 2), (0, 0)), mode='edge')
    file = destination / f'{group["id"]}-{density}x.rgba'
    with file.open('xb') as stream:
        stream.write(atlas.tobytes())
    group['variants'].append(dict(density=density, file=file.name, size=size,
        rects=[rects[i] for i in indices], sha256=sha(file)))
    return dict(density=density, slots=len(pieces), uniqueSamples=len(unique), size=size,
        rawBytes=file.stat().st_size, allNativeSlotIndicesRetained=True)


groups, records, layouts = [], [], []
cohorts = [(20, [r]) for r in proof['records'] if r['targetSet'] == 20 and not r['alreadySelected']]
cohorts += [(n, [r for r in proof['records'] if r['targetSet'] == n]) for n in [36, 40, 47]]
for number, rows in cohorts:
    group_id = ('m2-4-newurban-road-' + rows[0]['targetMember'].split('.')[0]) if number == 20 else f'm2-4-newurban-accepted-road-set{number}'
    group = dict(id=group_id,
        scope='COMPLETE_USED_NATIVE_ROAD_FAMILY_WITH_ACCEPTED_ART_AND_TARGET_OWNED_GEOMETRY', members=[], variants=[])
    pieces = {2: [], 4: []}
    for row in rows:
        source = sources[row['targetMember']]
        assert source['sha256'] == row['targetSourceSha256']
        assert sha(GUIDE / 'native' / source['nativeFile']) == source['sha256']
        metadata = [{k: v for k, v in image.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
                    for image in source['images']]
        definition = next((m for m in core['members'] if m['member'] == source['member']), None)
        if definition:
            assert metadata == definition['images'] and source['sha256'] in definition['sourceHashes'].values()
        group['members'].append(definition if definition else dict(member=source['member'],
            sourceHashes=dict(yr=source['sha256']), images=metadata))
        record = dict(member=source['member'], group=group['id'], donorMember=row['donorMember'],
            acceptedDonor=row['acceptedPack'], sourceSha256=source['sha256'], priorCoreExact=bool(definition), frames=[])
        road_samples = [native(source, image)[..., :3][asphalt_pixels(native(source, image))]
                        for image in source['images'] if image['nativeOffset'] > 0]
        slope = number == 47
        gain = float(np.concatenate(road_samples).mean() / flat) if slope else 1
        for density in [2, 4]:
            for image, detail in zip(source['images'], row['frames'], strict=True):
                slot = image['subTile']
                original = native(source, image)
                if definition:
                    pixels = crop(baseline, source['member'], slot, density)
                    changes = dict(policy='EXACT_ACCEPTED_BRIDGE_CONTACT_CORE', changedPixels=0)
                elif image['nativeOffset'] <= 0:
                    usages = [r['usage'] for r in inventory['rows'] if r['kind'] == 'tmp'
                              and r['source']['member'] == source['member']]
                    assert usages and all(slot not in value['values'] for use in usages for value in use.values())
                    pixels = original.repeat(density, 0).repeat(density, 1)
                    changes = dict(policy='UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY', changedPixels=0)
                else:
                    assert not detail['rectangleDifferences'], (source['member'], slot)
                    pixels = crop(row['acceptedPack'], row['donorMember'], slot, density)
                    assert pixels.shape[:2] == tuple(n * density for n in image['size'][::-1])
                    alpha = original[..., 3].repeat(density, 0).repeat(density, 1)
                    missing = (pixels[..., 3] == 0) & (alpha > 0)
                    if missing.any():
                        nearest = ndimage.distance_transform_edt(pixels[..., 3] == 0,
                            return_distances=False, return_indices=True)
                        pixels[missing, :3] = pixels[tuple(nearest)][missing, :3]
                    pixels[..., 3] = alpha
                    pixels, changes = project_road_material(pixels, original, image, density, materials[density], gain)
                    changes['policy'] = 'ACCEPTED_ROAD_FORM_WITH_SHARED_ACCEPTED_NEWURBAN_ASPHALT'
                    changes['originalAlphaCellsDifferentFromDonor'] = detail['alphaDifferences']
                assert np.array_equal(pixels[..., 3], original[..., 3].repeat(density, 0).repeat(density, 1))
                record['frames'].append(dict(density=density, subTile=slot, nativePointer=image['nativeOffset'],
                    rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest(), **changes))
                pieces[density].append(pixels)
        records.append(record)
    for density in [2, 4]:
        layouts.append(dict(group=group['id'], **pack(group, density, pieces[density])))
    groups.append(group)
manifest['groups'] += groups
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
write(ROOT / 'export-and-preservation-v4.json', dict(
    status='EXPORTED_FOUR_COMPLETE_USED_ROAD_FAMILIES_FROM_ACCEPTED_MATERIALS_NOT_SELECTED',
    baseline=baseline, candidate=candidate, sourcePreparation=pin(ROOT / 'urban-road-reuse-preparation-v3.json'),
    records=records, layouts=layouts, preservedOtherPayloads=preserved,
    fullUsedCategories=4, newCompleteLoadFamilies=26, totalMembers=38, newMembers=34, unchangedBridgeContactCoreMembers=4,
    oldGroupsPreserved=22, sourceOriginalRgbUsedAsHdDetail=False, selectedNewMothers=0,
    loadFamilyPolicy='Each paved-road TMP member is a complete source family with every native subtile and both densities. End/bits/slope cohorts remain complete source groups. No state or subtile is split. Actual map dependencies choose source families; no expected resource is hidden.',
    nativeGeometryDepthRules='EXACT_TARGET_SOURCE', worldBudgetBytes=[512 * 1024 ** 2, 1280 * 1024 ** 2],
    newArtReview='ONLY_NEWURBAN_ROAD_CONTINUITY_CONTEXT_AND_PRIOR_BATCH92_WARM_MATERIAL',
    native='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(dict(candidate=candidate, newMembers=34, totalMembers=38, layouts=layouts))
