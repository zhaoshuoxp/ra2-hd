"""Pack complete families with byte-identical frame sharing and bounded pages."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path('.artifacts/m1-6b')
EXPORTS = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'full-exports-v1')
REVISION = sys.argv[2] if len(sys.argv) > 2 else '1'
APPROVAL = ROOT / 'representative-acceptance.json'
assert json.loads(APPROVAL.read_text())['status'] == 'BATCH_REPRESENTATIVES_ACCEPTED'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checklist = json.loads((ROOT / 'production-checklist-v1.json').read_text())['families']
receipts = {}

for family_id, members in checklist.items():
    if len(sys.argv) > 3 and family_id not in sys.argv[3:]:
        continue
    review = EXPORTS / family_id
    report = json.loads((review / 'candidate-review.json').read_text())
    assert len(report['frames']) == sum(len(m['authorFrames']) for m in members)
    family_root = Path('.local/hd-packs') / f'soviet-{family_id.lower()}-authored' / REVISION
    family_root.mkdir(parents=True, exist_ok=False)
    family = dict(schemaVersion=1, family=family_id, theater='TEMPERATE', candidateSha256=sha(review/'candidate-review.json'),
                  approvalSha256=sha(APPROVAL), approvalScope='Representative direction accepted; final complete-family visual/gameplay review pending', members=[])
    allocations = {2: 0, 4: 0}
    member_reports = []
    for member_info in members:
        member = member_info['member']
        raw = json.loads((ROOT/'source-v1'/family_id/(member+'.json')).read_text())
        pack_id = f'soviet-{family_id.lower()}-{member[:-4].replace("_", "-")}-authored'
        out = Path('.local/hd-packs')/pack_id/REVISION
        out.mkdir(parents=True, exist_ok=False)
        logical = [dict(nativeFrame=i, trimOrigin=[f['x'],f['y']],trimSize=[f['width'],f['height']],
                        legacyRenderSize=[f['width']+f['width']%2,f['height']+f['height']%2],empty=f['empty'])
                   for i,f in enumerate(raw['frames'][:len(member_info['authorFrames'])])]
        variants=[]; measurements=[]
        for density in (2,4):
            unique=[]; aliases={}; seen={}
            for frame in logical:
                i=frame['nativeFrame']; stem=f'{member[:-4]}-{i:02}-{density}x'
                paths=[review/(stem+suffix+'.png') for suffix in ['', '-data']]
                images=[Image.open(p).convert('RGBA') for p in paths]
                assert all(im.size == tuple(max(1,n*density) for n in frame['legacyRenderSize']) for im in images)
                key=(tuple(frame['trimSize']),frame['empty'],*(hashlib.sha256(im.tobytes()).hexdigest() for im in images))
                if key in seen:
                    aliases[i]=seen[key]
                else:
                    seen[key]=i;unique.append(i)
            # Best-fit shelves, decreasing height. Frames keep their native IDs.
            layouts=[]; placements={}
            for i in sorted(unique,key=lambda i:(-logical[i]['legacyRenderSize'][1],-logical[i]['legacyRenderSize'][0],i)):
                w,h=[n*density for n in logical[i]['legacyRenderSize']]
                best=None
                for page_n,page in enumerate(layouts):
                    for row_n,row in enumerate(page):
                        if h+4<=row['height'] and row['x']+w+4<=2048:
                            score=(row['height']-h-4,2048-row['x']-w-4,page_n,row_n)
                            if best is None or score<best:best=score
                if best is not None:
                    page_n,row_n=best[2:];row=layouts[page_n][row_n]
                else:
                    page_n=next((n for n,p in enumerate(layouts) if sum(r['height'] for r in p)+h+4<=2048),len(layouts))
                    if page_n==len(layouts):layouts.append([])
                    row=dict(y=sum(r['height'] for r in layouts[page_n]),x=0,height=h+4)
                    layouts[page_n].append(row)
                placements[i]=dict(nativeFrame=i,page=f'p{page_n}',sampleRect=[row['x']+2,row['y']+2,w,h],
                                   contentRect=[row['x']+2,row['y']+2,*[n*density for n in logical[i]['trimSize']]])
                row['x']+=w+4
            pixel_count=sum(max(r['x'] for r in rows)*sum(r['height'] for r in rows) for rows in layouts)
            allocations[density]+=pixel_count*6
            measurement=dict(density=density,pages=len(layouts),gpuBytes=pixel_count*6,uniqueFrames=len(unique),sharedFrames=len(aliases),
                             status='PASS' if len(layouts)<=8 else 'REJECTED_PAGE_LIMIT')
            measurements.append(measurement)
            if len(layouts)>8:
                continue
            pages=[]
            for page_n,rows in enumerate(layouts):
                page=dict(id=f'p{page_n}',size=[max(r['x'] for r in rows),sum(r['height'] for r in rows)])
                for channel in ('base','data'):
                    atlas=Image.new('RGBA',tuple(page['size']),(0,0,0,255 if channel=='data' else 0))
                    for i,frame in placements.items():
                        if frame['page']!=page['id']:continue
                        suffix='-data' if channel=='data' else ''
                        image=Image.open(review/f'{member[:-4]}-{i:02}-{density}x{suffix}.png')
                        atlas.paste(image,tuple(frame['sampleRect'][:2]))
                    name=f'{density}x-{page["id"]}-{channel}.png';path=out/name;atlas.save(path)
                    page[channel]=name;page[channel+'Sha256']=sha(path);page[channel+'Bytes']=path.stat().st_size
                pages.append(page)
            for i,canonical in aliases.items():
                placements[i]={**placements[canonical],'nativeFrame':i,'sharedWith':canonical}
            variants.append(dict(density=density,pages=pages,frames=[placements[i] for i in range(len(logical))]))
        manifest=dict(schemaVersion=2,packId=pack_id,packRevision=REVISION,source=raw['source'],
                      purpose='Complete optional temperate Soviet building review candidate',candidateSha256=family['candidateSha256'],
                      logical=dict(canvas=raw['canvas'],frames=logical),color=dict(representation='authored-sRGB-RGBA8-plus-RGBA8-data'),variants=variants)
        path=out/'manifest.json';path.write_text(json.dumps(manifest,indent=2)+'\n')
        family['members'].append(dict(member=member,packId=pack_id,revision=REVISION,sha256=sha(path)))
        member_reports.append(dict(member=member,variants=measurements))
    path=family_root/'family.json';path.write_text(json.dumps(family,indent=2)+'\n')
    assert allocations[2]<=64*1024*1024
    receipts[family_id]=dict(family=str(path),sha256=sha(path),gpuBytes=allocations,members=member_reports,
                            limit=64*1024*1024,format='SRGB8_ALPHA8 + validated RG8; no mipmaps')
    print(json.dumps({family_id:dict(gpuBytes=allocations,sha256=sha(path))}),flush=True)
(ROOT/f'family-packs-{REVISION}.json').write_text(json.dumps(receipts,indent=2)+'\n')
