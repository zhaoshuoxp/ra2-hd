"""Compose NAPOWR frames from authored masters, retaining all raw generations."""
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path('.artifacts/m1-6a')
OUT = ROOT / 'full-exports-v2'
OUT.mkdir(exist_ok=False)
D = 8
SIZE = (210 * D, 140 * D)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sources = {m: json.loads((ROOT / 'source-v1' / f'{m}.json').read_text()) for m in ('ngpowr.shp', 'ngpowr_a.shp', 'ntpowrmk.shp')}

def resize(im, size):
    """Premultiplied linear-light area sampling; sources are never enlarged."""
    a = np.asarray(im).astype(np.float32) / 255
    rgb = np.where(a[..., :3] <= .04045, a[..., :3] / 12.92, ((a[..., :3] + .055) / 1.055) ** 2.4)
    prem = np.dstack([rgb * a[..., 3:4], a[..., 3]])
    p = np.stack([np.asarray(Image.fromarray(prem[..., k]).resize(size, Image.Resampling.BOX)) for k in range(4)], axis=2)
    lin = np.divide(p[..., :3], p[..., 3:4], out=np.zeros_like(p[..., :3]), where=p[..., 3:4] > 0)
    p[..., :3] = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.maximum(lin, 0) ** (1 / 2.4) - .055)
    return Image.fromarray(np.uint8(np.clip(np.rint(p * 255), 0, 255)))

registrations = {}
def register(path, f, fixed=False):
    im = Image.open(path).convert('RGBA')
    bbox = (0, 0, *im.size) if fixed else im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    crop = im.crop(bbox)
    scale = min(f['width'] / crop.width, f['height'] / crop.height)
    assert scale * D <= 1, 'undersized authored master'
    size = (round(crop.width * scale * D), round(crop.height * scale * D))
    offset = (round((f['x'] + f['width'] / 2) * D - size[0] / 2), (f['y'] + f['height']) * D - size[1])
    out = Image.new('RGBA', SIZE); out.paste(resize(crop, size), offset)
    registrations[str(path)] = dict(sha256=sha(path), crop=bbox, scale=scale, offset=offset, sourceDensity=1 / scale)
    return out

def polygon(points, blur=0):
    m = Image.new('L', SIZE); ImageDraw.Draw(m).polygon([(round(x * D), round(y * D)) for x, y in points], fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur * D)) if blur else m

def part(im, mask):
    out = im.copy(); out.putalpha(Image.fromarray((np.asarray(im.getchannel('A')).astype(float) * np.asarray(mask) / 255).astype('uint8')))
    return out

def patch(base, edited, mask):
    # RGB-only local edits preserve the master's coverage and all unmapped edges.
    a = np.asarray(base).copy(); b = np.asarray(edited); m = np.asarray(mask)[..., None] / 255
    a[..., :3] = np.rint(a[..., :3] * (1 - m) + b[..., :3] * m)
    return Image.fromarray(a)

normal = register(ROOT / 'art-v1/normal-raw.png', sources['ngpowr.shp']['frames'][0], True)
damaged = register(ROOT / 'art-v1/damaged-raw.png', sources['ngpowr.shp']['frames'][1])
active = register(ROOT / 'exports-v1/active-registered-master.png', sources['ngpowr.shp']['frames'][0], True)
body_edit = register(ROOT / 'full-art-v1/body-raw.png', sources['ngpowr.shp']['frames'][0], True)
# Only the lower reactor chamber's electric arcs are removed from the body.
chamber = polygon([(100,91),(135,90),(137,105),(124,117),(103,111),(98,105)], .5)
body = patch(normal, body_edit, chamber)
damage_body = patch(damaged, body_edit, chamber)
effect = polygon([(112,60),(128,59),(137,64),(140,76),(136,80),(135,94),(132,101),(127,105),(118,112),(107,113),(100,109),(100,103),(104,96),(109,91),(108,84),(110,69)], .45)
# Scope is authored electricity/sphere only; every architecture pixel outside it is invariant.
frames = {('ngpowr.shp', 0): body, ('ngpowr.shp', 1): damage_body, ('ngpowr.shp', 2): damage_body.copy()}
provenance = []
for i in range(38):
    damage = i >= 19; phase = i % 19
    master = damaged if damage else normal
    # Two authored local discharge patterns, a dark inter-pulse interval, and
    # per-phase intensity preserve native sequence length without moving walls.
    weight = (1 - math.cos(2 * math.pi * phase / 18)) / 2
    local = Image.blend(normal, active, weight)
    pulse = .72 + .28 * math.cos(4 * math.pi * phase / 18) ** 2
    local = Image.blend(body_edit, local, pulse)
    frames[('ngpowr_a.shp', i)] = patch(master, local, effect)
    provenance.append(dict(member='ngpowr_a.shp', frame=i, master='damaged' if damage else 'normal', phase=phase, localPatternWeight=weight, dischargeStrength=pulse))

