"""War Factory construction and native front/roof production depth layers."""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha, indices
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, project_part, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAWEAP',theater)
body,bib,flag,fan,front,under_front,roof,under_roof,build = row['members']
size = tuple(body['canvas'])
hd = tuple(v* DENSITY for v in size)
keys_path = ROOT/'production-art-v1/GAWEAP/keys-raw.png'
sheet = Image.open(keys_path).convert('RGBA')
keys = [sheet.crop(b) for b in ((0,0,680,640),(705,0,1280,640),(0,640,645,1280),(645,640,1280,1280))]
normal = normal_for(ROOT/'review-v1/GAWEAP-candidate-2x.png')
damaged,_ = register(keys[0],size,resting(row,True).getbbox())
floor,_ = register(keys[1],size,decode(row,build,0).getbbox())
mid,_ = register(keys[2],size,decode(row,build,11).getbbox())
late,_ = register(keys[3],size,decode(row,build,18).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT/'production-art-v1/GAWEAP/snow-raw.png').convert('RGBA'),2,1)
    normal,damaged = [register(part,size,resting(row,bool(i)).getbbox())[0] for i,part in enumerate(snow)]
open_path = ROOT/'production-art-v1/GAWEAP/open-roof-raw.png'
opened = [register(part,size,resting(row,bool(i)).getbbox())[0]
          for i,part in enumerate(sheet_cells(Image.open(open_path).convert('RGBA'),2,1))]
frames = {}
for member in (body,bib):
    for n in range(member['visibleFrames']):
        master = normal if n == 0 else damaged
        frames[member['source']['member'],n] = master if member is body else clip(opened[int(n!=0)],native_mask(member,min(n,1),hd,expand=1))
        if member is bib:
            rgba = np.array(frames[member['source']['member'],n])
            rgba[172*DENSITY:201*DENSITY,164*DENSITY:194*DENSITY] = 0
            frames[member['source']['member'],n] = Image.fromarray(rgba)


def partition(master,members,n):
    distances = []
    yy,xx = np.indices(hd[::-1])
    for member in members:
        native = indices(member,n)
        field = distance_transform_edt(native == 0)
        field = np.array(Image.fromarray(field).resize(hd,Image.Resampling.BILINEAR))
        f = member['frames'][n]
        allowed = (xx >= f['x']* DENSITY) & (xx < (f['x']+f['width'])* DENSITY)
        allowed &= (yy >= f['y']* DENSITY) & (yy < (f['y']+f['height'])* DENSITY)
        field[~allowed] = 1e6
        distances.append(field)
    fields = np.stack(distances)
    ownership = fields.argmin(axis=0)
    return [clip(master,Image.fromarray(np.uint8((ownership == i)&(fields[i] < 1e6))*255))
            for i in range(len(members))]


for pair,masters in (((front,under_front),(normal,damaged)),((roof,under_roof),opened)):
    for n in range(4):
        if n < 2:
            layers = partition(masters[n],pair,n)
        else:
            layers = [Image.new('RGBA',hd) for member in pair]
        for member,image in zip(pair,layers):
            if member is under_front and n < 2:
                image = clip(opened[n], native_mask(member,n,hd,expand=1))
            elif member is front and n < 2:
                # Floor pixels belong to the native flat layers, whose depth
                # allows produced vehicles to pass above the entrance ramp.
                floor_region = polygon(Image.new('RGBA',hd,(255,255,255,255)),
                    [(194,181),(213,169),(242,184),(243,206),(219,220),(195,200)])
                flat = np.maximum(np.array(frames[bib['source']['member'],n])[...,3],
                    np.array(clip(opened[n],native_mask(under_front,n,hd,expand=1)))[...,3]) > 0
                rgba = np.array(image); rgba[...,3][(np.array(floor_region)[...,3] > 0) & flat] = 0
                rgba[...,:3][rgba[...,3] == 0] = 0; image = Image.fromarray(rgba)
                native = under_front['frames'][n]
                x,y,w,h = (native[k]*DENSITY for k in ('x','y','width','height'))
                rgba[y:y+h,x:x+w] = 0; image = Image.fromarray(rgba)
            frames[member['source']['member'],n] = add_native_snow(row,member,n,image,normal)
