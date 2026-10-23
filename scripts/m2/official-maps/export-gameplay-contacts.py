"""Share accepted water/asphalt materials across native bridge contact pieces."""
import copy
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha


def read(p):
    return json.loads(p.read_text())


def contact_masks(native, sea_colors, road_band=None):
    rgb = native[..., :3].astype(float)
    active = native[..., 3] > 0
    yellow = active & (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 0] < rgb[..., 1]*1.25) & (rgb[..., 1] > 100) & (rgb[..., 2] < 32)
    supplied_band = road_band is not None
    if road_band is None:
        road_band = np.zeros(active.shape, bool)
    ys, xs = np.where(yellow)
    if len(xs) >= 5 and not supplied_band:
        points = np.column_stack([xs, ys])
        center = np.median(points, axis=0)
        _, _, vectors = np.linalg.svd(points-center, full_matrices=False)
        yy, xx = np.indices(active.shape)
        distance = np.abs((xx-center[0])*vectors[1, 0] + (yy-center[1])*vectors[1, 1])
        width = np.quantile(np.abs((points-center) @ vectors[1]), .95)+1
        road_band = distance <= width
    packed = native[..., 0].astype(np.uint32)*65536 + native[..., 1].astype(np.uint32)*256 + native[..., 2]
    water = active & np.isin(packed, sea_colors) & ~road_band
    labels, _ = ndimage.label(water)
    sizes = np.bincount(labels.ravel())
    water &= sizes[labels] >= 8
    asphalt = road_band & active & (rgb.max(2) < 132) & (rgb.max(2)-rgb.min(2) < 30)
    return water, asphalt


