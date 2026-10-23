"""Reuse the accepted Desert R2 port geometry for four corresponding NewUrban slopes."""
import copy
import hashlib
import os
import sys
from pathlib import Path
import numpy as np
from scipy import ndimage
from newurban_batch93_io import ROOT, GUIDE, crop, native, pin, read, sha, write

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from shared_road_network import asphalt_pixels, periodic_material, project_road_material

old = read(ROOT / 'export-and-preservation-v4.json')
assert read('.local/terrain-newurban-selection.json') == old['candidate']
baseline = old['candidate']
base = Path('.local/terrain-packs') / baseline['revision']
manifest = read(base / 'manifest.json')
revision = 'newurban-m2-4-accepted-road-network-batch93-v5'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
group, = [g for g in manifest['groups'] if g['id'] == 'm2-4-newurban-accepted-road-set47']
changed_files = {v['file'] for v in group['variants']}
preserved = []
for file in base.iterdir():
    if file.is_file() and file.name != 'manifest.json' and file.name not in changed_files:
        os.link(file, destination / file.name)
        preserved.append(pin(file))
sources = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
desert_guide = Path('.artifacts/m2-4/desert-native-v1/source.json')
donors = {s['member']: s for s in read(desert_guide)['sources']}
accepted = read('.local/terrain-desert-selection.json')
records = []
export = copy.deepcopy(old)
flat = np.concatenate([native(sources['proad02.ubn'], i)[..., :3][asphalt_pixels(native(sources['proad02.ubn'], i))]
                       for i in sources['proad02.ubn']['images']]).mean()
for variant in group['variants']:
    density = variant['density']
    before = np.fromfile(base / variant['file'], np.uint8).reshape(*reversed(variant['size']), 4)
    atlas = before.copy()
    controls = [crop(baseline, 'proad02.ubn', n, density) for n in range(3)]
    mean = np.concatenate([p[..., :3][asphalt_pixels(p)] for p in controls]).mean(0)
    material = periodic_material(controls[1], density, mean)
    broad = ndimage.gaussian_filter(material, (6 * density, 6 * density, 0), mode='wrap')
    medium = ndimage.gaussian_filter(material, (1.5 * density, 1.5 * density, 0), mode='wrap')
    material = mean + np.clip(material - medium + (medium - broad) * .25, -18, 18)
    offset = 0
    for member in group['members']:
        source = sources[member['member']]
        donor = donors[member['member'].replace('.ubn', '.des')]
        assert sha(desert_guide.parent / 'native' / donor['nativeFile']) == donor['sha256']
        gain = np.concatenate([native(source, f)[..., :3][asphalt_pixels(native(source, f))]
                               for f in source['images']]).mean() / flat
        target_record, = [r for r in export['records'] if r['member'] == member['member']]
        target_record.update(donorMember=donor['member'], acceptedDonor=accepted,
            correctedPortGeometry='REUSED_USER_ACCEPTED_DESERT_R2')
        for frame, donor_frame in zip(source['images'], donor['images'], strict=True):
            for key in ['subTile', 'grid', 'block', 'logical', 'offset', 'origin', 'height', 'hasExtraData', 'hasZData']:
                assert frame[key] == donor_frame[key], (source['member'], key)
            x, y, w, h = variant['rects'][offset]
            offset += 1
            pixels = crop(accepted, donor['member'], frame['subTile'], density)
            original = native(source, frame)
            alpha = original[..., 3].repeat(density, 0).repeat(density, 1)
            missing = (pixels[..., 3] == 0) & (alpha > 0)
            if missing.any():
                nearest = ndimage.distance_transform_edt(pixels[..., 3] == 0, return_distances=False, return_indices=True)
                pixels[missing, :3] = pixels[tuple(nearest)][missing, :3]
            pixels[..., 3] = alpha
            pixels, change = project_road_material(pixels, original, frame, density, material, float(gain))
            assert pixels.shape == (h, w, 4)
            assert np.array_equal(pixels[..., 3], before[y:y + h, x:x + w, 3])
            atlas[y - 2:y + h + 2, x - 2:x + w + 2] = np.pad(pixels, ((2, 2), (2, 2), (0, 0)), mode='edge')
            declaration, = [f for f in target_record['frames'] if f['density'] == density and f['subTile'] == frame['subTile']]
            declaration.update(rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest(),
                policy='ACCEPTED_DESERT_R2_PORT_GEOMETRY_WITH_SHARED_NEWURBAN_ASPHALT')
            records.append(dict(member=source['member'], donor=donor['member'], density=density,
                slot=frame['subTile'], donorOriginal=pin(desert_guide.parent / 'native' / donor['nativeFile']),
                beforeSha256=hashlib.sha256(before[y:y + h, x:x + w].tobytes()).hexdigest(),
                afterSha256=declaration['rgbaSha256'], alphaExact=True, material=change))
    file = destination / variant['file']
    with file.open('xb') as stream:
        stream.write(atlas.tobytes())
    variant['sha256'] = sha(file)
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
proof_file = ROOT / 'accepted-desert-slope-r2-reuse-v1.json'
write(proof_file, dict(status='FOUR_SLOPES_REUSE_ACCEPTED_R2_PORTS_NATIVE_RECHECK_PENDING',
    baseline=baseline, candidate=candidate, acceptedDesert=accepted, sourceGuide=pin(desert_guide), records=records,
    beforeNative=[pin(ROOT / 'native-2x-v1/report.json'), pin(ROOT / 'native-4x-v1/report.json')],
    internalVisualFinding='The initial accepted-source reuse retained older slope paint contacts. Reuse the already user-accepted Desert R2 line/curb geometry for the corresponding four source forms, without redoing unrelated accepted road material.',
    preservedPayloads=preserved, unchangedNewSources=30, changedNewSources=4,
    policy='Keep all target original metadata/alpha/depth, all 22 prior groups and 30 other new source payloads exact. Two raw density payloads change with their actual hashes. No budget, native map or runtime source behavior changes.',
    windows='NOT_RUN', m24Complete=False))
export.update(candidate=candidate, status='EXPORTED_ACCEPTED_R2_SLOPE_GEOMETRY_NATIVE_RECHECK_PENDING',
    incrementalCorrection=pin(proof_file), inheritedNativeSourcePaths=30, updatedNativeSourcePaths=4)
write(ROOT / 'export-and-preservation-v5.json', export)
contract = read('desktop/terrain-theater-hd-contracts.json')
assert contract['NEWURBAN'] == baseline
contract['NEWURBAN'] = candidate
write(ROOT / 'contract-candidate-v2.json', contract)
write(ROOT / 'selection-v2.json', dict(status='FOUR_SOURCE_INCREMENTAL_CORRECTION_SELECTED',
    candidate=candidate, previous=baseline, proof=pin(proof_file), windows='NOT_RUN', m24Complete=False))
Path('desktop/terrain-theater-hd-contracts.json').write_text(__import__('json').dumps(contract, indent=2) + '\n')
Path('.local/terrain-newurban-selection.json').write_text(__import__('json').dumps(candidate, indent=2) + '\n')
print(dict(candidate=candidate, updatedSources=4, inheritedNewSourcePaths=30, changedRawPayloads=2))