build_frames = sources['ntpowrmk.shp']['frames']
construction = register(ROOT / 'art-v1/buildup-raw.png', build_frames[12])
foundation = register(ROOT / 'full-art-v1/build-0-raw.png', build_frames[0])
# Caps and brick walls descend together behind the unchanged plinth/ramp mask.
# Cropping removes brick courses instead of scaling the building vertically.
left = polygon([(83,44),(112,44),(112,94),(99,102),(83,93)])
right = polygon([(134,72),(164,72),(164,121),(147,131),(134,117)])
for i in range(14):
    if i == 0:
        result = foundation.copy()
    else:
        result = construction.copy()
        delta = max(0, build_frames[i]['y'] - build_frames[12]['y']) * D
        for mask in (left, right):
            a = np.asarray(result).copy(); a[..., 3][np.asarray(mask) > 0] = 0; result = Image.fromarray(a)
            moved = Image.new('RGBA', SIZE); moved.alpha_composite(part(construction, mask), (0, delta))
            result.alpha_composite(part(moved, mask))
        # Reveal the plinth at the early source stages, preserving native trim.
        if i < 5:
            f = build_frames[i]
            window = polygon([(f['x'], f['y']), (f['x']+f['width'], f['y']), (f['x']+f['width'], f['y']+f['height']), (f['x'], f['y']+f['height'])])
            result = part(result, window)
            indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
            guide = Image.fromarray(np.uint8(indices > 0) * 255).resize((f['width']*D, f['height']*D), Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(.4*D))
            coverage = Image.new('L', SIZE); coverage.paste(guide, (f['x']*D, f['y']*D))
            result = part(result, coverage)
    frames[('ntpowrmk.shp', i)] = result
    provenance.append(dict(member='ntpowrmk.shp', frame=i, operation='authored foundation' if i == 0 else 'fixed plinth; translated and cropped authored brick pylons', verticalTranslation=max(0,build_frames[i]['y']-build_frames[12]['y'])))
