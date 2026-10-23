"""Correct only functional building layers and GI deployed firing registration."""
import copy
import sys
import subprocess
import numpy as np
from pathlib import Path
from PIL import Image, ImageFilter
from atlas import Member, read, write, sha

sys.path.insert(0, 'scripts/m1/allied-buildings')
from production_common import row_for, decode, normal_for, sheet_cells, indices, register, resting
sys.path.insert(0, 'scripts/m1/allied-units')

OUT = Path('.artifacts/allied-corrections')
GI_ONLY = '--gi-only' in sys.argv
REVISION = 'animation-r6' if GI_ONLY else 'animation-r5'
import json
catalog = json.loads(subprocess.check_output(['git', 'show', 'ee35fcf:desktop/allied-building-coverage.json']))
units = json.loads(subprocess.check_output(['git', 'show', 'ee35fcf:desktop/allied-unit-contracts.json']))
receipt = []

def region(image, box):
    out = Image.new('RGBA', image.size)
    out.paste(image.crop(box), box[:2])
    return out

def bag_bounds(image):
    a = np.asarray(image)
    r, g, b, alpha = (a[..., i].astype(float) for i in range(4))
    y = np.arange(image.height)[:, None]
    mask = (alpha > 128) & (r > g * 1.04) & (g > b * 1.14) & (r - g < 85) & (g > 45)
    mask &= y > image.height * .5
    return Image.fromarray(np.uint8(mask) * 255).getbbox()

def affine_part(image, source_box, target_box, canvas):
    sx = (target_box[2] - target_box[0]) / (source_box[2] - source_box[0])
    sy = (target_box[3] - target_box[1]) / (source_box[3] - source_box[1])
    tx, ty = target_box[0] - source_box[0] * sx, target_box[3] - source_box[3] * sy
    result = image.convert('RGBa').transform(canvas, Image.Transform.AFFINE,
        (1 / sx, 0, -tx / sx, 0, 1 / sy, -ty / sy), Image.Resampling.BICUBIC).convert('RGBA')
    return result, [sx, sy, tx, ty]

def semantic(base):
    a = np.array(base)
    r, g, b = (a[..., i].astype(float) for i in range(3))
    owner = (a[..., 3] > 0) & (r > g * 1.5) & (r > b * 1.5)
    owner &= ~((g > r*.25) & (g > b*1.3))
    data = np.zeros_like(a); data[..., 3] = 255
    data[..., 0][owner] = 255
    ramp = np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4
    shades = np.abs(r[..., None]-ramp).argmin(axis=2)
    data[..., 1][owner] = shades[owner]
    return Image.fromarray(data)

def publish_family(key, family, changes, cause):
    entry = catalog[key]
    new_family = copy.deepcopy(family)
    records = []
    for member in new_family['members']:
        if member['member'] not in changes: continue
        selected = Member(Path('.local/hd-packs') / member['packId'] / member['revision'])
        out, digest = selected.publish(REVISION, changes[member['member']], dict(cause=cause, baseManifestSha256=sha(selected.root / 'manifest.json')))
        member.update(revision=REVISION, sha256=digest)
        records.append(dict(member=member['member'], path=str(out), sha256=digest, changedSlots=sorted({n for _, n, _ in changes[member['member']]})))
    root = Path('.local') / entry['familyPath']
    target = root.parent.parent / REVISION / 'family.json'; target.parent.mkdir(exist_ok=False)
    new_family['correction'] = dict(cause=cause, baseFamilySha256=sha(root))
    write(target, new_family)
    entry.update(familyPath=str(target.relative_to('.local')), familyHash=sha(target))
    receipt.append(dict(key=key, familyPath=entry['familyPath'], familyHash=entry['familyHash'], members=records))

