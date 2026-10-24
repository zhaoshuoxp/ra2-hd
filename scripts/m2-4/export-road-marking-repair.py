"""Rebuild complete road markings and parking lots inside existing native geometry."""
import argparse
import ctypes
import hashlib
import json
import shutil
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from road_marking_geometry import repair_member
from shared_road_network import asphalt_pixels, periodic_material

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('sources', type=Path)
parser.add_argument('version')
args = parser.parse_args()
proof = json.loads((args.sources / 'source.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
read = lambda file: json.loads(Path(file).read_text())
packs_root = Path('.local/terrain-packs')
libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True) if sys.platform == 'darwin' else None


def clone(source, destination):
    assert not destination.exists()
    if libc is None or libc.clonefile(str(source).encode(), str(destination).encode(), 0) != 0:
        shutil.copyfile(source, destination)


@lru_cache(maxsize=12)
def atlas(revision, file, width, height, expected):
    data = (packs_root / revision / file).read_bytes()
    assert sha(data) == expected
    return np.frombuffer(data, np.uint8).reshape(height, width, 4)


def pack_manifest(pointer):
    file = packs_root / pointer['revision'] / 'manifest.json'
    assert sha(file.read_bytes()) == pointer['sha256']
    return read(file)


def crops(pack, record, density):
    group = next(group for group in pack['groups'] if group['id'] == record['group'])
    variant = next(variant for variant in group['variants'] if variant['density'] == density)
    first = sum(len(member['images']) for member in group['members'][:next(
        i for i, member in enumerate(group['members']) if member['member'] == record['member'])])
    data = atlas(pack['revision'], variant['file'], *variant['size'], variant['sha256'])
    return [data[y:y + h, x:x + w].copy() for x, y, w, h in variant['rects'][first:first + len(record['frames'])]]


def assemble(record, samples):
    frames = [(frame, sample) for frame, sample in zip(record['frames'], samples, strict=True) if not frame['empty']]
    low = np.min([np.array(frame['metadata']['origin']) + frame['metadata']['offset'] for frame, _ in frames], axis=0)
    high = np.max([np.array(frame['metadata']['origin']) + frame['metadata']['offset']
        + frame['metadata']['logical'] for frame, _ in frames], axis=0)
    density = frames[0][1].shape[1] // frames[0][0]['metadata']['logical'][0]
    output = np.zeros(((high[1] - low[1]) * density, (high[0] - low[0]) * density, 4), np.uint8)
    for frame, sample in frames:
        x, y = (np.array(frame['metadata']['origin']) + frame['metadata']['offset'] - low) * density
        h, w = sample.shape[:2]
        region = output[y:y + h, x:x + w]
        region[sample[..., 3] > 0] = sample[sample[..., 3] > 0]
    return output, low


def repack(samples):
    unique, indices, lookup = [], [], {}
    for sample in samples:
        key = sample.shape, sha(sample.tobytes())
        if key not in lookup:
            lookup[key] = len(unique)
            unique.append(sample)
        indices.append(lookup[key])
    choices = []
    minimum = max(sample.shape[1] + 4 for sample in unique)
    for width in range((minimum + 63) // 64 * 64, 4097, 64):
        x, y, height, rectangles = 2, 2, 0, []
        for sample in unique:
            h, w = sample.shape[:2]
            if x + w + 2 > width:
                x, y, height = 2, y + height + 4, 0
            rectangles.append([x, y, w, h])
            x += w + 4
            height = max(height, h)
        if y + height + 2 <= 4096:
            choices.append((width * (y + height + 2), [width, y + height + 2], rectangles))
    assert choices
    _, size, rectangles = min(choices)
    output = np.zeros((*reversed(size), 4), np.uint8)
    for sample, (x, y, w, h) in zip(unique, rectangles, strict=True):
        output[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(sample, ((2, 2), (2, 2), (0, 0)), mode='edge')
    return output, size, [rectangles[index] for index in indices]


records = []
for source_pack in proof['packs']:
    theater, pointer = source_pack['theater'], source_pack['pointer']
    if theater == 'snow':
        records.append(dict(theater=theater, baseline=pointer, candidate=pointer, status='UNCHANGED_SNOW_COVER',
            members=[], changed=[], preserved=[], reason='Retain accepted winter road cover. The matching rough sources are fields, not urban parking lots.'))
        continue
    manifest = pack_manifest(pointer)
    revision = f'{theater}-road-markings-{args.version}'
    destination = packs_root / revision
    destination.mkdir(exist_ok=False)
    output = args.sources.parent / revision
    output.mkdir(exist_ok=False)
    material_pack = next(pack for pack in proof['packs'] if pack['theater'] == 'newurban') if theater == 'urban' else source_pack
    material_manifest = pack_manifest(material_pack['pointer'])
    reference = next(record for record in material_pack['records'] if record['member'].startswith('proad02.'))
    materials = {}
    for density in [2, 4]:
        sample = crops(material_manifest, reference, density)[1]
        materials[density] = periodic_material(sample, density, sample[..., :3][asphalt_pixels(sample)].mean(0))
    updates, members = {}, []
    for record in source_pack['records']:
        name = record['member'].split('.')[0]
        parking = theater in ['urban', 'newurban'] and name in ['rough01', 'rough02', 'rough03', 'rough06']
        crossing = name in ['proadc13', 'proadc14']
        intersection = name == 'proad03'
        strip = theater in ['urban', 'newurban'] and name in [
            'proad04', 'proad05', 'proad06', 'proad07', 'proad08', 'proad09', 'prslpe01', 'prslpe02']
        curved = theater == 'urban' and name == 'proad14'
        if not (parking or crossing or intersection or strip or curved):
            continue
        native_samples = []
        for frame in record['frames']:
            data = (args.sources / frame['file']).read_bytes()
            assert sha(data) == frame['sha256']
            width, height = frame['metadata']['logical']
            native_samples.append(np.frombuffer(data, np.uint8).reshape(height, width, 4))
        native, origin = assemble(record, native_samples)
        ramps = {frame['metadata']['rampType'] for frame in record['frames'] if not frame['empty']}
        assert len(ramps) == 1
        member = dict(member=record['member'], group=record['group'], sourceHashes=record['sourceHashes'], frames=[])
        for density in [2, 4]:
            samples = crops(manifest, record, density)
            authored, actual_origin = assemble(record, samples)
            np.testing.assert_array_equal(origin, actual_origin)
            repaired, detail = repair_member(authored, native, origin, density, materials[density], parking=parking,
                crosswalk=crossing, curved=curved, strip=strip,
                member=record['member'], ramp=next(iter(ramps)))
            if not detail['changed']:
                continue
            if density == 4:
                Image.fromarray(authored).save(output / f'{record["member"]}-before.png')
                Image.fromarray(repaired).save(output / f'{record["member"]}-after.png')
            member[f'geometry{density}x'] = detail
            for slot, (frame, old) in enumerate(zip(record['frames'], samples, strict=True)):
                if frame['empty']:
                    continue
                x, y = (np.array(frame['metadata']['origin']) + frame['metadata']['offset'] - origin) * density
                h, w = old.shape[:2]
                sample = repaired[y:y + h, x:x + w].copy()
                sample[..., 3] = old[..., 3]
                np.testing.assert_array_equal(sample[..., 3], old[..., 3])
                updates[record['member'], slot, density] = sample
                member['frames'].append(dict(slot=slot, density=density, rgbaSha256=sha(sample.tobytes()),
                    changedPixels=int(np.any(sample != old, axis=2).sum())))
        if member['frames']:
            members.append(member)
    changed, preserved = [], []
    for group in manifest['groups']:
        for variant in group['variants']:
            original = packs_root / pointer['revision'] / variant['file']
            density = variant['density']
            if not any((member['member'], slot, density) in updates for member in group['members'] for slot in range(len(member['images']))):
                clone(original, destination / variant['file'])
                preserved.append(dict(file=variant['file'], sha256=variant['sha256']))
                continue
            pixels = atlas(pointer['revision'], variant['file'], *variant['size'], variant['sha256']).copy()
            samples, seen, conflict, frame = [], {}, False, 0
            for member in group['members']:
                for slot in range(len(member['images'])):
                    x, y, w, h = variant['rects'][frame]
                    sample = updates.get((member['member'], slot, density), pixels[y:y + h, x:x + w].copy())
                    samples.append(sample)
                    key = x, y, w, h
                    value = sha(sample.tobytes())
                    conflict |= key in seen and seen[key] != value
                    seen[key] = value
                    frame += 1
            before_size = variant['size'][:]
            if conflict:
                pixels, variant['size'], variant['rects'] = repack(samples)
            else:
                for sample, (x, y, w, h) in zip(samples, variant['rects'], strict=True):
                    pixels[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(sample, ((2, 2), (2, 2), (0, 0)), mode='edge')
            changed.append(dict(file=variant['file'], before=variant['sha256'], after=sha(pixels.tobytes()),
                priorSize=before_size, size=variant['size'], dealiased=conflict))
            variant['sha256'] = changed[-1]['after']
            with (destination / variant['file']).open('xb') as stream:
                stream.write(pixels.tobytes())
    manifest['revision'] = revision
    encoded = json.dumps(manifest, separators=(',', ':')).encode() + b'\n'
    with (destination / 'manifest.json').open('xb') as stream:
        stream.write(encoded)
    receipt = dict(theater=theater, baseline=pointer, candidate=dict(schemaVersion=1, revision=revision, sha256=sha(encoded)),
        status='EXPORTED_NOT_SELECTED', members=members, changed=changed, preserved=preserved,
        preservedMemberPolicy='Keep accepted clear roads, broken road ends, snow cover, dirt and sand overlays, and non-urban fields unchanged.',
        nativeGeometryAlphaDepthRules='UNCHANGED', newMaterialImagesGenerated=0, windows='NOT_RUN_ON_THIS_MAC')
    (output / 'export.json').write_text(json.dumps(receipt, indent=2) + '\n')
    records.append(receipt)
    print(json.dumps(dict(theater=theater, members=len(members), changedFiles=len(changed),
        dealiasedFiles=sum(file['dealiased'] for file in changed), candidate=receipt['candidate'])), flush=True)
(args.sources.parent / f'export-{args.version}.json').write_text(json.dumps(records, indent=2) + '\n')
