"""Complete the missing native bridge overlay independently of its TMP approaches."""
import copy
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'m2'))
from shared_overlay_asphalt import project_asphalt

root = Path('.artifacts/m2-4/bridge-overlay-completion-r5-20261019')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, d: p.write_text(json.dumps(d, indent=2)+'\n')
guide = read(root/'native/source.json');source, = guide['sources']
assert source['member'] == 'bridge.ubn' and source['totalFrames'] == 36
assert source['hasShadow'] and not source['remapable']
donor_guide_root = Path('.artifacts/m2-4/urban-bridge-native-v1')
donor_source = next(s for s in read(donor_guide_root/'source.json')['sources'] if s['member'] == 'bridge.urb')
contract_file = Path('desktop/environment-newurban-hd-contract.json')
baseline_file = root/'baseline-contract.json'
contract = read(baseline_file);before_contract_sha = sha(baseline_file)
before = contract['selectedPack'];base = Path('.local/environment-packs')/before['revision']
assert sha(base/'manifest.json') == before['sha256']
manifest = read(base/'manifest.json')
donor_contract_file = Path('desktop/environment-urban-hd-contract.json')
donor_contract = read(donor_contract_file)
donor = Path('.local/environment-packs')/donor_contract['selectedPack']['revision']
assert sha(donor/'manifest.json') == donor_contract['selectedPack']['sha256']
donor_entry, = read(donor/'manifest.json')['families']['urban-bridge-high-concrete']['members']
metadata_file = donor/donor_entry['path'];assert sha(metadata_file) == donor_entry['sha256']
hd = read(metadata_file)
assert hd['source']['sha256'] == donor_source['sha256'] and hd['logical']['canvas'] == source['canvas']
assert sha(root/'native/native'/source['nativeFile']) == source['sha256']
assert sha(donor_guide_root/'native'/donor_source['nativeFile']) == donor_source['sha256']
equivalence = []
for target, old in zip(source['frames'], donor_source['frames'], strict=True):
    assert all(target[k] == old[k] for k in ['slot','origin','size','empty'])
    a = root/'native/native'/target['indexFile'];b = donor_guide_root/'native'/old['indexFile']
    assert sha(a) == target['indexSha256'] and sha(b) == old['indexSha256']
    ia, ib = np.fromfile(a,np.uint8),np.fromfile(b,np.uint8)
    assert np.array_equal(ia == 12,ib == 12)
    alpha_delta = int(((ia != 0) != (ib != 0)).sum())
    assert alpha_delta <= 1
    if target['slot'] >= 18:assert np.array_equal(ia,ib)
    equivalence.append(dict(frame=target['slot'],geometryExact=True,coverageDeltaNativePixels=alpha_delta,
        shadowExact=target['slot'] >= 18,indexExact=bool(np.array_equal(ia,ib))))

# Reuse the accepted Temperate material registration rather than reconstructing
# road paint or detail from enlarged retail pixels.
spec = importlib.util.spec_from_file_location('accepted_contacts',Path('scripts/m2/official-maps/export-gameplay-contacts.py'))
contacts = importlib.util.module_from_spec(spec);spec.loader.exec_module(contacts)
terrain_pointer = read(Path('.local/terrain-newurban-selection.json'))
assert terrain_pointer['revision'] == 'newurban-m2-4-shared-bridge-road-r4-v1'
terrain_root = Path('.local/terrain-packs')/terrain_pointer['revision']
assert sha(terrain_root/'manifest.json') == terrain_pointer['sha256']
road = next(g for g in read(terrain_root/'manifest.json')['groups'] if g['id'] == 'm2-4-newurban-bridge-road-set20')
means = {}
for variant in road['variants']:
    file = terrain_root/variant['file'];assert sha(file) == variant['sha256']
    w,h = variant['size'];atlas = np.fromfile(file,np.uint8).reshape(h,w,4);samples=[]
    for x,y,w,h in variant['rects'][:3]:
        piece=atlas[y:y+h,x:x+w];rgb=piece[...,:3].astype(float)
        mask=(piece[...,3]>0)&(rgb.max(2)<132)&(np.ptp(rgb,axis=2)<20)
        samples.extend(rgb[mask])
    means[variant['density']] = np.mean(samples,axis=0)

