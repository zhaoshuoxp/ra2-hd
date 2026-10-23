"""Continue the user's GI-base/Prism-rotation feedback without changing HQ/UI."""
import copy
import importlib.util
import sys
from pathlib import Path
import numpy as np
from scipy.ndimage import label, median_filter
from PIL import Image, ImageDraw, ImageFilter
from atlas import Member, read, write, sha

sys.path.insert(0, 'scripts/m1/allied-buildings')
import production_common as production
from production_common import row_for, decode, normal_for, register, sheet_cells, resting

spec = importlib.util.spec_from_file_location('prism_rotor', 'scripts/allied-corrections/prism-rotor.py')
rotor = importlib.util.module_from_spec(spec); spec.loader.exec_module(rotor)
OUT = Path('.artifacts/allied-corrections/feedback-r2')
REVISION = 'animation-r8'
GI_ONLY = '--gi-only' in sys.argv
PRISM_ONLY = '--prism-only' in sys.argv
if GI_ONLY or PRISM_ONLY: REVISION = 'animation-r9'
PREVIEW = '--preview' in sys.argv
catalog = read('desktop/allied-building-coverage.json')
units = read('desktop/allied-unit-contracts.json')


def semantic(image):
    a = np.array(image); r, g, b = (a[..., i].astype(float) for i in range(3))
    owner = (a[..., 3] > 0) & (r > g * 1.5) & (r > b * 1.5)
    owner &= ~((g > r * .25) & (g > b * 1.3))
    data = np.zeros_like(a); data[..., 3] = 255
    ramp = np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8]) * 4
    data[..., 0][owner] = 255
    data[..., 1][owner] = np.abs(r[..., None] - ramp).argmin(2)[owner]
    return Image.fromarray(data)


def ground_mask(a):
    return (a[..., 3] > 0) & (a[..., :3].max(2) < 8)


def static_mask(image, density):
    a = np.array(image); r, g, b = (a[..., i].astype(float) for i in range(3))
    yy = np.arange(image.height)[:, None]
    bags = (a[..., 3] > 128) & (r > g * 1.04) & (r < g * 1.4) & (g > b * 1.25) & (g > 45)
    bags &= yy >= 21 * density
    top = np.where(bags, yy, image.height).min(0)
    xs = np.where(top < image.height)[0]
    top = np.interp(np.arange(image.width), xs, top[xs])
    # Smoothing may expand the fixed support, but must never exclude one of
    # its measured edge pixels and let the firing pose paint over it.
    top = np.minimum(top, median_filter(top, size=density * 2 + 1))
    return yy >= top[None, :]


# Immutable input pins are the actual Desktop version the user reviewed.
if not (OUT / 'before-buildings.json').exists():
    write(OUT / 'before-buildings.json', catalog); write(OUT / 'before-units.json', units)
else:
    catalog = read(OUT / 'before-buildings.json'); units = read(OUT / 'before-units.json')
