"""Validate every captured Original/HD pair, with individual family results."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root=Path('.artifacts/m1-6b')
run=root/(sys.argv[1] if len(sys.argv)>1 else 'runtime-complete-v1')
report=json.loads((run/'result.json').read_text())
assert report['status']=='PASS_COMPLETE_FAMILY_RENDER'
assert not report['errors'] and not report['consoleErrors']
results={}
for family,record in report['families'].items():
    pairs=[]
    for sample in record['samples']:
        if sample['density']==1 or sample['state'].startswith('owner-'):continue
        original=next(s for s in record['samples'] if s['state']==sample['state'] and s['mode']==sample['mode'] and s['density']==1)
        for key in ['tick','logical','camera','points','parts','crop','buffer','css']:
            assert sample[key]==original[key],(family,sample['state'],key)
        assert all(m['type']=='HdSpriteMaterial' and m['identity'].startswith(family.lower()+'/') for m in sample['materials'])
        assert all(m['type']!='HdSpriteMaterial' and m['identity'] is None for m in original['materials'])
        assert [m['shadowMap'] for m in sample['materials']]==[m['shadowMap'] for m in original['materials']]
        a=np.asarray(Image.open(run/family/sample['file']));b=np.asarray(Image.open(run/family/original['file']))
        changed=np.any(a!=b,axis=2);assert changed.any(),(family,sample['state'],'identical controls')
        xs,ys=zip(*sample['points']);sx=sample['buffer'][0]/sample['logical'][0];sy=sample['buffer'][1]/sample['logical'][1]
        x0=max(0,int((min(xs)-4)*sx)-sample['crop'][0]);x1=int((max(xs)+4)*sx)-sample['crop'][0]+1
        y0=max(0,int((min(ys)-4)*sy)-sample['crop'][1]);y1=int((max(ys)+4)*sy)-sample['crop'][1]+1
        outside=changed.copy();outside[y0:y1,x0:x1]=False
        assert not outside.any(),(family,sample['state'],int(outside.sum()))
        pairs.append(dict(state=sample['state'],mode=sample['mode'],changedPixels=int(changed.sum()),outsideBuildingPixels=0))
    colors=[s for s in record['samples'] if s['state'].startswith('owner-')]
    assert len(colors)==2 and colors[0]['palette']!=colors[1]['palette']
    assert not np.array_equal(np.asarray(Image.open(run/family/colors[0]['file'])),np.asarray(Image.open(run/family/colors[1]['file'])))
    alloc=report['allocations'][family]
    assert all(p['initialized'] for p in alloc['pages'])
    assert sum(p['base']+p['data'] for p in alloc['pages'])==alloc['report']['gpuBytes']
    assert report['damageRepairRemoval'][family]['status']=='PASS_NATIVE_DAMAGE_REPAIR_SALE'
    results[family]=dict(status='PASS_NATIVE_RENDER_INVARIANTS',pairs=pairs,ownerPalettes=[s['palette'] for s in colors],
                         effectiveDensity=alloc['report']['density'],gpuBytes=alloc['report']['gpuBytes'],finalVisualAcceptance='PENDING_USER')
old=report['acceptedAssets'];total=sum(old[k]['gpuBytes'] for k in ['conscript','powerPlant','napowr'])+16*(320*288*5+4)+sum(a['report']['gpuBytes'] for a in report['allocations'].values())
assert total<=256*1024*1024
assert [old[k]['density'] for k in ['conscript','powerPlant','napowr']]==[4,4,4]
receipt=dict(status='PASS_COMPLETE_RUNTIME_INVARIANTS',families=results,combinedOptionalGpuBytes=total,
             optionalTextureBudget=256*1024*1024,textureStorageTrace=report['textureStorage'],
             storageLimit='texStorage2D trace excludes unrecognized depth storage and non-texture allocations; not a claim of total physical VRAM',
             display=[{key:s[key] for key in ['mode','css','buffer','logical','dpr']} for s in next(iter(report['families'].values()))['samples'] if s['state']=='normal' and s['density']>1],
             visualAcceptance='PENDING_USER',nativeProduction=report['native']['status'])
(run/'evidence-check.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(receipt['status'],{f:len(r['pairs']) for f,r in results.items()},'GPU bytes',total)
