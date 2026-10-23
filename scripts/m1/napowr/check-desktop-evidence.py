"""Check real Electron allocation and same-frame spatial invariants."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
root=Path('.artifacts/m1-6a');game=root/'desktop-gameplay-final';d=json.loads((game/'result.json').read_text())
assert d['status']=='PASS_DESKTOP_GAMEPLAY' and not d['errors'] and not d['consoleErrors']
rg=[s for s in d['storage'] if s[2]==33323]
assert len(rg)==6 and all(s[1]==1 for s in rg)
bytes=sum(s[3]*s[4]*6 for s in rg)
assert bytes==66712416
for s in rg:assert any(t[2]==35907 and t[1]==1 and t[3:]==s[3:] for t in d['storage'])
comparison_root=root/'desktop-comparison-v3/healthy-napowr'
c=json.loads((comparison_root/'result.json').read_text())
probe=json.loads((root/'desktop-comparison-v3/result.json').read_text())[0]
assert probe['status']=='PASS' and not probe['errors']
assert not c['errors'] and not c['consoleErrors']
# The subsequent deliberate non-allowlisted route probe must return HTTP 404.
assert probe['consoleErrors']==['Failed to load resource: the server responded with a status of 404 (Not Found)']
comparisons=[]
for s in c['samples']:
 if not s['hd']:continue
 o=next(o for o in c['samples']if o['name']==s['name']and o['mode']==s['mode']and not o['hd'])
 for k in ['tick','logical','camera','points','models']:assert s[k]==o[k]
 a=np.asarray(Image.open(comparison_root/s['filename']));b=np.asarray(Image.open(comparison_root/o['filename']));changed=np.any(a!=b,axis=2)
 assert changed.sum()>100, 'Original and HD controls must actually differ'
 assert all(m['type']=='HdSpriteMaterial' for m in s['materials'])
 assert all(m['type']!='HdSpriteMaterial' for m in o['materials'])
 sx=s['buffer'][0]/s['logical'][0];sy=s['buffer'][1]/s['logical'][1]
 xs=[p[0]for p in s['points']];ys=[p[1]for p in s['points']]
 x0=int((min(xs)-4)*sx);x1=int((max(xs)+4)*sx)+1;y0=int((min(ys)-4)*sy);y1=int((max(ys)+4)*sy)+1
 outside=changed.copy();outside[y0:y1,x0:x1]=False
 assert not outside.any(),(s['filename'],int(outside.sum()))
 comparisons.append(dict(file=s['filename'],changedPixels=int(changed.sum()),outsideBuilding=int(outside.sum())))
# A registered owner palette changes team panels while the blue energy remains fixed.
a=np.asarray(Image.open(comparison_root/'owner-blue.png'));b=np.asarray(Image.open(comparison_root/'owner-yellow.png'))
changed=np.any(a!=b,axis=2);assert changed.any()
y,x=np.where(changed);assert x.max()-x.min()<300 and y.max()-y.min()<250
life=json.loads((root/'desktop-gameplay-final/result.json').read_text());assert life['status']=='PASS_DESKTOP_GAMEPLAY'
clean=[s['data']for s in life['steps']if s['name']=='result-menu-cleanup'];assert len(clean)==2
assert all(c['texturesReleased']and c['rhinoDisposed']and c['gameCleared']for c in clean)
steps={s['name']:s.get('data')for s in d['steps']}
assert steps['natural-damage-repair-sale']['damage']<50 and steps['natural-damage-repair-sale']['repaired']==100
assert steps['natural-rebuild-destruction']['destroyed']
report=dict(status='PASS_BOUNDED_DESKTOP_EVIDENCE',gpuBytes=bytes,actualStorage='Six RG8 + six matching SRGB8_ALPHA8 single-level texStorage2D allocations',comparisons=comparisons,ownerColorChangedPixels=int(changed.sum()),naturalGameplay=steps['natural-damage-repair-sale'],destruction=True,lifecycle=clean,
 historicalHarnessFailures='Earlier failed harness runs and the passing corrected lifecycle run remain intact; this receipt validates the exact final application and the corrected material-asserted comparison probe. Earlier same-frame comparison receipts lacked a positive-difference assertion and are superseded.')
(root/'desktop-evidence-corrected.json').write_text(json.dumps(report,indent=2)+'\n');print(report['status'])