report = dict(status='RESOURCE_VISUAL_RUNTIME_REVIEW_PENDING', before='79f2af5', revision=REVISION, rows=[])
family_path = Path('.local') / units['shp']['E1']['familyPath']
family = read(family_path); member = family['members'][0]
old = Member(Path('.local/hd-packs') / member['packId'] / member['revision'])
source = read('.artifacts/allied-units/source-v2/ra2/gi.shp.json')
changed = {}; bag_hashes = []
for density in (() if PRISM_ONLY else (2, 4)):
    for facing in range(8):
        idle = 292 + facing; reference = old.frame(density, idle)
        mask = static_mask(reference, density)
        static = np.array(reference); static[..., 3][~mask | ground_mask(static)] = 0
        static_image = Image.fromarray(static)
        bag_hashes.append(dict(density=density, facing=facing, idle=idle, maskPixels=int(mask.sum())))
        for n in range(315 + facing * 6, 321 + facing * 6):
            accepted = old.frame(density, n); pixels = np.array(accepted)
            pose = pixels.copy(); pose[..., 3][mask | ground_mask(pose)] = 0
            assembly = static_image.copy(); assembly.alpha_composite(Image.fromarray(pose))
            # Restore only the detached native muzzle region. A broad warm-color
            # mask would select yellow sandbags and bring their moving edge back.
            effect = np.zeros_like(pixels)
            if (n - 315) % 2 == 0:
                native = source['frames'][n]
                indices = np.zeros(source['canvas'][::-1], np.uint8)
                indices[native['y']:native['y'] + native['height'], native['x']:native['x'] + native['width']] = np.array(native['pixels']).reshape(native['height'], native['width'])
                components, _ = label((indices >= 176) & (indices <= 185))
                areas = np.bincount(components.ravel()); areas[0] = 0
                flash = components == areas.argmax(); yy, xx = np.where(flash)
                box = (max(0, int(xx.min()) - 2) * density, max(0, int(yy.min()) - 2) * density,
                       min(78, int(xx.max()) + 3) * density, min(66, int(yy.max()) + 3) * density)
                rgb = pixels[..., :3].astype(float)
                warm = (rgb[..., 0] > 215) & (rgb[..., 1] > 125) & (rgb[..., 1] > rgb[..., 2] * 1.4)
                roi = np.zeros_like(mask); roi[box[1]:box[3], box[0]:box[2]] = True
                effect = pixels.copy(); effect[..., 3][~(roi & warm & mask)] = 0
                assembly.alpha_composite(Image.fromarray(effect))
            ground = pixels.copy(); ground[..., 3][~ground_mask(ground)] = 0
            result = Image.fromarray(ground); result.alpha_composite(assembly)
            logical = old.manifest['logical']['frames'][n]
            x, y = (v * density for v in logical['trimOrigin']); w, h = (v * density for v in logical['trimSize'])
            bounded = Image.new('RGBA', result.size); bounded.paste(result.crop((x,y,x+w,y+h)), (x,y))
            changed[density,n,'base'] = bounded; changed[density,n,'data'] = semantic(bounded)
            # Artifact composition is asserted before the intentional muzzle and
            # native ground overlay: every stationary RGBA sample is identical.
            assert np.array(assembly)[mask & (static[...,3] > 0) & (effect[...,3] == 0)].tolist() == static[mask & (static[...,3] > 0) & (effect[...,3] == 0)].tolist()
        if density == 4 and facing in (0, 2, 6):
            board = Image.new('RGB', (1872, 264), '#34483d'); draw = ImageDraw.Draw(board)
            for j in range(6):
                n=315+facing*6+j; im=changed[4,n,'base']; board.paste(im,(j*312,0),im);draw.text((j*312+4,4),str(n),fill='white',font_size=22)
            board.save(OUT / f'gi-static-{REVISION}-facing-{facing}.png')
if not PREVIEW and not PRISM_ONLY:
    new, digest = old.publish(REVISION, changed, dict(cause='Freeze the complete per-facing idle sandbag layer; clear old pixels before composing distinct firing poses', baseManifestSha256=sha(old.root/'manifest.json')))
    member.update(revision=REVISION, sha256=digest)
    target = family_path.parent.parent / REVISION / 'family.json'; target.parent.mkdir(exist_ok=False);write(target,family)
    entry = units['shp']['E1'];entry.update(familyPath=str(target.relative_to('.local')),hash=sha(target),familyHash=sha(target));entry['members'][0]['manifestHash']=digest
    write('desktop/allied-unit-contracts.json',units)
if not PRISM_ONLY:
    report['rows'].append(dict(family='E1', changedSlots=list(range(315,363)), stationaryReferences=bag_hashes))

