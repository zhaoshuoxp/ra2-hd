"""Close rigid silo panels over a fixed platform after the missile has left."""
import hashlib
import json
import os
import shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from production import ROOT, Family, D, cut

old=Path(os.environ['SOVIET_PREVIOUS_EXPORTS'])/'NAMISL' if os.environ.get('SOVIET_PREVIOUS_EXPORTS') else ROOT/'full-exports-r7/NAMISL'
f=Family('NAMISL','full-exports-r8c')
prior=json.loads((old/'candidate-review.json').read_text())
for row in prior['frames']:
    member,n=row['member'],row['nativeFrame'];e=row['exports'][0];native=f.sources[member]['frames'][n]
    full=f.blank()
    if not native['empty']:full.paste(Image.open(old/e['base']), (native['x']*D,native['y']*D))
    f.put(member,n,full,'Accepted R3 frame retained without change')

def polygon(points):
    mask=Image.new('L',f.hdsize);ImageDraw.Draw(mask).polygon([(x*D/2,y*D/2) for x,y in points],fill=255);return mask

def translated(image,x,y):
    out=f.blank();out.alpha_composite(image,(round(x),round(y)));return out

checks=[]
for damage in [False,True]:
    closed=f.frames['ngmisl_e.shp',int(damage)]
    opened=f.frames['ngmisl_g.shp',int(damage)]
    # The outside armor comes from the accepted closed master. Each panel has
    # constant pixels, size and orientation; only translation changes.
    armor_mask=polygon([(179,165),(265,103),(305,172),(305,250),(327,321),(260,339),(160,294),(178,248)])
    if damage:armor_mask=polygon([(164,154),(264,98),(320,173),(309,253),(332,324),(260,340),(154,294),(165,249)])
    # Preserve the exact accepted foundation outside the armor footprint.
    platform=cut(closed,Image.fromarray(255-np.array(armor_mask)))
    floor=cut(opened,polygon([(166,286),(216,251),(270,263),(325,320),(260,337)]))
    platform.alpha_composite(floor)
    draw=ImageDraw.Draw(platform)
    draw.polygon([(x*D/2,y*D/2) for x,y in [(202,273),(235,253),(269,273),(237,295)]],fill='#52524c')
    draw.polygon([(x*D/2,y*D/2) for x,y in [(207,273),(235,257),(264,273),(237,290)]],fill='#12191a')
    armor=cut(closed,armor_mask)
    left_mask=polygon([(0,0),(238,0),(238,404),(0,404)])
    right_mask=Image.fromarray(255-np.array(left_mask))
    left,right=cut(armor,left_mask),cut(armor,right_mask)
    for phase in range(16):
        n=phase+16*int(damage)
        # Retail holds the open panels while the launch pad returns, then closes.
        travel=min(1,max(0,(phase-4)/11));ease=travel*travel*(3-2*travel)
        gap=29*D/2*(1-ease);lift=-7*D/2*(1-ease)
        image=platform.copy()
        image.alpha_composite(translated(left,-gap,lift))
        image.alpha_composite(translated(right,gap,lift))
        image.paste(closed.crop((0,170*D,f.hdsize[0],f.hdsize[1])), (0,170*D))
        if phase==15:image=closed.copy()
        f.put('ngmisl_h.shp',n,image,'Rigid armor panels translate onto a fixed platform; fired missile absent',
              damaged=damage,panelOffsets=[[-round(gap),round(lift)],[round(gap),round(lift)]],scale=[1,1],nativePhase=phase)
        checks.append(dict(frame=n,scale=[1,1],gap=gap,platform='FIXED',missile='ABSENT',closedEndpoint=phase==15))
f.export()
report=json.loads((f.out/'candidate-review.json').read_text())
# Preserve all accepted members including construction, opening and ready.
for row in report['frames']:
    member,n=row['member'],row['nativeFrame']
    if member!='ngmisl_h.shp':
        oldrow=next(r for r in prior['frames'] if r['member']==member and r['nativeFrame']==n)
        row.update(oldrow)
        for e in row['exports']:
            for key in ['base','data']:shutil.copyfile(old/e[key],f.out/e[key])
    else:
        for e in row['exports']:
            a=np.array(Image.open(f.out/e['base']));r,g,b=np.moveaxis(a[...,:3].astype(float),2,0)
            paint=(r>g*1.65)&(r>b*1.65)&(r-np.maximum(g,b)>14)&((b>g*.48)|(g<r*.32))&(a[...,3]>0)
            shades=np.abs(r[...,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(2)
            data=np.zeros_like(a);data[...,3]=255;data[...,0][paint]=255;data[...,1][paint]=shades[paint]
            Image.fromarray(data).save(f.out/e['data']);e.update(remapPixels=int(paint.sum()),shades=np.unique(shades[paint]).tolist())
report['registrations']=prior['registrations']
report['closingCorrection']={'previous':str(old),'method':'Fixed platform, two rigid translated armor panels, empty shaft, exact accepted closed endpoint','frames':checks}
(f.out/'candidate-review.json').write_text(json.dumps(report,indent=2)+'\n')
selection=json.loads((ROOT/'production-selection-r4.json').read_text());selection['NAMISL']={'exports':str(f.out)}
selection_path=Path(os.environ['SOVIET_SELECTION_OUTPUT']) if os.environ.get('SOVIET_SELECTION_OUTPUT') else ROOT/'production-selection-r5.json'
selection_path.write_text(json.dumps(selection,indent=2)+'\n')
unchanged=[]
for file in old.glob(f'*-{D}x*.png'):
    if not file.name.startswith('ngmisl_h-'):
        assert file.read_bytes()==(f.out/file.name).read_bytes();unchanged.append(file.name)
scope_path=Path(os.environ['SOVIET_SCOPE_OUTPUT']) if os.environ.get('SOVIET_SCOPE_OUTPUT') else ROOT/'feedback-r4/silo-scope.json'
scope_path.write_text(json.dumps({'status':'PASS_CLOSING_ONLY_SCOPE','unchangedFiles':unchanged,'frames':checks},indent=2)+'\n')
