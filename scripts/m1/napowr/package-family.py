"""Pack the complete, opt-in NAPOWR review family without modifying prior packs."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path('.artifacts/m1-6a')
review = root / 'full-exports-v2'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = json.loads((review / 'candidate-review.json').read_text())
assert report['requiredAuthoredFrames'] == 67 and report['validatedExports'] == 134
approval = root / 'representative-acceptance.json'
assert json.loads(approval.read_text())['status'] == 'REPRESENTATIVE_ART_ACCEPTED'
family_root = Path('.local/hd-packs/soviet-power-plant-authored/2')
family_root.mkdir(parents=True, exist_ok=False)
family = dict(schemaVersion=1, family='NAPOWR', theater='TEMPERATE', candidateSha256=sha(review / 'candidate-review.json'),
              approvalSha256=sha(approval), approvalScope='Representative direction; complete opt-in review candidate; final visual acceptance pending', members=[])
allocation = {2:0,4:0}
for member, role, count in [('ngpowr.shp','body',3),('ngpowr_a.shp','active',38),('ntpowrmk.shp','buildup',26)]:
    raw = json.loads((root / 'source-v1' / f'{member}.json').read_text())
    pack_id = f'soviet-power-plant-authored-{role}'
    out = Path('.local/hd-packs') / pack_id / '2'; out.mkdir(parents=True, exist_ok=False)
    logical = [dict(nativeFrame=i, trimOrigin=[f['x'],f['y']], trimSize=[f['width'],f['height']],
                    legacyRenderSize=[f['width']+f['width']%2,f['height']+f['height']%2],empty=f['empty']) for i,f in enumerate(raw['frames'][:count])]
    variants=[]
    for density in (2,4):
        # Tight shelf pages avoid charging unused 2048-wide strips to the GPU.
        pages=[]; frames=[]; x=y=2; row_height=0; page_frames=[]
        def finish():
            if not page_frames: return
            page_id=f'p{len(pages)}'
            size=(max(f['sampleRect'][0]+f['sampleRect'][2]+2 for f in page_frames),max(f['sampleRect'][1]+f['sampleRect'][3]+2 for f in page_frames))
            assert max(size)<=2048
            page=dict(id=page_id,size=size)
            for channel in ('base','data'):
                atlas=Image.new('RGBA',size,(0,0,0,255 if channel=='data' else 0))
                for frame in page_frames:
                    suffix='-data' if channel=='data' else ''
                    image=Image.open(review/f"{member[:-4]}-{frame['nativeFrame']:02d}-{density}x{suffix}.png").convert('RGBA')
                    atlas.paste(image,tuple(frame['sampleRect'][:2]))
                filename=f'{density}x-{page_id}-{channel}.png';path=out/filename;atlas.save(path)
                page[channel]=filename;page[channel+'Sha256']=sha(path);page[channel+'Bytes']=path.stat().st_size
            pages.append(page);frames.extend(page_frames);allocation[density]+=size[0]*size[1]*6
        for frame in logical:
            w,h=[n*density for n in frame['legacyRenderSize']]
            remaining = logical[frame['nativeFrame']:]
            remaining_width = sum(f['legacyRenderSize'][0]*density+4 for f in remaining)
            if page_frames and x+w+2>2048 and remaining_width < 1400:
                finish();page_frames=[];x=y=2;row_height=0
            if x+w+2>2048: x=2;y+=row_height+4;row_height=0
            if y+h+2>2048: finish();page_frames=[];x=y=2;row_height=0
            page_frames.append(dict(nativeFrame=frame['nativeFrame'],page=f'p{len(pages)}',sampleRect=[x,y,w,h],contentRect=[x,y,*[n*density for n in frame['trimSize']]]))
            x+=w+4;row_height=max(row_height,h)
        finish();assert len(pages)<=8
        variants.append(dict(density=density,pages=pages,frames=frames))
    manifest=dict(schemaVersion=2,packId=pack_id,packRevision='2',source=raw['source'],purpose='Complete optional NAPOWR review candidate',candidateSha256=family['candidateSha256'],logical=dict(canvas=raw['canvas'],frames=logical),color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'),variants=variants)
    path=out/'manifest.json';path.write_text(json.dumps(manifest,indent=2)+'\n')
    family['members'].append(dict(member=member,packId=pack_id,revision='2',sha256=sha(path)))
path=family_root/'family.json';path.write_text(json.dumps(family,indent=2)+'\n')
assert all(n<=64*1024*1024 for n in allocation.values()), allocation
receipt=dict(family=str(path),sha256=sha(path),gpuBytes=allocation,format='base SRGB8_ALPHA8 + validated remap RG8; no mipmaps',limit=64*1024*1024)
(root/'family-pack.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
