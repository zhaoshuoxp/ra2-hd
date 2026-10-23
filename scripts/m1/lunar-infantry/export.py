"""Export complete native LUNR slots into dual-density, hash-pinned atlas resources."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_cells import isolated_cells

parser = argparse.ArgumentParser()
parser.add_argument('--audit-only', action='store_true')
parser.add_argument('--revision', default='1')
args = parser.parse_args()
root = Path('.artifacts/lunar-infantry')
work = json.loads((root/'production-plan-v1/worklist.json').read_text())
source = json.loads((root/'source-v1/lunr.shp.json').read_text())
acceptance = Path('docs/lunar-infantry-acceptance.json')
assert json.loads(acceptance.read_text())['status'] == 'REPRESENTATIVE_ACCEPTED'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
details, audit, missing = {}, [], []
corrections = json.loads((root/'production-art-v1/corrections.json').read_text())


def components(mask):
    labels, _ = ndimage.label(mask, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return [labels == i for i in np.argsort(sizes)[::-1] if sizes[i] > 0]


def bounds(mask):
    return Image.fromarray(mask.astype(np.uint8)*255).getbbox()


def native_parts(frame, indices):
    mask = (indices != 0) & (indices != 12)
    particles = np.zeros_like(mask)
    if 134 <= frame <= 163 or 340 <= frame <= 369:
        parts = components(mask)
        count = 2 if 341 <= frame <= 354 and len(parts) > 1 and parts[1].sum() >= 15 else 1
        retained = parts[:count]
        particles = mask & ~np.logical_or.reduce(retained)
        return [bounds(part) for part in retained], particles
    return [bounds(mask)], particles

for batch in work['batches']:
    path = root/'production-art-v1'/corrections.get(batch['id'], batch['id']+'.png')
    if not path.exists():
        missing.append(batch['id']); continue
    rgba = np.array(Image.open(path).convert('RGBA')).astype(float)
    key = np.minimum(rgba[...,0], rgba[...,2]) - rgba[...,1]
    coverage = np.clip(1-key/255, 0, 1); coverage[key>180] = 0
    rgba[...,:3] = np.divide(rgba[...,:3] - (1-coverage[...,None])*[255,0,255],
                            np.maximum(coverage[...,None], .01))
    rgba[...,3] *= coverage
    cells = isolated_cells(Image.fromarray(np.uint8(np.clip(rgba,0,255))), *batch['grid'], len(batch['frames']))
    for frame, (detail, cell_bounds) in zip(batch['frames'], cells, strict=True):
        f = source['frames'][frame]
        indices = np.array(f['pixels'], np.uint8).reshape(f['height'],f['width'])
        bodies, _ = native_parts(frame, indices)
        authored = [detail]
        if len(bodies) == 2:
            rgba_detail = np.array(detail)
            masks = components(rgba_detail[..., 3] > 128)
            assert len(masks) >= 2 and masks[1].sum() > 100, ('Missing detached rocket', frame)
            authored = []
            for mask in masks[:2]:
                part = rgba_detail.copy()
                part[..., 3] *= ndimage.binary_dilation(mask, iterations=2)
                authored.append(Image.fromarray(part).crop(bounds(part[..., 3] > 0)))
        details[frame] = list(zip(authored, bodies, strict=True))
        for part_index, (part, body) in enumerate(details[frame]):
            assert body, frame
            width, height = body[2]-body[0], body[3]-body[1]
            ratio = min(part.width/width, part.height/height)
            audit.append(dict(frame=frame, part=part_index, batch=batch['id'], masterSize=list(part.size),
                              nativeBodySize=[width,height], availableDensity=ratio, sha256=sha(path)))
insufficient = [a for a in audit if a['availableDensity'] < 4]
report = dict(status='PASS_SAMPLING' if not missing and not insufficient else 'INCOMPLETE',
              presentFrames=len(details), missing=missing, insufficient=insufficient, frames=audit)
(root/'sampling-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='frames'}))
if args.audit_only:
    raise SystemExit(0)
assert not missing and not insufficient
out = Path('.local/hd-packs/lunar-infantry-authored')/args.revision
out.mkdir(parents=True, exist_ok=False)
export = root/f'exports-{args.revision}'; export.mkdir()
logical = [dict(nativeFrame=i, trimOrigin=[f['x'],f['y']], trimSize=[f['width'],f['height']],
                legacyRenderSize=[f['width']+f['width']%2,f['height']+f['height']%2],empty=f['empty'])
           for i,f in enumerate(source['frames'][:435])]
variants, checks = [], []
for density in [2,4]:
    folder = export/f'{density}x'; folder.mkdir()
    page_width = 2048
    layouts, packed = [[]], []
    x,y,row_height = 2,2,0
    for slot, geometry in zip(work['slots'],logical,strict=True):
        i = slot['frame']; f = source['frames'][i]
        fw,fh = f['width'],f['height']
        w,h = [n*density for n in geometry['legacyRenderSize']]
        indices = np.array(f['pixels'],np.uint8).reshape(fh,fw)
        ground = np.zeros((fh,fw,4),np.uint8);ground[...,3]=(indices==12)*255
        _, particles = native_parts(i, indices)
        ground[particles,:3] = np.array(source['palette'],np.uint8)[indices[particles]]
        ground[particles,3] = 255
        base = Image.new('RGBA',(w,h))
        base.alpha_composite(Image.fromarray(ground).resize((fw*density,fh*density),Image.Resampling.NEAREST))
        for detail, body in details[slot['canonicalFrame']]:
            left, top, right, bottom = body
            sprite = detail.convert('RGBa').resize(
                ((right-left)*density, (bottom-top)*density), Image.Resampling.LANCZOS).convert('RGBA')
            base.alpha_composite(sprite, (left*density, top*density))
        rgba = np.array(base); red,green,blue = [rgba[...,k].astype(float) for k in range(3)]
        # The approved suit's red panels are all semantic owner paint. Restricting
        # them to old pixel locations would leave newly detailed red edges behind.
        paint = (rgba[...,3]>0)&(red>35)&(red>green*1.5)&(red>blue*1.5)&(green-blue<(red-blue)*.25)
        native_owner = bool(np.any((indices>=16)&(indices<=31)))
        assert native_owner or not paint.any(), ('Unexpected team paint',i)
        assert not native_owner or paint.any(), ('Missing team paint',i)
        ramp = np.array(source['palette'])[16:32,0]
        shades = abs(red[...,None]-ramp).argmin(axis=2).astype(np.uint8)
        data = np.zeros_like(rgba);data[...,3]=255;data[...,0]=paint*255;data[...,1]=np.where(paint,shades,0)
        full = Image.new('RGBA',tuple(n*density for n in source['canvas']))
        full.paste(base,(f['x']*density,f['y']*density));full.save(folder/f'{i:04d}.png')
        if x+w+2>page_width: x,y,row_height=2,y+row_height+4,0
        if y+h+2>2048: layouts.append([]);x,y,row_height=2,2,0
        frame=dict(nativeFrame=i,page=f'p{len(layouts)-1}',sampleRect=[x,y,w,h],contentRect=[x,y,fw*density,fh*density])
        packed.append(frame);layouts[-1].append((frame,base,Image.fromarray(data)))
        x+=w+4;row_height=max(row_height,h)
        checks.append(dict(frame=i,density=density,remapPixels=int(paint.sum()),nativeGroundPixels=int((indices==12).sum()),
                           retainedNativeParticlePixels=int(particles.sum())))
    pages=[]
    for index,layout in enumerate(layouts):
        height=(max(f['sampleRect'][1]+f['sampleRect'][3]+2 for f,_,_ in layout)+15)//16*16
        page=dict(id=f'p{index}',size=[page_width,height])
        for offset,role in [(1,'base'),(2,'data')]:
            atlas=Image.new('RGBA',(page_width,height),(0,0,0,255 if role=='data' else 0))
            for item in layout: atlas.paste(item[offset],tuple(item[0]['sampleRect'][:2]))
            name=f'{density}x-p{index}-{role}.png';atlas.save(out/name)
            page.update({role:name,role+'Sha256':sha(out/name),role+'Bytes':(out/name).stat().st_size})
        pages.append(page)
    variants.append(dict(density=density,pages=pages,frames=packed))
manifest=dict(schemaVersion=2,packId='lunar-infantry-authored',packRevision=args.revision,rulesIdentities=['LUNR'],
              purpose='Complete native LUNR slots with approved artwork; final gameplay review separate',
              source=dict(member='lunr.shp',sha256=source['sha256'],theater='TEMPERATE',kind='resolved-shp-member'),
              logical=dict(canvas=source['canvas'],frames=logical),
              color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'),variants=variants,
              provenance=dict(representativeAcceptanceSha256=sha(acceptance),nativeWorklistSha256=sha(root/'production-plan-v1/worklist.json'),
                              samplingAuditSha256=sha(root/'sampling-audit.json'),remap='All authored red suit panels are owner paint; white suit, metal, visor and blue exhaust remain neutral.'))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(export/'receipt.json').write_text(json.dumps(dict(status='COMPLETE_DUAL_DENSITY_RUNTIME_PENDING',manifest=str(out/'manifest.json'),
    manifestSha256=sha(out/'manifest.json'),checks=checks,
    variants=[dict(density=v['density'],gpuBytes=sum(p['size'][0]*p['size'][1]*8 for p in v['pages'])) for v in variants]),indent=2)+'\n')
