"""Unify a bridge road network with the accepted Temperate road material."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from shared_bridge_road import road_surface

root = Path('.artifacts/m2-4/bridge-network-seams-r4-20261019')
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
before = read(Path('.local/terrain-newurban-selection.json'))
assert before['revision'] == 'newurban-m2-4-bridge-road-contact-r3-v2'
old_root = Path('.local/terrain-packs') / before['revision']
assert sha(old_root/'manifest.json') == before['sha256']
manifest = read(old_root/'manifest.json')
temperate = read(Path('.local/terrain-selection.json'))
temp_root = Path('.local/terrain-packs') / temperate['revision']
assert sha(temp_root/'manifest.json') == temperate['sha256']
temp_manifest = read(temp_root/'manifest.json')
guides = {name: read(root/f'{name}-guides/source.json') for name in ['newurban', 'temperate']}
sources = {name: {row['member']: row for row in guide['sources']} for name, guide in guides.items()}
layout = read(Path('.artifacts/m2-4/newurban-structures-contact-r1-authoring-20261019/layout.json'))
revision = 'newurban-m2-4-shared-bridge-road-r4-v1'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)


def main_pixels(theater, image):
    file = root/f'{theater}-guides'/image['main']['file']
    assert sha(file) == image['main']['sha256']
    return np.fromfile(file, np.uint8).reshape(30, 60, 4)


def entries(group, variant):
    result, offset = {}, 0
    for member in group['members']:
        result[member['member']] = variant['rects'][offset:offset+len(member['images'])]
        offset += len(member['images'])
    return result


road_group = next(g for g in temp_manifest['groups'] if any(m['member'] == 'proad02.tem' for m in g['members']))
template_member = next(m for m in road_group['members'] if m['member'] == 'proad02.tem')
temp_source = sources['temperate']['proad02.tem']
assert template_member['sourceHashes']['yr'] == temp_source['sha256']
assert sha(root/'temperate-guides'/temp_source['rawFile']) == temp_source['sha256']
# Calibrate one theater-wide asphalt offset, never separate colors per tile.
differences = []
for new, old in zip(sources['newurban']['proad02.ubn']['images'], temp_source['images']):
    a, b = main_pixels('newurban', new), main_pixels('temperate', old)
    valid = (a[..., 3] > 0) & (b[..., 3] > 0)
    valid &= (a[..., :3].max(2) < 110) & (b[..., :3].max(2) < 110)
    valid &= (np.ptp(a[..., :3], axis=2) < 20) & (np.ptp(b[..., :3], axis=2) < 20)
    differences.extend(a[valid, :3].astype(float)-b[valid, :3])
color_offset = np.mean(differences, axis=0)
assert np.max(np.abs(color_offset)) < 15
templates = {}
for variant in road_group['variants']:
    file = temp_root/variant['file']; assert sha(file) == variant['sha256']
    w, h = variant['size']; atlas = np.fromfile(file, np.uint8).reshape(h, w, 4)
    rects = entries(road_group, variant)['proad02.tem']
    templates[variant['density']] = [atlas[y:y+h, x:x+w].copy() for x, y, w, h in rects]

bridge_names = {'ovrps04.ubn', 'ovrps05.ubn', 'ovrps06.ubn'}
group = next(g for g in manifest['groups'] if any(m['member'] in bridge_names for m in g['members']))
records, exact_pairs, changed_pairs = [], 0, 0
for variant in group['variants']:
    file = old_root/variant['file']; assert sha(file) == variant['sha256']
    density = variant['density'];w, h = variant['size']
    original = np.fromfile(file, np.uint8).reshape(h, w, 4);updated = original.copy()
    rects = entries(group, variant)
    for member in group['members']:
        source = sources['newurban'].get(member['member'])
        if source:
            assert member['sourceHashes']['yr'] == source['sha256']
            assert sha(root/'newurban-guides'/source['rawFile']) == source['sha256']
        for image, rect in zip(member['images'], rects[member['member']]):
            x, y, w, h = rect; previous = original[y:y+h, x:x+w]; result = updated[y:y+h, x:x+w]
            if member['member'] in bridge_names and image['terrainType'] == 11 and image['height'] == 4:
                native = source['images'][image['subTile']]
                assert image == {k: v for k, v in native.items() if k not in ['nativeOffset', 'main']}
                lane = image['subTile'] % image['grid'][0]-1
                ox, oy = [-v*density for v in image['offset']]
                main = result[oy:oy+30*density, ox:ox+60*density]
                corrected, weight = road_surface(main, templates[density][lane],
                    main_pixels('newurban', native), lane, density, color_offset)
                main[:] = corrected
                outside = np.ones(previous.shape[:2], bool)
                outside[oy:oy+30*density, ox:ox+60*density] = weight == 0
                np.testing.assert_array_equal(previous[outside], result[outside])
                np.testing.assert_array_equal(previous[..., 3], result[..., 3])
                records.append(dict(member=member['member'],subTile=image['subTile'],density=density,
                    lane=lane,changedPixels=int(np.any(previous != result, axis=2).sum()),
                    alphaExact=True,nonRoadAndExtraDataExact=True))
            if np.array_equal(previous, result):exact_pairs += 1
            else:changed_pairs += 1
            updated[y-2:y+h+2, x-2:x+w+2] = np.pad(result, ((2, 2), (2, 2), (0, 0)), mode='edge')
    with (destination/variant['file']).open('xb') as stream:stream.write(updated.tobytes())
    variant['sha256'] = sha(destination/variant['file'])
for other in manifest['groups']:
    if other['id'] == group['id']:continue
    for variant in other['variants']:
        file = old_root/variant['file'];assert sha(file) == variant['sha256']
        os.link(file, destination/variant['file'])

# Include every native random straight-road alternative so encountering a different
# road variant cannot reopen a bridge join or mix densities inside this family.
road_members = []
for name in ['proad02.ubn', 'proad02a.ubn', 'proad02b.ubn', 'proad02c.ubn']:
    source = sources['newurban'][name]
    assert sha(root/'newurban-guides'/source['rawFile']) == source['sha256']
    road_members.append(dict(member=name,sourceHashes=dict(ra2=source['sha256'],yr=source['sha256']),
        images=[{k:v for k,v in image.items() if k not in ['nativeOffset','main']} for image in source['images']]))
new_group = dict(id='m2-4-newurban-bridge-road-set20',scope='COMPLETE_RANDOM_STRAIGHT_ROAD_FAMILY_SHARED_WITH_BRIDGE_ASPHALT',members=road_members,variants=[])
for density in [2, 4]:
    width, height = 256*density,128*density
    atlas = np.zeros((height,width,4),np.uint8);rects=[]
    for index, image in enumerate(image for member in road_members for image in member['images']):
        w,h=60*density,30*density;x=2+(index%4)*(w+4);y=2+(index//4)*(h+4)
        native = sources['newurban'][image['member']]['images'][image['subTile']]
        main = main_pixels('newurban', native)
        template = templates[density][image['subTile']]
        valid=template[...,3]>0; nearest=ndimage.distance_transform_edt(~valid,return_distances=False,return_indices=True)
        rgb=template[tuple(nearest)][...,:3].astype(float)+color_offset
        pixels=np.concatenate([np.uint8(np.clip(rgb,0,255)),main[...,3:4].repeat(density,0).repeat(density,1)],axis=2)
        atlas[y-2:y+h+2,x-2:x+w+2]=np.pad(pixels,((2,2),(2,2),(0,0)),mode='edge');rects.append([x,y,w,h])
    filename=f'm2-4-newurban-bridge-road-set20-{density}x.rgba'
    with (destination/filename).open('xb') as stream:stream.write(atlas.tobytes())
    new_group['variants'].append(dict(density=density,file=filename,size=[width,height],rects=rects,sha256=sha(destination/filename)))
manifest['groups'].append(new_group)
manifest.update(revision=revision,scope='SHARED_ACCEPTED_TEMPERATE_ROAD_SURFACE_ON_NATIVE_NEWURBAN_BRIDGE_AND_STRAIGHT_ROAD')
with (destination/'manifest.json').open('x') as stream:stream.write(json.dumps(manifest,indent=2)+'\n')
receipt=dict(status='PASS_SHARED_ROAD_SURFACE_AND_EXACT_NONROAD_PRESERVATION',baseline=before,
    candidate=dict(schemaVersion=1,revision=revision,sha256=sha(destination/'manifest.json')),
    temperateAuthority=temperate,templateMember='proad02.tem',asphaltColorOffset=color_offset.tolist(),
    changedBridgeMembers=sorted(bridge_names),changedBridgePairs=changed_pairs,exactOtherBridgePairs=exact_pairs,
    exactOtherGroups=len(manifest['groups'])-2,newStraightRoadMembers=4,records=records,
    alphaAndNativeGeometry='EXACT',extraDataAndNonRoadPixels='EXACT',goodOvrps02='EXACT',
    sourceGuideHashes={name:sha(root/f'{name}-guides/source.json') for name in guides},
    nativeValidation='PENDING',visualAcceptance='PENDING',windows='NOT_RUN',m24Complete=False)
with (root/'export-and-preservation-v1.json').open('x') as stream:stream.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ['status','candidate','changedBridgePairs','exactOtherBridgePairs','asphaltColorOffset']}))