# Radar source contains three accepted views. Register their mounting rings,
# not each frame's changing dish/feed bounding box. Retain the separate beacon.
poses = sheet_cells(Image.open('.artifacts/allied-buildings/production-art-v1/GAAIRC/radar-raw.png').convert('RGBA'), 3, 1)
for theater in (() if GI_ONLY else ('TEMPERATE', 'SNOW')):
    key = 'gaairc-' + theater.lower(); family = read(Path('.local') / catalog[key]['familyPath'])
    row = row_for('GAAIRC', theater); native_member = row['members'][4]
    selected_member = next(m for m in family['members'] if m['member'] == native_member['source']['member'])
    old = Member(Path('.local/hd-packs') / selected_member['packId'] / selected_member['revision'])
    changed, transforms = {}, []
    for density in (2, 4):
        reference = region(old.frame(density, 0), (40*density, 30*density, 93*density, 40*density))
        target = reference.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox()
        for n in range(16):
            pose = poses[[0, 0, 1, 0, 2, 2, 2, 0][n % 8]]
            support = pose.getchannel('A').point(lambda a: 255 if a > 128 else 0)
            bounds = support.getbbox()
            ring = support.crop((0, round(bounds[3] - (bounds[3]-bounds[1]) * .23), pose.width, pose.height)).getbbox()
            origin_y = round(bounds[3] - (bounds[3]-bounds[1]) * .23)
            source_box = (ring[0], ring[1]+origin_y, ring[2], ring[3]+origin_y)
            # One rigid scale keeps dish proportions; the bottom ring defines the pivot.
            scale = (target[2]-target[0]) / (source_box[2]-source_box[0])
            target_box = (target[0], target[3]-(source_box[3]-source_box[1])*scale, target[2], target[3])
            head, transform = affine_part(pose, source_box, target_box, old.frame(density, n).size)
            native = old.manifest['logical']['frames'][n]
            x, y = [v*density for v in native['trimOrigin']]; w, h = [v*density for v in native['trimSize']]
            head = region(head, (x, y, min(93*density, x+w), min(40*density, y+h)))
            beacon = region(old.frame(density, n), (93*density, 40*density, 115*density, 68*density))
            head.alpha_composite(beacon)
            data = semantic(head)
            beacon_data = region(old.frame(density, n, 'data'), (93*density, 40*density, 115*density, 68*density))
            data.paste(beacon_data.crop((93*density, 40*density, 115*density, 68*density)), (93*density, 40*density))
            changed[density, n, 'base'], changed[density, n, 'data'] = head, data
            transforms.append(dict(density=density, frame=n, ringTarget=list(target_box), transform=transform))
    publish_family(key, family, {native_member['source']['member']: changed}, 'Per-frame whole-radar bounds moved/scaled the mounting ring')
    write(OUT / f'{key}-registration.json', transforms)

def row_bounds(mask):
    left, right = [], []
    for row in mask:
        xs = np.where(row)[0]
        left.append(xs[0] if len(xs) else np.nan); right.append(xs[-1]+1 if len(xs) else np.nan)
    ys = np.arange(len(left)); valid = ~np.isnan(left)
    return np.interp(ys, ys[valid], np.array(left)[valid]), np.interp(ys, ys[valid], np.array(right)[valid])

