"""Compose the four approved building directions; retain raw art and native metadata.

Retail pixels supply coverage, motion and owner-region guides only. Every visible
RGB sample comes from a recorded authored master. Run one family at a time.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path('.artifacts/m1-6b')
ID = sys.argv[1]
REVISION = sys.argv[2] if len(sys.argv) > 2 else 'full-exports-v1'
OUT = ROOT / REVISION / ID
OUT.mkdir(parents=True, exist_ok=False)
D = 4
CHECKLIST = json.loads((ROOT / 'production-checklist-v1.json').read_text())['families'][ID]
SOURCES = {m['member']: json.loads((ROOT / 'source-v1' / ID / (m['member'] + '.json')).read_text()) for m in CHECKLIST}
REG = json.loads((ROOT / 'exports-v3/report.json').read_text())['families'][ID]
SIZE = tuple(n * D for n in next(iter(SOURCES.values()))['canvas'])
REGISTRATIONS = {}
COMPOSITIONS = {}
FRAMES = {}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def area(image, size):
    """Linear-light premultiplied area filtering, including RGB at alpha edges."""
    if image.size == size:
        return image.copy()
    a = np.asarray(image).astype(np.float32) / 255
    rgb = np.where(a[..., :3] <= .04045, a[..., :3] / 12.92, ((a[..., :3] + .055) / 1.055) ** 2.4)
    prem = np.dstack([rgb * a[..., 3:4], a[..., 3]])
    p = np.stack([np.asarray(Image.fromarray(prem[..., k]).resize(size, Image.Resampling.BOX)) for k in range(4)], axis=2)
    lin = np.divide(p[..., :3], p[..., 3:4], out=np.zeros_like(p[..., :3]), where=p[..., 3:4] > 0)
    p[..., :3] = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.maximum(lin, 0) ** (1 / 2.4) - .055)
    return Image.fromarray(np.uint8(np.clip(np.rint(p * 255), 0, 255)))


def register(path, reference=None, floor=False):
    image = Image.open(path).convert('RGBA')
    box = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if reference is not None:
        scale = min(reference['width'] / (box[2] - box[0]), reference['height'] / (box[3] - box[1]))
        tx = reference['x'] + (reference['width'] - (box[2] - box[0]) * scale) / 2
        ty = reference['y'] + reference['height'] - (box[3] - box[1]) * scale
    elif floor:
        # Match the common footprint width and bottom, never the changed height.
        native = REG['nativeBounds']
        scale = (native[2] - native[0]) / (box[2] - box[0])
        tx = native[0]
        ty = native[3] - (box[3] - box[1]) * scale
    else:
        box = REG['sourceCrop']
        scale = REG['uniformScale']
        tx, ty = REG['translation']
    assert scale * D <= 1, (str(path), 'insufficient source sampling')
    sample = area(image.crop(box), (round((box[2] - box[0]) * scale * D), round((box[3] - box[1]) * scale * D)))
    result = Image.new('RGBA', SIZE)
    result.paste(sample, (round(tx * D), round(ty * D)))
    REGISTRATIONS[str(path)] = dict(sha256=sha(path), crop=box, scale=scale, translation=[tx, ty], sourceDensity=1 / scale)
    return result


def polygon(points, blur=.3):
    mask = Image.new('L', SIZE)
    ImageDraw.Draw(mask).polygon([(round(x * D), round(y * D)) for x, y in points], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur * D)) if blur else mask


def region(box):
    x, y, r, b = box
    return polygon([(x, y), (r, y), (r, b), (x, b)])


def raw_polygon(points):
    box = REG['sourceCrop']; scale = REG['uniformScale']; tx, ty = REG['translation']
    return polygon([(tx+(x-box[0])*scale, ty+(y-box[1])*scale) for x,y in points])


def cut(image, mask):
    out = image.copy()
    out.putalpha(Image.fromarray(np.uint8(np.asarray(image.getchannel('A'), dtype=float) * np.asarray(mask) / 255)))
    return out


def guide(member, frame, dilate=1, remap=False):
    f = SOURCES[member]['frames'][frame]
    if not f['width'] or not f['height']:
        return Image.new('L', SIZE)
    indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
    values = (indices >= 16) & (indices <= 31) if remap else indices > 0
    out = Image.new('L', tuple(n // D for n in SIZE))
    out.paste(Image.fromarray(np.uint8(values) * 255), (f['x'], f['y']))
    if dilate:
        out = out.filter(ImageFilter.MaxFilter(2 * max(1, round(dilate)) + 1))
    out = out.resize(SIZE, Image.Resampling.NEAREST)
    return out if remap else out.filter(ImageFilter.GaussianBlur(.3 * D))


def move(image, dx, dy):
    out = Image.new('RGBA', SIZE)
    out.alpha_composite(image, (round(dx * D), round(dy * D)))
    return out


def add(member, n, image, operation, **details):
    FRAMES[member, n] = image
    COMPOSITIONS[member, n] = dict(member=member, nativeFrame=n, operation=operation, **details)


def activity(master, member, n, count):
    raw = SOURCES[member]; palette = np.array(raw['palette'], dtype=float)
    levels = []
    for f in raw['frames'][:count]:
        p = np.array(f['pixels'], dtype=np.uint8)
        levels.append(float(palette[p[p > 0]].mean()) if np.any(p > 0) else 0)
    low, high = min(levels), max(levels)
    pulse = .35 + .65 * (levels[n]-low)/(high-low) if high > low else 1
    image = cut(master,guide(member,n,.5));a=np.asarray(image).copy()
    a[...,:3]=np.rint(a[...,:3]*pulse)
    add(member,n,Image.fromarray(a),'Authored local activity; native phase coverage and measured luminance timing',pulse=pulse)


normal = register(ROOT / 'art-v1' / ID / 'normal-raw.png')
build_member = next(m['member'] for m in CHECKLIST if 'BUILDUP' in m['roles'])
build = SOURCES[build_member]['frames'][:len(next(m['authorFrames'] for m in CHECKLIST if m['member'] == build_member))]
body_member = next(m['member'] for m in CHECKLIST if 'body' in m['roles'])
damage_path = ROOT / ('art-v1' if ID == 'NAHAND' else 'full-art-v1') / ID / 'damaged-raw.png'
if ID != 'NACNST':
    damaged = register(damage_path)
    foundation = register(ROOT / 'full-art-v1' / ID / 'foundation-raw.png', floor=True)
mid = register(ROOT / 'full-art-v1' / ID / 'construction-raw.png', floor=True)

if ID == 'NAHAND':
    body, damage_body = normal, damaged
    statue_mask = polygon([(100,0),(150,0),(150,117),(121,124),(101,111)])
    statue = cut(normal, statue_mask)
    mid_base = cut(mid, Image.fromarray(255 - np.asarray(region((101, 0, 150, 115)))))
    for i, f in enumerate(build):
        result = foundation.copy()
        if i >= 4:
            result.alpha_composite(cut(mid_base, guide(build_member, i, 1)))
        if i >= 7:
            # Native statue rises vertically through the unfinished pedestal.
            delta = max(0, f['y'] - build[-1]['y'])
            translated = cut(move(statue, 0, delta), region((95, 0, 156, 128)))
            result.alpha_composite(translated)
            result.alpha_composite(cut(mid_base, region((0, 125, 254, 230))))
        if i >= 16:
            # Install the top plate first, then lower the existing front panels.
            base = cut(normal, Image.fromarray(255 - np.asarray(statue_mask)))
            if i < 22:
                base = cut(base, region((0, 112, 254, 133 + (i-16)*5)))
            if i < 24:
                base = cut(base, guide(build_member, i, .6))
            result.alpha_composite(base)
        if i < 7:
            result = cut(result, guide(build_member, i, .5))
        if i == len(build) - 1:
            result = normal.copy()
        add(build_member, i, result, 'Authored foundation, rigid rising statue and source-guided panel installation', statueTranslation=max(0, f['y'] - build[-1]['y']) if 7 <= i < 18 else 0)

elif ID == 'NAREFN':
    # One matched empty-state master owns the belt and basin in every ore phase.
    # The construction intermediate has a longer belt and must never enter idle art.
    empty_master = register(ROOT / 'feedback-r2/refinery-art/empty-raw.png')
    molten = raw_polygon([(678,550),(756,550),(865,742),(964,747),(1060,789),
                          (1087,895),(1043,954),(783,973),(687,921),(676,829),(765,769)])
    empty = Image.composite(empty_master, normal, molten)
    damage_empty = Image.composite(empty_master, damaged, molten)
    # Preserve only authored hot material from the filled master, not a second
    # copy of its conveyor rails. Structural pixels always use the empty master.
    authored = np.asarray(normal)
    hot_art = ((authored[...,0].astype(float) > authored[...,2] * 1.8)
               & (authored[...,1].astype(float) > authored[...,2] * 1.5)
               & (authored[...,0] > 160) & (authored[...,1] > 70))
    hot_mask = Image.fromarray(np.uint8(hot_art) * 255)
    hot_mask = Image.fromarray(np.minimum(np.asarray(hot_mask), np.asarray(molten)))
    bib_mask = guide('ngrefnbb.shp', 0, 1)
    body = cut(empty, Image.fromarray(255 - np.asarray(bib_mask)))
    damage_body = cut(damage_empty, Image.fromarray(255 - np.asarray(bib_mask)))
    for n in range(3):
        add('ngrefnbb.shp', n, cut(damaged if n else normal, bib_mask), 'Authored docking apron on the original flat bib plane')
    for level in range(1, 5):
        member = f'ngrefnl{level}.shp'
        for n in range(6):
            master = damaged if n >= 3 else normal
            base = damage_empty if n >= 3 else empty
            # Native molten coverage distinguishes storage level and phase.
            # RGB is sampled from the authored molten master, never the palette.
            f = SOURCES[member]['frames'][n]
            p = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
            pal = np.array(SOURCES[member]['palette'])
            colors = pal[p].astype(float)
            hot = (colors[...,0] > colors[...,2] * 1.7) & (colors[...,1] > colors[...,2] * 1.5) & (p > 31)
            mask = Image.new('L', SIZE)
            mask.paste(Image.fromarray(np.uint8(hot)*255).resize((f['width']*D,f['height']*D),Image.Resampling.NEAREST),(f['x']*D,f['y']*D))
            mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(.4*D))
            mask = Image.fromarray(np.minimum(np.asarray(mask), np.asarray(hot_mask)))
            layer = Image.composite(master, base, mask)
            add(member, n, cut(layer, guide(member,n,1.5)), 'Authored empty conveyor/crucible with native storage-level and flow coverage', oreLevel=level, phase=n%3, damaged=n>=3)
    ore_path = ROOT / 'art-v1/NAREFN/unload-raw.png'
    for n in range(20):
        f = SOURCES['ngrefnor.shp']['frames'][n]
        ore = register(ore_path, f)
        add('ngrefnor.shp', n, cut(ore, guide('ngrefnor.shp',n,.6)), 'Authored ore cutout registered to native discharge bounds and coverage')
    rear_mask = raw_polygon([(699,0),(1062,0),(1080,750),(818,793),(773,581),(655,485)])
    rear = cut(normal,rear_mask)
    chimney = cut(rear,raw_polygon([(735,40),(884,40),(884,380),(735,380)]))
    mid_without_rear = cut(mid,Image.fromarray(255-np.asarray(rear_mask)))
    front_mask = raw_polygon([(142,245),(504,235),(617,601),(659,947),(243,993),(129,749)])
    front = cut(empty,front_mask)
    front_chimney = cut(front,raw_polygon([(355,235),(500,235),(500,565),(355,565)]))
    for i, f in enumerate(build):
        result = foundation.copy()
        if i >= 1:
            delta = max(0, f['y'] - build[13]['y'])
            component = chimney if i < 6 else rear
            result.alpha_composite(cut(move(component,0,delta),region((100,0,173,146))))
        if i >= 5:
            result.alpha_composite(cut(mid_without_rear,region((0,95,210,184))))
        if i >= 14:
            # The front cone and its pipes are installed in the native order.
            delta = max(0, (20-i)*4)
            component = front_chimney if i < 16 else front
            result.alpha_composite(cut(move(component,0,delta),region((20,0,118,163))))
        if i >= 23:
            result = empty.copy()
        if i < 5:
            ground = cut(foundation,guide(build_member,i,.6))
            if i:
                ground.alpha_composite(cut(move(chimney,0,max(0,f['y']-build[13]['y'])),region((100,0,173,146))))
            result=ground
        add(build_member,i,result,'Authored ground, translated rear stack, unfinished core, then installed front furnace and pipes')

elif ID == 'NAWEAP':
    body, damage_body = normal, damaged
    opened = register(ROOT / 'exports-v3/NAWEAP/open-registered-master.png')
    for n in range(3):
        add('ngweapbb.shp',n,cut(damaged if n else normal,guide('ngweapbb.shp',n,1)),'Authored ramp on native flat bib plane')
    # Each native deployment member keeps its original independent depth plane.
    # The open master supplies the door opening; the intermediate supplies the
    # authored roofless interior. Source masks partition actual native parts.
    for member in ['ngweap_1.shp','ngweap_2.shp','ngweap_3.shp','ngweap_4.shp']:
        for n in range(2):
            if member in ['ngweap_1.shp','ngweap_2.shp']:
                master = opened if n == 0 else Image.composite(opened,damaged,region((170,120,282,224)))
            elif member == 'ngweap_4.shp':
                master = Image.composite(mid,damaged if n else normal,polygon([(115,82),(207,123),(226,150),(170,153),(111,111)]))
            else:
                master = damaged if n else normal
            add(member,n,cut(master,guide(member,n,1.4)),'Authored door/roof component cropped to native independent deployment plane')
    for n in range(13):
        activity(normal,'ngweap_a.shp',n,13)
    for i, f in enumerate(build):
        result = foundation.copy()
        if i >= 2:
            result.alpha_composite(cut(mid,guide(build_member,i,.6)))
        if i >= 14:
            # Fixed wall machinery appears before roof/dome installation.
            roof = raw_polygon([(523,385),(991,614),(983,759),(482,514)])
            lower = Image.fromarray(255-np.asarray(roof))
            lower = Image.fromarray(np.minimum(np.asarray(lower),np.asarray(region((0,104,282,224)))))
            result.alpha_composite(cut(cut(normal,lower),guide(build_member,i,.6)))
        if i >= 20:
            installed = normal if i >= 22 else cut(normal,Image.fromarray(255-np.asarray(raw_polygon([(523,385),(991,614),(983,759),(482,514)]))))
            result.alpha_composite(cut(installed,guide(build_member,i,.5)))
        if i == len(build)-1:
            result = normal.copy()
        if i < 20:
            result = cut(result,guide(build_member,i,.7))
        add(build_member,i,result,'Authored foundation, incomplete columns/walls, installed machinery and final roof/dome')

else:
    assert ID == 'NACNST'
    plate = register(ROOT / 'crane-motion-v1/stationary-plate.png')
    damage_plate = register(ROOT / 'full-art-v1/NACNST/damaged-plate-raw.png')
    doors = Image.new('RGBA',SIZE)
    for name in ['right-door','left-door']:
        doors.alpha_composite(register(ROOT/'crane-motion-v1'/f'part-{name}.png'))
    body = plate.copy(); body.alpha_composite(doors)
    damage_body = damage_plate.copy(); damage_body.alpha_composite(doors)
    idle = Image.new('RGBA',SIZE)
    for name in ['boom','hydraulic','hinge','forearm','left-jaw','right-jaw']:
        idle.alpha_composite(register(ROOT/'crane-motion-v1'/f'part-{name}.png'))
    for n in range(3):
        add('ngcnst_c.shp',n,idle,'Accepted authored articulated crane at native idle pose')
    for n in range(42):
        phase = min(n,20) if n < 22 else min(n-22,20)
        motion = register(ROOT/'crane-motion-v1/frames'/f'{phase:02}.png')
        if n >= 22:
            # Static plate damage replaces architecture only. The accepted
            # moving crane/doors/workpiece remain exactly the same cutouts.
            a,b = np.asarray(motion),np.asarray(plate)
            moving = np.max(np.abs(a.astype(int)-b.astype(int)),axis=2)>2
            mask = Image.fromarray(np.uint8(moving)*255)
            motion = Image.composite(motion,damage_plate,mask)
        add('ngcnst_b.shp',n,motion,'Accepted 21-pose authored rig; native normal/damaged sequence indices',normalPhase=phase,damaged=n>=22)
    # The native two-pixel finial beacon lies above the approved master's tip.
    # Reuse a high-resolution gold-tip cutout at that exact native attachment;
    # sampling the whole building there would silently export a blank activity.
    tip = Image.open(ROOT/'art-v1/NACNST/normal-raw.png').convert('RGBA').crop((681,55,701,79))
    beacon = Image.new('RGBA',SIZE)
    beacon.alpha_composite(area(tip,(7,8)),(141*D,46*D))
    for n in range(22):
        activity(beacon,'ngcnst_a.shp',n,22)
    folded = register(ROOT/'full-art-v1/NACNST/folded-raw.png',build[0])
    for i,f in enumerate(build):
        if i < 7:
            # The initial folded building assembly stays rigid as the native
            # platform unfolds around it. This does not override the MCV unit.
            result = cut(mid,guide(build_member,i,.6))
            result.alpha_composite(folded)
            result = cut(result,guide(build_member,i,1))
        elif i < 16:
            result = cut(mid,guide(build_member,i,1))
        else:
            result = mid.copy()
            result.alpha_composite(cut(normal,guide(build_member,i,.6)))
            result = cut(result,guide(build_member,i,1))
        if i == len(build)-1:
            result = body.copy();result.alpha_composite(idle)
        add(build_member,i,result,'Authored folded assembly, expanding platform, intermediate walls and installed tower/crane')

for n in range(3):
    add(body_member,n,body if n == 0 else damage_body,'Approved normal or authored structural damage master; unchanged native health slots')

exports=[]
for checklist in CHECKLIST:
    member=checklist['member'];raw=SOURCES[member]
    for n in checklist['authorFrames']:
        f=raw['frames'][n];master=FRAMES[member,n]
        crop=master.crop((f['x']*D,f['y']*D,(f['x']+f['width'])*D,(f['y']+f['height'])*D))
        support=guide(member,n,4,remap=True).crop((f['x']*D,f['y']*D,(f['x']+f['width'])*D,(f['y']+f['height'])*D))
        entry=dict(member=member,nativeFrame=n,exports=[])
        for density in (2,4):
            size=((f['width']+f['width']%2)*density,(f['height']+f['height']%2)*density)
            storage_size=tuple(max(1,n) for n in size)
            image=Image.new('RGBA',storage_size)
            if not f['empty']:
                image.paste(area(crop,(f['width']*density,f['height']*density)),(0,0))
            a=np.asarray(image);rgb=a[...,:3].astype(float)
            allowed=np.zeros(storage_size[::-1],bool)
            if f['width'] and f['height']:
                allowed[:f['height']*density,:f['width']*density]=np.asarray(support.resize((f['width']*density,f['height']*density),Image.Resampling.NEAREST))>0
            red=allowed&(rgb[...,0]>rgb[...,1]*1.5)&(rgb[...,0]>rgb[...,2]*1.5)&(a[...,3]>0)
            shades=np.abs(rgb[...,0,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2)
            data=np.zeros_like(a);data[...,3]=255;data[...,0][red]=255;data[...,1][red]=shades[red]
            stem=f'{member[:-4]}-{n:02}-{density}x'
            image.save(OUT/f'{stem}.png');Image.fromarray(data).save(OUT/f'{stem}-data.png')
            entry['exports'].append(dict(density=density,base=f'{stem}.png',data=f'{stem}-data.png',remapPixels=int(red.sum()),shades=np.unique(shades[red]).tolist(),visiblePixels=int((a[...,3]>0).sum())))
        exports.append(entry)
    seq=[]
    for n in checklist['authorFrames']:
        f=raw['frames'][n];canvas=Image.new('RGBA',SIZE,'#34483d')
        canvas.alpha_composite(Image.open(OUT/f'{member[:-4]}-{n:02}-4x.png'),(f['x']*D,f['y']*D))
        seq.append(canvas.convert('RGB').resize(tuple(raw['canvas']),Image.Resampling.LANCZOS))
    sheet=Image.new('RGB',(raw['canvas'][0]*5,math.ceil(len(seq)/5)*(raw['canvas'][1]+28)),'#34483d');draw=ImageDraw.Draw(sheet)
    for n,im in enumerate(seq):
        x=n%5*im.width;y=n//5*(im.height+28);sheet.paste(im,(x,y+28));draw.text((x+4,y+2),str(n),fill='white',font_size=20)
    sheet.save(OUT/f'{member}-contact.png')
    if len(seq)>3:
        duration=round(600/len(build)) if member==build_member else 50
        seq[0].save(OUT/f'{member}-sequence.webp',save_all=True,append_images=seq[1:],duration=duration,loop=0,lossless=True)
report=dict(status='COMPLETE_EXPORT_CANDIDATE_VISUAL_QA_PENDING',family=ID,revision=REVISION,frames=exports,
            registrations=REGISTRATIONS,composition=list(COMPOSITIONS.values()),
            approvalScope='Approved representatives; full sequences and gameplay still require final review',
            sampling='4x composition from authored sources >=4x; linear-light premultiplied area downsampling',
            sourceUse='Indexed alpha, owner-region and native motion guides only; no retail RGB in authored output',
            retainedOriginal= {m['member']:m['retainedTail'] for m in CHECKLIST})
(OUT/'candidate-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(family=ID,frames=len(exports),exports=len(exports)*2,status=report['status'])))
