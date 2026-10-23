"""Author six infrastructure construction rigs from complete physical components."""
import argparse
import copy
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt, label, find_objects, map_coordinates
from scipy.spatial import ConvexHull

from buildup import native_indices, read, sha, write
from painted_rig import bounds, over, place, project_rgba, vector_coverage
from retained_idle import display

parts = SourceFileLoader('infrastructure_parts', 'scripts/art/author-ore-satellite.py').load_module()
kit_tools = SourceFileLoader('infrastructure_kit', 'scripts/art/author-weather-depot.py').load_module()
terminal = parts.terminal


def complete_atlas(file):
    rgba = np.array(Image.open(file).convert('RGBA'))
    ids, _ = label(rgba[..., 3] >= 230)
    objects = []
    for number, region in enumerate(find_objects(ids), 1):
        support = ids[region] == number
        if support.sum() < 500:
            continue
        ys, xs = np.where(support)
        center = [xs.mean()+region[1].start, ys.mean()+region[0].start]
        objects.append((number, center))
    result = {}
    for cell in range(6):
        target = np.array([(cell%3+.5)*rgba.shape[1]/3, (cell//3+.5)*rgba.shape[0]/2])
        number, _ = min(objects, key=lambda item: np.linalg.norm(np.asarray(item[1])-target))
        support = binary_dilation(ids == number, iterations=2)
        selected = rgba.copy(); selected[~support] = 0
        x0,y0,x1,y1 = bounds(support)
        result[cell] = (Image.fromarray(selected[y0:y1,x0:x1]), (x0,y0,x1,y1))
    return result


def mask(rgba, polygon):
    return terminal.masked(rgba, terminal.polygon(rgba.shape, polygon))


def neutral(rgba):
    out = rgba.copy()
    red = (out[..., 0] > out[..., 1] * 2.0) & (out[..., 0] > out[..., 2] * 2.0)
    value = np.dot(out[..., :3], [.55, .30, .15])
    out[red, :3] = np.clip(value[red, None] * [1., 1.02, 1.05], 0, 255).astype(np.uint8)
    return out


def transform(layer, matrix, canvas):
    matrix = np.asarray(matrix, float).copy()
    matrix[:, :2] /= 4
    return project_rgba(Image.fromarray(layer), matrix.tolist(), canvas)


def rotate(layer, angle, pivot, canvas):
    c, s = np.cos(angle), np.sin(angle)
    matrix = np.array([[c, -s], [s, c]])
    return transform(layer, np.column_stack((matrix, np.asarray(pivot)-matrix@pivot)), canvas)


def hinged(layer, angle, pivot, canvas, depth=2., back_color=(100, 105, 110), axis_direction=(2., 1.), fold_direction=(.5, -.25), ground_plane=False):
    """Rotate an extruded part about its fixed isometric cross axis."""
    axis = np.array(axis_direction); axis /= np.linalg.norm(axis)
    vertical = np.array([-axis[1], axis[0]])
    normal = np.cos(angle)*vertical + np.sin(angle)*np.array(fold_direction)
    matrix = np.outer(axis, axis) + np.outer(normal, vertical)
    if ground_plane:
        width_axis = np.array([-1., .5])
        length_axis = np.array([1., .5])
        turned_length = np.array([np.cos(angle), .5*np.cos(angle)-np.sin(angle)])
        matrix = np.column_stack((width_axis, turned_length)) @ np.linalg.inv(
            np.column_stack((width_axis, length_axis)))
    pivot = np.asarray(pivot, float)
    translation = pivot-matrix@pivot
    result = np.zeros_like(layer)
    if depth:
        edge = np.array([-.7, .45])*depth
        outline = np.column_stack(np.where(layer[..., 3] >= 128)[::-1])[::16]/4
        if len(outline) >= 3:
            hull = outline[ConvexHull(outline).vertices]
            rim = Image.new('RGBA', (canvas[0]*4, canvas[1]*4)); draw = ImageDraw.Draw(rim)
            for a, b in zip(hull, np.roll(hull, -1, axis=0)):
                points = [matrix@v+translation for v in [a, b]]
                quad = points+[points[1]+edge, points[0]+edge]
                draw.polygon([tuple(v*4) for v in quad], fill=(*back_color, 255))
            result = np.array(rim)
    if abs(np.linalg.det(matrix)) > 1e-5:
        result = over(transform(layer, np.column_stack((matrix, translation)), canvas), result)
    return result


class Scene:
    def __init__(self, record, assets, reference, output, diagnostic=False):
        self.rig, self.full = parts.seed_rig(record, reference, output)
        self.record = record
        self.output = output
        key = {'GAREFN':'garefn-temperate', 'GAYARD':'gayard-temperate'}.get(record['identity'], record['identity'].lower())
        self.file = assets/(key+'-components-v1.png')
        self.kit = complete_atlas(self.file)
        self.yy, self.xx = np.mgrid[:self.full.shape[0], :self.full.shape[1]]/4
        self.phases = []
        self.checks = []
        self.diagnostic = diagnostic
        self.violations = []
        self.owner_allowed = []
        for phase in range(record['frames']):
            indices = native_indices(self.rig.raw, phase)
            self.owner_allowed.append(bool(((indices>=16)&(indices<=31)).any()))
        geometries = read(reference)['cases'][record['identity']]['poseCheck']['initialIdleGeometry']
        activity = [g['sourceMember'] for g in geometries if g['sourceMember'].endswith('l1.shp')]
        self.structure = display(self.rig.record, exclude_members=activity) if activity else self.full

    def fitted(self, cell, box):
        return place(self.kit[cell][0], box, self.rig.canvas)

    def closed_pad(self, center, radius=11.):
        cx,cy=center
        ring=Image.new('RGBA',(self.rig.canvas[0]*16,self.rig.canvas[1]*16))
        draw=ImageDraw.Draw(ring)
        for inset,color in [(0,(95,100,105,255)),(.7,(165,12,9,255)),(2.,(75,80,85,255)),(2.7,(190,195,203,255))]:
            rx=radius-inset;ry=(radius-inset)*.43
            draw.ellipse(((cx-rx)*16,(cy-ry)*16,(cx+rx)*16,(cy+ry)*16),fill=color)
        for angle in np.linspace(0,2*np.pi,7)[:-1]:
            x=cx+(radius-1.3)*np.cos(angle);y=cy+(radius-1.3)*.43*np.sin(angle)
            draw.ellipse((x*16-4,y*16-3,x*16+4,y*16+3),fill=(215,218,224,255))
        return np.array(ring.resize((self.rig.canvas[0]*4,self.rig.canvas[1]*4),Image.Resampling.LANCZOS))

    def reactor_bed(self):
        density=16
        image=Image.new('RGBA',(self.rig.canvas[0]*density,self.rig.canvas[1]*density))
        draw=ImageDraw.Draw(image)
        outer=np.array([(84,102),(109,89),(149,112),(124,127)],float)
        inner=np.array([(91,101),(110,92),(141,111),(122,121)],float)
        def polygon(points,color):draw.polygon([tuple(p*density) for p in points],fill=color)
        polygon([outer[0],outer[3],outer[3]+[0,2],outer[0]+[0,2]],(61,63,66,255))
        polygon([outer[3],outer[2],outer[2]+[0,2],outer[3]+[0,2]],(42,44,47,255))
        polygon(outer,(124,121,113,255));polygon(inner,(43,43,42,255))
        for fraction in [.2,.5,.8]:
            a=inner[0]+(inner[3]-inner[0])*fraction
            b=inner[1]+(inner[2]-inner[1])*fraction
            draw.line([tuple(a*density),tuple(b*density)],fill=(82,86,91,255),width=round(1.8*density))
            draw.line([tuple((a+[0,-.35])*density),tuple((b+[0,-.35])*density)],fill=(164,169,176,255),width=round(.5*density))
        for a,b in zip(outer,np.roll(outer,-1,axis=0)):
            draw.line([tuple(a*density),tuple(b*density)],fill=(180,181,179,255),width=round(.55*density))
            for fraction in [.15,.5,.85]:
                p=a+(b-a)*fraction
                draw.ellipse((p[0]*density-7,p[1]*density-5,p[0]*density+7,p[1]*density+5),fill=(212,214,215,255))
        return np.array(image.resize((self.rig.canvas[0]*4,self.rig.canvas[1]*4),Image.Resampling.LANCZOS))

    def emit(self, nodes, layer, name, phase, method, source='retained', ground=False, **details):
        if not self.owner_allowed[phase]:
            layer = neutral(layer)
        if ground:
            indices = native_indices(self.rig.raw, phase)
            coverage = indices > 0
            if self.record['identity'] == 'GAREFN' and name == 'fixed-empty-platform':
                rgb = np.asarray(self.record['palette'], float)[indices]
                coverage &= (rgb[..., 0] > rgb[..., 2]*1.08) & (rgb[..., 1] > rgb[..., 2]*1.04)
                coverage &= rgb[..., 0] < rgb[..., 1]*1.4
            layer = layer.copy()
            layer[..., 3] = np.minimum(layer[..., 3], vector_coverage(coverage))
            layer[layer[..., 3] == 0] = 0
        if not (layer[..., 3] > 0).any():
            return
        frame = self.rig.logical[phase]
        x, y = frame['trimOrigin']; w, h = frame['trimSize']
        outside = layer[..., 3].copy(); outside[y*4:(y+h)*4, x*4:(x+w)*4] = 0
        violation = not ground and (outside >= 8).any()
        if violation:
            detail = {'key':self.record['key'], 'phase':phase, 'name':name,
                      'outsideBounds':bounds(outside >= 8), 'pixels':int((outside >= 8).sum())}
            assert self.diagnostic, detail
            self.violations.append(detail)
        source_info = (source if isinstance(source,dict) else {'code':__file__, 'sha256':sha(__file__), 'material':'AUTHORED_CLOSED_STEEL_SOCKET'}
                       if source == 'geometry' else
                       {'family':self.record['newFamilyPath'], 'sha256':self.record['newFamilySha256']}
                       if source == 'retained' else {'image':str(self.file), 'sha256':sha(self.file)})
        if violation:
            node = self.rig.save(layer, name, phase, {'method':method, 'reference':source_info,
                'outsidePixels':int((outside >= 8).sum()), **details})
        else:
            node = parts.node(self.rig, layer, name, phase, source_info, method,
                          componentCamera='FIXED_RETAINED_CAMERA', opaquePixelsClipped=0, **details)
        if node:
            nodes.append(node)
            self.checks.append({'phase':phase, 'name':name, 'method':method, **details})

    def floor(self, cell=0, box=None, polygon=None):
        layer = neutral(self.fitted(cell, box))
        layer[..., 3] = np.minimum(layer[..., 3], self.full[..., 3])
        if polygon:
            layer = mask(layer, polygon)
        return layer

    def terminal(self, phase):
        if phase < self.record['frames']-1:
            return None
        nodes = []
        marker = np.zeros_like(self.full)
        x, y = self.rig.logical[phase]['trimOrigin']; marker[y*4, x*4] = [0, 0, 0, 1]
        self.emit(nodes, marker, 'retained-idle-marker', phase, 'RETAINED_IDLE_PRESENTATION')
        return nodes

    def finish(self):
        result = self.rig.finish(self.phases)
        result.update(newConstructionArt=True, losslessTilePool=True,
            neutralMaterialProvenance='AUTHORED_COMPONENTS_AND_RETAINED_HD_RGB_NO_NATIVE_COLOR',
            architecturalMethod='COMPLETE_RIGID_COMPONENTS_FIXED_UV_PHYSICAL_HINGES_AND_EMERGENCE', visualAcceptance='PENDING')
        for phase, nodes in enumerate(self.phases):
            preview = Image.new('RGBA', (self.rig.canvas[0]*4, self.rig.canvas[1]*4))
            for node in nodes:
                x0, y0, x1, y1 = [round(v*4) for v in node['box']]
                layer = Image.open(node['image']).convert('RGBA')
                if layer.size != (x1-x0, y1-y0):
                    layer = layer.resize((x1-x0, y1-y0), Image.Resampling.LANCZOS)
                preview.alpha_composite(layer, (x0, y0))
            preview.save(self.output/f'{phase:02}-preview.png')
        result['infrastructureMotion'] = {'identity':self.record['identity'], 'checks':self.checks,
            'wholeBuildingBoundsFit':False, 'nativeNeutralRgbContribution':0, 'visualAcceptance':'PENDING'}
        result['unselectedGeometryViolations'] = self.violations
        Image.fromarray(self.full).save(self.output/'retained-idle-reference.png')
        return result


def allied_refinery(s):
    full,yy,xx=s.structure,s.yy,s.xx
    floor=s.floor(box=(32,117,202,192))
    raw=np.array(Image.open(s.file).convert('RGBA'))
    shed_source=mask(raw,[(620/4,236/4),(687/4,187/4),(824/4,212/4),
        (878/4,250/4),(880/4,326/4),(810/4,378/4),(636/4,315/4)])
    bb=bounds(shed_source[...,3]>=128);x0,y0,x1,y1=bb
    shed=place(Image.fromarray(shed_source[y0:y1,x0:x1]),(77,106,161,155),s.rig.canvas)
    roofs=mask(full,[(102,122),(128,109),(152,105),(178,112),(181,139),
                     (155,165),(121,170),(99,164)])
    beam=mask(full,[(92,104),(112,99),(151,117),(151,143),(139,143),(137,123),(92,114)])
    red=(full[...,0]>full[...,1]*2.0)&(full[...,0]>full[...,2]*2.0)
    beam=terminal.masked(beam,red&(((xx-123)/14)**2+((yy-99)/8)**2>1))
    post=terminal.masked(beam,(xx>=139)&(yy>=120))
    strip=terminal.masked(beam,(yy<125)&(xx<151))
    loading=mask(full,[(127,170),(147,151),(166,144),(187,147),(201,161),(196,181),(156,192),(133,184)])
    chambers=[s.fitted(3,(48,119,103,158)),s.fitted(3,(107,96,146,129))]
    lower=[mask(full,[(39,136),(52,124),(79,121),(100,132),(100,151),(77,160),(49,149)]),
           mask(full,[(107,108),(121,102),(141,108),(147,120),(138,130),(115,125)])]
    lower=[terminal.masked(lower[0],yy>=125),terminal.masked(lower[1],yy>=108)]
    stacks=[mask(full,[(69,78),(91,78),(92,107),(96,122),(84,126),(67,120),(71,104)]),
            mask(full,[(112,58),(134,58),(134,85),(139,101),(125,106),(110,100),(115,83)])]
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        s.emit(nodes,floor,'fixed-empty-platform',p,'FIXED_WORLD_UV_DEPLOYED_FOUNDATION',source='kit',ground=p<4)
        if p<16:s.emit(nodes,s.closed_pad((82,140)),'front-closed-foundation-pad',p,'COMPLETE_CLOSED_SOCKET_NATIVE_INITIAL_STAGE',source='geometry')
        if p<18:
            cy=122-max(0,p-16)*8
            s.emit(nodes,s.closed_pad((123,cy),10.),'rear-closed-foundation-pad',p,'COMPLETE_CLOSED_SOCKET_NATIVE_INITIAL_STAGE',source='geometry')
        if p>=18:
            chamber=over(lower[1],chambers[1])
            s.emit(nodes,chamber,'rear-chimney-chamber',p,'COMPLETE_CLOSED_CHAMBER_BEHIND_ROOF',source='kit')
        if p>=21:
            top=s.rig.logical[p]['trimOrigin'][1]
            drop=max(0,top-58+.5)
            rear=terminal.masked(terminal.move(stacks[1],dy=drop),yy<105)
            s.emit(nodes,rear,'rear-chimney-stack',p,'FIXED_SCALE_STACK_EMERGES_FROM_COLLAR',verticalDrop=drop)
        if p:
            drop=max(0,124-4*p-106)
            body=terminal.masked(terminal.move(shed,dy=drop),yy<158)
            s.emit(nodes,body,'unfinished-processing-shed',p,'COMPLETE_SHED_RISES_THROUGH_FOUNDATION',source='kit',verticalDrop=drop)
        if p>=7:
            drop=max(0,(10-p)*6)
            hardware=terminal.masked(terminal.move(loading,dy=drop),yy<192)
            s.emit(nodes,hardware,'loading-rollers-and-hopper',p,'COMPLETE_LOADING_ASSEMBLY_EMERGENCE',verticalDrop=drop)
        if p>=6:s.emit(nodes,post,'front-red-connector-post',p,'INDEPENDENT_COMPLETE_CONNECTOR_POST')
        if p>=8:
            shift=max(0,s.rig.logical[p]['trimOrigin'][1]-bounds(strip[...,3]>=8)[1]/4+.25)
            s.emit(nodes,terminal.move(strip,dy=shift),'red-top-connector',p,'COMPLETE_TOP_CONNECTOR_NATIVE_INSTALL_STAGE',verticalDrop=shift)
        if p>=11:
            drop={11:24,12:16,13:10,14:5,15:1}.get(p,0)
            casing=terminal.masked(terminal.move(roofs,dy=drop),yy<=170)
            s.emit(nodes,casing,'sliding-curved-casing',p,'RIGID_CURVED_SHELL_TRANSLATES_THROUGH_GROUND_SOCKET',verticalDrop=drop)
        if p>=16:
            chamber=over(lower[0],chambers[0])
            s.emit(nodes,chamber,'front-chimney-chamber',p,'COMPLETE_CLOSED_CHAMBER_WITH_EXACT_RETAINED_LOWER_BODY',source='kit')
        if p>=19:
            drop=max(0,(24-p)*8)
            front=terminal.masked(terminal.move(stacks[0],dy=drop),yy<124)
            s.emit(nodes,front,'front-chimney-stack',p,'FIXED_SCALE_STACK_EMERGES_FROM_COLLAR',verticalDrop=drop)
        s.phases.append(nodes)
    return s.finish()


def naval_yard(s):
    full,yy=s.full,s.yy
    floor=s.fitted(1,(183,172,237,205));floor[...,3]=np.minimum(floor[...,3],full[...,3])
    housing=mask(full,[(180,72),(188,64),(196,61),(198,55),(205,53),(211,55),
        (214,65),(221,72),(228,83),(233,94),(237,106),(233,117),
        (225,127),(217,130),(204,127),(198,117),(189,109),(183,100),(180,89)])
    gold=(housing[...,0]>housing[...,1]*1.08)&(housing[...,1]>housing[...,2]*1.5)&(housing[...,1]>70)
    housing=terminal.masked(housing,~(gold&(s.xx>218)&(yy>96)))
    drum=mask(full,[(197,132),(222,132),(231,145),(231,156),(224,166),(206,172),
        (187,161),(187,152),(195,146)])
    jib=mask(full,[(220,98),(291,98),(293,111),(272,119),(220,116)])
    hook=mask(full,[(289,157),(300,157),(303,174),(295,190),(281,179),(281,171)])
    raw=np.array(Image.open(s.file).convert('RGBA'))
    body_raw=mask(raw,[(1245/4,154/4),(1396/4,154/4),(1396/4,382/4),(1245/4,382/4)])
    bb=bounds(body_raw[...,3]>=128);x0,y0,x1,y1=bb;body_image=Image.fromarray(body_raw[y0:y1,x0:x1])
    boxes=[(164,116,198,185),(237,129,271,202),(151,151,185,217),(215,161,250,228)]
    bodies=[];feet=[]
    for x0,y0,x1,y1 in boxes:
        body=place(body_image,(x0,y0+16,x1,y1-3),s.rig.canvas)
        cap=s.fitted(3,(x0,y0,x1,y0+18));assembly=over(cap,body);assembly[...,3]=np.minimum(assembly[...,3],full[...,3]);bodies.append(assembly)
        water=s.fitted(2,(x0-9,y1-58,x1+9,y1+26))
        water[...,3]=np.minimum(water[...,3],full[...,3])
        feet.append(terminal.masked(water,yy>=y1-8))
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        s.emit(nodes,floor,'fixed-naval-platform',p,'FIXED_CENTRAL_DECK',source='kit')
        for i,(body,foot,box) in enumerate(zip(bodies,feet,boxes)):
            s.emit(nodes,foot,'fixed-waterline-foot-'+str(i),p,'FIXED_PYLON_WATERLINE_FOOT',source='kit',ground=p<8)
            drop={0:31,1:22,2:12,3:4}.get(p,0)
            layer=terminal.masked(terminal.move(body,dy=drop),yy<=box[3])
            s.emit(nodes,layer,'telescoping-pylon-'+str(i),p,'COMPLETE_CYLINDER_RISES_THROUGH_FIXED_FOOT',source='kit',verticalDrop=drop)
        if p>=13:
            completed=terminal.masked(full,(yy>=134)&(s.xx<280))
            s.emit(nodes,completed,'retained-deployed-naval-structure',p,'EXACT_RETAINED_DEPLOYED_PYLONS_AND_LOWER_DECK')
        if p>=8:
            drop=max(0,(13-p)*5)
            s.emit(nodes,terminal.masked(terminal.move(drum,dy=drop),yy<175),'central-drum',p,'FIXED_DIAMETER_CENTRAL_MAST_EMERGENCE',verticalDrop=drop)
        angle=np.deg2rad({0:88,1:88,2:88,3:88,4:88,5:88,6:88,7:88,8:87,9:84,10:80,11:66,12:43,13:30,14:23,15:21,16:21,17:21,18:21,19:10}.get(p,8))
        upper=hinged(housing,angle,(211,133),s.rig.canvas,depth=3)
        # The complete pivot bearing rises from the central socket first.
        if p<11:
            drop=s.rig.logical[p]['trimOrigin'][1]-bounds(upper[...,3]>=128)[1]/4+.5
            upper=terminal.move(upper,dy=max(0,drop))
            bb=bounds(upper[...,3]>=8)
            dx=max(0,s.rig.logical[p]['trimOrigin'][0]-bb[0]/4+.25)
            upper=terminal.move(upper,dx=dx)
        if p>=11:
            bearing=mask(full,[(200,123),(227,123),(231,137),(218,142),(199,135)])
            s.emit(nodes,bearing,'fixed-upper-bearing',p,'COMPLETE_RETAINED_BEARING_CONNECTS_HOUSING_TO_MAST')
        s.emit(nodes,upper,'pivoting-crane-housing',p,'FIXED_CROSS_AXIS_EXTRUDED_HOUSING',hinge=[211,133],angleRadians=float(angle))
        if p>=18:
            angle={18:-.25,19:-.7,20:-.55,21:-.3,22:-.12}.get(p,0)
            moved=rotate(jib,angle,(221,106),s.rig.canvas)
            s.emit(nodes,moved,'rotating-lattice-jib',p,'COMPLETE_FIXED_LENGTH_JIB_ROTATES_ABOUT_BEARING',hinge=[221,106],angleRadians=angle)
            if p>=20:
                c,si=np.cos(angle),np.sin(angle);tip=np.array([[c,-si],[si,c]])@np.array([70.,0])+[221,106]
                delta=tip-[291,106]
                carried=terminal.move(hook,dx=delta[0],dy=delta[1])
                # Native hoist travel keeps the entire grab in its world envelope.
                right=s.rig.logical[p]['trimOrigin'][0]+s.rig.logical[p]['trimSize'][0]
                bb=bounds(carried[...,3]>=128);dx=min(0,right-bb[2]/4-.25)
                carried=terminal.move(carried,dx=dx)
                s.emit(nodes,carried,'hanging-grab',p,'RIGID_GRAB_FOLLOWS_NATIVE_HOIST_TRAVEL',translation=[float(delta[0]+dx),float(delta[1])])
                cable=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(cable)
                draw.line((tip[0]*4,tip[1]*4,(tip[0]+dx)*4,(157+delta[1])*4),fill=(145,140,125,255),width=3)
                s.emit(nodes,np.array(cable),'hoist-cable',p,'CABLE_FROM_MOVING_JIB_TIP_TO_GRAB')
        s.phases.append(nodes)
    return s.finish()


def power_plant(s):
    full,yy,xx=s.full,s.yy,s.xx
    floor=s.reactor_bed()
    bodies=[s.fitted(2,(82,42,111,99)),s.fitted(2,(136,69,165,127))]
    caps=[mask(full,[(82,46),(98,41),(111,48),(97,57),(82,51)]),
          mask(full,[(135,75),(151,68),(165,74),(151,83),(135,79)])]
    towers=[over(c,b) for c,b in zip(caps,bodies)]
    finished_faces=[mask(full,[(82,46),(98,41),(111,48),(111,88),(96,99),(82,92)]),
        mask(full,[(136,77),(151,69),(166,75),(166,117),(150,127),(136,120)])]
    finished_faces[0]=terminal.masked(finished_faces[0],~((xx>106)&(yy>58)))
    finished_faces[1]=terminal.masked(finished_faces[1],~((xx<148)&(yy>=103)))
    finished_faces[0]=terminal.masked(finished_faces[0],~terminal.polygon(full.shape,[(78,79),(91,86),(80,102),(64,94)]))
    ramps=[mask(full,[(78,79),(91,86),(80,102),(64,94)]),
           mask(full,[(131,105),(146,112),(139,129),(123,121)])]
    reactor=s.fitted(4,(106,59,143,99))
    sphere=mask(full,[(109,65),(119,59),(130,60),(137,67),(138,87),(130,98),(117,98),(107,88),(105,77)])
    sphere=terminal.masked(sphere,(xx<134)|(yy<70))
    reactor=over(sphere,reactor)
    front_occluder=towers[1][...,3]>=128
    pipes=mask(full,[(162,77),(177,77),(178,135),(155,135),(152,126),(162,117)])
    arc=((full[...,2]>full[...,0]*1.05)&(full[...,2]>full[...,1]*1.05)&(yy>89)&(yy<116)&(xx>98)&(xx<143))
    arcs=terminal.masked(full,arc)
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        s.emit(nodes,floor,'fixed-reactor-bed',p,'FIXED_WORLD_UV_REACTOR_FOUNDATION',source='kit',ground=p<6)
        indices=native_indices(s.rig.raw,p);palette=np.asarray(s.record['palette']);rgb=palette[indices]
        native_red=(rgb[...,0]>rgb[...,1]*2.0)&(rgb[...,0]>rgb[...,2]*2.0)&(indices>0)
        ny,nx=np.indices(indices.shape)
        for i,(tower,cap,base) in enumerate(zip(towers,caps,[104,128])):
            if i==1 and p==0:continue
            region=(nx<118) if i==0 else (nx>125)
            bb=bounds(native_red&region)
            top=bb[1] if bb else s.rig.logical[p]['trimOrigin'][1]
            source_top=bounds(cap[...,3]>=128)[1]/4
            drop=max(0,top-source_top)
            body=terminal.masked(terminal.move(tower,dy=drop),yy<base)
            if p>=(15 if i==0 else 16):
                body=over(finished_faces[i],body)
            if i==1 and p==1:body=terminal.move(body,dx=-.5)
            s.emit(nodes,body,'rising-brick-tower-'+str(i),p,'FIXED_SCALE_TOWER_RISES_THROUGH_ITS_FOOT',source='kit',verticalDrop=drop)
        if p>=16:
            hardware=Image.new('RGBA',(s.rig.canvas[0]*16,s.rig.canvas[1]*16));draw=ImageDraw.Draw(hardware)
            routes=[[(104,56),(108,57),(119,64)],[(104,64),(108,66),(119,73)],
                    [(103,90),(108,92),(118,96)],[(139,91),(132,87)],[(139,100),(131,94)]]
            for route in routes:
                points=[(x*16,y*16) for x,y in route]
                draw.line(points,fill=(45,47,49,255),width=48,joint='curve')
                draw.line(points,fill=(125,128,134,255),width=32,joint='curve')
                draw.line([(x*16,(y-.4)*16) for x,y in route],fill=(190,194,202,255),width=12,joint='curve')
            hardware=np.array(hardware.resize((s.rig.canvas[0]*4,s.rig.canvas[1]*4),Image.Resampling.LANCZOS))
            s.emit(nodes,hardware,'installed-reactor-couplings',p,'COMPLETE_METAL_COUPLINGS_BEFORE_CORE_ENERGIZATION',source='geometry')
        if p>=1:
            for i,ramp in enumerate(ramps):
                angle=np.deg2rad(-max(6,80-p*5.5))
                hinge=(72,98) if i==0 else (131,125)
                panel=hinged(neutral(ramp) if p<21 else ramp,angle,hinge,s.rig.canvas,depth=.5)
                bb=bounds(panel[...,3]>=8);frame=s.rig.logical[p]
                left=max(f['trimOrigin'][0] for f in s.rig.logical[p:s.record['frames']-1])
                dx=max(0,left-bb[0]/4+.25) if i==0 else 0
                dy=-max(0,bb[3]/4-sum([frame['trimOrigin'][1],frame['trimSize'][1]])+.25) if i==1 else 0
                panel=terminal.move(panel,dx=dx,dy=dy)
                s.emit(nodes,panel,'hinged-access-panel-'+str(i),p,'RIGID_HINGED_PANEL_ON_DEPLOYING_FOOT',hinge=[hinge[0]+dx,hinge[1]+dy],footTranslation=[dx,dy],angleRadians=float(angle))
        if p>=17:
            cx,cy=124.5,79.
            scale=min(1.,.25+(p-17)*.125)
            matrix=[[scale,0,cx*(1-scale)],[0,scale,cy*(1-scale)+(1-scale)*9]]
            core=terminal.masked(transform(reactor,matrix,s.rig.canvas),~front_occluder)
            s.emit(nodes,core,'energizing-reactor-core',p,'NATIVE_ENERGY_FIELD_GROWTH',source='kit',energyScale=scale)
        if p>=20:
            dx=-max(.5,24-p)
            layer=terminal.masked(terminal.move(pipes,dx=dx),xx>=160)
            s.emit(nodes,layer,'late-external-conduits',p,'COMPLETE_CONDUITS_EMERGE_FROM_WALL',translation=[dx,0])
        if p>=21:s.emit(nodes,arcs,'energized-channel',p,'RETAINED_ENERGY_EFFECT_NATIVE_ACTIVATION_STAGE')
        s.phases.append(nodes)
    return s.finish()


def barracks(s):
    full,yy,xx=s.full,s.yy,s.xx
    floor=s.floor(box=(81,127,171,167))
    base=mask(full,[(92,116),(119,105),(147,115),(161,150),(171,158),(145,167),(115,164),(81,153)])
    statue=mask(full,[(103,4),(142,4),(143,89),(139,100),(132,101),(127,99),(123,106),(117,105),(118,90),(112,82),(113,61),(103,51)])
    top=mask(full,[(104,99),(119,94),(126,99),(140,96),(150,103),(147,114),(132,122),(104,114),(99,108)])
    plain=neutral(base)
    wall_parts=[
        (s.fitted(5,(98,111,123,145)),(110,142)),
        (s.fitted(5,(129,109,153,145)),(141,142)),
        (mask(plain,[(107,115),(127,121),(119,156),(97,149)]),(109,151)),
        (mask(plain,[(135,116),(150,110),(163,145),(143,156)]),(153,150))]
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        s.emit(nodes,floor,'fixed-barracks-slab',p,'FIXED_WORLD_UV_SLAB',source='kit',ground=p<3)
        if 4<=p<8:
            for index,(panel,hinge) in enumerate(wall_parts):
                degrees=([50,24,8,0] if index<2 else [74,50,28,8])[p-4]
                angle=np.deg2rad(degrees)
                walls=hinged(panel,angle,hinge,s.rig.canvas,depth=.7)
                s.emit(nodes,walls,'independent-folding-wall-'+str(index),p,
                    'COMPLETE_WALL_ROTATES_ABOUT_ITS_OWN_FOUNDATION_HINGE',source='kit' if index<2 else 'retained',
                    hinge=list(hinge),angleRadians=float(angle))
        elif p>=8:
            s.emit(nodes,plain if p<22 else base,'deployed-barracks-walls',p,'EXACT_RETAINED_DEPLOYED_WALLS_NATIVE_PAINT_STAGE')
        if p>=7:
            native_top=s.rig.logical[p]['trimOrigin'][1]
            drop=max(0,native_top-4)
            rising=terminal.masked(terminal.move(statue,dy=drop),yy<128)
            s.emit(nodes,rising,'complete-emerging-statue',p,'RIGID_STATUE_EMERGES_THROUGH_FIXED_ROOF_SOCKET',verticalDrop=drop)
        if p>=16:
            s.emit(nodes,top,'statue-plinth-and-roof',p,'FIXED_PLINTH_NATIVE_OWNER_FINISH_STAGE')
        s.phases.append(nodes)
    return s.finish()


def soviet_refinery(s):
    full,yy,xx=s.structure,s.yy,s.xx
    floor=s.floor(box=(35,104,191,180));floor=mask(floor,[(35,113),(99,99),(151,111),(150,159),(102,160),(35,135)])
    raw=np.array(Image.open(s.file).convert('RGBA'))
    concrete=Image.fromarray(raw[270:340,170:310]).convert('RGB')
    patch=np.array(concrete.resize((60*4,38*4),Image.Resampling.BICUBIC))
    replacement=np.zeros_like(full);replacement[124*4:162*4,104*4:164*4,:3]=patch
    radial=((xx-134)/30)**2+((yy-144)/18)**2
    weight=np.clip((1.15-radial)*2,0,1)[...,None]
    region=(xx>=104)&(xx<164)&(yy>=124)&(yy<162)
    floor[region,:3]=np.clip(floor[region,:3]*(1-weight[region])+replacement[region,:3]*weight[region],0,255).astype(np.uint8)
    chambers=[mask(full,[(111,37),(135,37),(135,73),(146,89),(146,123),(131,134),(102,130),(100,98),(108,78)]),
              mask(full,[(63,64),(84,64),(84,94),(98,112),(99,147),(86,155),(55,154),(43,143),(45,111),(61,95)])]
    ramp=mask(full,[(126,159),(164,142),(193,163),(193,180),(151,182),(127,168)])
    ramp=terminal.masked(ramp,yy>=-.5*xx+224)
    bridge=mask(full,[(76,89),(91,88),(114,103),(117,132),(109,143),(92,135),(87,114),(71,105)])
    bucket_region=terminal.polygon(full.shape,[(108,106),(118,106),(135,137),(132,145),(124,141),(108,117)])
    bucket=terminal.masked(full,bucket_region)
    bridge=terminal.masked(bridge,~bucket_region&~((xx<82)&(yy<106)))
    end=Image.new('RGBA',(s.rig.canvas[0]*4,s.rig.canvas[1]*4));draw=ImageDraw.Draw(end)
    for polygon,color in [([(78,88),(83,86),(89,89),(84,92)],(210,12,8,255)),
        ([(78,88),(84,92),(84,99),(78,95)],(142,7,5,255)),
        ([(84,92),(89,89),(89,96),(84,99)],(176,8,6,255))]:
        draw.polygon([(x*4,y*4) for x,y in polygon],fill=color)
    bridge=over(bridge,np.array(end))
    pit_file=s.file.parent/'narefn-empty-pit-v1.png'
    pit_image=kit_tools.atlas(pit_file,(1,1))[0][0]
    pit=place(pit_image,(108,129,162,158),s.rig.canvas)
    fills=[s.fitted(1,(101,37,148,130)),s.fitted(1,(47,64,96,155))]
    for i in range(2):
        foreground=bucket_region|((full[...,0]>full[...,1]*2.)&(full[...,0]>full[...,2]*2.))
        if i==0:foreground|=(xx<114)&(yy>102)
        if i==1:
            foreground|=(yy>81)&(yy<103)&(xx>80.25)
        clean=terminal.masked(chambers[i],~foreground)
        chambers[i]=over(clean,fills[i])
        chambers[i][...,3]=np.minimum(chambers[i][...,3],full[...,3])
    pipes=terminal.masked(full,((xx<51)&(yy>120))|((xx>131)&(xx<154)&(yy>100))|((yy>146)&(xx<102)))
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        s.emit(nodes,floor,'fixed-refinery-platform',p,'FIXED_WORLD_UV_FOUNDATION',source='kit',ground=p<6)
        if p>=10:s.emit(nodes,pit,'complete-empty-loading-pit',p,'COMPLETE_EMPTY_PIT_BEFORE_BUCKET_INSTALLATION',source={'image':str(pit_file),'sha256':sha(pit_file)})
        if p>=1:
            angle=np.deg2rad({1:180,2:160,3:140,4:120,5:100,6:85,7:70,8:57,9:43,10:32,11:24,12:14,13:8,14:3,15:1}.get(p,0))
            panel=hinged(ramp,angle,(148,150),s.rig.canvas,depth=1.1*abs(np.sin(angle)),ground_plane=True)
            s.emit(nodes,panel,'hinged-arrival-ramp',p,'COMPLETE_RAMP_ROTATES_ABOUT_FIXED_REAR_EDGE',hinge=[148,150],angleRadians=float(angle))
        for i,start in enumerate([1,10]):
            if p<start:continue
            drop=max(0,s.rig.logical[p]['trimOrigin'][1]-37+.5) if i==0 else max(0,(18-p)*5)
            body=terminal.masked(terminal.move(chambers[i],dy=drop),yy<(129 if i==0 else 151))
            s.emit(nodes,body,'rising-reaction-chamber-'+str(i),p,'RIGID_CHAMBER_RISES_THROUGH_FIXED_CIRCULAR_FOOT',verticalDrop=drop)
        if p>=5:
            if p<12:
                angle=np.deg2rad((12-p)*10)
                beam=hinged(bridge,angle,(102,130),s.rig.canvas,depth=1.5)
            else:beam=bridge;angle=0
            s.emit(nodes,beam,'central-connecting-beam',p,'RIGID_CONNECTOR_ROTATES_ABOUT_BEARING',hinge=[102,130],angleRadians=float(angle))
        if p>=10:
            lip=mask(full,[(43,147),(69,144),(97,146),(100,152),(81,158),(51,154)])
            lip=terminal.masked(lip,yy>=149)
            s.emit(nodes,lip,'fixed-front-chamber-socket',p,'FIXED_CONCRETE_SOCKET_OCCLUDES_EMERGING_CHAMBER')
        if p>=16:s.emit(nodes,pipes,'late-independent-pipes',p,'COMPLETE_EXTERNAL_PIPES_NATIVE_INSTALL_STAGE')
        if p>=22:
            angle={22:-.65,23:-.3}.get(p,0)
            deployed=rotate(bucket,angle,(112,110),s.rig.canvas)
            s.emit(nodes,deployed,'deploying-bucket-conveyor',p,'COMPLETE_BUCKET_UNIT_ROTATES_FROM_ITS_BEARING',hinge=[112,110],angleRadians=angle)
        s.phases.append(nodes)
    return s.finish()


def retained_front_uv(full):
    """Rectify the accepted completed dish into its fixed physical surface UVs."""
    radius, depth, vertical_scale = 20.7, 5., 1.25
    tilt, azimuth = np.deg2rad([55., 110.])
    ct, st, ca, sa = np.cos(tilt), np.sin(tilt), np.cos(azimuth), np.sin(azimuth)
    rotation = np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]]) @ np.array(
        [[1, 0, 0], [0, ct, -st], [0, st, ct]])
    v, u = np.mgrid[-radius:radius:256j, -radius:radius:256j]
    z = depth * (u*u + v*v) / radius**2
    world = np.stack((u, v, z), axis=-1) @ rotation.T
    x = (118.55 + world[..., 0] - world[..., 1]) * 4
    y = (33.46 + .5 * (world[..., 0] + world[..., 1]) - vertical_scale * world[..., 2]) * 4
    pixels = np.stack([map_coordinates(full[..., channel], [y, x], order=1,
        mode='constant', cval=0) for channel in range(4)], axis=-1)
    valid = pixels[..., 3] >= 230
    _, nearest = distance_transform_edt(~valid, return_indices=True)
    pixels[~valid] = pixels[nearest[0][~valid], nearest[1][~valid]]
    return Image.fromarray(pixels)