# The native body starts at y=42; its complete moving crown belongs to ACTIVE.
# Publish solid authored crown pixels, deforming their structure with the native
# crown's silhouette. Electrical emission remains a separate additive artwork layer.
for theater in (() if GI_ONLY else ('TEMPERATE', 'SNOW')):
    key = 'atesla-' + theater.lower(); family = read(Path('.local') / catalog[key]['familyPath'])
    row = row_for('ATESLA', theater)
    changes = {}
    for index, half in ((1, 9), (2, 10)):
        native_member = row['members'][index]; name = native_member['source']['member']
        member = next(m for m in family['members'] if m['member'] == name)
        old = Member(Path('.local/hd-packs') / member['packId'] / member['revision'])
        changed = {}
        for density in (2, 4):
            import os
            os.environ['RA2_EXPORT_DENSITY'] = str(density)
            # normal_for reads the module's density; only these accepted normal masters are needed.
            import production_common
            production_common.DENSITY = density
            path = Path('.artifacts/allied-buildings/review-v1') / ('ATESLA-candidate-2x.png' if theater == 'TEMPERATE' else 'ATESLA-SNOW-candidate-2x.png')
            if theater == 'SNOW':
                snow = sheet_cells(Image.open('.artifacts/allied-buildings/production-art-v1/ATESLA/snow-raw.png').convert('RGBA'), 2, 1)
                normal, _ = register(snow[0], row['members'][0]['canvas'], resting(row).getbbox())
                damaged_master, _ = register(snow[1], row['members'][0]['canvas'], resting(row, True).getbbox())
            else:
                normal = normal_for(path)
                damage = sheet_cells(Image.open('.artifacts/allied-buildings/production-art-v1/ATESLA/keys-raw.png').convert('RGBA'))[0]
                damaged_master, _ = register(damage, row['members'][0]['canvas'], resting(row, True).getbbox())
            for n in range(native_member['visibleFrames']):
                damaged = n >= half
                # Preserve the accepted damaged master and all shaft/base pixels.
                source = old.frame(density, n)
                head = region(damaged_master if damaged else normal, (0, 0, normal.width, 45*density))
                reference = indices(native_member, half if damaged else 0)[:45] != 0
                target = indices(native_member, n)[:45] != 0
                l0, r0 = row_bounds(reference); ln, rn = row_bounds(target)
                yy, xx = np.indices(head.size[::-1]); y = yy / density
                center0 = np.interp(y, np.arange(45), (l0+r0)/2)*density
                centern = np.interp(y, np.arange(45), (ln+rn)/2)*density
                ratio = np.interp(y, np.arange(45), (r0-l0)/np.maximum(1, rn-ln))
                map_x = center0 + (xx-centern)*ratio
                # Bilinear premultiplied resampling preserves solid structure and edge coverage.
                from scipy.ndimage import map_coordinates
                a = np.asarray(head.convert('RGBa'))
                warped = np.stack([map_coordinates(a[..., c], [yy, map_x], order=1, mode='constant', cval=0) for c in range(4)], axis=2)
                head = Image.frombytes('RGBa', head.size, np.uint8(warped).tobytes()).convert('RGBA')
                result = region(source, (0, 45*density, source.width, source.height))
                result.alpha_composite(head)
                if index == 2:
                    # Preserve native charge progression without masking solid moving RGB.
                    native = np.array(decode(row, native_member, n)); baseline = np.array(decode(row, native_member, half if damaged else 0))
                    rgb = native[..., :3].astype(float)
                    emission = (rgb.min(axis=2)>160) & (rgb.max(axis=2)-rgb.min(axis=2)<110)
                    emission &= (rgb.mean(axis=2)-baseline[..., :3].mean(axis=2)>25) & (native[..., 3]>0)
                    glow = Image.fromarray(np.uint8(emission)*200).resize(result.size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.6*density/2))
                    effect = Image.new('RGBA', result.size, (195, 220, 255, 0)); effect.putalpha(glow); result.alpha_composite(effect)
                changed[density, n, 'base'] = result
                data = old.frame(density, n, 'data'); replacement = semantic(result)
                data.paste(replacement.crop((0,0,data.width,45*density)), (0,0))
                changed[density, n, 'data'] = data
        changes[name] = changed
    publish_family(key, family, changes, 'Native moving silhouette was used as a clipping mask against a stationary painted crown')

if not GI_ONLY:
    write('desktop/allied-building-coverage.json', catalog)
    write(OUT / 'building-selections.json', receipt)

