"""Compose complete Desert roads from accepted road and Desert ground materials."""
import copy
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

root = Path('.artifacts/m2-4/desert-roads-batch78-20261019')
root.mkdir(exist_ok=True)
prepared = Path('.artifacts/m2-4/desert-roads-hybrid-batch78-preparation-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
guide = read(prepared/'source.json')
proof = read(prepared/'reuse-preparation-v1.json')
assert sha(Path(proof['auditFile'])) == proof['auditSha256']
assert sha(Path(guide['inventoryFile'])) == guide['inventorySha256']
donor_pointer = read(Path('.local/terrain-selection.json'))
assert donor_pointer == proof['acceptedDonor']
donor_root = Path('.local/terrain-packs')/donor_pointer['revision']
assert sha(donor_root/'manifest.json') == donor_pointer['sha256']
donor = read(donor_root/'manifest.json')
prior = read(Path('.local/terrain-desert-selection.json'))
assert prior['revision'] == 'desert-m2-4-structures-material-contacts-r2'
old_root = Path('.local/terrain-packs')/prior['revision']
assert sha(old_root/'manifest.json') == prior['sha256']
manifest = read(old_root/'manifest.json')
revision = 'desert-m2-4-hybrid-roads-batch78-v4'
destination = Path('.local/terrain-packs')/revision
destination.mkdir(exist_ok=False)
sources = {s['member']: s for s in guide['sources']}
inventory = read(Path(guide['inventoryFile']))
native_donor = {s['member']: s for s in read(prepared/'temperate-guides/source.json')['sources']}
cache = {}


def crop(pack_root, pack, member_name, slot, density):
    group = next(g for g in pack['groups'] if any(m['member'] == member_name for m in g['members']))
    variant = next(v for v in group['variants'] if v['density'] == density)
    file = pack_root/variant['file']
    if file not in cache:
        assert sha(file) == variant['sha256']
        cache[file] = Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes())
    index = 0
    for member in group['members']:
        if member['member'] == member_name:
            break
        index += len(member['images'])
    x, y, w, h = variant['rects'][index+slot]
    return np.array(cache[file].crop((x, y, x+w, y+h)))


def native_pixels(source, slot):
    image = source['images'][slot]
    file = prepared/'native'/image['file']
    assert sha(file) == image['rgbaSha256']
    return np.fromfile(file, np.uint8).reshape(*reversed(image['size']), 4)


def adapt_soil(pixels, source, image, density):
    original = native_pixels(source, image['subTile'])
    donor_source = native_donor[source['member'].replace('.des', '.tem')]
    guide_image = donor_source['images'][image['subTile']]
    file = prepared/'temperate-guides'/guide_image['main']['file']
    assert sha(file) == guide_image['main']['sha256']
    native = np.fromfile(file, np.uint8).reshape(30, 60, 4).astype(float)
    target = original.astype(float)
    # Select the native grass-to-sand difference, not neutral road palette noise.
    green = (native[..., 1] > native[..., 0]*.88) & (native[..., 1] > native[..., 2]*1.35)
    sand = (target[..., 0] > target[..., 2]*1.35) & (target[..., 0] > target[..., 1]*1.02)
    soil = green & sand & (original[..., 3] > 0)
    if not soil.any():
        return pixels, dict(soilNativePixels=0, changedPixels=0)
    # Reconstruct the material boundary at output resolution. No native RGB is enlarged.
    signed = ndimage.distance_transform_edt(soil)-ndimage.distance_transform_edt(~soil)
    distance = np.asarray(Image.fromarray(signed.astype(np.float32)).resize(
        (pixels.shape[1], pixels.shape[0]), Image.Resampling.BICUBIC))
    weight = np.clip((distance+.65)/1.3, 0, 1)
    ground = crop(old_root, manifest, 'clear01.des', 0, density)
    valid = ground[..., 3] > 0
    nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    material = ground[tuple(nearest)][..., :3]
    yy, xx = np.indices(weight.shape)
    ox, oy = image['origin']
    # Repeat on the isometric ground lattice, not on its rectangular bounding box.
    px, py = (xx+.5)/density+ox, (yy+.5)/density+oy
    u, v = (px/60+py/30-.5) % 1, (-px/60+py/30+.5) % 1
    sx, sy = (30+30*(u-v))*density-.5, 15*(u+v)*density-.5
    sampled = np.stack([ndimage.map_coordinates(material[..., channel].astype(float),
        [sy, sx], order=1, mode='nearest') for channel in range(3)], axis=2)
    result = pixels.copy()
    result[..., :3] = np.rint(pixels[..., :3]*(1-weight[..., None])+sampled*weight[..., None]).astype(np.uint8)
    np.testing.assert_array_equal(result[..., 3], pixels[..., 3])
    np.testing.assert_array_equal(result[weight == 0], pixels[weight == 0])
    return result, dict(soilNativePixels=int(soil.sum()), changedPixels=int(np.any(result != pixels, axis=2).sum()),
        nonSoilExact=True, alphaExact=True)


