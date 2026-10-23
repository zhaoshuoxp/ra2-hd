"""Reconstruct source-phase mechanisms with separately registered HD surfaces."""
import argparse
import copy
import shutil
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_closing, binary_fill_holes, distance_transform_edt
from PIL import Image, ImageDraw

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, vector_coverage

art = SourceFileLoader('soviet_component_art', 'scripts/art/author-soviet-original.py').load_module()
closure = SourceFileLoader('soviet_component_canvas', 'scripts/art/close-soviet-original.py').load_module()
terminal = art.terminal
ROOT = Path('.artifacts/buildup-remaining-20261013-r74-v1')
HIDDEN_FILE = ROOT / 'soviet-component-rebuild-r91-v1/hidden-surfaces-v1.png'
HIDDEN_TILES = {}



def hidden_tile(name):
    if name not in HIDDEN_TILES:
        boxes={'reverseBearing':(0,0,767,479),'roofSteel':(770,0,1536,479),
               'boilerLid':(110,482,655,1011)}
        HIDDEN_TILES[name]=Image.open(HIDDEN_FILE).convert('RGBA').crop(boxes[name])
    return HIDDEN_TILES[name]


def unplaced(s, prior, phase, name):
    node = next(n for n in prior['phases'][phase] if n['name'] == name)
    layer = closure.canvas_node(node, s.rig.canvas)
    dx, dy = node['rigidPart'].get('translation', [0, 0])
    return terminal.move(layer, dx=-dx, dy=-dy)