for n in range(flag['visibleFrames']):
    if n >= 30:
        image = Image.new('RGBA',hd)
    else:
        master = normal if n < 15 else damaged
        image = rectangle(master,(102,65,109,95))
        cloth = polygon(master,[(108,68),(126,73),(125,79),(117,84),(108,78)])
        phase = (n%15)/15*2*np.pi
        q = [(108,68),(127,68),(127,85),(108,85)]
        target = [(108,68),(126+np.sin(phase)*2,69+np.cos(phase)),
                  (123+np.sin(phase)*2,83+np.cos(phase)),(108,85)]
        image.alpha_composite(project_part(cloth,q,target))
    frames[flag['source']['member'],n] = image
for n in range(fan['visibleFrames']):
    if n >= 6:
        image = Image.new('RGBA',hd)
    else:
        image = clip(normal,native_mask(fan,n,hd,expand=1))
        rotor = normal.crop((83* DENSITY,142* DENSITY,97* DENSITY,149* DENSITY)).resize((28*DENSITY,28*DENSITY),Image.Resampling.BICUBIC)
        rotor = rotor.rotate(n*15,Image.Resampling.BICUBIC).resize((14*DENSITY,7*DENSITY),Image.Resampling.LANCZOS)
        layer = Image.new('RGBA',hd)
        layer.alpha_composite(rotor,(83* DENSITY,142* DENSITY))
        image.alpha_composite(clip(layer,native_mask(fan,n,hd,expand=0)))
    frames[fan['source']['member'],n] = image
ground,foot = ground_planes(normal)
rear = polygon(mid,[(58,108),(91,99),(111,83),(136,97),(126,153),(83,171),(60,153)])
reactor = rectangle(normal,(95,98,123,139))
roof_quad = [(130,105),(225,149),(202,196),(103,157)]
shop_floor = polygon(late,[(118,137),(146,135),(260,190),(204,224),(113,183)])
for n in range(build['visibleFrames']):
    image = floor.copy()
    if n >= 1:
        image.alpha_composite(clip(translate(rear,dy=max(0,6-n)*9),ground))
    if n >= 5:
        image.alpha_composite(clip(rectangle(mid,(98,143,260,224)),native_mask(build,n,hd,expand=1)))
    if n >= 12:
        image.alpha_composite(clip(shop_floor,native_mask(build,n,hd,expand=1)))
    if n >= 15:
        reactor_floor,_ = ground_planes(reactor)
        image.alpha_composite(clip(translate(reactor,dy=max(0,17-n)*5),reactor_floor))
    if n >= 19:
        image.alpha_composite(clip(translate(rectangle(normal,(102,65,129,101)),dy=max(0,22-n)*8),ground))
    if n >= 21:
        amount = [0.2,0.6,0.9,1][n-21]
        a,b,c,d = roof_quad
        target = [(d[0]+(a[0]-d[0])*amount,d[1]+(a[1]-d[1])*amount),
                  (c[0]+(b[0]-c[0])*amount,c[1]+(b[1]-c[1])*amount),c,d]
        image.alpha_composite(project_part(normal,roof_quad,target))
    image = clip(image,native_mask(build,n,hd,expand=2))
    if n == 24:
        image = normal.copy()
    frames[build['source']['member'],n] = add_native_snow(row,build,n,image,normal)
out = ROOT/'full-exports-v2'/('GAWEAP' if theater == 'TEMPERATE' else 'GAWEAP-SNOW')
export_frames(row,frames,out,{'authoredKeysSha256':sha(keys_path),'openRoofSha256':sha(open_path),
    'mechanism':'Separate native foreground/under-door layers; open roof interior; local flag/fan and roof construction',
    'factoryPoseFrames':'Normal 0, damaged 1, shadow-only tails blank; native runtime range audit pending',
    'wholeBuildingScale':[1,1]})
print(theater,len(frames),'War Factory slots; visual QA pending')
