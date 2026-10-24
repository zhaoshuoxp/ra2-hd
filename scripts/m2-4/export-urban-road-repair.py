"""Replace coarse Urban road samples with source-checked accepted road artwork."""
import argparse
import copy
import hashlib
import json
import shutil
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from shared_road_network import asphalt_pixels, periodic_material, project_road_material

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('sources', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
sha = lambda data: hashlib.sha256(data).hexdigest()
read = lambda file: json.loads(Path(file).read_text())
proof = read(args.sources / 'source.json')
base_pointer = proof['baseline']
assert read('.local/terrain-urban-selection.json') == base_pointer
base = Path('.local/terrain-packs') / base_pointer['revision']
assert sha((base / 'manifest.json').read_bytes()) == base_pointer['sha256']
manifest = read(base / 'manifest.json')
before = copy.deepcopy(manifest)
destination = base.parent / args.revision
destination.mkdir(exist_ok=False)
records = {row['member']: row for row in proof['records']}


@lru_cache(maxsize=16)
def atlas(revision, file, expected_hash, width, height):
    data = (base.parent / revision / file).read_bytes()
    assert sha(data) == expected_hash
    return np.frombuffer(data, np.uint8).reshape(height, width, 4)


def crop(pointer, name, slot, density):
    root = base.parent / pointer['revision']
    assert sha((root / 'manifest.json').read_bytes()) == pointer['sha256']
    pack = read(root / 'manifest.json')
    group, = [group for group in pack['groups'] if any(member['member'] == name for member in group['members'])]
    variant, = [variant for variant in group['variants'] if variant['density'] == density]
    offset = 0
    for member in group['members']:
        if member['member'] == name:
            break
        offset += len(member['images'])
    x, y, width, height = variant['rects'][offset + slot]
    pixels = atlas(pointer['revision'], variant['file'], variant['sha256'], *variant['size'])
    return pixels[y:y + height, x:x + width].copy()


newurban = proof['donors'][0]
materials = {}
for density in [2, 4]:
    reference = crop(newurban, 'proad02.ubn', 1, density)
    mean = reference[..., :3][asphalt_pixels(reference)].mean(0)
    materials[density] = periodic_material(reference, density, mean)

changed, preserved, frames = [], [], []
for group in manifest['groups']:
    affected = any(member['member'] in records for member in group['members'])
    for variant in group['variants']:
        original_file = base / variant['file']
        original_bytes = original_file.read_bytes()
        assert sha(original_bytes) == variant['sha256']
        output_file = destination / variant['file']
        if not affected:
            shutil.copyfile(original_file, output_file)
            assert sha(output_file.read_bytes()) == variant['sha256']
            preserved.append(dict(file=variant['file'], sha256=variant['sha256']))
            continue
        pixels = np.frombuffer(original_bytes, np.uint8).reshape(*reversed(variant['size']), 4).copy()
        density, index, seen = variant['density'], 0, {}
        for member in group['members']:
            row = records[member['member']]
            for slot, frame in enumerate(row['frames']):
                width, height = frame['metadata']['logical']
                native_bytes = (args.sources / frame['file']).read_bytes()
                assert sha(native_bytes) == frame['sha256']
                native = np.frombuffer(native_bytes, np.uint8).reshape(height, width, 4)
                old = crop(base_pointer, member['member'], slot, density)
                if frame['empty']:
                    sample = old
                    detail = dict(policy='UNREFERENCED_EMPTY_SLOT_COMPATIBILITY_UNCHANGED')
                elif not row['exactDepth']:
                    sample, detail = project_road_material(old, native, frame['metadata'], density, materials[density])
                    detail['policy'] = 'URBAN_ROAD_FORM_WITH_ACCEPTED_NEWURBAN_ASPHALT'
                else:
                    donor = row['donor']
                    accepted = crop(donor['pointer'], donor['member'], slot, density)
                    offset = (np.array(donor['images'][slot]['offset']) - frame['metadata']['offset']) * density
                    dx, dy = map(int, offset)
                    sample = np.zeros_like(old)
                    left, top = max(0, dx), max(0, dy)
                    right = min(sample.shape[1], dx + accepted.shape[1])
                    bottom = min(sample.shape[0], dy + accepted.shape[0])
                    sample[top:bottom, left:right] = accepted[top - dy:bottom - dy, left - dx:right - dx]
                    target_alpha = native[..., 3].repeat(density, 0).repeat(density, 1)
                    missing = (target_alpha > 0) & (sample[..., 3] == 0)
                    assert (sample[..., 3] > 0).any()
                    nearest = ndimage.distance_transform_edt(sample[..., 3] == 0,
                        return_distances=False, return_indices=True)
                    sample[missing, :3] = sample[tuple(nearest)][missing, :3]
                    sample[..., 3] = target_alpha
                    detail = dict(policy='ACCEPTED_ROAD_ART_REGISTERED_TO_URBAN_COVERAGE', offset=[dx, dy],
                        filledCoverageSamples=int(missing.sum()), donor=donor['member'], pack=donor['pointer'])
                expected_alpha = native[..., 3].repeat(density, 0).repeat(density, 1)
                np.testing.assert_array_equal(sample[..., 3], expected_alpha)
                x, y, width, height = variant['rects'][index]
                assert sample.shape == (height, width, 4)
                key = x, y, width, height
                sample_hash = sha(sample.tobytes())
                assert key not in seen or seen[key] == sample_hash
                seen[key] = sample_hash
                pixels[y - 2:y + height + 2, x - 2:x + width + 2] = np.pad(
                    sample, ((2, 2), (2, 2), (0, 0)), mode='edge')
                frames.append(dict(member=member['member'], slot=slot, density=density, sha256=sample_hash,
                    **{**detail, 'changedPixels': int(np.any(sample != old, axis=2).sum())}))
                index += 1
        with output_file.open('xb') as stream:
            stream.write(pixels.tobytes())
        changed.append(dict(file=variant['file'], before=variant['sha256'], after=sha(pixels.tobytes())))
        variant['sha256'] = changed[-1]['after']

manifest['revision'] = args.revision
encoded = json.dumps(manifest, separators=(',', ':')).encode() + b'\n'
with (destination / 'manifest.json').open('xb') as stream:
    stream.write(encoded)
candidate = dict(schemaVersion=1, revision=args.revision, sha256=sha(encoded))
receipt = dict(schema='urban-road-repair-v1', status='EXPORTED_NOT_SELECTED', baseline=base_pointer,
    candidate=candidate, sourcesSha256=sha((args.sources / 'source.json').read_bytes()),
    members=len(records), changed=changed, preserved=preserved, frames=frames,
    nativeGeometrySourceHashesAndRules='UNCHANGED', atlasSizesAndRectangles='UNCHANGED',
    newImagesGenerated=0, windows='NOT_RUN_ON_THIS_MAC', visual='PENDING_USER_REVIEW')
with (args.sources / 'export.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(candidate=candidate, members=len(records), changedFiles=len(changed),
    preservedFiles=len(preserved), densitySlots=len(frames),
    targetFormMembers=[row['member'] for row in records.values() if not row['exactDepth']])))