def high_bridge_band(authored, density, native_frame):
    """Recover the full native isometric deck corridor from accepted lane marks."""
    rgb = authored.astype(float)
    marks = (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 0] < rgb[..., 1]*1.25) & (rgb[..., 1] > 100) & (rgb[..., 2] < 80)
    ys, xs = np.where(marks)
    assert len(xs) >= 20, 'Concrete deck lane references must be present'
    slope = .5 if native_frame < 9 else -.5
    distance = (ys/density + slope*xs/density)/np.sqrt(1.25)
    lo, hi = np.quantile(distance, [.02, .98])
    yy, xx = np.indices((authored.shape[0]//density, authored.shape[1]//density))
    signed = (yy + slope*xx)/np.sqrt(1.25)
    return (signed >= lo-1) & (signed <= hi+1)


def contacts(authored, native, density, sea_colors, sea_mean, road_mean, road_band=None):
    water, road = contact_masks(native, sea_colors, road_band)
    native_authored = np.asarray(Image.fromarray(authored).resize(native.shape[1::-1], Image.Resampling.BOX)).astype(float)
    # Several dark road/stone shades share retail palette values with water.
    # A blue authored material must corroborate a native water color match.
    water &= (native_authored[...,2]>native_authored[...,0]+5) & (native_authored[...,2]>native_authored[...,1]+2)
    if road_band is not None:
        # Retail bridge colors can be muted. Retain the accepted colored paint
        # even when its native palette shade resembles dark asphalt.
        road = road_band & (native[...,3]>0) & (native_authored.max(2)<140) & (native_authored.mean(2)>30) & (native_authored.max(2)-native_authored.min(2)<45)
    result = authored.copy()
    detail = authored.astype(float)-ndimage.gaussian_filter(authored.astype(float), (density*2, density*2, 0))
    for mask, mean, strength in [(water, sea_mean, .18), (road, road_mean, .65)]:
        if not mask.any():
            continue
        enlarged = np.repeat(np.repeat(mask, density, 0), density, 1)
        # Match the broad shared material. Preserve only bounded fine structure,
        # including restrained retail pier ripples and accepted authored detail.
        native_detail = native[..., :3].astype(float)-mean
        original = np.asarray(Image.fromarray(np.uint8(np.clip(mean+native_detail*.2, 0, 255)))
            .resize(result.shape[1::-1], Image.Resampling.BICUBIC)).astype(float)
        if mask is road:
            # Use the live accepted paved road tone, rather than a historical
            # nominal value. Keep fine neutral texture without broad color blocks.
            texture = np.clip(detail.mean(2, keepdims=True), -20, 20)
            value = np.uint8(np.clip(mean+texture*strength, 0, 255))
        else:
            value = np.uint8(np.clip(original+np.clip(detail, -16, 16)*strength, 0, 255))
        result[enlarged] = value[enlarged]
    return result, dict(waterNativePixels=int(water.sum()), asphaltNativePixels=int(road.sum()))


def main():
    env_base, component_patch, env_output, terrain_base, terrain_output, evidence = map(Path, sys.argv[1:7])
    assert all(not p.exists() for p in [env_output, terrain_output, evidence])
    env = read(env_base/'manifest.json')
    terrain = read(terrain_base/'manifest.json')
    bridge_guide = Path('/Users/Aone/RA2remaster/ra2-hd/.artifacts/m2-2/prepared-native-v2')
    new_guide = Path('.artifacts/m2-3/native-guides-v3')
    old_sources = {s['member']: s for s in read(bridge_guide/'source.json')['sources']}
    new_sources = {s['member']: s for s in read(new_guide/'source.json')['sources']}
    bridge_layout = read(Path('.artifacts/m2-3/authoring-tmp-v2/layout.json'))
    road_bands = {}
    for name in [n for n in new_sources if n.startswith('ovrps')]:
        full = np.asarray(Image.open(Path('.artifacts/m2-3/authoring-tmp-v2')/(name+'-native.png')).convert('RGBA'))
        # Recover the whole road band once, then use the same geometry for every
        # sub-tile, including pieces that contain no lane-mark pixels themselves.
        _, band = contact_masks(full, [])
        colors = full[..., :3].astype(float)
        marks = (full[...,3]>0)&(colors[...,0]>=colors[...,1])&(colors[...,0]<colors[...,1]*1.25)&(colors[...,1]>100)&(colors[...,2]<32)
        ys,xs = np.where(marks)
        if len(xs)>=5:
            points=np.column_stack([xs,ys]);center=np.median(points,axis=0)
            _,_,vectors=np.linalg.svd(points-center,full_matrices=False)
            yy,xx=np.indices(full.shape[:2])
            width=np.quantile(np.abs((points-center) @ vectors[1]),.95)+1
            road_bands[name]=np.abs((xx-center[0])*vectors[1,0]+(yy-center[1])*vectors[1,1])<=width
    sea_source = old_sources['water04.tem']
    f = sea_source['images'][0]
    native_sea = np.asarray(Image.frombytes('RGBA', tuple(f['logical']), (bridge_guide/'native'/f['file']).read_bytes()))
    valid = native_sea[..., 3] > 0
    c = native_sea[..., :3][valid].astype(np.uint32)
    sea_colors = np.unique(c[:, 0]*65536+c[:, 1]*256+c[:, 2])
    group = next(g for g in terrain['groups'] if any(m['member'] == 'water04.tem' for m in g['members']))
    offset = sum(len(m['images']) for m in group['members'][:next(i for i,m in enumerate(group['members']) if m['member']=='water04.tem')])
    sea_means = {}
    for v in group['variants']:
        x,y,w,h = v['rects'][offset]
        atlas = np.frombuffer((terrain_base/v['file']).read_bytes(),np.uint8).reshape(*v['size'][::-1],4)
        piece = atlas[y:y+h,x:x+w]
        sea_means[v['density']] = piece[..., :3][piece[...,3]>0].mean(0)
    road_group = next(g for g in terrain['groups'] if g['id']=='road-representative')
    road_means = {}
    for v in road_group['variants']:
        atlas = np.frombuffer((terrain_base/v['file']).read_bytes(),np.uint8).reshape(*v['size'][::-1],4)
        rgb = atlas[...,:3].astype(float)
        mask = (atlas[...,3]>0)&(rgb.max(2)<140)&(rgb.max(2)-rgb.min(2)<30)
        road_means[v['density']] = rgb[mask].mean(0)
    changed = []
    env_output.mkdir(parents=True)
    result = copy.deepcopy(env)
    result['revision'] = env_output.name
    patch = read(component_patch/'manifest.json')
    for family, record in result['families'].items():
        selected = patch['families'].get(family, record)
        origin = component_patch if family in patch['families'] else env_base
        result['families'][family] = copy.deepcopy(selected)
        for entry in result['families'][family]['members']:
            source, target = origin/entry['path'], env_output/entry['path']
            assert sha(source) == entry['sha256']
            shutil.copytree(source.parent, target.parent)
            if family not in ['environment-lobrdb', 'environment-bridge']:
                continue
            meta = read(target)
            native_guide = bridge_guide if entry['member'] in old_sources else new_guide
            native = (old_sources if entry['member'] in old_sources else new_sources)[entry['member']]
            assert native['sha256'] == meta['source']['sha256']
            member_changes = []
            for v in meta['variants']:
                d = v['density']
                for page in v['pages']:
                    file = target.parent/str(d)/page['id']/'base.png'
                    image = np.array(Image.open(file).convert('RGBA'))
                    before = image.copy()
                    seen = set()
                    for frame in v['frames']:
                        if frame['page'] != page['id'] or tuple(frame['sampleRect']) in seen:
                            continue
                        seen.add(tuple(frame['sampleRect']))
                        f = native['frames'][frame['nativeFrame']]
                        if f['empty']:
                            continue
                        original_file = native_guide/'native'/f['file']
                        assert sha(original_file) == f['rgbaSha256']
                        original = np.array(Image.frombytes('RGBA',tuple(f['size']),original_file.read_bytes()))
                        x,y,w,h = frame['contentRect']
                        deck_rgb = image[y:y+h,x:x+w,:3]
                        if entry['member']=='bridge.tem':
                            band = high_bridge_band(deck_rgb, d, frame['nativeFrame'])
                        else:
                            number = int(entry['member'][6:8])
                            orientation = 0 if number<=9 or 19<=number<=22 else 9
                            band = high_bridge_band(deck_rgb, d, orientation)
                        rgb, counts = contacts(image[y:y+h,x:x+w,:3], original, d, sea_colors, sea_means[d], road_means[d], band)
                        image[y-2:y+h+2,x-2:x+w+2,:3] = np.pad(rgb,((2,2),(2,2),(0,0)),mode='edge')
                        member_changes.append(dict(member=entry['member'], frame=frame['nativeFrame'], density=d, **counts))
                    assert np.array_equal(image[...,3],before[...,3])
                    image[image[...,3]==0,:3]=0
                    Image.fromarray(image).save(file)
                    page['baseSha256'], page['baseBytes'] = sha(file),file.stat().st_size
            meta['packRevision'] = env_output.name
            meta['color']['sharedContactMaterial'] = dict(water='Accepted water04.tem density-specific mean',
                asphalt='Accepted road-representative density-specific mean',nativeMasks=True)
            target.write_text(json.dumps(meta,separators=(',',':'))+'\n')
            entry['sha256'] = sha(target)
            changed.extend(member_changes)
    (env_output/'manifest.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    terrain_output.mkdir(parents=True)
    result = copy.deepcopy(terrain)
    result['revision'] = terrain_output.name
    changed_groups = []
    for group in result['groups']:
        # Previously accepted water/shore groups retain exact payloads. Register
        # the added concrete bridge approaches and other added water backgrounds.
        candidate = group['id'] in {f'm2-3-set{i:02d}' for i in [12,15,19,30,49,51,57]} or group['id']=='m2-3-r4-set80'
        group_changed = False
        for v in group['variants']:
            src, dst = terrain_base/v['file'], terrain_output/v['file']
            assert sha(src) == v['sha256']
            atlas = np.frombuffer(src.read_bytes(),np.uint8).reshape(*v['size'][::-1],4).copy()
            before = atlas.copy()
            offset = 0
            if candidate:
                for member in group['members']:
                    native = new_sources[member['member']]
                    for info in member['images']:
                        rect = v['rects'][offset]
                        offset += 1
                        frame = next(f for f in native['images'] if f['subTile']==info['subTile'])
                        file = new_guide/'native'/frame['file']
                        assert sha(file) == frame['rgbaSha256']
                        original = np.asarray(Image.frombytes('RGBA',tuple(info['logical']),file.read_bytes()))
                        x,y,w,h = rect
                        band = None
                        if member['member'] in road_bands and group['id']=='m2-3-set19':
                            px,py,pw,ph = next(p['rect'] for p in bridge_layout[member['member']]['parts'] if p['subTile']==info['subTile'])
                            band=road_bands[member['member']][py:py+ph,px:px+pw]
                            assert band.shape==original.shape[:2]
                        rgb, counts = contacts(atlas[y:y+h,x:x+w,:3],original,v['density'],sea_colors,sea_means[v['density']],road_means[v['density']],band)
                        # Only the bridge approaches share roadway material here.
                        if group['id'] != 'm2-3-set19':
                            water, road = contact_masks(original, sea_colors)
                            road = np.repeat(np.repeat(road,v['density'],0),v['density'],1)
                            rgb[road] = atlas[y:y+h,x:x+w,:3][road]
                            counts['asphaltNativePixels'] = 0
                        atlas[y-2:y+h+2,x-2:x+w+2,:3] = np.pad(rgb,((2,2),(2,2),(0,0)),mode='edge')
                        if any(counts.values()):
                            changed.append(dict(member=member['member'],subTile=info['subTile'],density=v['density'],**counts))
                group_changed |= not np.array_equal(atlas,before)
            assert np.array_equal(atlas[...,3],before[...,3])
            dst.parent.mkdir(parents=True,exist_ok=True)
            dst.write_bytes(atlas.tobytes())
            v['sha256'], v['bytes'] = sha(dst),dst.stat().st_size
        if group_changed:
            changed_groups.append(group['id'])
    (terrain_output/'manifest.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    evidence.write_text(json.dumps(dict(status='EXPORTED_COMPLETE_REUSABLE_CONTACTS_PENDING_NATIVE_QA',
        changedEnvironmentFamilies=['environment-ctairp','environment-ctoild','environment-lobrdb','environment-bridge'],
        changedTerrainGroups=changed_groups,seaMeans={str(k):v.tolist() for k,v in sea_means.items()},
        roadMeans={str(k):v.tolist() for k,v in road_means.items()},
        changes=changed,logicalGeometry='EXACT_PRESERVED',alpha='EXACT_PRESERVED',
        environment=dict(schemaVersion=1,revision=env_output.name,sha256=sha(env_output/'manifest.json')),
        terrain=dict(schemaVersion=1,revision=terrain_output.name,sha256=sha(terrain_output/'manifest.json'))),indent=2)+'\n')
    print(json.dumps(dict(environment=str(env_output),terrain=str(terrain_output),changedGroups=changed_groups)))


if __name__ == '__main__':
    main()