temp=read(Path('.local/terrain-selection.json'));temp_root=Path('.local/terrain-packs')/temp['revision']
assert sha(temp_root/'manifest.json')==temp['sha256']
temp_group=next(g for g in read(temp_root/'manifest.json')['groups'] if g['id']=='road-representative')
offset=read(Path('.artifacts/m2-4/bridge-network-seams-r4-20261019/export-and-preservation-v1.json'))['asphaltColorOffset']
templates={}
for variant in temp_group['variants']:
    density=variant['density'];file=temp_root/variant['file'];assert sha(file)==variant['sha256']
    width,height=variant['size'];atlas=np.fromfile(file,np.uint8).reshape(height,width,4);cursor=0
    for member in temp_group['members']:
        rects=variant['rects'][cursor:cursor+len(member['images'])];cursor+=len(member['images'])
        if member['member'] not in ['proad01.tem','proad02.tem']:continue
        canvas=Image.new('RGBA',(120*density,60*density))
        for image,rect in zip(member['images'],rects):
            x,y,w,h=rect;ox,oy=image['origin'];ox+=60 if member['member']=='proad01.tem' else 0
            canvas.alpha_composite(Image.fromarray(atlas[y:y+h,x:x+w]),(ox*density,oy*density))
        pixels=np.array(canvas);pixels[...,:3]=np.uint8(np.clip(pixels[...,:3].astype(float)+offset,0,255))
        templates[density,member['member']]=pixels

family='newurban-bridge-high-concrete';revision='newurban-environment-bridge-overlay-r5-v3'
destination=Path('.local/environment-packs')/revision;destination.mkdir(exist_ok=False)
preserved=0
for file in base.rglob('*'):
    if not file.is_file() or file == base/'manifest.json':continue
    target=destination/file.relative_to(base);target.parent.mkdir(parents=True,exist_ok=True)
    os.link(file,target);assert sha(file)==sha(target);preserved+=1
directory=destination/'members/bridge-ubn';directory.mkdir(parents=True)
records=[]
for variant in hd['variants']:
    density=variant['density'];assert density in [2,4] and len(variant['frames'])==18
    variant.pop('nativeFrameToneEvidence',None)
    for page in variant['pages']:
        old_base=metadata_file.parent/str(density)/page['id']/'base.png'
        old_data=metadata_file.parent/str(density)/page['id']/'data.png'
        assert sha(old_base)==page['baseSha256'] and sha(old_data)==page['dataSha256']
        pixels=np.array(Image.open(old_base).convert('RGBA'));data=np.array(Image.open(old_data).convert('RGBA'))
        for frame in variant['frames']:
            if frame['page']!=page['id']:continue
            slot=frame['nativeFrame'];native=source['frames'][slot]
            assert hd['logical']['frames'][slot]['trimOrigin']==native['origin']
            assert hd['logical']['frames'][slot]['trimSize']==native['size']
            x,y,w,h=frame['contentRect'];rgba=pixels[y:y+h,x:x+w].copy()
            valid=rgba[...,3]>0
            nearest=ndimage.distance_transform_edt(~valid,return_distances=False,return_indices=True)
            rgba[...,:3]=rgba[tuple(nearest)][...,:3]
            native_file=root/'native/native'/native['file'];assert sha(native_file)==native['rgbaSha256']
            original=np.fromfile(native_file,np.uint8).reshape(*native['size'][::-1],4)
            rgba[...,3]=(original[...,3]>0).repeat(density,0).repeat(density,1)*255
            band=contacts.high_bridge_band(rgba[...,:3],density,slot)
            rgb,proof=project_asphalt(rgba[...,:3],templates[density,'proad01.tem' if slot<9 else 'proad02.tem'],
                band,original[...,3]>0,native['origin'],slot,density)
            rgba[...,:3]=rgb;rgba[rgba[...,3]==0,:3]=0
            sx,sy,sw,sh=frame['sampleRect'];assert (sx,sy)==(x,y)
            expanded=np.pad(rgba,((0,sh-h),(0,sw-w),(0,0)),mode='edge')
            expanded[...,3]=0;expanded[:h,:w]=rgba
            padded=np.pad(expanded,((2,2),(2,2),(0,0)),mode='edge')
            padded[...,3]=0;padded[2:2+h,2:2+w]=rgba
            pixels[y-2:y+sh+2,x-2:x+sw+2]=padded
            np.testing.assert_array_equal(pixels[y:y+h,x:x+w,3],rgba[...,3])
            records.append(dict(frame=slot,density=density,**proof,sourceAlphaExact=True,
                shadow='EXACT_NATIVE_SOURCE',asphaltTarget=means[density].tolist()))
        covered=np.zeros(pixels.shape[:2],bool)
        for frame in variant['frames']:
            if frame['page']==page['id']:
                x,y,w,h=frame['contentRect'];covered[y:y+h,x:x+w]=True
        assert not pixels[...,3][~covered].any(), 'Gutters and legacy-size padding must remain transparent'
        target=directory/str(density)/page['id'];target.mkdir(parents=True)
        Image.fromarray(pixels).save(target/'base.png');Image.fromarray(data).save(target/'data.png')
        for role in ['base','data']:
            page[role+'Sha256']=sha(target/(role+'.png'));page[role+'Bytes']=(target/(role+'.png')).stat().st_size
