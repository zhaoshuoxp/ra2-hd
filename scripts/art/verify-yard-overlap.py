"""Check the localized base-layer exception and unchanged shipyard mechanics."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from buildup import read,sha,unpack,write
from retained_idle import display,terminal
from painted_rig import over

root=Path('.artifacts/buildup-remaining-20261013-r74-v1');r=root/'yard-seam-r86-v1';c=r/'candidate-v2'
a=read(c/'completed-layer-authoring.json');old=read(root/'infrastructure-original-r85-v1/selected-v1/authoring.json')
repair=read(c/'overlap-repair.json');checks=[]
for row in repair['checks']:
 key=row['key']
 if key!='gayard-temperate':continue
 rec=next(x for x in a['families'] if x['key']==key);before=next(x for x in old['families'] if x['key']==key)
 old_family,new_family=read(before['newFamilyPath']),read(rec['newFamilyPath'])
 assert new_family['members']==[row['newMember'] if m==row['oldMember'] else m for m in old_family['members']]
 roots=[Path('.local/hd-packs')/m['packId']/m['revision'] for m in [row['oldMember'],row['newMember']]]
 manifests=[read(p/'manifest.json') for p in roots]
 assert manifests[0]['logical']==manifests[1]['logical'] and manifests[0]['source']==manifests[1]['source']
 mask4=terminal.polygon((304*4,432*4,4),row['polygon'])
 for density in [2,4]:
  mask=np.array(Image.fromarray(mask4).resize((432*density,304*density),Image.Resampling.NEAREST))
  for phase in range(3):
   for role in ['base','data']:
    x,y=[unpack(p,m,density,phase,role) for p,m in zip(roots,manifests)]
    changed=np.any(x!=y,axis=-1)
    assert not changed[~mask].any()
    if phase:assert not changed.any()
    elif role=='base':assert not y[mask].any()
    else:assert not y[mask,:3].any()
    checks.append({'key':key,'density':density,'phase':phase,'role':role,'changedPixels':int(changed.sum()),'outsideRepairPolygon':0})
 # The unbroken activity layer is present under the removed foreground pixels.
 member=next(m for m in new_family['members'] if m['member'].endswith('yard_a.shp'))
 for phase in range(15):
  layer=terminal.render_member(rec,member,phase)
  assert np.array_equal(layer,terminal.render_member(before,member,phase))
  removed=mask4 & (unpack(roots[0],manifests[0],4,0)[...,3]>0)
  # Fringe pixels outside the activity silhouette are duplicate-edge overhangs.
  assert np.mean(layer[...,3][removed]>0)>.99
 # Compare accepted construction nodes: only mechanism surfaces are regenerated.
 newrig=read(c/'rigs.json')[key];oldrig=before['componentRig']
 dynamic={'original-lifting-drum','original-lifting-collar','original-extending-curved-guides','original-paired-moving-header','original-late-top-motor'}
 for phase,(nn,oo) in enumerate(zip(newrig['phases'],oldrig['phases'])):
  assert [n['name'] for n in nn]==[n['name'] for n in oo],(key,phase)
  for n,o in zip(nn,oo):
   if n['name'] not in dynamic:assert n==o,(key,phase,n['name'])
 fixed=display(rec);previous=display(before)
 Image.fromarray(fixed).save(r/(key+'-completed-fixed.png'))
 canvas=Image.new('RGB',(1120,580),(45,52,48));draw=ImageDraw.Draw(canvas)
 for i,(title,im) in enumerate([('V20: duplicate foreground shell',previous),('V21: continuous crane shell',fixed)]):
  crop=Image.fromarray(im).crop((175*4,66*4,245*4,140*4)).resize((490,518))
  canvas.paste(crop,(i*560,55),crop);draw.text((i*560+10,12),title,font_size=25)
 canvas.save(r/(key+'-seam-comparison.png'))
write(r/'localized-seam-validation-v1.json',{'status':'PASS_SCOPED_BASE_EXCEPTION_AND_ACCEPTED_MOTION_PRESERVED','checks':checks,
 'healthyActivityFramesUnchanged':15,'damagedAndShadowFramesExact':True,'unaffectedRigNodesExact':True,
 'visualAcceptance':'PENDING','boundary':'The foreground duplicate is removed only from healthy frame 0 in the screenshot theater. No whole-image warp or runtime adjustment.'})
print('Scoped base exception and accepted mechanism preservation pass')
