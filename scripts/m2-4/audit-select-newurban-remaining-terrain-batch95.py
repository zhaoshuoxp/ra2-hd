"""Independently verify new families and every inherited sample plus filter guard."""
from collections import Counter
import hashlib
import itertools
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch95_io import ROOT, GUIDE, assemble, atlas_pixels, crop, native, pin, read, sha, write

export = read(ROOT/'export-and-preservation-v4.json')
assert read(ROOT/'target-native-metadata-v3.json')['candidate'] == export['candidate']
baseline, pointer = export['baseline'], export['candidate']
roots = [Path('.local/terrain-packs')/p['revision'] for p in [baseline, pointer]]
for folder, p in zip(roots, [baseline, pointer], strict=True):
    assert sha(folder/'manifest.json') == p['sha256']
old, selected = [read(folder/'manifest.json') for folder in roots]
assert 92 == len(old['groups']) and 98 == len(selected['groups']) <= 256
assert (roots[1]/'manifest.json').stat().st_size <= 2*1024**2
assert selected['deferredSources'] == old['deferredSources']
assert not any(m['member'].startswith('prslpe') for g in selected['groups'] for m in g['members'])
prior = []
for index, before in enumerate(old['groups']):
    after = selected['groups'][index]
    assert {k:v for k,v in before.items() if k!='variants'} == {k:v for k,v in after.items() if k!='variants'}
    for density in [2,4]:
        variants = [next(v for v in group['variants'] if v['density']==density) for group in [before,after]]
        pages = [atlas_pixels(str(folder/v['file']),v['sha256'],tuple(v['size']))
                 for folder,v in zip(roots,variants,strict=True)]
        for slot,rects in enumerate(zip(variants[0]['rects'],variants[1]['rects'],strict=True)):
            guarded = [page[y-2:y+h+2,x-2:x+w+2] for page,(x,y,w,h) in zip(pages,rects,strict=True)]
            assert np.array_equal(*guarded),(before['id'],density,slot)
            prior.append(dict(group=before['id'],density=density,atlasSlot=slot,
                guardedRgbaSha256=hashlib.sha256(guarded[0].tobytes()).hexdigest()))
write(ROOT/'inherited-filter-guards-v3.json',dict(status='PASS_ALL_PRIOR_SAMPLES_AND_COMPLETE_TWO_TEXEL_GUARDS',
    baseline=baseline,candidate=pointer,count=len(prior),samples=prior))
for group in selected['groups']:
    assert sorted(v['density'] for v in group['variants']) == [2,4]
    for variant in group['variants']:
        file=roots[1]/variant['file']
        assert sha(file)==variant['sha256'] and file.stat().st_size==int(np.prod(variant['size'])*4)
        assert len(variant['rects'])==sum(len(m['images']) for m in group['members'])
        for x,y,w,h in variant['rects']:
            assert x>=2 and y>=2 and w>0 and h>0 and x+w+2<=variant['size'][0] and y+h+2<=variant['size'][1]
sources={s['member']:s for s in read(ROOT/'source.json')['sources']}
assert len(sources)==len(export['records'])==36
inventory=read('.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021/inventory-newurban-v2/inventory.json')
counts=Counter();coverage=[]
folder=ROOT/'registered-assemblies-v3';folder.mkdir(exist_ok=False)
for row in export['records']:
    source=sources[row['member']]
    definition,=[m for g in selected['groups'] if g['id']==row['group'] for m in g['members'] if m['member']==row['member']]
    assert definition['sourceHashes']==dict(yr=source['sha256'])
    assert definition['images']==[{k:v for k,v in image.items() if k not in ['nativeOffset','size','file','rgbaSha256']} for image in source['images']]
    for frame in row['frames']:
        density,slot=frame['density'],frame['subTile'];p=crop(pointer,row['member'],slot,density)
        assert hashlib.sha256(p.tobytes()).hexdigest()==frame['rgbaSha256']
        original=native(source,source['images'][slot])
        assert np.array_equal(p[...,3],original[...,3].repeat(density,0).repeat(density,1))
        if frame['nativePointer']<=0:
            assert np.array_equal(p,original.repeat(density,0).repeat(density,1))
            usages=[r['usage'] for r in inventory['rows'] if r['kind']=='tmp' and r['source']['member']==row['member']]
            assert usages and all(slot not in value['values'] for use in usages for value in use.values())
            counts['originalUnreferencedCompatibilityDensitySlots']+=1
        else:
            counts['authoredDensitySlots']+=1
            assert not frame['originalRgbUsedAsDetail']
        counts['densitySlots']+=1
        if frame.get('targetCoverage'):coverage.append(dict(member=row['member'],**frame))
    for density in [1,2,4]:
        panel,_=assemble([(f,native(source,f) if density==1 else crop(pointer,row['member'],f['subTile'],density))
                          for f in source['images'] if f['nativeOffset']>0],density)
        panel.save(folder/f'{source["member"]}-{density}x.png')