def radar_dish(s,p,front,back):
    """Ray trace one fixed-radius paraboloid while its physical axis turns."""
    radius=20.7;depth=5.;vertical_scale=1.25
    tilt_degrees=max(0,min(82,(p-13)*11.7)) if p<=20 else {21:80,22:75,23:70,24:65,25:60,26:55}[p]
    azimuth_degrees=max(0,(p-14)*7.5) if p<=20 else {21:60,22:70,23:80,24:90,25:100,26:110}[p]
    tilt=np.deg2rad(tilt_degrees);azimuth=np.deg2rad(azimuth_degrees)
    ct,st=np.cos(tilt),np.sin(tilt);ca,sa=np.cos(azimuth),np.sin(azimuth)
    rotation=np.array([[ca,-sa,0],[sa,ca,0],[0,0,1]])@np.array([[1,0,0],[0,ct,-st],[0,st,ct]])
    normal_world=rotation@np.array([0.,0.,1.])
    normal_offset_y=(.5*(normal_world[0]+normal_world[1])-vertical_scale*normal_world[2])*10
    center=np.array([113.75+(normal_world[0]-normal_world[1])*10,103.-min(p,14)*3.7])
    x=s.xx-center[0];y=s.yy-center[1]
    origin=np.stack((y+x/2,y-x/2,np.zeros_like(x)),axis=-1)@rotation
    direction=np.array([1.,1.,1/vertical_scale])@rotation
    if p<21:
        cap_height=8.8
        weights=np.array([1/radius**2,1/radius**2,1/cap_height**2])
        a=np.sum(direction**2*weights)
        b=2*np.sum(origin*direction*weights,axis=-1)
        c=np.sum(origin**2*weights,axis=-1)-1
    else:
        a=depth/radius**2*(direction[0]**2+direction[1]**2)
        b=2*depth/radius**2*(origin[...,0]*direction[0]+origin[...,1]*direction[1])-direction[2]
        c=depth/radius**2*(origin[...,0]**2+origin[...,1]**2)-origin[...,2]
    disc=b*b-4*a*c;root=np.sqrt(np.maximum(disc,0));t1=(-b+root)/(2*a);t2=(-b-root)/(2*a)
    one=origin+t1[...,None]*direction;two=origin+t2[...,None]*direction
    valid1=(disc>=0)&(one[...,0]**2+one[...,1]**2<=radius**2)
    valid2=(disc>=0)&(two[...,0]**2+two[...,1]**2<=radius**2)
    if p<21:
        valid1&=one[...,2]>=0
        valid2&=two[...,2]>=0
    point=np.where(valid1[...,None],one,two)
    valid=valid1|valid2
    uv=(point[...,:2]/radius+1)/2
    forward=(rotation@np.array([0.,0.,1.])).sum()>0
    texture=front if p>=25 else back
    rgba=np.array(texture.convert('RGBA'))
    valid_texture=rgba[...,3]>=230
    if p<25:
        color=rgba[...,:3].astype(float)
        valid_texture&=color[...,0]<color[...,1]*1.4
    _,nearest=distance_transform_edt(~valid_texture,return_indices=True)
    rgba[...,:3]=rgba[nearest[0],nearest[1],:3]
    tx=np.clip(uv[...,0]*(rgba.shape[1]-1),0,rgba.shape[1]-1).astype(int);ty=np.clip(uv[...,1]*(rgba.shape[0]-1),0,rgba.shape[0]-1).astype(int)
    result=rgba[ty,tx].copy();result[...,3]=np.where(valid,255,0)
    normal=(point*np.array([1/radius**2,1/radius**2,1/8.8**2]))@rotation.T if p<21 else np.stack((-2*depth*point[...,0]/radius**2,-2*depth*point[...,1]/radius**2,np.ones_like(x)),axis=-1)@rotation.T
    illumination=.78+.23*np.abs(normal@np.array([-.3,-.4,.86]))/np.linalg.norm(normal,axis=-1)
    if p>=25:illumination=np.ones_like(illumination)
    result[...,:3]=np.clip(result[...,:3]*illumination[...,None],0,255).astype(np.uint8);result[~valid]=0
    bb=bounds(result[...,3]>=128)
    dy=s.rig.logical[p]['trimOrigin'][1]-bb[1]/4+.25
    result=terminal.move(result,dy=dy)
    return result,{'nativeVerticalRegistration':dy,'bearingOffsetY':normal_offset_y,'verticalCameraScale':vertical_scale,'radius':radius,'depth':depth,'tiltDegrees':float(np.rad2deg(tilt)),'azimuthDegrees':float(np.rad2deg(azimuth)),'center':center.tolist()}


