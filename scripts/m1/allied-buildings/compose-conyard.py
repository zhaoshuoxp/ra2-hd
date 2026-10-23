"""Construction Yard: fixed jib, vertical claw, workshop shutter and rail cart."""
import sys
import numpy as np
from PIL import Image
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, project_part, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GACNST',theater)
body,production,active,build = row['members']
size = tuple(body['canvas'])
hd = tuple(v* DENSITY for v in size)
keys_path = ROOT/'production-art-v1/GACNST/keys-raw.png'
sheet = Image.open(keys_path).convert('RGBA')
keys = [sheet.crop(b) for b in ((0,0,715,640),(900,0,1280,640),(0,640,635,1280))]
normal = normal_for(ROOT/'review-v1/GACNST-candidate-2x.png')
damaged,_ = register(keys[0],size,resting(row,True).getbbox())
if theater == 'SNOW':
    normal = normal_for(ROOT/'review-v1/GACNST-SNOW-candidate-2x.png')
    damaged,_ = register(Image.open(ROOT/'production-art-v1/GACNST/snow-damage-raw.png').convert('RGBA'),size,resting(row,True).getbbox())
early,_ = register(keys[1],size,decode(row,build,0).getbbox())
mid,_ = register(keys[2],size,decode(row,build,14).getbbox())
open_path = ROOT/'production-art-v1/GACNST/production-open-raw.png'
empty_path = ROOT/'production-art-v1/GACNST/empty-bay-raw.png'
opened,_ = register(Image.open(open_path).convert('RGBA'),size,resting(row).getbbox())
empty,_ = register(Image.open(empty_path).convert('RGBA'),size,resting(row).getbbox())
patch_points = [(115,149),(140,134),(173,138),(174,216),(87,216),(87,178)]
empty_patch = polygon(empty,patch_points)
claw_points = [(120,159),(126,159),(131,168),(130,179),(122,176),(117,180),(117,168)]
claw_open = polygon(normal,claw_points)
claw_closed = polygon(opened,claw_points)
cable = rectangle(normal,(122,147,125,162))
cart = polygon(opened,[(101,180),(110,174),(126,169),(144,177),(146,185),(131,196),(112,199),(100,190)])
cart_pixels = np.array(cart)
rgb = cart_pixels[...,:3].astype(float)
# Remove only the separately animated yellow hook from the loaded cart part.
yellow = (rgb[...,0] > 150)&(rgb[...,1] > 80)&(rgb[...,2] < rgb[...,1]*.55)
cart_pixels[yellow,3] = 0
cart = Image.fromarray(cart_pixels)
empty_cart = polygon(cart,[(100,189),(117,181),(145,183),(145,187),(129,197),(111,199)])
door_quad = [(141,139),(168,152),(169,177),(141,164)]
shutter = polygon(normal,door_quad)
ground,_ = ground_planes(normal)
frames = {(body['source']['member'],n): normal if n == 0 else damaged for n in range(3)}
cart_progress = [None,None,None,0,.15,.3,.5,.7,.85,1,1,1,1,1,1,.85,.55,.2,None,None]
door_open = [0,.25,.65,1,1,1,1,1,1,1,1,1,1,1,1,1,.75,.35,0,0]
claw_lift = [0,5,10,14,14,14,12,8,4,0,0,2,5,9,12,12,8,4,0,0]
for n in range(production['visibleFrames']):
    phase = n%20
    damage = n >= 20
    image = (damaged if damage else normal).copy()
    if phase not in (0,19):
        image.alpha_composite(empty_patch)
        if door_open[phase] < 1:
            panel = translate(shutter,dy=-door_open[phase]*25)
            image.alpha_composite(polygon(panel,door_quad))
        progress = cart_progress[phase]
        if progress is not None:
            load = cart if phase < 14 else empty_cart
            image.alpha_composite(translate(load,dx=(1-progress)*24,dy=-(1-progress)*13))
        image.alpha_composite(translate(cable,dy=-claw_lift[phase]))
        image.alpha_composite(translate(claw_closed if 9 <= phase <= 13 else claw_open,dy=-claw_lift[phase]))
    frames[production['source']['member'],n] = add_native_snow(row,production,n,image,normal)
