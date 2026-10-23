"""Reuse accepted dirt-road detail with source-controlled Desert sand margins."""
import hashlib
import json
import os
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

root = Path('.artifacts/m2-4/desert-dirt-roads-batch81-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
proof = read(root/'preparation-v1.json')
assert all(row['geometryCompatible'] for row in proof['rows'])
assert sha(Path(proof['inventoryFile'])) == proof['inventorySha256']
native_root = Path(proof['nativeRoot'])
assert sha(native_root/'source.json') == proof['nativeGuideSha256']
native = {s['member']: s for s in read(native_root/'source.json')['sources']}
inventory = read(Path(proof['inventoryFile']))
prior = read(Path('.artifacts/m2-4/desert-road-geometry-r2-20261019/user-acceptance-20261019.json'))['candidate']
assert prior['revision'] == 'desert-m2-4-continuous-road-geometry-r2-v5'
old_root = Path('.local/terrain-packs')/prior['revision']
assert sha(old_root/'manifest.json') == prior['sha256']
manifest = read(old_root/'manifest.json')
donor_root = Path('.local/terrain-packs')/proof['acceptedDonor']['revision']
assert sha(donor_root/'manifest.json') == proof['acceptedDonor']['sha256']
donor = read(donor_root/'manifest.json')
revision = 'desert-m2-4-dirt-roads-batch81-v7'
destination = Path('.local/terrain-packs')/revision
destination.mkdir(exist_ok=False)
cache = {}


def crop(pack_root, pack, name, slot, density):
    group = next(g for g in pack['groups'] if any(m['member'] == name for m in g['members']))
    variant = next(v for v in group['variants'] if v['density'] == density)
    file = pack_root/variant['file']
    if file not in cache:
        assert sha(file) == variant['sha256']
        cache[file] = Image.frombytes('RGBA', tuple(variant['size']), file.read_bytes())
    offset = 0
    for member in group['members']:
        if member['member'] == name:
            break
        offset += len(member['images'])
    x, y, w, h = variant['rects'][offset+slot]
    return np.array(cache[file].crop((x, y, x+w, y+h)))


def raw(image, donor_frame=None):
    file = root/donor_frame['file'] if donor_frame else native_root/'native'/image['file']
    expected = donor_frame['rgbaSha256'] if donor_frame else image['rgbaSha256']
    assert sha(file) == expected
    return np.fromfile(file, np.uint8).reshape(*reversed(image['size']), 4)


def replace_native_contact_colors(pixels, original, density):
    expanded = original.repeat(density, 0).repeat(density, 1)
    visible = pixels[..., 3] > 0
    copied = np.all(pixels[..., :3] == expanded[..., :3], axis=2) & visible
    labels, _ = ndimage.label(copied)
    counts = np.bincount(labels.ravel())
    copied &= counts[labels] >= 3*density
    copied = ndimage.binary_dilation(copied, iterations=1) & visible
    valid = visible & ~copied
    assert valid.any()
    nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    result = pixels.copy()
    result[copied, :3] = pixels[tuple(nearest)][copied, :3]
    return result, int(copied.sum())


sand_fields = {}
mother_file = Path('.artifacts/m2-4/desert-representative-tmp-batch65-v1/tmp-set00-1254-3x4-01-master.png')
assert sha(mother_file) == 'b8e70666ce8d326013653c67e4005e0e3c77d393e8991b718852ce2c67aa2c8d'


def sand_field(density):
    if density in sand_fields:
        return sand_fields[density]
    mother = np.array(Image.open(mother_file).convert('RGBA'))
    size = 60*density
    v, u = (np.indices((size, size))+.5)/size
    # Use the genuinely HD interior of the accepted source mother, before old
    # native-color contact guards are inserted by the historical export path.
    center = mother.shape[1]/6
    sx, sy = center+144*(u-v), center+72*(u+v-1)
    field = np.stack([ndimage.map_coordinates(mother[..., c].astype(float), [sy, sx], order=1)
        for c in range(3)], axis=2)
    assert ndimage.map_coordinates(mother[..., 3], [sy, sx], order=0).min() > 0
    # Periodic-plus-smooth decomposition removes only opposed-edge mismatch.
    # All remaining detail is sampled accepted mother RGB, not generated noise.
    boundary = np.zeros_like(field)
    boundary[0] += field[0]-field[-1]
    boundary[-1] -= field[0]-field[-1]
    boundary[:, 0] += field[:, 0]-field[:, -1]
    boundary[:, -1] -= field[:, 0]-field[:, -1]
    fy, fx = np.indices((size, size))
    denominator = 2*np.cos(2*np.pi*fx/size)+2*np.cos(2*np.pi*fy/size)-4
    denominator[0, 0] = 1
    smooth_fft = np.fft.fft2(boundary, axes=(0, 1))/denominator[..., None]
    smooth_fft[0, 0] = 0
    field -= np.fft.ifft2(smooth_fft, axes=(0, 1)).real
    ground = crop(old_root, manifest, 'clear01.des', 0, density)
    valid = ndimage.binary_erosion(ground[..., 3] > 0, iterations=3*density)
    field += ground[..., :3][valid].mean(0)-field.mean((0, 1))
    sand_fields[density] = field
    np.save(root/f'accepted-sand-periodic-{density}x-v7.npy', field)
    return field


def adapt(pixels, source, image, donor_frame, density):
    target, original = raw(image), raw(image, donor_frame)
    pixels, old_contacts = replace_native_contact_colors(pixels, original, density)
    a, b = original[..., :3].astype(float), target[..., :3].astype(float)
    grass = (a[..., 1] > a[..., 0]*.88) & (a[..., 1] > a[..., 2]*1.35)
    sand = (b[..., 0] > b[..., 2]*1.35) & (b[..., 0] > b[..., 1]*1.02)
    soil = grass & sand & (target[..., 3] > 0)
    assert soil.any(), source['member']
    # Separate the accepted HD rut material at its own painted boundary. The
    # native mask is an audit cue only: interpolating its per-subtile pixel
    # pattern would recreate retail blocks and colored seams in new artwork.
    rgb = pixels[..., :3].astype(float)
    road = np.clip((rgb[..., 0]-rgb[..., 1]-12)/18, 0, 1)
    road *= np.clip((rgb[..., 0]-rgb[..., 2]-25)/35, 0, 1)
    road = ndimage.gaussian_filter(road, .4*density, mode='nearest')
    weight = 1-road
    material = sand_field(density)
    yy, xx = np.indices(weight.shape)
    x = (xx+.5)/density+image['origin'][0]+image['offset'][0]
    y = (yy+.5)/density+image['origin'][1]+image['offset'][1]
    u, v = (x/60+y/30-.5) % 1, (-x/60+y/30+.5) % 1
    coords = [v*material.shape[0]-.5, u*material.shape[1]-.5]
    sampled = np.stack([ndimage.map_coordinates(material[..., c], coords, order=1, mode='grid-wrap')
        for c in range(3)], axis=2)
    result = pixels.copy()
    alpha = target[..., 3].repeat(density, 0).repeat(density, 1)
    missing = (pixels[..., 3] == 0) & (alpha > 0)
    if missing.any():
        nearest = ndimage.distance_transform_edt(pixels[..., 3] == 0, return_distances=False, return_indices=True)
        rgb[missing] = rgb[tuple(nearest)][missing]
    result[..., :3] = np.rint(rgb*(1-weight[..., None])+sampled*weight[..., None]).astype(np.uint8)
    result[..., 3] = alpha
    opaque = alpha > 0
    nearest = ndimage.distance_transform_edt(~opaque, return_distances=False, return_indices=True)
    result[~opaque, :3] = result[tuple(nearest)][~opaque, :3]
    np.testing.assert_array_equal(result[..., 3], alpha)
    return result, dict(nativeContactPixelsReplaced=old_contacts, nativeSoilPixels=int(soil.sum()), targetCoverageExtension=int(missing.sum()),
        changedPixels=int(np.any(result != pixels, axis=2).sum()), nativeRgbUsedAsDetail=False)


groups = {}
records = []
for record in proof['rows']:
    source = native[record['member']]
    assert sha(native_root/'native'/source['nativeFile']) == source['sha256'] == record['sourceSha256']
    index = source['setIndex']
    entry = groups.setdefault(index, dict(group=dict(id=f'm2-4-desert-dirt-roads-set{index:02d}',
        scope='COMPLETE_USED_NATIVE_DIRT_ROADS_ACCEPTED_TEMPERATE_DETAIL_WITH_DESERT_SAND',
        members=[], variants=[]), pieces={2: [], 4: []}))
    metadata = [{k: v for k, v in image.items() if k not in ['nativeOffset', 'size', 'file', 'rgbaSha256']}
        for image in source['images']]
    entry['group']['members'].append(dict(member=source['member'],
        sourceHashes=dict(ra2=source['sha256'], yr=source['sha256']), images=metadata))
    for density in [2, 4]:
        for image in source['images']:
            slot = image['subTile']
            authored = crop(donor_root, donor, record['donorMember'], slot, density)
            if image['nativeOffset'] == 0:
                usages = [row['usage'] for row in inventory['rows'] if row['kind'] == 'tmp'
                    and row['source']['member'] == source['member']]
                assert all(slot not in use['values'] for usage in usages for use in usage.values())
                result = raw(image).repeat(density, 0).repeat(density, 1)
                detail = dict(status='UNREFERENCED_ZERO_POINTER_ORIGINAL_COMPATIBILITY_ONLY')
            else:
                result, detail = adapt(authored, source, image, record['images'][slot], density)
                detail['status'] = 'ACCEPTED_ROAD_DETAIL_WITH_DESERT_SAND_ADAPTATION'
            entry['pieces'][density].append(Image.fromarray(result))
            records.append(dict(member=source['member'], subTile=slot, density=density,
                nativePointer=image['nativeOffset'], outputSha256=hashlib.sha256(result.tobytes()).hexdigest(), **detail))
preserved = []
for group in manifest['groups']:
    for variant in group['variants']:
        file = old_root/variant['file']
        assert sha(file) == variant['sha256']
        os.link(file, destination/variant['file'])
        preserved.append(dict(file=variant['file'], sha256=variant['sha256']))
for index, entry in sorted(groups.items()):
    group = entry['group']
    for density, pieces in entry['pieces'].items():
        width, x, y, height, rects = (4096 if index == 18 else 2048), 2, 2, 0, []
        for piece in pieces:
            if x+piece.width+2 > width:
                x, y, height = 2, y+height+4, 0
            rects.append([x, y, piece.width, piece.height])
            x += piece.width+4
            height = max(height, piece.height)
        atlas = np.zeros((y+height+2, width, 4), np.uint8)
        assert max(atlas.shape[:2]) <= 8192
        for piece, (x, y, w, h) in zip(pieces, rects, strict=True):
            atlas[y-2:y+h+2, x-2:x+w+2] = np.pad(np.array(piece), ((2, 2), (2, 2), (0, 0)), mode='edge')
        file = f'{group["id"]}-{density}x.rgba'
        (destination/file).write_bytes(atlas.tobytes())
        group['variants'].append(dict(density=density, file=file,
            size=[atlas.shape[1], atlas.shape[0]], rects=rects, sha256=sha(destination/file)))
    manifest['groups'].append(group)
manifest['revision'] = revision
(destination/'manifest.json').write_text(json.dumps(manifest, separators=(',', ':'))+'\n')
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination/'manifest.json'))
receipt = dict(status='EXPORTED_ACCEPTED_DIRT_ROAD_DETAIL_AND_DESERT_SAND_NATIVE_PENDING',
    baseline=prior, candidate=candidate, donor=proof['acceptedDonor'], newGroups=[e['group']['id'] for e in groups.values()],
    members=81, actualNativeSlots=521, compatibilitySlots=173, actualDensitySlots=1042,
    acceptedSandMother=dict(file=str(mother_file), sha256=sha(mother_file)),
    records=records, priorPayloadsExact=preserved, maps=sorted(set(m for row in proof['rows'] for m in row['maps'])),
    preparationSha256=sha(root/'preparation-v1.json'), nativeMapsChanged=False, nativeGeometryAndAlpha='EXACT_TARGET',
    officialSourceMapEdition='yr', runtimeEditionAdmission='Existing dual-edition terrain contract; one verified imported source stream, with no RA2 Desert official map claim',
    originalRgbUsedAsHdDetail=False, native='PENDING', visualAcceptance='PENDING', windows='NOT_RUN', m24Complete=False)
(root/'export-and-preservation-v7.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(dict(candidate=candidate, newGroups=receipt['newGroups'], members=81, actualDensitySlots=1042)))
