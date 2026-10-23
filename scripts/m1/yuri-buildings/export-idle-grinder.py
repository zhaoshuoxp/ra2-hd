"""Restore native continuous central-rotor animation and idle owner paint."""
import json
import shutil
import sys
import numpy as np
from PIL import Image
from production_common import ROOT, row_for
from central_grinder import column, BOUNDS

output = ROOT / sys.argv[1]
rotor_bounds = (151, 79, 168, 101)
for theater in ('TEMPERATE', 'SNOW'):
    for density in (2, 4):
        source = ROOT / f'feedback-r6/grinder-volume-exports-v2/YAGRND-{theater}-{density}x'
        target = output / source.name
        shutil.copytree(source, target)
        report = json.loads((source / 'candidate-review.json').read_text())
        native = row_for('YAGRND', theater)
        by_role = {role:m['source']['member'] for m in native['members'] for role in m['roles']}
        body, idle, active = [by_role[role] for role in ('body','IDLE','ACTIVE')]
        rows = {(r['member'],r['nativeFrame']):r for r in report['frames']}
        def expand(row, data=False):
            result = Image.new('RGBA',(320*density,220*density),(0,0,0,255) if data else (0,0,0,0))
            if row['data' if data else 'base']:
                result.paste(Image.open(source/row['data' if data else 'base']),
                             (row['native']['x']*density,row['native']['y']*density))
            return result
        fixed = [expand(rows[body,n]) for n in (0,1)]
        owners = [expand(rows[body,n],True) for n in (0,1)]
        def replace(image, n, damage=False):
            region = tuple(v*density for v in BOUNDS)
            current = np.array(image.crop(region)); resting = np.array(fixed[int(damage)].crop(region))
            data = np.array(owners[int(damage)].crop(region))
            visible = np.all(abs(current.astype(int)-resting.astype(int))<=2,axis=2) & (data[...,0]==0)
            # Retire the tall R7 shaft footprint; keep foreground and owner panels.
            gold = (resting[...,3]>240) & (resting[...,0]>resting[...,2]*1.15)
            current[visible & gold,:3]=[27,25,21]
            image=image.copy();image.paste(Image.fromarray(current),region[:2])
            compact = column(density,47*(n%11)/11,False,rotor_bounds,6.1)
            if damage:
                pixels=np.array(compact);pixels[...,:3]=np.uint8(pixels[...,:3]*.7);compact=Image.fromarray(pixels)
            box=tuple(v*density for v in rotor_bounds)
            old=np.array(image.crop(box));rotor=np.array(compact)
            exposure=visible[(rotor_bounds[1]-BOUNDS[1])*density:(rotor_bounds[3]-BOUNDS[1])*density,
                             (rotor_bounds[0]-BOUNDS[0])*density:(rotor_bounds[2]-BOUNDS[0])*density]
            alpha=rotor[...,3].astype(float)/255*exposure
            old[...,:3]=np.uint8(np.clip(old[...,:3]*(1-alpha[...,None])+rotor[...,:3]*alpha[...,None],0,255))
            image.paste(Image.fromarray(old),box[:2])
            return image
        changed=[]
        for row in report['frames']:
            member,n=row['member'],row['nativeFrame']
            if not row['base']:continue
            damage=n>=48 if member==active else n==1
            if member==body and n<2:
                image=replace(expand(row),0,damage)
            elif member==active:
                phase=max(0,n-49) if damage else n
                image=replace(expand(row),phase*(1 if damage else .75),damage)
            elif member==idle and n<11:
                image=replace(fixed[0],n)
                # Native idle bounds include a painted rear rim; use its body owner data.
                data=owners[0]
                xy=[row['native'][k]*density for k in ('x','y')]
                size=Image.open(source/row['base']).size
                paint=np.array(data.crop((*xy,xy[0]+size[0],xy[1]+size[1])))
                paint[:,row['native']['width']*density:,:3]=0
                Image.fromarray(paint).save(target/row['data'])
                row['ownerSource']={'member':body,'nativeFrame':0,'bounds':list(rotor_bounds)}
            else:continue
            xy=[row['native'][k]*density for k in ('x','y')]
            size=Image.open(source/row['base']).size
            pixels=np.array(image.crop((*xy,xy[0]+size[0],xy[1]+size[1])))
            pixels[:,row['native']['width']*density:]=0
            Image.fromarray(pixels).save(target/row['base'])
            row['operation']+='; native-bounds central rotor; continuous idle loop and correctly classified rear-rim paint'
            changed.append([member,n])
        report['centralColumn']={'bounds':list(rotor_bounds),'retiredFootprint':list(BOUNDS),'axis':[0,1,0],
            'idleFrames':list(range(11)),'idleOwnerData':'Copied from the matching body coordinates',
            'activeSpeed':'Normal native rate ratio 5/6.666; damaged ratio 1; native opening and return retained',
            'changed':changed}
        (target/'candidate-review.json').write_text(json.dumps(report,indent=2)+'\n')
        print('PASS_NATIVE_IDLE_ROTOR_EXPORT',theater,density,len(changed),flush=True)