def lab(s, prior):
    cap = unplaced(s, prior, 22, 'original-golden-dome')
    big = unplaced(s, prior, 22, 'original-lower-circular-tier')
    medium = unplaced(s, prior, 22, 'original-middle-circular-tier')
    inner = s.retained([(98,52),(106,48),(127,48),(136,55),(136,74),(128,80),(108,80),(98,74)])
    spires = [s.retained(p) for p in [
        [(53,67),(67,67),(69,95),(69,105),(52,99)],
        [(166,67),(180,67),(182,97),(165,104)],
        [(117,103),(120,103),(120,108),(119.5,110.5),(121,112),(121,116),(122,118),(122,122),(127,125),(127,129),(118,134),(108,129),(108,125),(113,122),(113,118),(115,116),(115,112),(117,110),(117,107)]]]
    # Reconstruct the narrow area hidden by the foreground finial from the
    # adjacent retained ring surface; otherwise its gold tip would be doubled.
    hidden = (spires[2][...,3]>0) & (big[...,3]>0)
    for row in np.where(hidden.any(axis=1))[0]:
        xs=np.where(hidden[row])[0]
        left=max(0,int(xs.min())-2);right=min(big.shape[1]-1,int(xs.max())+2)
        for col in xs:
            weight=(col-left)/max(1,right-left)
            big[row,col]=np.rint(big[row,left]*(1-weight)+big[row,right]*weight)
    steps = [s.retained(p) for p in [
        [(77,132),(91,130),(106,146),(101,152),(77,145)],
        [(141,132),(153,130),(164,145),(156,153),(140,147)]]]
    central = s.region([(85,79),(93,63),(98,48),(104,8),(131,8),(136,48),(144,63),(150,88),(150,100),(133,111),(105,112),(85,103)])
    excluded = central | np.logical_or.reduce([v[...,3]>0 for v in spires+steps])
    # Lower walls and the roof translate together. Their underground portions
    # disappear behind a fixed foundation plane, never a moving rectangle.
    lower = terminal.masked(s.full, ~excluded & (s.yy < 161-np.abs(s.xx-117)*.46))
    ground_line = 162-np.abs(s.xx-117)*.49
    roof = art.material_quad(s,2,[(48,100),(117,66),(183,100),(117,133)],(64,64))
    roof = over(terminal.masked(lower, s.yy < 133-np.abs(s.xx-117)*.50), roof)
    walls = terminal.masked(lower,s.yy >= 133-np.abs(s.xx-117)*.50)
    foundation = art.material_quad(s,2,[(43,132),(117,96),(192,132),(117,172)],(72,72),.88)
    foundation = over(terminal.masked(s.full,(s.yy >= ground_line+3) & ~np.logical_or.reduce([v[...,3]>0 for v in steps])),foundation)
    expansion=[.24,.55,.77,.92,1,1]+[1]*18
    roof_drop=[0,8,15,21,27,29,26,19,10,3,0]+[0]*13
    gold=[]; band=[]
    for p in range(24):
        ix=native_indices(s.rig.raw,p);rgb=np.asarray(s.record['palette'],float)[ix]
        yy,xx=np.indices(ix.shape,dtype=float);xx-=s.origin[0];yy-=s.origin[1]
        marker=(ix>31)&(xx>=108)&(xx<=128)&(rgb[...,0]>rgb[...,1]*1.05)&(rgb[...,1]>rgb[...,2]*1.35)&(rgb[...,0]>100)
        gold.append(float(yy[marker].min()))
        marker=(ix>=16)&(ix<32)&(xx>=93)&(xx<=100)&(yy<140)
        band.append(float(yy[marker].min()) if marker.any() else None)
    for p in range(25):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        if p==23:
            nodes=[];s.put(nodes,s.full,'complete-retained-building',p,'EXACT_RETAINED_COMPLETED_ANATOMY');s.phases.append(nodes);continue
        nodes=[];s.active_phase=p
        native=native_indices(s.rig.raw,p)>0
        floor=foundation.copy()
        if 0<p<4:
            floor=art.affine_about(s,floor,[[expansion[p],0],[0,expansion[p]]],(117,137))
        floor[...,3]=np.minimum(floor[...,3],vector_coverage(native));floor[floor[...,3]==0]=0
        s.put(nodes,floor,'fixed-world-foundation',p,'FIXED_WORLD_UV_NATIVE_FOUNDATION_COVERAGE',ground=True)
        e=expansion[p];drop=roof_drop[p]
        floor_roof=art.affine_about(s,roof,[[e,0],[0,e]],(117,132),[0,drop])
        if p<3:
            floor_roof[...,3]=np.minimum(floor_roof[...,3],vector_coverage(native));floor_roof[floor_roof[...,3]==0]=0
        s.put(nodes,floor_roof,'complete-square-roof',p,'ONE_ROOF_PLANE_BEHIND_ALL_CENTRAL_TIERS',expansion=e,translation=[0,drop])
        wall=terminal.move(walls,dy=drop)
        wall=terminal.masked(wall,(s.yy<=ground_line)&(p>=5))
        if p>=5:s.put(nodes,wall,'lower-wall-block',p,'FIXED_UV_WALLS_RISE_WITH_ROOF_THROUGH_FIXED_GROUND_PLANE',translation=[0,drop])
        translated=[]
        for i,(part,center) in enumerate(zip(spires,[(60,100),(173,100),(117,131)])):
            delta=(np.asarray([117,137])-center)*(1-e)+[0,drop]
            translated.append((terminal.move(part,dx=delta[0],dy=delta[1]),delta))
            if i<2:s.put(nodes,translated[-1][0],f'rear-finial-{i}',p,'RIGID_FINIAL_ON_SHARED_ROOF',translation=delta.tolist())
        cap_drop=max(0,gold[p]-gold[23]);mid_drop=max(0,band[p]-band[23]) if p else 0
        outer_drop=[0,28,30,31,30,29,26,19,10,3,0][min(p,10)]
        bottom=None
        if p>=1:
            scale=[0,.48,.78,.96,1][min(p,4)]
            bottom=art.affine_about(s,big,[[scale,0],[0,scale]],(117,99),[0,outer_drop])
            if p==1:bottom=np.zeros_like(bottom)
            s.put(nodes,bottom,'outer-ring',p,'COMPLETE_CONCENTRIC_RING_WITH_EQUAL_VIEW_PLANE_DIAMETER_SCALE',diameter=scale,translation=[0,outer_drop])
            middle_scale=[0,.52,.82,.98,1][min(p,4)]
            middle=art.affine_about(s,medium,[[middle_scale,0],[0,middle_scale]],(117,80),[0,mid_drop-17*(1-middle_scale)])
            middle=terminal.masked(middle,s.yy<=111+outer_drop)
            s.put(nodes,middle,'middle-ring',p,'INDEPENDENT_NATIVE_RING_TRAVEL_WITH_COMPLETE_TOP',translation=[0,mid_drop])
        if bottom is not None and p>=2:
            lip=terminal.masked(bottom,s.yy>=100+outer_drop)
            s.put(nodes,lip,'outer-ring-front-lip',p,'FOREGROUND_RING_LIP_OCCLUDES_RETRACTED_MIDDLE_WALL')
        if p>=10:
            fixed=terminal.masked(s.full,~central & ~np.logical_or.reduce([v[...,3]>0 for v in spires+steps]))
            hidden=art.material_quad(s,2,[(75,139),(117,118),(167,143),(117,168)],(48,48),.85)
            hidden=over(art.material_quad(s,0,[(76,122),(106,138),(106,153),(76,138)],(30,18)),hidden)
            hidden=over(art.material_quad(s,1,[(140,137),(166,123),(166,138),(140,153)],(30,18)),hidden)
            hidden=terminal.masked(hidden,np.logical_or.reduce([v[...,3]>0 for v in steps]))
            fixed=over(fixed,hidden)
            nodes=[n for n in nodes if n['name'] not in ['fixed-world-foundation','complete-square-roof','lower-wall-block']]
            layer=[];s.put(layer,fixed,'completed-lower-structure',p,'EXACT_RETAINED_STATIC_STRUCTURE_AFTER_NATIVE_LOWER_COMPLETION')
            nodes=layer+nodes
        if p>=19:
            fixed=terminal.masked(s.full,~((cap[...,3]>0)|(inner[...,3]>0)))
            nodes=[];s.put(nodes,fixed,'completed-static-assembly',p,'EXACT_RETAINED_ASSEMBLY_AROUND_LAST_INNER_EXTENSION')
            core=terminal.move(inner,dy=cap_drop)
            core=terminal.masked(core,s.yy<=80+mid_drop)
            s.put(nodes,core,'inner-strut-core',p,'RIGID_INNER_CORE_EMERGES_THROUGH_MIDDLE_RING',translation=[0,cap_drop])
        cap_layer=cap
        if p==0:
            cap_layer=art.affine_about(s,cap,[[.69,0],[0,.70]],(117,9))
        s.put(nodes,terminal.move(cap_layer,dy=cap_drop),'golden-dome',p,'DOME_PETALS_COLLAPSED_IN_FIRST_PHASE_THEN_NATIVE_TIP_TRAVEL',translation=[0,cap_drop])
        # The near corner is in front of the central assembly at every phase.
        part,delta=translated[2]
        if p<19:s.put(nodes,part,'front-finial',p,'FOREGROUND_FINIAL_OCCLUDES_CENTRAL_RINGS',translation=delta.tolist())
        if 11<=p<19:
            angle=np.deg2rad({11:84,12:67,13:43,14:17}.get(p,0))
            for i,(part,pivot) in enumerate(zip(steps,[(91,150),(152,151)])):
                layer=art.hinged(part,angle,np.asarray(pivot)+s.origin,s.rig.canvas,depth=0,axis_direction=(1,.5))
                s.put(nodes,layer,f'entry-ramp-{i}',p,'RIGID_RAMP_HINGE_ON_ORIGINAL_PHASES',angleRadians=angle)
        s.phases.append(nodes)
    return s.finish()




def red_panel(s, quad, span):
    w,h=span
    paint=Image.new('RGBA',(w*4,h*4),(177,5,4,255));d=ImageDraw.Draw(paint)
    for y in range(4,h*4,20):
        d.line((0,y,w*4,y),fill=(84,3,3,255),width=2)
        d.line((0,y+2,w*4,y+2),fill=(219,8,6,255),width=1)
    for x in [3,w*2,w*4-4]:
        d.line((x,0,x,h*4),fill=(104,3,3,255),width=2)
        for y in range(12,h*4,20):d.ellipse((x-1,y-1,x+1,y+1),fill=(82,62,51,255))
    raw=art.place(paint,(0,0,w,h),s.rig.canvas)
    return s.project(raw,[(0,0),(w,0),(w,h),(0,h)],quad)


