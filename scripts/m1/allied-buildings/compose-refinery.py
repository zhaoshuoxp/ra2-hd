"""Empty refinery architecture, separate native-timed ore layers and assembly."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha, indices
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GAREFN',theater)
body,bib,l1,l2,l3,ore,build = row['members']
size = tuple(body['canvas'])
hd = tuple(v* DENSITY for v in size)
keys_path = ROOT/'production-art-v1/GAREFN/keys-raw.png'
sheet = Image.open(keys_path).convert('RGBA')
keys = [sheet.crop(b) for b in ((0,0,695,640),(695,0,1280,640),(0,640,640,1280),(640,640,1280,1280))]
empty_path = ROOT/'production-art-v1/GAREFN/empty-raw.png'
empty = sheet_cells(Image.open(empty_path).convert('RGBA'),2,1)
normal,damaged = [register(part,size,resting(row,bool(i)).getbbox())[0] for i,part in enumerate(empty)]
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT/'production-art-v1/GAREFN/snow-raw.png').convert('RGBA'),2,1)
    snow_masters = [register(part,size,resting(row,bool(i)).getbbox())[0] for i,part in enumerate(snow)]
    tray_points = [(126,139),(148,133),(173,141),(177,154),(140,168),(125,160)]
    normal_empty,damaged_empty = normal,damaged
    normal,damaged = snow_masters
    normal.alpha_composite(polygon(normal_empty,tray_points))
    damaged.alpha_composite(polygon(damaged_empty,tray_points))
floor,_ = register(keys[1],size,decode(row,build,5).getbbox())
mid,_ = register(keys[2],size,decode(row,build,11).getbbox())
late,_ = register(keys[3],size,decode(row,build,19).getbbox())

# Recover ore material from the accepted high-resolution master. Only this
# material moves; neither the empty tray nor the architecture participates.
ore_source_path = ROOT/'art-v1/GAREFN/normal-raw.png'
source = Image.open(ore_source_path).convert('RGBA').crop((775,792,1055,964))
pixels = np.array(source)
rgb = pixels[...,:3].astype(float)
gold = (rgb[...,0] > 95) & (rgb[...,1] > 45) & (rgb[...,0] > rgb[...,2]*1.6) & (rgb[...,1] > rgb[...,2]*1.25)
pixels[...,3] = np.uint8(gold)*pixels[...,3]
grain = Image.fromarray(pixels)
frames = {}
for member in (body,bib):
    for n in range(member['visibleFrames']):
        master = normal if n == 0 else damaged
        frames[member['source']['member'],n] = master if member is body else clip(master,native_mask(member,min(n,1),hd,expand=1))
for member in (l1,l2,l3,ore):
    for n in range(member['visibleFrames']):
        native = decode(row,member,n)
        pixels = indices(member,n)
        if not native.getbbox() or set(np.unique(pixels)).issubset({0,1}):
            image = Image.new('RGBA',hd)
        else:
            target = native.getbbox()
            image,_ = register(grain,size,target)
            # Independent granular fall, contained in the original ore layer.
            image = translate(image,dx=(n%3-1)*.35,dy=(n%4)*.28)
            p = np.array(image)
            p[...,:3] = np.uint8(np.clip(p[...,:3].astype(float)*(1-.08*(n%3)),0,255))
            image = Image.fromarray(p)
            image = clip(image,native_mask(member,n,hd,expand=1))
        frames[member['source']['member'],n] = image
ground,foot = ground_planes(normal)
front_arch = polygon(normal,[(119,119),(137,120),(132,153),(113,168),(94,166),(96,144)])
rear_arch = polygon(normal,[(135,108),(158,110),(169,126),(167,141),(152,145),(133,133)])
chimneys = [rectangle(normal,b) for b in ((67,72,90,125),(106,56,130,105))]
early = Image.new('RGBA',hd)
for source_box,target in (((790,409,890,486),(61,137,85,153)),((978,326,1084,399),(100,117,124,132))):
    part,_ = register(sheet.crop(source_box),size,target)
    early.alpha_composite(part)
early.alpha_composite(polygon(floor,[(94,145),(111,137),(135,151),(122,162)]))
for n in range(build['visibleFrames']):
    image = clip(floor,native_mask(build,n,hd,expand=1))
    if n >= 1:
        shell = rectangle(mid,(75,112,153,163))
        shell = clip(translate(shell,dy=max(0,5-n)*3),ground)
        image.alpha_composite(clip(shell,native_mask(build,n,hd,expand=1)))
    if n >= 7:
        image.alpha_composite(clip(rectangle(late,(118,151,202,190)),native_mask(build,n,hd,expand=1)))
    if n >= 11:
        for part in (front_arch,rear_arch):
            part_ground,_ = ground_planes(part)
            image.alpha_composite(clip(translate(part,dy=max(0,16-n)*3),part_ground))
    if n >= 15:
        image.alpha_composite(clip(late,native_mask(build,n,hd,expand=1)))
    if n >= 19:
        for part in chimneys:
            part_ground,_ = ground_planes(part)
            image.alpha_composite(clip(translate(part,dy=[43,35,25,18,8,0][n-19]),part_ground))
    if n >= 18:
        image.alpha_composite(clip(foot,native_mask(build,n,hd,expand=1)))
    if n == 0:
        image = early.copy()
    if n == 24:
        image = normal.copy()
    frames[build['source']['member'],n] = add_native_snow(row,build,n,image,normal)
out = ROOT/'full-exports-v2'/('GAREFN' if theater == 'TEMPERATE' else 'GAREFN-SNOW')
export_frames(row,frames,out,{'authoredKeysSha256':sha(keys_path),'emptyTraySha256':sha(empty_path),
    'oreMaterialSha256':sha(ore_source_path),'mechanism':'Empty static tray; separate ore levels and granular fall; local arches and chimney assembly',
    'oreShadowTail':'Native indices 0/1 only; no duplicate color sprite','wholeBuildingScale':[1,1]})
print(theater,len(frames),'Refinery slots; visual QA pending')
