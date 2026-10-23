"""Verify individual-family representative evidence without averaging away failures."""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('.artifacts/m1-6b');run=root/(sys.argv[1]if len(sys.argv)>1 else'runtime-candidate-v1')
d=json.loads((run/'result.json').read_text());export_root=root/d.get('exports','exports-v1');exports=json.loads((export_root/'report.json').read_text())
assert d['status']=='PASS_CONSOLIDATED_REPRESENTATIVE_RENDER'and not d['errors']and not d['consoleErrors']
assert d['cleanup']['released']
results={}
ledger=json.loads((root/'ledger.json').read_text())
for id,f in d['families'].items():
 rows=[];assert len(f['samples'])==12
 for s in f['samples']:
  if s['density']==1:continue
  o=next(o for o in f['samples']if o['density']==1 and o['state']==s['state']and o['mode']==s['mode'])
  for k in ['tick','logical','camera','points','parts']:assert s[k]==o[k],(id,s['file'],k)
  assert all(m['type']=='HdSpriteMaterial'and 'REPRESENTATIVE_ONLY'in m['identity']for m in s['materials'])
  assert all(m['type']!='HdSpriteMaterial'and m['identity']is None for m in o['materials'])
  assert [m['shadowMap']for m in s['materials']]==[m['shadowMap']for m in o['materials']]
  a=np.asarray(Image.open(run/id/s['file']));b=np.asarray(Image.open(run/id/o['file']));diff=np.any(a!=b,axis=2);assert diff.sum()>100
  sx=s['buffer'][0]/s['logical'][0];sy=s['buffer'][1]/s['logical'][1];xs=[p[0]for p in s['points']];ys=[p[1]for p in s['points']]
  x0=max(0,int((min(xs)-4)*sx));x1=int((max(xs)+4)*sx)+1;y0=max(0,int((min(ys)-4)*sy));y1=int((max(ys)+4)*sy)+1
  outside=diff.copy();outside[y0:y1,x0:x1]=False;assert not outside.any(),(id,s['file'],int(outside.sum()))
  rows.append({'file':s['file'],'changedPixels':int(diff.sum()),'outsideBuildingPixels':int(outside.sum())})
 e=exports['families'][id];assert e['sourceDensity']>=4 and not e['upsampling']
 for state,v in e['states'].items():
  for x in v['exports']:
   a=np.array(Image.open(export_root/id/x['base']));b=np.array(Image.open(export_root/id/x['data']));assert a.shape==b.shape
   assert (b[:,:,3]==255).all()and not b[:,:,2].any()and b[:,:,1].max()<=15
   assert not b[:,:,0][a[:,:,3]==0].any()
 results[id]={'status':'PASS_REPRESENTATIVE_INVARIANTS','pairs':rows,'sourceDensity':e['sourceDensity'],'stationaryChecks':e['stationaryChecks'],
  'visualDecision':ledger['families'][id].get('reviewDecision','PENDING_USER'),'completeFamily':'NOT PRODUCED','normalGameActivation':False}
receipt={'status':'PASS_CONSOLIDATED_REPRESENTATIVE_INVARIANTS','families':results,'textureCleanup':'PASS','scope':'Diagnostic art samples; full family, native functional gameplay and combined allocation budget remain post-approval work.'}
out=run/'evidence-check.json';assert not out.exists();out.write_text(json.dumps(receipt,indent=2)+'\n')
for id,r in results.items():
 l=ledger['families'][id]
 if l.get('reviewDecision','PENDING_USER')=='PENDING_USER':l['status']='sample ready'
 l['checks'].update(runtime=r['status'],export='PASS_REPRESENTATIVE_ONLY');l['exports']=[str(export_root.relative_to(root)/id)];l['reviewEvidence']=str(out.relative_to(root));l['fullFamilyFrameSlots']=sum(len(m['authorFrames'])for m in json.loads((root/'production-checklist-v1.json').read_text())['families'][id])
(root/'ledger.json').write_text(json.dumps(ledger,indent=2)+'\n');print(receipt['status'],{id:len(r['pairs'])for id,r in results.items()})