def masonry_shell(s, rim, foot, edges=(0, 1, 2, 3)):
    """A hinged well has independent rim and foot vertices, not vertical extrusion."""
    rim, foot = np.asarray(rim, float), np.asarray(foot, float)
    inner = rim * .72 + rim.mean(axis=0) * .28
    bottom = foot * .72 + foot.mean(axis=0) * .28
    result = art.material_quad(s, 3, bottom, (24, 24), .45)
    for a in edges:
        b = (a + 1) % 4
        result = over(art.material_quad(s, 1, [inner[a], inner[b], bottom[b], bottom[a]], (24, 42), .7), result)
    for a in [1, 2, 3]:
        if a not in edges:
            continue
        b = (a + 1) % 4
        result = over(art.material_quad(s, 0 if a == 3 else 1,
                      [rim[a], rim[b], foot[b], foot[a]], (28, 42)), result)
    for a in edges:
        b = (a + 1) % 4
        result = over(art.material_quad(s, 2, [rim[a], rim[b], inner[b], inner[a]], (28, 4)), result)
    return result


def replace_node(s, nodes, p, name, layer, method, **details):
    at = next((i for i, n in enumerate(nodes) if n['name'] == name), len(nodes))
    nodes[:] = [n for n in nodes if n['name'] != name]
    addition = []
    s.put(addition, layer, name, p, method, **details)
    nodes[at:at] = addition



def completed_roof_panel(s,q,reverse=False):
    # Foreground columns hide part of the finished roof. Reconstruct that
    # concealed steel surface before moving the panel into an exposed pose.
    paint=Image.new('RGBA',(264,64));a=np.array(paint);yy,xx=np.indices(a.shape[:2])
    value=211+21*np.cos((yy/64-.4)*np.pi)
    for c in range(3):a[...,c]=np.clip(value+c,0,255)
    a[...,3]=255;paint=Image.fromarray(a);d=ImageDraw.Draw(paint)
    for x in range(0,264,44):
        d.line((x,0,x,64),fill=(65,69,70,255),width=3)
        d.line((x+3,0,x+3,64),fill=(247,248,247,255),width=1)
    raw=art.place(hidden_tile('roofSteel') if reverse else paint,(0,0,66,16),s.rig.canvas)
    layer=s.project(raw,[(0,0),(66,0),(66,16),(0,16)],q)
    return layer