# Later construction installs native machinery followed by the growing energy
# sphere. Reuse full authored components; scaling is uniform for the sphere.
sphere_mask = polygon([(111,61),(126,59),(135,64),(139,73),(137,87),(134,96),(126,99),(118,96),(111,91),(107,81),(107,71)], .3)
sphere = part(body, sphere_mask)
for i in range(14, 26):
    if i == 25:
        result = body.copy()
    else:
        # Per-component installation masks prevent static architecture flicker.
        result = construction.copy()
        machinery = polygon([(62,42),(112,42),(112,112),(98,119),(62,103)])
        if i >= 16:
            machinery = Image.fromarray(np.maximum(np.asarray(machinery), np.asarray(polygon([(132,73),(178,73),(178,136),(125,136)]))))
        machinery = Image.fromarray(np.minimum(np.asarray(machinery), 255 - np.asarray(sphere_mask.filter(ImageFilter.MaxFilter(17)))))
        installed = part(body, machinery)
        reveal = polygon([(0,0),(210,0),(210, min(140,65+(i-14)*14)),(0,min(140,65+(i-14)*14))])
        result.alpha_composite(part(installed, reveal))
        if i >= 18:
            box = sphere.getbbox(); component = sphere.crop(box); scale = (i-17)/8
            small = resize(component, (max(1, round(component.width*scale)), max(1,round(component.height*scale))))
            center = ((box[0]+box[2])//2,(box[1]+box[3])//2)
            result.alpha_composite(small,(center[0]-small.width//2,center[1]-small.height//2))
    frames[('ntpowrmk.shp', i)] = result
    provenance.append(dict(member='ntpowrmk.shp', frame=i, operation='authored machinery installation and uniformly growing authored sphere', sphereScale=max(0,(i-17)/8)))

exports = []
for member, count in [('ngpowr.shp',3),('ngpowr_a.shp',38),('ntpowrmk.shp',26)]:
    for i in range(count):
        f = sources[member]['frames'][i]; master = frames[(member,i)]
        crop = master.crop((f['x']*D,f['y']*D,(f['x']+f['width'])*D,(f['y']+f['height'])*D))
        indices = np.array(f['pixels'],dtype=np.uint8).reshape(f['height'],f['width'])
        support = Image.fromarray(np.uint8((indices>=16)&(indices<=31))*255).filter(ImageFilter.MaxFilter(9))
        entry = dict(member=member,nativeFrame=i,exports=[])
        for density in (2,4):
            size=((f['width']+f['width']%2)*density,(f['height']+f['height']%2)*density)
            image=Image.new('RGBA',size);image.paste(resize(crop,(f['width']*density,f['height']*density)),(0,0))
            pixels=np.asarray(image);rgb=pixels[...,:3].astype(float)
            allowed=np.zeros(size[::-1],dtype=bool)
            allowed[:f['height']*density,:f['width']*density]=np.asarray(support.resize((f['width']*density,f['height']*density),Image.Resampling.NEAREST))>0
            red=allowed&(rgb[...,0]>rgb[...,1]*1.5)&(rgb[...,0]>rgb[...,2]*1.5)&(pixels[...,3]>0)
            shades=np.abs(rgb[...,0,None]-np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])*4).argmin(axis=2)
            data=np.zeros_like(pixels);data[...,3]=255;data[...,0][red]=255;data[...,1][red]=shades[red]
            stem=f'{member[:-4]}-{i:02d}-{density}x'
            image.save(OUT/f'{stem}.png');Image.fromarray(data).save(OUT/f'{stem}-data.png')
            entry['exports'].append(dict(density=density,base=f'{stem}.png',data=f'{stem}-data.png',remapPixels=int(red.sum()),shades=np.unique(shades[red]).tolist()))
        exports.append(entry)
# Native-size sequences and larger structural sheets are supplementary to game captures.
for member, count, duration in [('ngpowr_a.shp',38,100),('ntpowrmk.shp',26,69)]:
    sequences=[]
    for i in range(count):
        f=sources[member]['frames'][i];im=Image.open(OUT/f'{member[:-4]}-{i:02d}-4x.png')
        canvas=Image.new('RGBA',(840,560),(51,71,60,255));canvas.alpha_composite(im,(f['x']*4,f['y']*4))
        sequences.append(canvas)
    sheet=Image.new('RGB',(1260, math.ceil(count/6)*170),(51,71,60));draw=ImageDraw.Draw(sheet)
    for i,im in enumerate(sequences):
        x=(i%6)*210;y=(i//6)*170;sheet.paste(im.resize((210,140),Image.Resampling.LANCZOS),(x,y+24));draw.text((x+6,y+3),str(i),fill='white',font_size=20)
    sheet.save(OUT/f'{member}-contact.png')
    seq=sequences[:18] if member=='ngpowr_a.shp' else sequences
    native=[im.resize((210,140),Image.Resampling.LANCZOS) for im in seq]
    native[0].save(OUT/f'{member}-native.webp',save_all=True,append_images=native[1:],duration=duration,loop=0,lossless=True)
    if member=='ntpowrmk.shp': native[-1].save(OUT/'sale-native.webp',save_all=True,append_images=native[-2::-1],duration=duration,loop=0,lossless=True)
report=dict(status='COMPLETE_AUTHORED_REVIEW_CANDIDATE',requiredAuthoredFrames=67,validatedExports=len(exports)*2,registrations=registrations,frames=exports,composition=provenance,shadowPolicy='All native shadow frames and shared effects retained',approvalScope='Representative direction accepted; final visual review pending')
(OUT/'candidate-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(frames=len(exports),exports=len(exports)*2,sourceDensityMinimum=min(r['sourceDensity'] for r in registrations.values()))))
