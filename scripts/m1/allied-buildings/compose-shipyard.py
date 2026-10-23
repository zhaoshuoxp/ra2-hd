"""Shipyard: fixed piers, independently projected jib, cable and claw."""
import sys
import numpy as np
from scipy import ndimage
from PIL import Image
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, project_part, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAYARD',theater)
body,idle,production,active,repair,build = row['members']
size = tuple(body['canvas'])
hd = tuple(v* DENSITY for v in size)
keys_path = ROOT/'production-art-v1/GAYARD/keys-raw.png'
keys = sheet_cells(Image.open(keys_path).convert('RGBA'))
normal = normal_for(ROOT/'review-v1/GAYARD-candidate-2x.png')
damaged,_ = register(keys[0],size,resting(row,True).getbbox())
early,_ = register(keys[1],size,decode(row,build,0).getbbox())
mid,_ = register(keys[2],size,decode(row,build,11).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT/'production-art-v1/GAYARD/snow-raw.png').convert('RGBA'),2,1)
    normal,_ = register(snow[0],size,resting(row).getbbox())
    damaged,_ = register(snow[1],size,resting(row,True).getbbox())
fixed_path = ROOT/'production-art-v1/GAYARD/fixed-raw.png'
fixed,_ = register(Image.open(fixed_path).convert('RGBA'),size,(146,57,284,255))
boom_quad = [(219,100),(290,101),(289,111),(219,120)]
boom = polygon(normal,boom_quad)
claw = rectangle(normal,(279,158,303,193))
cable = rectangle(normal,(289,113,293,159))
pivot = np.array([222.,109.])


def native_gold(member,n):
    rgba = np.array(decode(row,member,n))
    rgb = rgba[...,:3].astype(float)
    yy,xx = np.indices(rgba.shape[:2])
    gold = (rgb[...,0] > 100)&(rgb[...,1] > 65)&(rgb[...,2] < rgb[...,1]*.6)&(rgba[...,3] > 0)
    return gold,xx,yy


def tip_and_hook(member,n):
    gold,xx,yy = native_gold(member,n)
    labels,count = ndimage.label(ndimage.binary_dilation(gold,iterations=1))
    candidates = []
    for label in range(1,count+1):
        support = (labels == label)&gold
        points = np.array([xx[support],yy[support]]).T
        if len(points) and np.linalg.norm(points-pivot,axis=1).min() < 20:
            candidates.append((len(points),label))
    upper = gold&(labels == max(candidates)[1]) if candidates else gold&(xx > 217)&(yy < 131)
    points = np.array([xx[upper],yy[upper]]).T
    if not len(points):
        return np.array([289.,106.]),193.
    distances = np.linalg.norm(points-pivot,axis=1)
    tip = points[np.argsort(distances)[-min(5,len(points)):]].mean(axis=0)
    vector = tip-pivot
    tip += vector/max(1,np.linalg.norm(vector))*4
    hook = gold&(abs(xx-tip[0]) < 17)&(yy > tip[1]+12)
    bottom = float(yy[hook].max()+1) if hook.any() else float(tip[1]+55)
    return tip,bottom


base_tip,base_hook = tip_and_hook(idle,0)


def crane(member,n,damage=False,parts_only=False):
    image = Image.new('RGBA',hd) if parts_only else fixed.copy()
    if damage:
        # Preserve the authored structural damage in the stationary head.
        image.alpha_composite(rectangle(damaged,(175,55,218,157)))
    tip,hook = tip_and_hook(member,n)
    tip += np.array([289.,106.])-base_tip
    hook += 193-base_hook
    vector = tip-pivot
    u = vector/max(1,np.linalg.norm(vector))
    v = np.array([-u[1],u[0]])
    target = [tuple(pivot-v*9),tuple(tip-v*5),tuple(tip+v*5),tuple(pivot+v*10)]
    image.alpha_composite(project_part(boom,boom_quad,target))
    top = float(tip[1]+3)
    bottom = max(top+4,hook-34)
    wire = cable.crop(tuple(round(v * DENSITY / 2) for v in (578,226,586,318))).resize((4*DENSITY,max(DENSITY,round((bottom-top)* DENSITY))),Image.Resampling.LANCZOS)
    image.alpha_composite(wire,(round((tip[0]-2)* DENSITY),round(top* DENSITY)))
    image.alpha_composite(translate(claw,dx=tip[0]-291,dy=hook-193))
    return image


frames = {}
for n in range(body['visibleFrames']):
    frames[body['source']['member'],n] = normal if n == 0 else damaged
for member in (idle,production,repair):
    damaged_start = next(a['damaged']['start'] for a in row['animations'] if a['member'] == member['source']['member'])
    for n in range(member['visibleFrames']):
        image = crane(member,n,n >= damaged_start)
        frames[member['source']['member'],n] = add_native_snow(row,member,n,image,normal)
for n in range(active['visibleFrames']):
    if n >= 30:
        image = Image.new('RGBA',hd)
    else:
        # Authored foam follows the native water support, without blue shadow pixels.
        source = normal if n < 15 else damaged
        water = rectangle(source,(135,185,295,256))
        image = clip(water,native_mask(active,n,hd,expand=2))
    frames[active['source']['member'],n] = image

ground,foot = ground_planes(normal)
head = polygon(fixed,[(174,54),(208,53),(229,83),(240,110),(229,137),(195,136),(176,111)])
pedestal = polygon(fixed,[(195,124),(223,127),(226,164),(215,175),(195,169),(193,145)])
platform = rectangle(early,(135,174,295,256))
columns = [polygon(normal,p) for p in [
    [(163,118),(189,116),(198,131),(194,153),(171,165),(163,148)],
    [(237,123),(262,122),(275,143),(269,182),(249,191),(237,174)],
    [(147,158),(165,148),(184,154),(188,178),(178,216),(152,214)],
    [(218,164),(239,153),(254,164),(254,211),(243,231),(215,219)],
]]
for n in range(build['visibleFrames']):
    image = platform.copy()
    for i,part in enumerate(columns):
        # Each piston rises within its own stationary pier envelope.
        image.alpha_composite(clip(translate(part,dy=max(0,6-n)*3),ground))
    if n < 4:
        image = early.copy() if n == 0 else image
        image.alpha_composite(rectangle(early,(175,147,233,186)))
    if n >= 3:
        image.alpha_composite(clip(translate(pedestal,dy=max(0,10-n)*6),ground))
    if n >= 9:
        source = [(174,53),(240,53),(240,137),(174,137)]
        amount = min(1,(n-8)/8)
        target = [(174,137-84*amount),(240,137-84*amount),(240,137),(174,137)]
        image.alpha_composite(project_part(head,source,target))
    if n >= 18:
        image.alpha_composite(crane(build,n,parts_only=True))
    image = clip(image,native_mask(build,n,hd,expand=3))
    if n >= 23:
        image = normal.copy()
    frames[build['source']['member'],n] = add_native_snow(row,build,n,image,normal)
out = ROOT/'full-exports-v2'/('GAYARD' if theater == 'TEMPERATE' else 'GAYARD-SNOW')
export_frames(row,frames,out,{'authoredKeysSha256':sha(keys_path),'fixedHeadSha256':sha(fixed_path),
    'mechanism':'Fixed piers; projected local jib; independent hanging cable/claw; native production and repair ranges',
    'wholeBuildingScale':[1,1]})
print(theater,len(frames),'Shipyard slots; visual QA pending')
