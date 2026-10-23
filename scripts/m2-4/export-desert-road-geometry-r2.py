"""Export complete Desert road geometry without changing native TMP coverage."""
import hashlib
import json
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'m2'))
from continuous_road_markings import fit_member, reconstruct
from shared_road_network import asphalt_pixels, periodic_material

root = Path('.artifacts/m2-4/desert-road-geometry-r2-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = read(root/'feedback.json')['baseline']
old_root = Path('.local/terrain-packs')/baseline['revision']
assert sha(old_root/'manifest.json') == baseline['sha256']
manifest = read(old_root/'manifest.json')
native_root = Path('.artifacts/m2-4/desert-native-v1')
sources = {s['member']: s for s in read(native_root/'source.json')['sources']}
revision = 'desert-m2-4-continuous-road-geometry-r2-v5'
destination = Path('.local/terrain-packs')/revision
destination.mkdir(exist_ok=False)
cache = {}


def native_pixels(image):
    file = native_root/'native'/image['file']
    assert sha(file) == image['rgbaSha256']
    return np.fromfile(file, np.uint8).reshape(*reversed(image['size']), 4)


def pixels(name, slot, density):
    group = next(g for g in manifest['groups'] if any(m['member'] == name for m in g['members']))
    variant = next(v for v in group['variants'] if v['density'] == density)
    file = old_root/variant['file']
    if file not in cache:
        assert sha(file) == variant['sha256']
        cache[file] = np.fromfile(file, np.uint8).reshape(*reversed(variant['size']), 4)
    offset = 0
    for member in group['members']:
        if member['member'] == name:
            break
        offset += len(member['images'])
    x, y, w, h = variant['rects'][offset+slot]
    return cache[file][y:y+h, x:x+w].copy()


names = ['proad01', 'proad01a', 'proad01b', 'proad01c', 'proad02', 'proad02a', 'proad02b', 'proad02c',
    'proad06', 'proad07', 'proad08', 'proad09', 'proad10', 'proad11', 'proad13', 'proad14',
    'prslpe01', 'prslpe02', 'prslpe03', 'prslpe04']
models = {}
for stem in names:
    name = stem+'.des'
    source = sources[name]
    frames = [i for i in source['images'] if i['nativeOffset']]
    low = np.min([np.array(i['origin'])+i['offset'] for i in frames], axis=0)
    high = np.max([np.array(i['origin'])+i['offset']+i['size'] for i in frames], axis=0)
    canvas = Image.new('RGBA', tuple(high-low))
    for image in frames:
        canvas.alpha_composite(Image.fromarray(native_pixels(image)),
            tuple(np.array(image['origin'])+image['offset']-low))
    models[name] = fit_member(np.array(canvas), low, name, frames[0]['rampType'])
(root/'geometry-models-v5.json').write_text(json.dumps([m['audit'] for m in models.values()], indent=2)+'\n')
flat_light = np.concatenate([native_pixels(i)[..., :3][asphalt_pixels(native_pixels(i))]
    for name in ['proad01.des', 'proad02.des'] for i in sources[name]['images']]).mean()
changed_groups = {'m2-4-desert-hybrid-roads-set20', 'm2-4-desert-equivalent-set47'}
records, preserved, palettes = [], [], []
for group in manifest['groups']:
    if group['id'] not in changed_groups:
        for variant in group['variants']:
            file = old_root/variant['file']
            assert sha(file) == variant['sha256']
            os.link(file, destination/variant['file'])
            preserved.append(dict(file=variant['file'], sha256=variant['sha256']))
        continue
    for variant in group['variants']:
        density = variant['density']
        original = np.fromfile(old_root/variant['file'], np.uint8).reshape(*reversed(variant['size']), 4)
        atlas = original.copy()
        donors = [pixels(name, slot, density) for name in ['proad01.des', 'proad02.des'] for slot in range(3)]
        asphalt = np.concatenate([p[..., :3][asphalt_pixels(p)] for p in donors])
        reference = pixels('proad01.des', 1, density)
        material = periodic_material(reference, density, asphalt.mean(0))
        # Transfer accepted fine and medium aggregate detail without a periodic
        # broad dark slab becoming a false slope joint. This is authored RGB
        # detail reuse, not enlarged native grain or independently drawn noise.
        broad = ndimage.gaussian_filter(material, (6*density, 6*density, 0), mode='wrap')
        medium = ndimage.gaussian_filter(material, (1.5*density, 1.5*density, 0), mode='wrap')
        material = asphalt.mean(0)+np.clip(material-medium+(medium-broad)*.25, -18, 18)
        yellow, white, curb = [], [], []
        for name in ['proad01.des', 'proad02.des']:
            for slot, image in enumerate(sources[name]['images']):
                p = pixels(name, slot, density)
                rgb = p[..., :3].astype(float)
                active = p[..., 3] > 0
                yellow.append(rgb[active & (rgb[..., 0] > 90) & (rgb[..., 1] > 70)
                    & (rgb[..., 2] < 100) & (np.ptp(rgb, axis=2) > 60)])
                white.append(rgb[active & (rgb.mean(2) > 160) & (np.ptp(rgb, axis=2) < 22)])
                n = native_pixels(image)[..., :3].astype(float)
                native_curb = (n.mean(2) > 110) & (np.ptp(n, axis=2) < 45)
                mask = ndimage.binary_erosion(native_curb, iterations=1).repeat(density, 0).repeat(density, 1)
                curb.append(rgb[active & mask])
        colors = dict(yellow=np.median(np.concatenate(yellow), axis=0),
            white=np.median(np.concatenate(white), axis=0), curb=np.median(np.concatenate(curb), axis=0))
        palettes.append(dict(density=density, colors={k: v.tolist() for k, v in colors.items()}))
        # The first accepted straight subtile owns the complete pale curb.
        # Bound dark strip-end shadows while retaining its authored HD material.
        detail = np.clip(donors[0][..., :3].astype(float), 115, 235)
        offset = 0
        for member in group['members']:
            source = sources[member['member']]
            assert sha(native_root/'native'/source['nativeFile']) == source['sha256'] == member['sourceHashes']['yr']
            slope = member['member'].startswith('prslpe')
            gain = (np.concatenate([native_pixels(i)[..., :3][asphalt_pixels(native_pixels(i))]
                for i in source['images']]).mean()/flat_light) if slope else 1
            for image in source['images']:
                x, y, w, h = variant['rects'][offset]
                offset += 1
                before = original[y:y+h, x:x+w].copy()
                changed = member['member'] in models and image['nativeOffset'] > 0
                result = reconstruct(before, native_pixels(image), image, density,
                    models[member['member']], material, colors, detail, gain) if changed else before.copy()
                np.testing.assert_array_equal(result[..., 3], before[..., 3])
                atlas[y-2:y+h+2, x-2:x+w+2] = np.pad(result, ((2, 2), (2, 2), (0, 0)), mode='edge')
                records.append(dict(member=member['member'], subTile=image['subTile'], density=density,
                    nativePointer=image['nativeOffset'], changed=changed,
                    changedPixels=int(np.any(result != before, axis=2).sum()), alphaExact=True,
                    bodySha256=hashlib.sha256(result.tobytes()).hexdigest()))
        (destination/variant['file']).write_bytes(atlas.tobytes())
        variant['sha256'] = sha(destination/variant['file'])
manifest['revision'] = revision
(destination/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination/'manifest.json'))
receipt = dict(status='EXPORTED_ANALYTIC_PAINT_AND_CURBS_NATIVE_PENDING', baseline=baseline,
    candidate=candidate, changedGroups=sorted(changed_groups), changedMembers=len(models),
    otherPayloadFilesExact=preserved, records=records, palettes=palettes,
    geometryModelsSha256=sha(root/'geometry-models-v5.json'), nativeGeometryAndAlpha='EXACT',
    nativeMapsOrRulesModified=False, corePreparedChanged=False, native='PENDING', visualAcceptance='PENDING',
    windows='NOT_RUN', m24Complete=False)
(root/'export-and-preservation-v5.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(dict(candidate=candidate, changedMembers=len(models), palettes=palettes)))
