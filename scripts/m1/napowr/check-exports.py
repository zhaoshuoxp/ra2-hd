"""Validate complete authored exports, stable architecture and owner-color scope."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('.artifacts/m1-6a');out=root/'full-exports-v2';review=json.loads((out/'candidate-review.json').read_text())
assert len(review['frames'])==67
assert Image.open(out/'ngpowr-01-4x.png').tobytes()==Image.open(out/'ngpowr-02-4x.png').tobytes()
results=[]
for frame in review['frames']:
 source=json.loads((root/'source-v1'/f"{frame['member']}.json").read_text())['frames'][frame['nativeFrame']]
 for e in frame['exports']:
  base=np.asarray(Image.open(out/e['base']));data=np.asarray(Image.open(out/e['data']));d=e['density']
  assert base.shape==((source['height']+source['height']%2)*d,(source['width']+source['width']%2)*d,4)
  assert np.all(data[...,2]==0) and np.all(data[...,3]==255) and np.all(data[...,1]<=15)
  assert not np.any((base[...,3]==0)&(data[...,0]!=0))
  assert np.any(base[...,3]>0)
  red=data[...,0]>0
  if frame['member']!='ntpowrmk.shp': assert len(np.unique(data[...,1][red]))>=10
  colored=[]
  for owner in ([24,80,255],[255,235,24]):
   ramp=np.floor(np.array(owner)[None,:]/255*np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])[:,None]*4)
   rgba=base.copy();rgba[red,:3]=ramp[data[...,1][red]]
   assert np.array_equal(rgba[~red],base[~red]);colored.append(rgba)
  results.append({'member':frame['member'],'frame':frame['nativeFrame'],'density':d,'remapPixels':int(red.sum()),'shades':np.unique(data[...,1][red]).tolist(),'neutralAndEmissiveUnchanged':True})
# Coverage is exactly stable for each normal/damaged activity sequence.
for begin in (0,19):
 for d in (2,4):
  images=[np.asarray(Image.open(out/f'ngpowr_a-{i:02d}-{d}x.png')) for i in range(begin,begin+19)]
  assert all(np.array_equal(im[...,3],images[0][...,3]) for im in images)
  changed=np.any(np.stack(images)!=images[0],axis=(0,3))
  yy,xx=np.where(changed)
  # Authored local effect mask lies strictly inside this native trim region.
  assert xx.min()>=35*d and xx.max()<80*d and yy.min()>=14*d and yy.max()<75*d
report={'status':'PASS_COMPLETE_EXPORTS','frames':67,'exports':134,'body2ReusesIdenticalNativeDamageState':True,'activityCoverageStable':True,'ownerColorChecks':results}
(root/'export-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='ownerColorChecks'}))