records, pieces_by_density = [], {2: [], 4: []}
group = dict(id='m2-4-desert-hybrid-roads-set20',
    scope='COMPLETE_USED_NATIVE_PAVED_ROAD_SET_ACCEPTED_TEMPERATE_WITH_DESERT_GROUND_ADAPTATION',
    members=[], variants=[])
for record in proof['records']:
    source = sources[record['member']]
    assert sha(prepared/'native'/source['nativeFile']) == source['sha256'] == record['sourceSha256']
    donor_name = record.get('donorMember', source['member'].replace('.des', '.tem'))
    donor_member = next(m for g in donor['groups'] for m in g['members'] if m['member'] == donor_name)
    metadata = [{k: v for k, v in i.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
        for i in source['images']]
    assert len(metadata) == len(donor_member['images'])
    for target_image, donor_image in zip(metadata, donor_member['images'], strict=True):
        for key in ['grid', 'block', 'logical', 'offset', 'origin', 'height', 'hasExtraData', 'hasZData']:
            assert target_image[key] == donor_image[key], (source['member'], key)
    group['members'].append(dict(member=source['member'], sourceHashes=dict(ra2=source['sha256'], yr=source['sha256']),
        images=metadata))
    adapted = record['status'] == 'REQUIRES_THEATER_MATERIAL_ADAPTATION'
    detail = dict(member=source['member'], sourceSha256=source['sha256'], donorMember=donor_name,
        status='DESERT_GROUND_MATERIAL_ADAPTATION' if adapted else 'EXACT_ACCEPTED_PIXEL_REUSE', frames=[])
    for density in [2, 4]:
        for image in source['images']:
            pixels = crop(donor_root, donor, donor_name, image['subTile'], density)
            native = native_pixels(source, image['subTile'])
            if image['nativeOffset'] == 0:
                # The existing decoder retains these legacy zero-pointer slots.
                # Neither official map references them. Preserve Original bytes
                # solely for compatibility; never author or present them as HD.
                usages = [row['usage'] for row in inventory['rows'] if row['kind'] == 'tmp'
                    and row['source']['member'] == source['member']]
                assert usages and all(image['subTile'] not in use['values']
                    for usage in usages for use in usage.values())
                pixels = native.repeat(density, 0).repeat(density, 1)
                detail['frames'].append(dict(density=density, subTile=image['subTile'],
                    status='UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY',
                    pixelsSha256=hashlib.sha256(pixels.tobytes()).hexdigest()))
                pieces_by_density[density].append(Image.fromarray(pixels))
                continue
            target_alpha = native[..., 3].repeat(density, 0).repeat(density, 1)
            alpha_difference = int(np.count_nonzero(pixels[..., 3] != target_alpha))
            if adapted:
                # A few source boundary pixels differ on damaged road members.
                # Keep target coverage and extend only the existing HD material.
                assert alpha_difference <= 3*density*density
                missing = (pixels[..., 3] == 0) & (target_alpha > 0)
                if missing.any():
                    nearest = ndimage.distance_transform_edt(pixels[..., 3] == 0,
                        return_distances=False, return_indices=True)
                    pixels[missing, :3] = pixels[tuple(nearest)][missing, :3]
                pixels[..., 3] = target_alpha
            else:
                np.testing.assert_array_equal(pixels[..., 3], target_alpha)
            frame = dict(density=density, subTile=image['subTile'], donorPixelsSha256=hashlib.sha256(pixels.tobytes()).hexdigest())
            frame['targetCoverageAdaptedPixels'] = alpha_difference
            if adapted:
                pixels, changes = adapt_soil(pixels, source, image, density)
                frame.update(changes)
            else:
                pinned = next(f for f in record['frames'] if f['density'] == density and f['subTile'] == image['subTile'])
                assert frame['donorPixelsSha256'] == pinned['pixelsSha256']
            frame['pixelsSha256'] = hashlib.sha256(pixels.tobytes()).hexdigest()
            detail['frames'].append(frame)
            pieces_by_density[density].append(Image.fromarray(pixels))
    records.append(detail)

for density, pieces in pieces_by_density.items():
    width, x, y, row_height, rects = 2048, 2, 2, 0, []
    for piece in pieces:
        if x+piece.width+2 > width:
            x, y, row_height = 2, y+row_height+4, 0
        rects.append([x, y, piece.width, piece.height])
        x += piece.width+4
        row_height = max(row_height, piece.height)
    atlas = Image.new('RGBA', (width, y+row_height+2))
    for piece, rect in zip(pieces, rects, strict=True):
        atlas.paste(piece, tuple(rect[:2]))
    filename = f'{group["id"]}-{density}x.rgba'
    (destination/filename).write_bytes(atlas.tobytes())
    group['variants'].append(dict(density=density, file=filename, size=list(atlas.size), rects=rects,
        sha256=sha(destination/filename)))
preserved = []
for old_group in manifest['groups']:
    for variant in old_group['variants']:
        file = old_root/variant['file']
        assert sha(file) == variant['sha256']
        os.link(file, destination/variant['file'])
        preserved.append(dict(file=variant['file'], sha256=variant['sha256']))
manifest['groups'].append(group)
manifest['revision'] = revision
write(destination/'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination/'manifest.json'))
write(root/'source.json', guide)
(root/'native').symlink_to((prepared/'native').resolve(), target_is_directory=True)
write(root/'export-and-preservation-v1.json', dict(status='PASS_COMPLETE_FAMILY_SOURCE_PINS_AND_ACCEPTED_MATERIAL_COMPOSITION',
    candidate=candidate, baseline=prior, acceptedRoadDonor=donor_pointer, acceptedGroundDonor=prior,
    completeMembers=20, exactReuseMembers=12, groundAdaptationMembers=8, densityFrames=sum(map(len, pieces_by_density.values())),
    priorPayloadsExact=preserved, records=records, sourceGuideSha256=sha(prepared/'source.json'),
    temperateGuideSha256=sha(prepared/'temperate-guides/source.json'), maps=['yr:saharami.map', 'yr:saharamimw.map'],
    nativeGeometryAndAlpha='EXACT_TARGET', sourceMapsModified=False, originalRgbUsedInHd=False,
    zeroPointerPolicy='Unreferenced legacy decoder slots retain Original compatibility pixels; excluded from authored counts and review.',
    activeDensityFrames=sum(1 for r in records for f in r['frames'] if f.get('status') != 'UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY'),
    visualAcceptance='PENDING', native='PENDING', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(candidate=candidate, members=20, densityFrames=sum(map(len, pieces_by_density.values())))))