def radar(s):
    full,yy,xx=s.full,s.yy,s.xx
    fitted=s.fitted(1,(67,78,157,129))
    central=terminal.masked(fitted,((xx-112)/23)**2+((yy-104)/19)**2<=1)
    mast=mask(full,[(107,58),(119,58),(119,80),(122,86),(120,93),(109,94),(103,88),(105,78)])
    dish_full=mask(full,[(98,3),(126,1),(143,16),(151,41),(146,57),(130,64),(111,62),(98,52),(91,32),(92,15)])
    foot_polygons=[[(66,101),(79,92),(94,94),(92,109),(78,112),(66,107)],
        [(77,115),(87,97),(97,97),(98,110),(91,122),(84,124)],
        [(99,111),(111,105),(123,114),(130,125),(120,129),(100,124),(97,120)],
        [(130,99),(139,95),(150,100),(158,112),(150,115),(132,111)]]
    feet=[mask(full,poly) for poly in foot_polygons]
    offsets=[(20,-4),(10,-10),(0,-15),(-20,-3)]
    front=retained_front_uv(full)
    photo=Image.open(s.file).convert('RGBA')
    back=photo.crop((1200,120,1370,280))
    late=terminal.masked(full,(yy>=88)&~((xx>121)&(yy<92)))
    for p in range(s.record['frames']):
        nodes=s.terminal(p)
        if nodes is not None:s.phases.append(nodes);continue
        nodes=[]
        if p>=5:
            remaining=max(0,(11-p)/6)
            for i,(foot,(dx,dy)) in enumerate(zip(feet,offsets)):
                offset=[dx*remaining,dy*remaining]
                if i==0:
                    native_left=max(f['trimOrigin'][0] for f in s.rig.logical[p:s.record['frames']-1])
                    offset[0]=max(0,native_left-bounds(foot[...,3]>=8)[0]/4+.25)
                layer=terminal.move(foot,dx=offset[0],dy=offset[1])
                s.emit(nodes,layer,'radially-deploying-foot-'+str(i),p,'COMPLETE_FOOT_TRANSLATES_FROM_CENTRAL_SOCKET',translation=offset)
        if p>=7:
            drop=max(0,(14-p)*2)
            body=terminal.masked(terminal.move(central,dy=drop),yy<116)
            s.emit(nodes,body,'emerging-radar-pedestal',p,'FIXED_DIAMETER_PEDESTAL_EMERGENCE',source='kit',verticalDrop=drop)
        if p>=27:
            top=bounds(dish_full[...,3]>=128)[1]/4
            dy=max(0,s.rig.logical[p]['trimOrigin'][1]-top+.25)
            dish=terminal.move(dish_full,dy=dy)
            geometry={'radius':20.7,'retainedCompletedDish':True,'verticalRegistration':dy}
            bearing_y=40+dy
        else:
            dish,geometry=radar_dish(s,p,front,back)
            bearing_y=geometry['center'][1]+geometry['nativeVerticalRegistration']-geometry['bearingOffsetY']
        if p>=11:
            # Constant-pitch lattice and rails extend; no finished shaft is stretched.
            top=max(s.rig.logical[p]['trimOrigin'][1],bearing_y-3)
            shaft=np.zeros_like(full)
            patch=full[62*4:78*4,108*4:120*4]
            region=(xx>=108)&(xx<120)&(yy>=top)&(yy<88)
            sy=((88-yy)*4).astype(int)%patch.shape[0]
            sx=((xx-108)*4).astype(int)%patch.shape[1]
            shaft[region]=patch[sy[region],sx[region]]
            s.emit(nodes,shaft,'telescoping-lattice-mast',p,'FIXED_PITCH_LATTICE_EXTENDS_TO_MOVING_BEARING',bearingY=bearing_y,baseY=88,bracePitch=16)
        if 13<=p<27:
            # The rotating bearing joins the mast axis to the complete dish back.
            center=np.asarray(geometry['center'])+[0,geometry['nativeVerticalRegistration']]
            normal_projection=np.array([center[0]-113.75,geometry['bearingOffsetY']])/10
            start=np.array([113.75,bearing_y-1])
            end=center+normal_projection*(8.8 if p<21 else 0)
            mount=Image.new('RGBA',(s.rig.canvas[0]*16,s.rig.canvas[1]*16));draw=ImageDraw.Draw(mount)
            for width,color,offset in [(4.8,(43,45,47,255),0),(3.2,(116,121,125,255),-.3),(1.1,(197,202,205,255),-.7)]:
                draw.line([tuple((point+[0,offset])*16) for point in [start,end]],fill=color,width=round(width*16))
            for fraction in [.15,.38,.61,.84]:
                point=start+(end-start)*fraction
                draw.ellipse(((point[0]-1.8)*16,(point[1]-1)*16,(point[0]+1.8)*16,(point[1]+1)*16),fill=(77,82,86,255))
            joint=np.array(mount.resize((s.rig.canvas[0]*4,s.rig.canvas[1]*4),Image.Resampling.LANCZOS))
            s.emit(nodes,joint,'complete-dish-bearing',p,'RIGID_BEARING_CONNECTS_MAST_AXIS_AND_DISH_BACK',source='geometry',mastEndpoint=start.tolist(),dishEndpoint=end.tolist())
        s.emit(nodes,dish,'rotating-paraboloid-dish',p,'FIXED_RADIUS_PARABOLOID_AND_RETAINED_FINAL_POSE',source='kit',**geometry)
        if p>=22:s.emit(nodes,late,'retained-completed-pedestal',p,'EXACT_RETAINED_PEDESTAL_FINISH')
        s.phases.append(nodes)
    return s.finish()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['authoring','assets','output']:parser.add_argument(name,type=Path)
    parser.add_argument('--diagnostic',action='store_true')
    args=parser.parse_args();args.output.mkdir(exist_ok=False)
    methods={'GAREFN':allied_refinery,'GAYARD':naval_yard,'NAPOWR':power_plant,
             'NAHAND':barracks,'NAREFN':soviet_refinery,'NARADR':radar}
    rigs={}
    for rec in read(args.authoring)['families']:
        if rec['identity'] not in methods or rec['theater'] not in ['TEMPERATE','SNOW']:continue
        ref=args.assets/('reference-'+rec['theater'].lower()+'-v1/report.json')
        scene=Scene(rec,args.assets,ref,args.output/rec['key'],args.diagnostic)
        rigs[rec['key']]=methods[rec['identity']](scene)
        print(rec['key'],'authored',flush=True)
    assert len(rigs)==12
    write(args.output/'rigs.json',rigs)


if __name__=='__main__':main()