# Retain each authored firing pose. Register it by its sandbags, which do not
# recoil or change size when the flash alters the connected native body bounds.
work = read(OUT / 'e1-selected-worklist.json')['families']['E1']['members'][0]
batch = next(b for b in work['batches'] if b['action'] == 'DeployedFire')
assert sha(batch['selectedArt']) == batch['selectedArtSha256']
family_path = Path('.local') / units['shp']['E1']['familyPath']; family = read(family_path)
member = family['members'][0]; old = Member(Path('.local/hd-packs') / member['packId'] / member['revision'])
changed, metrics = {}, []
for density in (2,4):
    for j, sample in enumerate(batch['samples']):
        n = sample['frame']; reference = 316 + (j//6)*6
        if j % 2: continue
        reference_image = old.frame(density, reference)
        reference_crop = reference_image.crop(reference_image.getbbox())
        refbag = bag_bounds(reference_crop)
        rx, ry = reference_image.getbbox()[:2]
        target = (refbag[0]+rx, refbag[1]+ry, refbag[2]+rx, refbag[3]+ry)
        # Native firing already has the correct vertical registration. Correct
        # only the demonstrated horizontal compression; keep recoil and flash Y.
        accepted = old.frame(density, n)
        crop_box = accepted.getbbox(); crop = accepted.crop(crop_box)
        support = bag_bounds(crop)
        source_bag = (support[0]+crop_box[0], support[1]+crop_box[1], support[2]+crop_box[0], support[3]+crop_box[1])
        target_bag = (target[0], source_bag[1], target[2], source_bag[3])
        pose, transform = affine_part(accepted, source_bag, target_bag, reference_image.size)
        # Sandbags are a stationary assembly; use the accepted no-flash bag
        # surface while preserving the distinct upper body, gun and muzzle pose.
        stationary = region(reference_image, (0, target[1], reference_image.width, reference_image.height))
        from scipy.ndimage import binary_dilation
        emitted = np.array(pose); rgb = emitted[..., :3].astype(float)
        emission = (rgb[..., 0]>180) & (rgb[..., 1]>80) & (rgb[..., 0]>rgb[..., 1]*1.35) & (rgb[..., 1]>rgb[..., 2]*1.4) & (emitted[..., 3]>0)
        emission = binary_dilation(emission, iterations=density)
        emitted[..., 3] *= emission
        effect = Image.fromarray(emitted)
        pose.alpha_composite(stationary)
        pose.alpha_composite(effect)
        logical = old.manifest['logical']['frames'][n]
        x,y = [v*density for v in logical['trimOrigin']];w,h=[v*density for v in logical['trimSize']]
        pose = region(pose, (x,y,x+w,y+h))
        # Preserve the native embedded shadow/ground patch from the accepted slot.
        original = old.frame(density, n); pixels=np.array(original)
        shadow=(pixels[...,3]>0)&(pixels[...,:3].max(axis=2)<8)
        # The native embedded ground patch must not follow the artwork's X fit.
        fitted=np.array(pose)
        fitted[...,3][(fitted[...,3]>0)&(fitted[...,:3].max(axis=2)<8)]=0
        pose=Image.fromarray(fitted)
        ground=Image.fromarray(np.dstack([pixels[...,:3],np.uint8(shadow)*pixels[...,3]]));ground.alpha_composite(pose)
        changed[density,n,'base'] = ground
        data = semantic(ground)
        changed[density,n,'data'] = data
        metrics.append(dict(frame=n,density=density,reference=reference,bagTarget=list(target),atlasBag=list(source_bag),transform=transform,
                            maximumAtlasRegistrationScale=max(transform[:2])))
out,digest=old.publish(REVISION,changed,dict(cause='Connected native firing support and muzzle bounds resized the full sandbag/body artwork',baseManifestSha256=sha(old.root/'manifest.json')))
member.update(revision=REVISION,sha256=digest)
target=family_path.parent.parent/REVISION/'family.json';target.parent.mkdir(exist_ok=False);write(target,family)
entry=units['shp']['E1'];entry.update(familyPath=str(target.relative_to('.local')),hash=sha(target),familyHash=sha(target));entry['members'][0]['manifestHash']=digest
write('desktop/allied-unit-contracts.json',units)
write(OUT/'gi-registration.json',metrics)
print('Published '+('GI' if GI_ONLY else 'four building families and GI')+' in both densities; visual/runtime QA required')