hd.update(packId=family,packRevision=revision)
hd['source'].update(member='bridge.ubn',sha256=source['sha256'],theater='NEWURBAN')
hd['color'].pop('nativeFrameTone',None)
hd['color']['sharedContactMaterial']=dict(schema='source-pinned-accepted-bridge-overlay-material-v1',
    donorMetadataSha256=donor_entry['sha256'],donorMember='bridge.urb',targetSourceSha256=source['sha256'],
    roadTerrainPack=terrain_pointer,alpha='EXACT_TARGET_NATIVE',shadows='ORIGINAL_TARGET_SOURCE',
    material='Accepted Urban bridge artwork with the actual accepted Temperate road texture projection',
    acceptedRoadMaterial=temp)
write(directory/'manifest.json',hd)
descriptor={k:copy.deepcopy(source[k]) for k in ['sha256','canvas','totalFrames','palette','hasShadow','remapable']}
descriptor['bodyFrames']=18
descriptor['framePalettes']={str(slot):dict(**source['palette'],role='body',runtimeUsed=True,remapable=False) for slot in range(18)}
assert 'bridge.ubn' not in contract['sources'] and family not in contract['families']
basis=dict(theater='NEWURBAN',members={'bridge.ubn':descriptor},identities=['BRIDGE1','BRIDGE2'])
family_hash=hashlib.sha256(json.dumps(basis,sort_keys=True,separators=(',',':')).encode()).hexdigest()
contract['sources']['bridge.ubn']=descriptor
contract['families'][family]=dict(members=['bridge.ubn'],identities=['BRIDGE1','BRIDGE2'],editions=['yr'],kinds=['overlay'],familyHash=family_hash)
for name in ['BRIDGE1','BRIDGE2']:
    assert name not in contract['identities']['yr'];contract['identities']['yr'][name]=family
manifest['families'][family]=dict(familyHash=family_hash,members=[dict(member='bridge.ubn',path='members/bridge-ubn/manifest.json',sha256=sha(directory/'manifest.json'))])
manifest['revision']=revision;write(destination/'manifest.json',manifest)
pointer=dict(schemaVersion=1,revision=revision,sha256=sha(destination/'manifest.json'))
contract['selectedPack']=pointer;contract['preparedSourceSha256']=sha(root/'native/source.json')
contract['extensions']=dict(milestone='M2.4',baselineContractSha256=before_contract_sha,baselineSelectedPack=before,
    nativeGuideSha256=contract['preparedSourceSha256'],newFamilies=[family],state='FULL_OVERLAY_SOURCE_CLOSURE_NATIVE_PENDING')
write(root/'contract-candidate-v3.json',contract)
write(root/'export-and-source-audit-v3.json',dict(status='PASS_COMPLETE_18_FRAME_BOTH_DENSITY_OVERLAY_WITH_TARGET_GEOMETRY',
    baseline=before,candidate=pointer,family=family,member='bridge.ubn',densityFrames=36,
    preservedPayloadFiles=preserved,sourceEquivalence=equivalence,records=records,
    acceptedDonor=donor_contract['selectedPack'],acceptedDonorMetadataSha256=donor_entry['sha256'],
    terrainPreserved=terrain_pointer,native='PENDING',visual='PENDING',windows='NOT_RUN',m24Complete=False))
assert read(Path('.local/environment-newurban-selection.json')) in [before,read(root/'internal-visual-review-v2.json')['candidate']]
write(Path('.local/environment-newurban-selection.json'),pointer);write(contract_file,contract)
print(json.dumps(dict(selected=pointer,densityFrames=len(records),preservedPayloadFiles=preserved)))