for n in range(active['visibleFrames']):
    if n >= 6:
        image = Image.new('RGBA',hd)
    else:
        master = normal if n < 3 else damaged
        image = clip(master,native_mask(active,n,hd,expand=1))
        for x,y,w,h in [(120,109,24,15),(143,96,28,18)]:
            rotor = master.crop((x* DENSITY,y* DENSITY,(x+w)* DENSITY,(y+h)* DENSITY)).resize((40*DENSITY,40*DENSITY),Image.Resampling.BICUBIC)
            rotor = rotor.rotate(n%3*16,Image.Resampling.BICUBIC).resize((w* DENSITY,h* DENSITY),Image.Resampling.LANCZOS)
            layer = Image.new('RGBA',hd)
            layer.alpha_composite(rotor,(x* DENSITY,y* DENSITY))
            image.alpha_composite(clip(layer,native_mask(active,n,hd,expand=0)))
    frames[active['source']['member'],n] = image

# Do not use the late key's invented second crane. Build from approved parts.
foundation_path = ROOT/'production-art-v1/GACNST/foundation-raw.png'
pad,_ = register(Image.open(foundation_path).convert('RGBA'),size,(37,134,249,222))
rear_wall = polygon(normal,[(96,88),(137,71),(148,93),(146,131),(111,142),(96,120)])
rear_pixels = np.array(rear_wall)
yy,xx = np.indices(rear_pixels.shape[:2])
rear_pixels[(xx < 204)&(yy > 208),3] = 0
rear_wall = Image.fromarray(rear_pixels)
workshop = polygon(normal,[(137,115),(178,95),(212,94),(230,113),(231,163),
                            (211,185),(180,184),(169,174),(140,163)])
mast = polygon(normal,[(71,107),(93,106),(102,119),(98,156),(88,168),(68,161),(66,137)])
jib = polygon(normal,[(87,127),(97,129),(127,143),(124,151),(87,137)])
flat_shop = rectangle(mid,(142,146,218,190))
for n in range(build['visibleFrames']):
    if n < 5:
        image = early.copy()
        if n:
            # MCV deployment is a local module; the eventual foundation is fixed.
            source = [(106,110),(174,110),(174,173),(106,173)]
            lean = [0,8,12,15,15][n]
            target = [(106-lean,110),(174-lean,110),(174,173),(106,173)]
            image = project_part(early,source,target)
    else:
        image = clip(pad,native_mask(build,n,hd,expand=2))
        image.alpha_composite(flat_shop)
        if n >= 6:
            image.alpha_composite(clip(translate(rear_wall,dy=max(0,19-n)*3),ground))
        if n >= 8:
            mast_ground,_ = ground_planes(mast)
            image.alpha_composite(clip(translate(mast,dy=max(0,15-n)*7),mast_ground))
        if n >= 16:
            # The workshop shell hinges up from its own sill.
            source = [(140,94),(232,94),(232,185),(140,185)]
            amount = min(1,(n-15)/5)
            target = [(140,185-91*amount),(232,185-91*amount),(232,185),(140,185)]
            image.alpha_composite(project_part(workshop,source,target))
        if n >= 19:
            q = [(87,125),(129,142),(126,151),(87,137)]
            amount = min(1,(n-18)/6)
            target = [(87,125),(87+42*amount,125+17*amount),
                      (87+39*amount,137+14*amount),(87,137)]
            image.alpha_composite(project_part(jib,q,target))
        if n >= 24:
            image.alpha_composite(translate(cable,dy=-(27-n)*4))
            image.alpha_composite(translate(claw_open,dy=-(27-n)*4))
    image = clip(image,native_mask(build,n,hd,expand=2))
    if n >= 27:
        image = normal.copy()
    frames[build['source']['member'],n] = add_native_snow(row,build,n,image,normal)
out = ROOT/'full-exports-v2'/('GACNST' if theater == 'TEMPERATE' else 'GACNST-SNOW')
export_frames(row,frames,out,{'authoredKeysSha256':sha(keys_path),'openBaySha256':sha(open_path),
    'emptyBaySha256':sha(empty_path),'foundationSha256':sha(foundation_path),
    'mechanism':'Fixed jib; vertical claw; shutter and separate cart; local MCV/workshop assembly',
    'unusedLateKey':'Excluded invented second jib','wholeBuildingScale':[1,1]})
print(theater,len(frames),'Construction Yard slots; visual QA pending')
