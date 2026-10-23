"""Export faithful loading patches and complete UI state atlases; preserve accepted cameos."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import hashlib, json, shutil, sys
root = Path(__file__).resolve().parents[2]
art = root / '.artifacts/menu-ui'
revision = sys.argv[1] if len(sys.argv) > 1 else 'original-screens-v4'
out = root / '.local/ui-packs' / revision
out.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assets = []
def write_image(image, entry):
    target = out / entry['file']
    import io
    buf = io.BytesIO(); image.save(buf, format='PNG'); data = buf.getvalue()
    if target.exists() and target.read_bytes() != data:
        raise RuntimeError('Immutable member already differs: ' + str(target))
    target.write_bytes(data)
    entry.update(sha256=sha(target), width=image.width, height=image.height)
    assets.append(entry)
accepted = json.loads((root/'.local/ui-packs/direction-v5/manifest.json').read_text())
for a in accepted['assets']:
    if a['id'] in ['menu-background', 'loading-background']: continue
    source = root / '.local/ui-packs/direction-v5' / a['file']
    assert sha(source) == a['sha256']
    target = out / a['file']
    if target.exists(): assert target.read_bytes() == source.read_bytes()
    else: shutil.copy2(source,target)
    assets.append(a)
countries = ['ustates','france','germany','ukingdom','russia','cuba','libya','iraq','korea']
ledger = []
for country in countries:
    source = art/'original-screens/units'/f'{country}.png'
    master = art/'loading-units-v1'/f'{country}.png'
    original = Image.open(source).convert('RGBA').resize((744,600),Image.Resampling.LANCZOS)
    candidate = Image.open(master).convert('RGBA').resize((744,600),Image.Resampling.LANCZOS)
    # A source-derived matte preserves every original grid/background pixel outside the unit.
    small=Image.open(source).convert('RGB');mask=Image.new('L',small.size)
    mask.putdata([255 if min(c)>8 and max(c)>35 else 0 for c in small.getdata()])
    mask=mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(0.7))
    mask=mask.resize((744,600),Image.Resampling.LANCZOS)
    image = Image.composite(candidate,original,mask)
    entry = dict(id='loading-unit-'+country,file='loading-unit-'+country+'.png',logicalWidth=186,logicalHeight=150)
    write_image(image,entry)
    ledger.append(dict(id=entry['id'],source=str(source.relative_to(root)),sourceSha256=sha(source),
        master=str(master.relative_to(root)),masterSha256=sha(master),crop=[210,8,186,150],status='ART_REVIEW_PENDING'))
originals = {a['key']:a for a in json.loads((art/'ui-originals/inventory.json').read_text())}
for side in ['allied','soviet']:
    for kind in ['controls','panels']:
        master = art/'ui-controls-v1'/f'{side}{"" if kind=="controls" else "-panels"}.png'
        if side == 'soviet' and kind == 'panels' and revision != 'original-screens-v2':
            master = art/'ui-controls-v2/soviet-panels.png'
        sheet = Image.open(master).convert('RGBA')
        if side == 'soviet' and kind == 'panels' and revision not in ['original-screens-v2', 'original-screens-v3']:
            # Register the revised sheet to the original grid before slicing.
            # Silhouette fit: 0.97 content scale and -2 native-pixel x translation.
            sheet = sheet.transform(sheet.size, Image.Transform.AFFINE,
                (0.97, 0, 2 * sheet.width / 504 * 0.97, 0, 0.97, 0), Image.Resampling.BICUBIC)
        sw,sh = (640,440) if kind=='controls' else (504,480)
        layout=json.loads((art/'ui-originals'/f'{side}-{kind}-layout.json').read_text())
        keys = list(dict.fromkeys(x['key'] for x in layout))
        for key in keys:
            if key.endswith('-powerp'): continue # Native solid-color indicator; no generated glow.
            source=originals[key];w,h,n=source['width'],source['height'],source['frames']
            atlas=Image.new('RGBA',(w*n*4,h*4))
            for cell in [x for x in layout if x['key']==key]:
                x,y=cell['x'],cell['y']; f=cell['frame']
                crop=sheet.crop((round(x/sw*sheet.width),round(y/sh*sheet.height),
                    round((x+w)/sw*sheet.width),round((y+h)/sh*sheet.height))).resize((w*4,h*4),Image.Resampling.LANCZOS)
                original=Image.open(art/'ui-originals'/source['framesData'][f]['file'].replace('.rgba','.png')).convert('RGBA')
                original=original.resize((w*4,h*4),Image.Resampling.LANCZOS)
                composed=Image.alpha_composite(original,crop)
                composed.putalpha(original.getchannel('A')) # Exact original silhouette and transparent cutouts.
                atlas.paste(composed,(f*w*4,0))
            entry=dict(id=key,file=key+'.png',logicalWidth=w*n,logicalHeight=h)
            write_image(atlas,entry)
            ledger.append(dict(id=key,source=source['source'],member=source['member'],sourceSha256=source['sha256'],
                palette=source['palette'],paletteSha256=source['paletteSha256'],frames=n,
                master=str(master.relative_to(root)),masterSha256=sha(master),status='ART_REVIEW_PENDING'))
if (art/'ui-originals/inventory-yuri.json').exists():
    yuri={a['key']:a for a in json.loads((art/'ui-originals/inventory-yuri.json').read_text())}
    for entry in list(assets):
        if not entry['id'].startswith('soviet-'): continue
        key=entry['id'].replace('soviet-','yuri-');source=yuri[key];shared=originals[entry['id']]
        assert source['sha256']==shared['sha256'] and source['paletteSha256']==shared['paletteSha256']
        assets.append(dict(entry,id=key))
        ledger.append(dict(id=key,status='DORMANT_ART_REVIEW_PENDING',source=source['source'],member=source['member'],
            sourceSha256=source['sha256'],sharedWith=entry['id'],frames=source['frames']))
radar_masks={
    'allied':[(12,7),(43,10),(83,2),(127,8),(155,7),(150,42),(105,52),(87,106),(75,102),(56,53),(13,39)],
    'soviet':[(84,3),(97,28),(119,37),(140,43),(118,63),(125,103),(87,93),(62,107),(51,71),(29,41),(58,32),(69,11)],
    'yuri':[(23,5),(146,5),(151,21),(130,55),(97,96),(84,107),(67,77),(20,18)],
}
for side in ['allied','soviet','yuri']:
    master=art/'ui-controls-v1'/f'{side}-radar.png'
    if not master.exists(): continue
    source=art/'ui-originals'/f'{side}-radar-0.png';original=Image.open(source).convert('RGBA').resize((672,440),Image.Resampling.LANCZOS)
    candidate=Image.open(master).convert('RGBA').resize((672,440),Image.Resampling.LANCZOS)
    mask=Image.new('L',(672,440));draw=ImageDraw.Draw(mask)
    draw.polygon([(x*4,y*4) for x,y in radar_masks[side]],fill=255)
    draw.rectangle((0,0,12*4,440),fill=255);draw.rectangle((156*4,0,672,440),fill=255)
    image=Image.composite(candidate,original,mask.filter(ImageFilter.GaussianBlur(2)))
    image.putalpha(original.getchannel('A'))
    write_image(image,dict(id=side+'-radar-base',file=side+'-radar-base.png',logicalWidth=168,logicalHeight=110))
    ledger.append(dict(id=side+'-radar-base',master=str(master.relative_to(root)),masterSha256=sha(master),
        status='DORMANT_ART_REVIEW_PENDING' if side=='yuri' else 'ART_REVIEW_PENDING',frames=33,
        transition='Original darkening and flash maps composite over one restored base; original timing retained.'))
master=art/'ui-controls-v1/menu-buttons.png';sheet=Image.open(master).convert('RGBA');buttons=[]
for f in [0,1,2,3,4,16]:
    x,y=f%4*160,f//4*48
    crop=sheet.crop((round(x/640*sheet.width),round(y/240*sheet.height),round((x+156)/640*sheet.width),round((y+42)/240*sheet.height)))
    buttons.append(crop.resize((624,168),Image.Resampling.LANCZOS))
atlas=Image.new('RGBA',(2496,840));offsets=[5,20,44,79,123,156]
for f in range(17):
    if f<5: image=buttons[f].copy()
    else:
        image=buttons[5].copy();delta=offsets[(f-5)%6]*4
        if delta<624:
            panel=buttons[1 if f<11 else 0].crop((0,0,624-delta,168));image.paste(panel,(delta,0))
    original=Image.open(art/'ui-originals'/f'menu-sdbtnanm-{f}.png').convert('RGBA').resize((624,168),Image.Resampling.LANCZOS)
    image=Image.alpha_composite(original,image);image.putalpha(original.getchannel('A'))
    atlas.paste(image,((f%4)*624,(f//4)*168))
write_image(atlas,dict(id='menu-button-states',file='menu-button-states.png',logicalWidth=624,logicalHeight=210))
ledger.append(dict(id='menu-button-states',frames=17,master=str(master.relative_to(root)),masterSha256=sha(master),
    source='ra2.mix/neutral.mix/sdbtnanm.shp',slideOffsets=offsets,status='ART_REVIEW_PENDING'))
video={}
for mode,size in [('original',(632,570)),('hd',(1896,1710))]:
    source=art/'original-screens'/f'menu-{mode}.webm';target=out/source.name
    if target.exists(): assert sha(source)==sha(target)
    else: shutil.copy2(source,target)
    video[mode]=dict(file=target.name,sha256=sha(target),width=size[0],height=size[1])
manifest=dict(schemaVersion=1,revision=revision,assets=assets,menuVideo=video)
data=(json.dumps(manifest,indent=2)+'\n').encode()
target=out/'manifest.json'
if target.exists(): assert target.read_bytes()==data
target.write_bytes(data)
(root/'.local/ui-selection.json').write_text(json.dumps(dict(schemaVersion=1,revision=revision,sha256=sha(target),reviewOnly=True),indent=2)+'\n')
(art/f'{revision}-ledger.json').write_text(json.dumps(dict(revision=revision,status='ART_REVIEW_PENDING',acceptedCameos=12,
    loadingUnits=9,controlFamilies=42,dormantYuriFamilies=22,assets=ledger,video='Original BIK content; deterministic Lanczos 3x, no new invented frame detail.'),indent=2)+'\n')
print(json.dumps(dict(revision=revision,assets=len(assets),manifestSha256=sha(target),totalPngBytes=sum((out/a['file']).stat().st_size for a in assets))))