write(ROOT/'static-audit-v3.json',dict(status='PASS_36_COMPLETE_SOURCES_PRIOR_CROPS_AND_FILTER_GUARDS',
    candidate=pointer,members=36,priorMemberGroupsExact=92,priorGuardedDensitySamplesExact=len(prior),
    completeNewLoadFamilies=6,selectedGroups=len(selected['groups']),counts=dict(counts),
    coverageAdapters=coverage,manifestBytes=(roots[1]/'manifest.json').stat().st_size,
    prior4xRawBytesSaved=sum(v['savedRawBytes'] for v in export['losslessPriorPacking'] if v['density']==4),
    targetMetadata=pin(ROOT/'target-native-metadata-v3.json'),selectedNewMothers=0,
    memoryBudgets='UNCHANGED',windows='NOT_RUN',visual='PENDING_NEW_CONTEXT',m24Complete=False))
members=set(sources);maps=sorted({m for row in export['records'] for m in row['maps']})
cover={m:{r['member'] for r in export['records'] if m in r['maps']} for m in maps}
for size in range(1,len(maps)+1):
    solutions=[c for c in itertools.combinations(maps,size) if set.union(*(cover[m] for m in c))==members]
    if solutions:break
remaining=set(members);chosen=set(solutions[0]);cases=[]
important={'cliffx01.ubn','cliffx05.ubn','cliffx08.ubn','cliffx12.ubn','cliffx19.ubn','cliffx21.ubn','cliffx22.ubn',
           'cliffx33.ubn','cliffx34.ubn','cliffx35.ubn','cliffx36.ubn','cliffx37.ubn','cliffx39.ubn','cliffx40.ubn',
           'wclifx10.ubn','baseb01.ubn','droadc09.ubn'}
while chosen:
    map_id=max(sorted(chosen),key=lambda m:len(cover[m]&remaining));new=sorted(cover[map_id]&remaining)
    captures=sorted(set(new)&important)
    cases.append(dict(mapId=map_id,newMembers=new,captureMembers=captures or new[:1]))
    remaining-=cover[map_id];chosen.remove(map_id)
write(ROOT/'native-case-plan-v3.json',dict(status='MINIMUM_ORIGINAL_MAP_SOURCE_MEMBERSHIP_COVER',cases=cases,
    members=len(members),densityPaths=len(members)*2,mapCount=len(cases),
    selectionBasis='Exhaustive cover over unchanged native source dependencies. Check each newly selected source once per density; capture representative complete structures and all bounded shape adapters.'))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
preview=['cliffx01.ubn','cliffx05.ubn','cliffx21.ubn','cliffx22.ubn','cliffx33.ubn','cliffx34.ubn','cliffx39.ubn','cliffx40.ubn','wclifx10.ubn','baseb01.ubn','droadc09.ubn']
for page_index in range(3):
    chosen=preview[page_index*4:(page_index+1)*4]
    canvas=Image.new('RGB',(1450,len(chosen)*350),(22,30,34));draw=ImageDraw.Draw(canvas)
    for row,name in enumerate(chosen):
        for col,(density,label) in enumerate([(1,'Original x3'),(2,'2X actual'),(4,'4X actual')]):
            im=Image.open(folder/f'{name}-{density}x.png')
            if density==1:im=im.resize((im.width*3,im.height*3),Image.Resampling.NEAREST)
            im.thumbnail((470,305));canvas.paste(im,(10+col*480,row*350+35),im)
            draw.text((10+col*480,row*350+5),f'{name} {label}',font=font,fill='white')
    canvas.save(ROOT/f'authored-structure-inspection-part{page_index+1}-v3.png')
assert read('.local/terrain-newurban-selection.json')==read(ROOT/'selection-v2.json')['candidate']
contract=read('desktop/terrain-theater-hd-contracts.json');assert contract['NEWURBAN']==read(ROOT/'selection-v2.json')['candidate']
contract['NEWURBAN']=pointer
Path('desktop/terrain-theater-hd-contracts.json').write_text(json.dumps(contract,indent=2)+'\n')
Path('.local/terrain-newurban-selection.json').write_text(json.dumps(pointer,indent=2)+'\n')
write(ROOT/'selection-v3.json',dict(status='SELECTED_AFTER_STATIC_AUDIT_NATIVE_PENDING',candidate=pointer,baseline=baseline,
    audit=pin(ROOT/'static-audit-v3.json'),native='NOT_RUN',windows='NOT_RUN',m24Complete=False))
print(dict(status='PASS_STATIC_SELECTED',counts=dict(counts),priorGuardedSamplesExact=len(prior),
    nativeCases=[dict(map=c['mapId'],paths=len(c['newMembers']),captures=len(c['captureMembers'])) for c in cases]))