production.DENSITY = 4
for theater in (() if GI_ONLY else ('TEMPERATE', 'SNOW')):
    row = row_for('ATESLA', theater); key='atesla-'+theater.lower()
    family_path = Path('.local') / catalog[key]['familyPath']; family=read(family_path)
    if theater == 'SNOW':
        snow = sheet_cells(Image.open('.artifacts/allied-buildings/production-art-v1/ATESLA/snow-raw.png').convert('RGBA'),2,1)
        normal,_=register(snow[0],row['members'][0]['canvas'],resting(row).getbbox())
        damaged,_=register(snow[1],row['members'][0]['canvas'],resting(row,True).getbbox())
    else:
        normal=normal_for(Path('.artifacts/allied-buildings/review-v1/ATESLA-candidate-2x.png'))
        keys=sheet_cells(Image.open('.artifacts/allied-buildings/production-art-v1/ATESLA/keys-raw.png').convert('RGBA'))
        damaged,_=register(keys[0],row['members'][0]['canvas'],resting(row,True).getbbox())
    quads = {
        ('TEMPERATE', True): {
            'front': [(69.8,20.4),(74.5,32.3),(78.6,32.1),(76.5,20.3)],
            'top': [(69.5,16.8),(69.8,20.4),(76.5,20.3),(78,17)],
            'side': [(78.5,20),(78.7,31),(82,29),(82,17)]},
        ('SNOW', False): {
            'front': [(79,28),(80,39),(85,40),(84,28)],
            'top': [(78.5,24.5),(79,28),(84,28),(85.5,25.5)],
            'side': [(85,27),(85,38),(88,36),(88,25)]},
        ('SNOW', True): {
            'front': [(65.5,26.3),(70,36.5),(75.9,36.7),(71.5,25.8)],
            'top': [(65,22.5),(65.5,26.3),(71.5,25.8),(73,23.6)],
            'side': [(76,26),(77,37),(81,35),(81,23)]},
    }
    rotating = {(density,state,phase):rotor.render(damaged if state else normal,phase,density,quads.get((theater,state)),state)
                for density in (2,4) for state in (False,True) for phase in range(8)}
    for index, half in ((1,9),(2,10)):
        native_member=row['members'][index];name=native_member['source']['member'];member=next(m for m in family['members'] if m['member']==name)
        old=Member(Path('.local/hd-packs')/member['packId']/member['revision']);changes={}
        for density in (2,4):
            for n in range(native_member['visibleFrames']):
                state=n>=half
                # Charge retains its native stationary crown pose; emission is
                # layered above solid material, never substituted for it.
                phase=(n-half if state else n)%8 if index==1 else 0
                pixels=np.array(old.frame(density,half if state else 0))
                pixels[:45*density]=0
                result=Image.fromarray(pixels)
                master=damaged if state else normal
                # Snow's accepted whole-building registration places its crown
                # ten pixels lower. Register the fixed neck separately and do
                # not retain obsolete petal tails beneath the rotating head.
                if theater=='SNOW':
                    collar_top=39 if state else 43
                    source_top=36 if state else 41
                    neck=Image.new('RGBA',(172*density,14*density))
                    post=master.crop((0,source_top*4,172*4,collar_top*4))
                    post=post.convert('RGBa').resize((172*density,(collar_top-31)*density),Image.Resampling.LANCZOS).convert('RGBA')
                    neck.alpha_composite(post)
                    cap=master.crop((0,collar_top*4,172*4,45*4)).convert('RGBa').resize((172*density,(45-collar_top)*density),Image.Resampling.LANCZOS).convert('RGBA')
                    neck.alpha_composite(cap,(0,(collar_top-31)*density))
                else:
                    neck=master.crop((0,31*4,172*4,45*4)).convert('RGBa').resize((172*density,14*density),Image.Resampling.LANCZOS).convert('RGBA')
                result.alpha_composite(neck,(-5*density if state else 0,31*density))
                result.alpha_composite(rotating[density,state,phase])
                if index==2:
                    native=np.array(decode(row,native_member,n));baseline=np.array(decode(row,native_member,half if state else 0));rgb=native[...,:3].astype(float)
                    emission=(rgb.min(2)>160)&(rgb.max(2)-rgb.min(2)<110)&(rgb.mean(2)-baseline[...,:3].mean(2)>25)&(native[...,3]>0)
                    glow=Image.fromarray(np.uint8(emission)*200).resize(result.size,Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.3*density))
                    light=Image.new('RGBA',result.size,(195,220,255,0));light.putalpha(glow);result.alpha_composite(light)
                logical=old.manifest['logical']['frames'][n];x,y=(v*density for v in logical['trimOrigin']);w,h=(v*density for v in logical['trimSize'])
                bounded=Image.new('RGBA',result.size);bounded.paste(result.crop((x,y,x+w,y+h)),(x,y))
                changes[density,n,'base']=bounded; data=old.frame(density,n,'data');replacement=semantic(bounded)
                data.paste(replacement.crop((0,0,data.width,45*density)),(0,0));changes[density,n,'data']=data
        if index==1:
            board=Image.new('RGB',(1664,448),'#34483d');draw=ImageDraw.Draw(board)
            for n in range(16):
                slot=n if n<8 else n+1
                im=changes[4,slot,'base'].crop((60*4,0,112*4,48*4));x=n%8*208;y=n//8*224
                board.paste(im,(x,y+28),im);draw.text((x+4,y+4),str(slot),fill='white',font_size=22)
            board.save(OUT / f'prism-rigid-v3-{theater.lower()}.png')
        if not PREVIEW:
            new,digest=old.publish(REVISION,changes,dict(cause='Accepted surface textures projected on a rigid eight-petal rotor; fixed pivot and scale; depth occlusion replaces row deformation',baseManifestSha256=sha(old.root/'manifest.json'),pivot=list(rotor.PIVOT),nativePhaseYawDegrees=[n*45/8 for n in range(8)]))
            member.update(revision=REVISION,sha256=digest)
    if not PREVIEW:
        target=family_path.parent.parent/REVISION/'family.json';target.parent.mkdir(exist_ok=False);write(target,family)
        catalog[key].update(familyPath=str(target.relative_to('.local')),familyHash=sha(target))
    report['rows'].append(dict(family=key, changedMembers=[row['members'][i]['source']['member'] for i in (1,2)],pivot=list(rotor.PIVOT),phaseYawDegrees=[n*45/8 for n in range(8)]))
if not PREVIEW and not GI_ONLY:write('desktop/allied-building-coverage.json',catalog)
mode='prism-' if PRISM_ONLY else ''
write(OUT / ('preview-'+mode+REVISION+'.json' if PREVIEW else 'resources-'+mode+REVISION+'.json'),report)
print('Prepared rigid Prism and stationary GI exports; preview='+str(PREVIEW))
