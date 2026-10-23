"""Repair depot: fixed platform, authored arm poses and distinct closing path."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from production_common import DENSITY, normal_for, export_output, ROOT, row_for, decode, resting, register, sheet_cells, export_frames, sha
from mechanical_common import clip, polygon, rectangle, translate, native_mask, ground_planes, add_native_snow

theater = sys.argv[1] if len(sys.argv) > 1 else 'TEMPERATE'
row = row_for('GADEPT', theater)
body, bib, idle, opening, working, closing, build = row['members']
size = tuple(body['canvas'])
hd = tuple(v* DENSITY for v in size)
keys_path = ROOT / 'production-art-v1/GADEPT/keys-raw.png'
keys = sheet_cells(Image.open(keys_path).convert('RGBA'))
normal = normal_for(ROOT / 'review-v1/GADEPT-candidate-2x.png')
damaged, _ = register(keys[0], size, resting(row, True).getbbox())
early, _ = register(keys[1], size, decode(row, build, 0).getbbox())
if theater == 'SNOW':
    snow = sheet_cells(Image.open(ROOT / 'production-art-v1/GADEPT/snow-raw.png').convert('RGBA'), 2, 1)
    normal, _ = register(snow[0], size, resting(row).getbbox())
    damaged, _ = register(snow[1], size, resting(row, True).getbbox())
empty_path = ROOT / 'production-art-v1/GADEPT/no-arm-raw.png'
fixed, _ = register(Image.open(empty_path).convert('RGBA'), size, (6, 67, 146, 145))
arm_path = ROOT / 'production-art-v1/GADEPT/arm-poses-raw.png'
poses = sheet_cells(Image.open(arm_path).convert('RGBA'), 4, 2)


def yellow_box(image, native=False):
    p = np.array(image)
    rgb = p[..., :3].astype(float)
    yellow = (rgb[..., 0] > 100) & (rgb[..., 1] > 50) & (rgb[..., 0] > rgb[..., 2]*1.8)
    yellow &= (rgb[..., 1] > rgb[..., 2]*1.3) & (p[..., 3] > 0)
    if native:
        yy, xx = np.indices(p.shape[:2])
        yellow &= (yy < 96) & (xx > 24) & (xx < 126)
    return Image.fromarray(np.uint8(yellow)*255).getbbox()


def arm(member, n, pose, damage=False):
    source = poses[pose]
    a = yellow_box(source)
    b = yellow_box(decode(row, member, n), native=True)
    if not b:
        return Image.new('RGBA', hd)
    # Local arm projection follows the native joint envelope. The fixed depot
    # and its logical frame geometry are never transformed with this part.
    sx, sy = (b[2]-b[0])/(a[2]-a[0]), (b[3]-b[1])/(a[3]-a[1])
    sampled = source.resize((max(1,round(source.width*sx* DENSITY)), max(1,round(source.height*sy* DENSITY))), Image.Resampling.LANCZOS)
    x = round((b[0]+b[2]) - (a[0]+a[2])*sx)
    y = round(b[3]* DENSITY-a[3]*sy* DENSITY)
    if damage:
        p = np.array(sampled)
        p[..., :3] = np.uint8(p[..., :3]*.7)
        sampled = Image.fromarray(p)
    result = Image.new('RGBA', hd)
    result.alpha_composite(sampled, (x,y))
    return result


frames = {}
for member in (body,bib):
    for n in range(member['visibleFrames']):
        frames[member['source']['member'],n] = clip(normal if n == 0 else damaged,
            native_mask(member,min(n,1),hd,expand=1))
for n in range(idle['visibleFrames']):
    frames[idle['source']['member'],n] = clip(normal if n == 0 else damaged, native_mask(idle,n,hd,expand=1))
open_poses = [0,0,0,1,2,2,3,3,3,3]
work_poses = [3,3,3,4,4,4,5,5,5,5,5,6,6,7,7,7,7,7,7,3]
close_poses = [3,3,3,3,4,2,4,1,0,0]
fixed_animation = polygon(fixed, [(25,94),(58,71),(95,65),(128,84),(125,94),(80,95),(28,114)])
for member, sequence in ((opening,open_poses),(working,work_poses),(closing,close_poses)):
    half = len(sequence)
    for n in range(member['visibleFrames']):
        phase = n % half
        if (member is opening and phase == 0) or (member is closing and phase == half-1):
            image = clip(normal if n < half else damaged, native_mask(idle,int(n >= half),hd,expand=1))
        else:
            image = fixed_animation.copy()
            if n >= half:
                p = np.array(image)
                p[...,:3] = np.uint8(p[...,:3]*.72)
                image = Image.fromarray(p)
            image.alpha_composite(arm(member,n,sequence[phase],n >= half))
        frames[member['source']['member'],n] = add_native_snow(row,member,n,image,normal)
ground, foot = ground_planes(normal)
platform = clip(normal,native_mask(bib,0,hd,expand=1))
pedestal = polygon(fixed,[(55,77),(79,71),(93,80),(87,98),(65,103),(54,94)])
for n in range(build['visibleFrames']):
    image = clip(platform,native_mask(build,n,hd,expand=1))
    if n == 0:
        image = early.copy()
    else:
        image.alpha_composite(clip(translate(pedestal,dy=max(0,5-n)*3),ground))
        if n >= 8:
            image.alpha_composite(clip(fixed,native_mask(build,n,hd,expand=1)))
        if n >= 7:
            pose = 2 if n < 16 else 4 if n < 18 else 1 if n < 21 else 0
            if n < 13:
                top = yellow_box(decode(row,build,n), native=True)
                ref = yellow_box(decode(row,build,13), native=True)
                motion = translate(arm(build,13,2),dy=top[1]-ref[1])
                envelope = Image.new('L',hd)
                envelope.paste(255,(0,0,hd[0],86* DENSITY))
                image.alpha_composite(clip(motion,envelope))
            else:
                image.alpha_composite(arm(build,n,pose))
        image.alpha_composite(clip(foot,native_mask(build,n,hd,expand=1)))
    if n >= 23:
        image = normal.copy()
    frames[build['source']['member'],n] = add_native_snow(row,build,n,image,normal)
out = ROOT / 'full-exports-v4' / ('GADEPT' if theater == 'TEMPERATE' else 'GADEPT-SNOW')
export_frames(row,frames,out,{'authoredKeysSha256':sha(keys_path),'armPartsSha256':sha(arm_path),
    'fixedMachinerySha256':sha(empty_path),'mechanism':'Fixed platform; eight authored local arm poses; independent close sequence',
    'wholeBuildingScale':[1,1]})
print(theater,len(frames),'Repair Depot slots; visual QA pending')