def factory(s, prior):
    # The rear well turns around its ground edge. Its upper and lower outlines
    # are measured independently; a single downward extrusion moves its foot.
    rims = {
        6: [(68,116),(91,106),(132,127),(110,139)],
        7: [(68,106),(94,98),(134,124),(110,136)],
        8: [(73,97),(101,91),(135,121),(110,131)],
        9: [(76,88),(101,82),(135,114),(111,125)],
        10: [(81,80),(102,73),(134,105),(112,116)],
        11: [(85,77),(102,69),(132,97),(112,106)],
        12: [(85,77),(102,69),(134,99),(114,109)],
        16: [(86,77),(103,69),(136,101),(116,111)],
        21: [(101,86),(117,78),(142,91),(126,101)]}
    keys = sorted(rims)
    foot = np.array([(101,112),(118,103),(143,119),(126,129)],float)
    material=s.materials[2];w,h=material.size
    tile=np.array(material.crop((w//4,h//4,w*3//4,h*3//4)).resize((256,256)).convert('RGBA'))
    u=np.floor((s.xx+2*s.yy)*2).astype(int)%256
    v=np.floor((2*s.yy-s.xx)*2).astype(int)%256
    floor_master=tile[v,u].copy();floor_master[...,3]=255
    front = s.retained([(110,112),(129,120),(129,143),(118,145),(110,138)])
    rear = s.retained([(152,89),(160,88),(175,96),(174,119),(155,113),(152,107)])
    for p, old in enumerate(prior['phases']):
        s.active_phase = p
        nodes = copy.deepcopy(old)
        if p<21:
            ix=native_indices(s.rig.raw,p);rgb=np.asarray(s.record['palette'],float)[ix]
            yy,xx=np.indices(ix.shape)
            stone=(ix>31)&(rgb[...,0]>75)&(rgb[...,1]>65)&(rgb[...,2]>50)
            stone&=(rgb[...,0]<rgb[...,1]*1.6)&(rgb[...,1]<rgb[...,0]*1.15)
            if p>=6:stone&=yy>=122+np.abs(xx-125)*.48
            stone=binary_fill_holes(binary_closing(stone))
            floor=floor_master.copy();floor[...,3]=np.minimum(floor[...,3],vector_coverage(stone));floor[floor[...,3]==0]=0
            replace_node(s,nodes,p,'original-foundation-panels',floor,
                         'SEPARATE_SOURCE_FOUNDATION_PANELS_WITH_FIXED_HD_WORLD_TEXTURE',ground=True)
        if 6 <= p < 21:
            rim = np.array([[np.interp(p, keys, [rims[k][j][i] for k in keys])
                             for i in range(2)] for j in range(4)])
            # Until the first rotation, the far end is still near the floor.
            amount = min(1, (p - 5) / 5)
            offset=np.array([np.interp(p,[6,8,11,16,21],[16,15,5,5,0]),
                             np.interp(p,[6,8,11,16,21],[7,25,36,36,25])])
            lower=rim+offset
            shell = masonry_shell(s, rim, lower)
            replace_node(s,nodes,p,'original-rear-tower-hinge',shell,
                         'INDEPENDENT_NATIVE_RIM_AND_PLANTED_FOOT_OF_HINGED_TOWER',rim=rim.tolist(),foot=lower.tolist())
        if p < 13:
            nodes = [n for n in nodes if n['name'] != 'original-rear-pipework']
            node=next((n for n in nodes if n['name']=='original-left-boiler'),None)
            if node:
                drop=node['rigidPart']['translation'][1]
                body=s.retained([(86,121),(91,119),(109,122),(113,128),(113,146),(103,153),(87,147)])
                body=terminal.masked(body,s.yy>=132)
                lid=art.place(hidden_tile('boilerLid'),(86,123,113,138),s.rig.canvas)
                ellipse=((s.xx-99.5)/13.5)**2+((s.yy-130.5)/7.5)**2<=1
                lid=terminal.masked(lid,ellipse)
                body=over(lid,body)
                replace_node(s,nodes,p,'original-left-boiler',terminal.move(body,dy=drop),
                             'COMPLETE_CLOSED_BOILER_TOP_BEFORE_PIPEWORK_EMERGES',translation=[0,drop])
        # Complete red columns extend at fixed width; the narrow visible
        # finished cap is not scaled together with an unrelated component kit.
        for back in [True,False]:
            for i in range(3):
                name = f'original-{"back" if back else "front"}-column-{i}'
                old_node = next((n for n in nodes if n['name']==name),None)
                if old_node is None:
                    continue
                top = old_node['rigidPart']['originalTop']
                cx, cy = (162+i*27,139+i*14) if back else (118+i*27,163+i*14)
                final_top = 89+i*14 if back else 113+i*14
                drop = max(0,top-final_top)
                part = terminal.move(rear if back else front,dx=i*27,dy=i*14+drop)
                # Material of concealed shaft: engraved red steel, attached
                # to the same moving top and clipped only at its fixed foot.
                x0 = (152 if back else 110)+i*27
                y0 = final_top+drop+15
                quad = [(x0,y0),(x0+20,y0+10),(x0+20,cy+7),(x0,cy-3)]
                shaft = red_panel(s,quad,(20,45)) if y0<cy-4 else np.zeros_like(s.full)
                part = over(part,shaft)
                part = terminal.masked(part,s.yy<=cy+(s.xx-cx)*.5)
                replace_node(s,nodes,p,name,part,'FIXED_WIDTH_RED_COLUMN_WITH_SEPARATE_CAP_AND_HIDDEN_SHAFT',translation=[i*27,i*14+drop])
        if p<21:
            nodes=[n for n in nodes if n['name']!='original-longitudinal-wall-rails']
        if 12<=p<21:
            progress=[.025,.07,.15,.26,.42,.61,.79,.93,1][p-12]
            panels=[]
            for name,top,bottom in [
                    ('far-wall',[(143,112),(208,144)],[(143,151),(208,184)]),
                    ('near-wall',[(126,130),(193,164)],[(126,163),(193,197)])]:
                top=np.asarray(top,float);bottom=np.asarray(bottom,float)
                current=bottom+(top-bottom)*progress
                q=[current[0],current[1],bottom[1],bottom[0]]
                wall=art.material_quad(s,1 if name=='far-wall' else 0,q,(65,36))
                s.put(panels,wall,name,p,'WALL_TOP_RISES_FROM_FIXED_FOUNDATION_BEHIND_COLUMNS',extension=progress)
            at=next((i for i,n in enumerate(nodes) if n['name']=='original-front-facade-hinge'),len(nodes))
            nodes[at:at]=panels
        if 12<=p<23:
            nodes=[n for n in nodes if not n['name'].startswith('original-closing-roof-')]
            panel_nodes=[]
            progress=[.03,.08,.16,.28,.42,.58,.72,.85,1][min(p-12,8)]
            angle=np.deg2rad({21:76,22:32}.get(p,90))
            for name,q in [
                    ('far',[(144,109),(207,142),(199,151),(136,118)]),
                    ('near',[(128,130),(193,162),(199,151),(136,118)])]:
                q=np.array(q,float);hinge=q[:2];free=q[[3,2]]
                lifted=hinge+(free-hinge)*np.cos(angle)+[0,-24*np.sin(angle)]
                dest=np.array([hinge[0],hinge[1],lifted[1],lifted[0]])
                layer=s.project(completed_roof_panel(s,q,p<=21),q,dest)
                if p<=20:
                    layer=terminal.move(layer,dy=24*(1-progress))
                    line=hinge[0,1]+(s.xx-hinge[0,0])*(hinge[1,1]-hinge[0,1])/(hinge[1,0]-hinge[0,0])
                    layer=terminal.masked(layer,s.yy<=line)
                s.put(panel_nodes,layer,f'rising-and-folding-roof-{name}',p,
                      'COMPLETE_METAL_ROOF_PANEL_RISES_UPRIGHT_THEN_FOLDS_INWARD',angleRadians=angle,extension=progress)
            at=next((i for i,n in enumerate(nodes) if n['name']=='original-front-facade-hinge'),len(nodes))
            nodes[at:at]=panel_nodes
        if 2 <= p <= 21:
            nodes=[n for n in nodes if n['name']!='original-closed-louver-caps']
            ix=native_indices(s.rig.raw,p);yy,xx=np.indices(ix.shape)
            for i in range(3):
                if p<2+i*3:continue
                x0,y0=151+i*27,87+i*14
                mask=(ix>=16)&(ix<32)&(xx>=x0)&(xx<x0+26)&(yy>=y0)&(yy<140+i*14)
                filled=binary_fill_holes(mask)
                alpha=vector_coverage(filled)
                face=np.zeros_like(s.full)
                # Owner indices supply only the painted face lighting guide;
                # fresh engraved enamel is rendered at full density.
                nearest=distance_transform_edt(~mask,return_distances=False,return_indices=True)
                light=np.clip((32-ix[tuple(nearest)].astype(float))/16,.12,1)
                light=np.asarray(Image.fromarray(light.astype('float32')).resize((face.shape[1],face.shape[0]),Image.Resampling.BICUBIC))
                grooves=1-.10*np.exp(-((np.mod(s.yy+.5*s.xx,5)-.25)/.25)**2)
                face[...,0]=np.clip((45+174*light)*grooves,0,255)
                face[...,1]=np.clip(4+3*light,0,255);face[...,2]=4;face[...,3]=alpha
                face[alpha==0]=0
                name=f'original-back-column-{i}'
                replace_node(s,nodes,p,name,face,'NATIVE_CLOSED_CAP_FACE_AND_FOLD_PHASE_WITH_AUTHORED_ENAMEL')
        if p<21:
            for i in range(3):
                if p>=4+i*3:
                    foot=s.retained(np.array([(105,158),(130,170),(130,178),(105,166)])+[i*27,i*14])
                    s.put(nodes,foot,f'installed-column-foot-{i}',p,
                          'COMPLETE_FIXED_COLUMN_FOOT_AFTER_ITS_NATIVE_PLATFORM_OPENS')
        if 21<=p<23:
            foreground=[]
            for i in range(3):
                foreground.append(s.retained(np.array([(109,112),(129,122),(129,176),(109,166)])+[i*27,i*14]))
            foreground.append(s.retained([(193,145),(233,130),(241,156),(247,181),(224,198),(207,187)]))
            for i,layer in enumerate(foreground):
                s.put(nodes,layer,f'fixed-foreground-fixture-{i}',p,'COMPLETED_COLUMNS_AND_FACADE_OCCLUDE_CLOSING_ROOF')
        s.phases.append(nodes)
    return s.finish()


def depot(s, prior):
    # Two masonry arms turn from the floor into an open U around the mast.
    # Each wall has a face, a return and a narrow top; there is no box floor.
    left_source=[(52,78),(73,89),(73,125),(52,114)]
    left=art.material_quad(s,0,left_source,(22,38))
    rgb=s.full[...,:3].astype(float);red=(rgb[...,0]>rgb[...,1]*2)&(rgb[...,0]>rgb[...,2]*2)
    visible=terminal.masked(s.retained(left_source),(s.yy<103)&~red)
    left=over(visible,left)
    right_source=[(80,81),(90,86),(90,112),(80,118)]
    right=art.material_quad(s,1,right_source,(12,32))
    right=over(terminal.masked(s.retained(right_source),(s.yy<100)&~red),right)
    poses={3:[(30,122),(50,112),(72,119),(51,130)],
           4:[(30,113),(51,103),(72,119),(51,130)],
           5:[(33,103),(54,94),(72,120),(51,130)],
           6:[(38,94),(58,84),(73,123),(52,131)],
           7:[(44,85),(64,79),(73,125),(52,128)],
           8:[(49,79),(69,84),(73,125),(52,118)],
           9:left_source}
    crane=s.member_layer('_b')
    head=terminal.masked(crane,(s.xx<83)&(s.yy<68)&~((s.xx>=68)&(s.xx<=79)&(s.yy<46)))
    boom=terminal.masked(crane,(s.xx>=80)&(s.yy<74)&~((s.xx>117)&(s.yy>66)))
    drops=[64,64,64,64,65,56,48,39,34,26,17,11,6,1,0,0,0,0,0,0,0,0,0,0]
    tips={4:(86,85),14:(86,85),15:(87,83),16:(91,82),17:(94,81),18:(98,80),
          19:(108,79),20:(117,77),21:(124,75),22:(126,73),23:(127,72)}
    for p,old in enumerate(prior['phases']):
        s.active_phase=p;nodes=copy.deepcopy(old)
        if 4<=p<23:
            at=next(i for i,n in enumerate(nodes) if n['name']=='original-coupled-swivel-and-jib')
            nodes=[n for n in nodes if n['name'] not in ['original-coupled-swivel-and-jib','original-front-service-swivel','original-service-cable']]
            head_angle=([1.47]*14+[1.43,1.35,1.22,1.05,.86,.65,.45,.26,.12,0])[p]
            upper=art.base.rotate(head,head_angle,(74,56),s.rig.canvas)
            upper=terminal.move(upper,dy=drops[p]);upper=terminal.masked(upper,s.yy<107)
            correction=max(0,s.rig.logical[p]['trimOrigin'][1]+1-bounds(upper[...,3]>=8)[1]/4)
            upper=terminal.move(upper,dy=correction)
            addition=[];s.put(addition,upper,'registered-counterweight-and-collar',p,'SOURCE_COUNTERWEIGHT_POSE_ABOUT_MAST_BEARING',angleRadians=head_angle,translation=[0,drops[p]])
            tip=np.array(tips.get(p,(86,85)),float)+[2,-7]
            delta=tip-[79,54.5];normal=np.array([-delta[1],delta[0]])
            normal=normal/np.linalg.norm(normal)*7
            source=[(79,48),(129,62),(129,69),(79,61)]
            root=np.array([79,54.5]);dest=[root-normal*.9,tip-normal*.5,tip+normal*.5,root+normal*.9]
            moving=s.project(terminal.masked(boom,s.region(source)),source,dest)
            moving=terminal.move(moving,dy=drops[p]);moving=terminal.masked(moving,s.yy<107)
            s.put(addition,moving,'registered-service-lattice',p,'INDEPENDENT_BOOM_FORESHORTENING_AT_SOURCE_TIP',tip=tip.tolist(),translation=[0,drops[p]])
            nodes[at:at]=addition
            stays=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(stays)
            middle=root*.55+tip*.45+[0,-5];pin=np.array([75,43])
            vertices=[v+[0,drops[p]] for v in [pin,middle,tip]]
            draw.line([tuple(v*4) for v in vertices],fill=(42,43,40,255),width=3)
            joint=vertices[1]*4;draw.ellipse((joint[0]-4,joint[1]-4,joint[0]+4,joint[1]+4),fill=(146,149,146,255),outline=(44,45,42,255),width=2)
            stays=terminal.masked(np.array(stays),s.yy<107)
            s.put(nodes,stays,'registered-service-boom-stays',p,'CABLE_AND_KNUCKLE_SHARE_THE_LATTICE_AND_MAST_ANCHORS')
            if p>=18:
                hook_node=next(n for n in nodes if n['name']=='original-service-hook')
                box=hook_node['box'];hook=np.array([(box[0]+box[2])/2,box[1]+.5])
                cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                draw.line([tuple((tip+[0,drops[p]])*4),tuple(hook*4)],fill=(40,40,36,255),width=3)
                s.put(nodes,np.array(cable),'registered-service-hoist',p,'CABLE_FROM_ACTUAL_BOOM_TIP_TO_EXISTING_HOOK')
        if p<23 and p>=1:
            pad=terminal.masked(s.full,(s.xx>=84)&(s.yy>=124));v=s.yy-.5*s.xx;u=.5*s.xx+s.yy
            middle=terminal.masked(pad,np.abs(v-86)<8)
            nodes=[n for n in nodes if not n['name'].startswith(('original-telescopic-pad','original-unfolding-pad-wing'))]
            extension=[0,.23,.34,.43,.51,.6,.68,.76,.84,.92,1][min(p,10)]
            for i,(lo,hi) in enumerate([(175,204),(204,232),(232,268)]):
                segment=terminal.masked(middle,(u>=lo)&(u<hi))
                travel=max(0,(lo+hi)/2-185)*(1-extension)
                s.put(nodes,terminal.move(segment,dx=-travel,dy=-travel*.5),f'complete-pad-segment-{i}',p,
                      'THREE_COMPLETE_CENTER_PLATES_SLIDE_FROM_SOURCE_SOCKET',translation=[-travel,-travel*.5],ground=True)
            if p>=12:
                angle=np.deg2rad({12:84,13:73,14:56,15:38,16:23,17:11}.get(p,0))
                along=np.array([1.,.5]);cross=np.array([-1.,.5])
                matrix=np.column_stack([along,cross*np.cos(angle)])@np.linalg.inv(np.column_stack([along,cross]))
                for i,mask in enumerate([v<=78,v>=94]):
                    wing=terminal.masked(pad,mask)
                    s.put(nodes,art.affine_about(s,wing,matrix,(129,151)),f'complete-pad-wing-{i}',p,
                          'LATERAL_PAD_WINGS_UNFOLD_AROUND_LONGITUDINAL_BEARING',angleRadians=angle)
            if p>=16:
                stationary=s.member_layer('main');stationary=terminal.masked(stationary,~((s.xx>=84)&(s.yy>=124)))
                replace_node(s,nodes,p,'installed-service-base',stationary,'RETAINED_STATIONARY_BASE_EXCLUDING_STILL_UNFOLDING_PAD')
        if 13<=p<16:
            block=terminal.masked(s.member_layer('main'),(s.xx>=40)&(s.xx<112)&(s.yy>=120)&(s.yy<140))
            tank_mask=s.region([(40,111),(50,105),(62,105),(70,111),(70,121),(64,129),(40,126)])
            block=terminal.masked(block,~tank_mask)
            drop={13:10,14:6,15:2}[p]
            addition=[];s.put(addition,s.rise(block,drop,141),'rising-complete-service-plinth',p,
                             'LOWER_SERVICE_BLOCK_EMERGES_DURING_SOURCE_TANK_STAGES',translation=[0,drop])
            nodes=addition+nodes
        if p<16:
            nodes=[n for n in nodes if n['name']!='original-service-lower-block']
            base=art.material_quad(s,2,[(32,125),(68,107),(110,128),(74,145)],(38,38),.88)
            replace_node(s,nodes,p,'original-machinery-floor',base,
                         'BARE_FOUNDATION_WITH_NO_COMPLETED_TANK_OR_FACADE_PIXELS',ground=True)
            edge=s.red_plates(p,lambda x,y:(y>=118)&(x<112))
            addition=[];s.put(addition,edge,'native-folded-base-plates',p,'REGISTERED_EARLY_RED_FOUNDATION_PLATES',ground=True)
            nodes=addition+nodes
        if 3<=p<16:
            q=np.asarray(poses.get(p,left_source),float)
            near=s.project(left,left_source,q)
            # Separate opposite arm shares the native hinge, with an open gap.
            far_q=q+np.array([17,0])
            far_q[2:]=np.asarray([(90,112),(80,118)])
            if p>=9:far_q=np.asarray(right_source,float)
            far=s.project(right,right_source,far_q)
            arm=over(near,far)
            for face,delta in [(q,np.array([3,-2])),(far_q,np.array([-3,-2]))]:
                top=[face[0],face[1],face[1]+delta,face[0]+delta]
                arm=over(art.material_quad(s,2,top,(23,4)),arm)
                if p>=7:
                    paint=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(paint)
                    draw.line([tuple((face[j]+delta*.5)*4) for j in [0,1]],fill=(197,5,4,255),width=8)
                    arm=over(np.array(paint),arm)
            replace_node(s,nodes,p,'original-service-brick-hinge',arm,
                         'TWO_OPEN_MASONRY_ARMS_WITH_SEPARATE_SIDE_AND_CAP_SURFACES',nearCorners=q.tolist(),farCorners=far_q.tolist())
        s.phases.append(nodes)
    return s.finish()



def dock(s, prior):
    crane=s.member_layer('_a')
    stationary=s.member_layer('_a',exclude=True)
    head=terminal.masked(crane,s.region([(130,34),(145,33),(156,39),(165,20),(181,42),(180,61),(168,70),(140,80),(130,62)]))
    head=over(head,terminal.masked(stationary,(s.xx<155)&(s.yy<85)))
    triangle_mask=s.region([(163,20),(172,25),(183,44),(151,46),(151,42)])
    triangle=terminal.masked(head,triangle_mask)
    source_head=[(130,34),(165,22),(180,61),(140,80)]
    head_poses={13:[(170,103),(203,90),(210,119),(178,122)],
                14:[(165,89),(181,75),(210,111),(178,122)],
                15:[(161,82),(179,70),(204,99),(177,119)],
                16:[(141,79),(169,64),(183,97),(149,112)],
                17:[(136,79),(165,60),(180,95),(145,112)],
                18:[(132,78),(163,60),(179,96),(141,115)],
                19:[(130,65),(163,47),(179,83),(140,102)],
                20:[(130,46),(164,28),(180,63),(140,82)],
                21:[(130,39),(165,24),(180,63),(140,81)],
                22:[(130,35),(165,22),(180,62),(140,80)],23:source_head}
    source_jib=[(177,39),(295,66),(295,77),(177,56)]
    jib=s.retained(source_jib)
    jib_poses={14:[(205,126),(223,157),(232,160),(215,125)],
               15:[(204,107),(233,132),(241,141),(211,125)],
               16:[(187,90),(237,111),(251,122),(189,106)],
               17:[(180,87),(266,116),(267,124),(180,105)],
               18:[(177,90),(267,119),(269,127),(177,106)],
               19:[(177,72),(280,103),(282,111),(177,89)],
               20:[(177,55),(292,94),(294,102),(177,72)],
               21:[(177,43),(294,78),(295,85),(177,60)],
               22:[(177,40),(294,67),(294,78),(177,57)],23:source_jib}
    stairs=[[(146,128),(179,128),(179,160),(159,173),(146,160)],
            [(216,125),(247,125),(247,159),(225,174),(216,159)]]
    footprints=[[(123,87),(157,87),(157,150),(140,158),(123,150)],
                [(178,115),(219,115),(219,178),(198,188),(178,178)],
                [(175,65),(219,65),(219,124),(175,124)],
                [(230,91),(272,91),(272,158),(230,158)]]
    removed=np.logical_or.reduce([s.region(poly) for poly in stairs+footprints])
    removed|=s.region([(151,48),(181,48),(181,121),(151,121)])
    removed|=(s.xx<182)&(s.yy<87)
    removed|=s.region([(204,102),(219,102),(235,111),(238,123),(231,130),(213,129),(202,119)])
    base=terminal.masked(stationary,~removed & (s.yy>=100))
    ground=art.material_quad(s,2,[(112,144),(201,101),(287,145),(202,188)],(90,90),.85)
    base=over(base,ground)
    supports=[]
    for i,poly in enumerate(footprints):
        retained=terminal.masked(stationary,s.region(poly)&~np.logical_or.reduce([s.region(v) for v in stairs])
                                 &~s.region([(151,48),(181,48),(181,121),(151,121)]))
        if i<2:
            dx,dy=(0,0) if i==0 else (56,29)
            left=np.array([(124,111),(140,119),(140,155),(124,147)])+[dx,dy]
            right=np.array([(140,119),(156,110),(156,146),(140,155)])+[dx,dy]
            solid=over(art.material_quad(s,0,left,(18,35)),art.material_quad(s,1,right,(18,35)))
            top=terminal.masked(retained,s.yy<122+dy-abs(s.xx-(140+dx))*.35)
            solid=over(top,solid)
        else:
            dx,dy=(0,0) if i==2 else (55,27)
            q=np.array([(176,75),(217,89),(217,126),(176,112)])+[dx,dy]
            solid=art.material_quad(s,0,q,(41,40))
            cap_q=np.array([(176,73),(183,69),(218,81),(211,85)])+[dx,dy]
            top=art.material_quad(s,2,cap_q,(40,8))
            enamel=red_panel(s,np.array([(180,73),(184,71),(213,81),(209,83)])+[dx,dy],(34,5))
            top=over(enamel,top)
            solid=over(top,solid)
        if i<2:
            gap=(s.yy>=121+dy-np.abs(s.xx-(140+dx))*.35)&(s.yy<=143+dy-np.abs(s.xx-(140+dx))*.35)
        else:
            gap=(s.yy>=90+dy+(s.xx-(176+dx))*.34)&(s.yy<=110+dy+(s.xx-(176+dx))*.34)
        # Keep finished visible brickwork; only the closed opening needs new paint.
        solid=over(terminal.masked(retained,~gap),solid)
        supports.append((solid,retained,gap))
    for p,old in enumerate(prior['phases']):
        s.active_phase=p;nodes=copy.deepcopy(old)
        if p<23:
            nodes=[n for n in nodes if not n['name'].startswith(('original-front-dock-support','original-rear-dock-support'))
                   and n['name'] not in ['original-dock-platform','original-fixed-waterline']]
            current_base=base
            if p>=19:
                step_regions=s.region([(163,137),(177,144),(162,164),(151,157)])|s.region([(230,137),(243,143),(230,162),(219,155)])
                excluded=step_regions|s.region([(154,54),(180,54),(180,121),(154,121)])|((s.xx<155)&(s.yy<85))
                current_base=over(terminal.masked(stationary,~excluded),terminal.masked(ground,step_regions))
            initial=[];s.put(initial,current_base,'fixed-complete-dock-platform',p,'RETAINED_WORLD_PLATFORM_WITH_CLOSED_HIDDEN_DECK_AND_NO_EARLY_STAIRS',ground=True)
            for i,(solid,retained,gap) in enumerate(supports):
                source=solid
                if p>=19:
                    cover=terminal.masked(solid,gap)
                    cover=terminal.move(cover,dy=-{19:5,20:12,21:19,22:26}[p])
                    cover=terminal.masked(cover,gap)
                    source=over(cover,retained)
                if i<2:
                    cx,cy=140+i*56,155+i*29
                    drop=max(0,31*(1-np.clip((p-6)/6,0,1)))
                    part=terminal.move(source,dy=drop)
                    part=terminal.masked(part,s.yy<=cy-np.abs(s.xx-cx)*.35)
                else:
                    target=s.marker_top(p,lambda x,y:(x>180+(i-2)*55)&(x<216+(i-2)*55)&(y<125+(i-2)*27),99+(i-2)*27)
                    drop=max(0,target+1-bounds(solid[...,3]>=8)[1]/4) if p<19 else 0
                    part=terminal.move(source,dy=drop)
                    part=terminal.masked(part,s.yy<=126+(i-2)*27)
                s.put(initial,part,f'complete-emerging-support-{i}',p,
                      'SOLID_MASONRY_SUPPORT_WITH_CAP_AND_LATE_OPENING',translation=[0,drop])
            nodes=initial+nodes
            if p<18:
                lid=art.material_quad(s,3,[(153,118),(168,110),(184,118),(168,126)],(28,28),.72)
                s.put(nodes,lid,'closed-crane-socket',p,'OPAQUE_METAL_PLATFORM_CAP_BEFORE_VERTICAL_MAST_LIFT')
        if 13<=p<23:
            projected=s.project(terminal.masked(head,~triangle_mask) if p<=15 else head,source_head,head_poses[p])
            correction=max(0,s.rig.logical[p]['trimOrigin'][1]+1-bounds(projected[...,3]>=8)[1]/4)
            projected=terminal.move(projected,dy=correction)
            if p<=15:
                source=np.array([(165,22),(180,43),(153,45)],float)
                target=np.array({13:[(218,133),(206,121),(200,101)],
                                 14:[(202,99),(211,117),(187,91)],
                                 15:[(186,75),(204,101),(178,96)]}[p],float)
                matrix=np.linalg.solve(np.column_stack([source,np.ones(3)]),target).T
                folded=art.base.transform(triangle,matrix,s.rig.canvas)
                projected=over(projected,folded)
                face={13:[(170,101),(191,94),(193,117),(171,114)],
                      14:[(165,90),(172,88),(181,110),(176,113)],
                      15:[(161,83),(166,82),(171,104),(167,107)]}[p]
                tile=art.place(hidden_tile('reverseBearing'),(0,0,30,30),s.rig.canvas)
                reverse=s.project(tile,[(0,0),(30,0),(30,30),(0,30)],face)
                projected=over(reverse,projected)
            replace_node(s,nodes,p,'original-coupled-dock-head-and-jib',projected,
                         'INDEPENDENT_SOURCE_HEAD_PERSPECTIVE_AND_BOOM_FACE_POSES',corners=head_poses[p])
            if p>=14:
                boom=s.project(jib,source_jib,jib_poses[p])
                s.put(nodes,boom,'registered-lattice-boom',p,'FULL_LATTICE_FACE_PROJECTED_ON_NATIVE_BOOM_CORNERS',corners=jib_poses[p])
                cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                peak=np.asarray(head_poses[p][1],float)+[0,correction+1]
                peak[1]=max(peak[1],s.rig.logical[p]['trimOrigin'][1]+1)
                tip=np.asarray(jib_poses[p][1],float)+[0,2]
                draw.line([tuple(peak*4),tuple(tip*4)],fill=(38,38,32,255),width=3)
                s.put(nodes,np.array(cable),'registered-boom-stay',p,'CABLE_JOINS_ACTUAL_HEAD_PIN_AND_LATTICE_TIP')
            if p>=18:
                nodes=[n for n in nodes if n['name'] not in ['original-dock-hook','original-dock-cable']]
                grab=terminal.masked(crane,(s.xx>282)&(s.yy>=99)&(s.yy<131))
                tip=np.asarray(jib_poses[p][1],float)+[0,5]
                hook_top=np.array({18:[250,134],19:[270,143],20:[288,137],21:[292,122],22:[293,108]}[p],float)
                hook=terminal.move(grab,dx=hook_top[0]-293,dy=hook_top[1]-104)
                s.put(nodes,hook,'registered-dock-hook',p,'HOOK_FOLLOWS_NATIVE_DOWNWARD_HOIST_PATH',translation=(hook_top-[293,104]).tolist())
                cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                draw.line([tuple(tip*4),tuple(hook_top*4)],fill=(38,38,32,255),width=3)
                s.put(nodes,np.array(cable),'registered-hoist-cable',p,'CABLE_JOINS_BOOM_TIP_AND_NATIVE_HOOK')
        if 12<=p<23:
            pump=s.retained([(204,102),(219,102),(235,111),(238,123),(231,130),(213,129),(202,119)])
            angle={12:-1.96,13:-1.96,14:-1.75,15:-1.15,16:-.6,17:-.18}.get(p,0)
            rolled=art.base.rotate(pump,angle,(220,116),s.rig.canvas)
            if p<18:rolled=terminal.move(rolled,dx=-1,dy=11 if p==12 else 2)
            rolled=terminal.masked(rolled,s.yy<142)
            replace_node(s,nodes,p,'original-dock-pump',rolled,
                         'CYLINDER_EMERGES_UPRIGHT_THEN_ROLLS_TO_RETAINED_HORIZONTAL_POSE',angleRadians=angle)
        if 13<=p<19:
            near=[n for n in nodes if n['name'] in ['complete-emerging-support-0','complete-emerging-support-1']]
            nodes=[n for n in nodes if n not in near]+near
        s.phases.append(nodes)
    return s.finish()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('output',type=Path)
    p.add_argument('--families',default='NAWEAP,NADEPT,NAYARD,NATECH')
    args=p.parse_args()
    selected={value.strip() for value in args.families.split(',')}
    assert selected and selected <= {'NAWEAP','NADEPT','NAYARD','NATECH'}, selected
    args.output.mkdir(exist_ok=False)
    snap=args.output/'authoring-source.py';shutil.copy2(__file__,snap)
    art.SOURCE={
        'code':str(snap),'sha256':sha(snap),
        'projectionCode':'scripts/art/author-soviet-original.py',
        'projectionCodeSha256':sha('scripts/art/author-soviet-original.py'),
        'material':'RETAINED_HD_AND_AUTHORED_SURFACE_PLANES_NO_NATIVE_NEUTRAL_RGB',
        'hiddenSurfaceAtlas':str(HIDDEN_FILE),'hiddenSurfaceAtlasSha256':sha(HIDDEN_FILE)}
    baseline=read(ROOT/'soviet-original-r89-v1/selected-v4/authoring.json')
    old=read(ROOT/'soviet-original-r89-v1/selected-rigs-v4.json');assets=ROOT/'soviet-production-r88-v1';rigs={}
    for rec in baseline['families']:
        if rec['identity'] not in selected or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        ref=assets/('reference-'+rec['theater'].lower()+'-v1/report.json')
        scene=art.Scene(rec,assets,ref,args.output/rec['key'],True)
        for material in [0,1]:
            texture=scene.materials[material];w,h=texture.size
            scene.materials[material]=texture.crop((w//4,h//4,w*3//4,h*3//4))
        method={'NATECH':lab,'NAWEAP':factory,'NADEPT':depot,'NAYARD':dock}[rec['identity']]
        rigs[rec['key']]=method(scene,old[rec['key']])
        write(args.output/(rec['key']+'-rig.json'),rigs[rec['key']])
        print(rec['key'],len(scene.violations),'geometry violations',flush=True)
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
