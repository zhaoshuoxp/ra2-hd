"""Export faithful whole-assembly cliff artwork, keeping Original ground controls."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision')
parser.add_argument('--authoring-root', type=Path, default=Path('.artifacts/m2-1/authoring-v8'))
parser.add_argument('--boundary-repair', action='store_true')
args = parser.parse_args()
root, revision, boundary_repair = args.authoring_root, args.revision, args.boundary_repair
destination = Path('.local/terrain-packs') / revision
destination.mkdir(parents=True, exist_ok=False)
export_root = root / revision
export_root.mkdir(exist_ok=False)
region = json.loads((root / 'region.json').read_text())
layout = json.loads((root / 'layout.json').read_text())
members = [m for m in region['members'] if m['member'] in layout]
plates, provenance = {}, []
for name, info in layout.items():
    file = root / info['board']
    master = Image.open(file).convert('RGBA')
    if 'sourceRect' in info:
        master = master.crop(info['sourceRect'])
    elif info['slot'] is not None:
        x, y = info['slot'] % 2, info['slot'] // 2
        master = master.crop((x * master.width // 2, y * master.height // 2,
                              (x + 1) * master.width // 2, (y + 1) * master.height // 2))
    rect = master.getchannel('A').point(lambda a: 255 if a > 180 else 0).getbbox()
    master = master.crop(rect)
    a = info['nativeAlphaBounds']
    capacity = min(master.width / (a[2]-a[0]), master.height / (a[3]-a[1]))
    if capacity < 4:
        raise ValueError(f'Insufficient independent 4X source: {name}: {capacity}')
    rgb = np.asarray(master)[:, :, :3].copy()
    valid = np.asarray(master)[:, :, 3] > 180
    # Extrude only transparent technical RGB; retain every authored covered pixel.
    while not valid.all():
        previous = valid.copy()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            neighbor = np.roll(previous, (dy,dx), axis=(0,1))
            if dy < 0: neighbor[dy:] = False
            if dy > 0: neighbor[:dy] = False
            if dx < 0: neighbor[:,dx:] = False
            if dx > 0: neighbor[:,:dx] = False
            fill = ~valid & neighbor
            rgb[fill] = np.roll(rgb, (dy,dx), axis=(0,1))[fill]
            valid |= fill
    # One palette offset per entire connected assembly, never per cut subtile.
    native = np.asarray(Image.open(root / f'{name}-native.png'))
    mask = native[a[1]:a[3],a[0]:a[2],3] > 0
    projected = np.asarray(Image.fromarray(rgb).resize((a[2]-a[0],a[3]-a[1]), Image.Resampling.LANCZOS))
    delta = native[a[1]:a[3],a[0]:a[2],:3][mask].mean(0) - projected[mask].mean(0)
    plates[name] = Image.fromarray(np.clip(rgb.astype(float)+delta,0,255).astype(np.uint8))
    provenance.append(dict(member=name,file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
                           crop=rect,sourceRect=info.get('sourceRect'),slot=info['slot'],
                           densityCapacity=capacity,paletteOffset=delta.tolist()))


def native_image(member, image):
    raw = Path('.artifacts/m2-1/inventory/native') / f"{member['nativeName']}-{image['subTile']}.rgba"
    return Image.frombytes('RGBA',tuple(image['logical']),raw.read_bytes())


def project(member, image, density):
    native = native_image(member,image)
    size = tuple(n*density for n in native.size)
    expected = np.asarray(native.resize(size,Image.Resampling.NEAREST))
    if member['nativeOffsets'][image['subTile']] <= 0:
        return Image.fromarray(expected)
    info = layout[member['member']]
    a = info['nativeAlphaBounds']
    full = Image.new('RGB',(info['bounds'][2]*density,info['bounds'][3]*density))
    full.paste(plates[member['member']].resize(((a[2]-a[0])*density,(a[3]-a[1])*density),
               Image.Resampling.LANCZOS),(a[0]*density,a[1]*density))
    if boundary_repair:
        # Calibrate only the external assembly perimeter against adjoining Original art.
        # Internal subtile joins and the reconstructed face RGB remain authored.
        original = Image.open(root / f"{member['member']}-native.png").convert('RGBA')
        inside = np.asarray(original)[:, :, 3] > 0
        colors = np.asarray(original)[:, :, :3].astype(float)
        grass = (colors[:, :, 1] >= colors[:, :, 0] - 30) & (colors[:, :, 1] > colors[:, :, 2] + 20)
        boundary = np.zeros(inside.shape, dtype=np.float32)
        for step in range(9):
            pad = np.pad(inside, 1)
            eroded = (pad[1:-1, 1:-1] & pad[:-2, 1:-1] & pad[2:, 1:-1]
                      & pad[1:-1, :-2] & pad[1:-1, 2:])
            ring = inside & ~eroded
            boundary[ring] = np.maximum(max(0, 1 - step / 2),
                                       grass[ring] * min(1, max(0, (8-step) / 4)))
            inside = eroded
        target_size = full.size
        weight = np.array(Image.fromarray(boundary).resize(target_size, Image.Resampling.BILINEAR))
        nearest = np.asarray(Image.fromarray(boundary).resize(target_size, Image.Resampling.NEAREST))
        weight[nearest == 1] = 1
        original_rgb = np.asarray(original.convert('RGB').resize(target_size, Image.Resampling.NEAREST))
        authored = np.asarray(full)
        full = Image.fromarray(np.clip(authored * (1-weight[:, :, None])
                                       + original_rgb * weight[:, :, None], 0, 255).astype(np.uint8))
    x, y, w, h = [n * density for n in next(p['rect'] for p in info['parts']
                                           if p['subTile'] == image['subTile'])]
    result = np.empty((*expected.shape[:2], 4), dtype=np.uint8)
    result[:, :, :3] = np.asarray(full.crop((x, y, x + w, y + h)))
    result[:, :, 3] = expected[:, :, 3]
    valid = result[:, :, 3] > 0
    for _ in range(2):
        previous = valid.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            neighbor = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy < 0: neighbor[dy:] = False
            if dy > 0: neighbor[:dy] = False
            if dx < 0: neighbor[:, dx:] = False
            if dx > 0: neighbor[:, :dx] = False
            fill = ~valid & neighbor
            result[fill, :3] = np.roll(result[:, :, :3], (dy, dx), axis=(0, 1))[fill]
            valid |= fill
    return Image.fromarray(result)


old_root=Path('.local/terrain-packs/temperate-m2-1-representative-v4')
old=json.loads((old_root/'manifest.json').read_text())
road=next(g for g in old['groups'] if g['id']=='road-representative')
for variant in road['variants']:
    (destination/variant['file']).write_bytes((old_root/variant['file']).read_bytes())
group=dict(id='elevation-representative',scope='USER_REQUESTED_CONTIGUOUS_CLIFF_REGION',
           members=[{k:m[k] for k in ['member','sourceHashes','images']} for m in members],variants=[])
checks=0
for density in [2,4]:
    frames=[project(m,i,density) for m in members for i in m['images']]
    width=1024 if density==2 else 2048
    rects = []
    x = y = 2
    row = 0
    for frame in frames:
        if x + frame.width + 2 > width:
            x = 2
            y += row + 4
            row = 0
        rects.append([x, y, *frame.size])
        x += frame.width + 4
        row = max(row, frame.height)
    atlas=Image.new('RGBA',(width,y+row+2))
    for frame,rect in zip(frames,rects):
        atlas.paste(frame, tuple(rect[:2]))
        checks += 1
        x,y,w,h=rect
        for strip,point in [(frame.crop((0,0,1,h)).resize((2,h)),(x-2,y)),
            (frame.crop((w-1,0,w,h)).resize((2,h)),(x+w,y)),
            (frame.crop((0,0,w,1)).resize((w,2)),(x,y-2)),
            (frame.crop((0,h-1,w,h)).resize((w,2)),(x,y+h))]:
            atlas.paste(strip,point)
    file = f'elevation-representative-{density}x.rgba'
    data = atlas.tobytes()
    (destination / file).write_bytes(data)
    atlas.save(export_root / f'{density}x-atlas.png')
    group['variants'].append(dict(density=density,size=list(atlas.size),file=file,
                                 sha256=hashlib.sha256(data).hexdigest(),rects=rects))
manifest=dict(schema='tmp-terrain-hd-v1',revision=revision,theater='TEMPERATE',editions=['ra2','yr'],
              scope='CONTIGUOUS_CLIFF_REPRESENTATIVE_REVIEW_ONLY',groups=[road,group])
data=(json.dumps(manifest,separators=(',',':'))+'\n').encode();(destination/'manifest.json').write_bytes(data)
pointer=dict(schemaVersion=1,revision=revision,sha256=hashlib.sha256(data).hexdigest())
for file in ['.local/terrain-selection.json','desktop/terrain-hd-contract.json']:
    Path(file).write_text(json.dumps(pointer,indent=2)+'\n')
(export_root/'recipe.json').write_text(json.dumps(dict(pack=pointer,masters=provenance,
    method='Complete newly reconstructed authored RGB; native alpha and geometry; global assembly palette anchors',
    nativeGround='Original; all rejected V7 ground removed from selection',roads='Exact acknowledged V4',
    externalBoundary='Original outer pixel and second-pixel fade; only olive grass contacts extend to five pixels plus three-pixel fade; authored rock interiors' if boundary_repair else 'Authored',
    independentDensities=[2,4],imageDensityPairs=checks),indent=2)+'\n')
print(json.dumps(dict(pack=pointer,members=len(members),images=len(frames),imageDensityPairs=checks),indent=2))
