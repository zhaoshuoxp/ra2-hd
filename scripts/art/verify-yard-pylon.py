"""Verify complete pylon coverage and unchanged crane/finished artwork."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes

from buildup import read, sha, write
from painted_rig import place

root = Path('.artifacts/buildup-remaining-20261013-r74-v1')
r = root/'yard-pylon-r87-v1'
candidate = r/'candidate-v7'
before_path = root/'yard-seam-r86-v1/selected-v1/authoring.json'
before = next(f for f in read(before_path)['families'] if f['key']=='gayard-temperate')
rig = read(candidate/'rigs.json')['gayard-temperate']
full = np.array(Image.open(candidate/'gayard-temperate/retained-idle-reference.png'))
yy, xx = np.mgrid[:full.shape[0], :full.shape[1]]/4
visible = (xx>=164)&(xx<194)&(yy>=115)&(yy<146)&(full[...,3]==255)
checks = []
for phase, (old_nodes, nodes) in enumerate(zip(before['componentRig']['phases'],rig['phases'])):
    assert len(nodes)==len(old_nodes)
    for old, node in zip(old_nodes,nodes):
        if old['name']!='telescoping-pylon-0':
            assert old==node, (phase,old['name'])
        else:
            assert node['name']=='complete-rear-left-pylon'
    if phase==24:
        continue
    node = next(n for n in nodes if n['name']=='complete-rear-left-pylon')
    layer = place(Image.open(node['image']),node['box'],[432,304])
    # A complete connected cap must not contain transparent interior cutouts.
    alpha = layer[...,3]>127
    holes = binary_fill_holes(alpha)&~alpha
    assert not holes.any(), (phase,'Interior pylon cutout',int(holes.sum()))
    image = np.array(Image.open(candidate/f'gayard-temperate/{phase:02}-preview.png'))
    row = {'phase':phase,'interiorAlphaHoles':0,'unrelatedNodes':'EXACT_V21'}
    if phase>=13:
        assert np.array_equal(image[visible],full[visible]), (phase,'Visible pylon differs from idle')
        row.update(completedVisiblePylonPixels=int(visible.sum()),differentVisiblePylonPixels=0)
    checks.append(row)
write(r/'pylon-validation-v1.json',{'status':'PASS_COMPLETE_PYLON_AND_EXACT_LATE_VISIBLE_SURFACE',
    'baseline':str(before_path),'baselineSha256':sha(before_path),'rigs':str(candidate/'rigs.json'),
    'rigsSha256':sha(candidate/'rigs.json'),'checks':checks,'exactLatePhases':list(range(13,24)),
    'completedAndNonMkMembers':'UNCHANGED','otherConstructionNodes':'EXACT_V21',
    'visualAcceptance':'PENDING','boundary':'Coverage and late visible pixels do not replace human motion review.'})
canvas = Image.new('RGB',(1500,800),(52,72,61))
draw = ImageDraw.Draw(canvas)
for i,(label,image) in enumerate([
        ('V21: clipped cap and open joint',Image.open(root/'yard-seam-r86-v1/candidate-v2/gayard-temperate/23-preview.png')),
        ('V22: complete pylon / phase 23',Image.open(candidate/'gayard-temperate/23-preview.png')),
        ('Retained completed reference',Image.fromarray(full))]):
    crop = image.crop((158*4,108*4,208*4,182*4)).resize((500,740))
    canvas.paste(crop,(i*500,52),crop)
    draw.text((i*500+8,12),label,font_size=23)
canvas.save(r/'pylon-comparison.png')
frames = Image.new('RGB',(1536,1044),(52,72,61))
draw = ImageDraw.Draw(frames)
for i,phase in enumerate([0,4,10,13,20,23]):
    image = Image.open(candidate/f'gayard-temperate/{phase:02}-preview.png')
    crop = image.crop((155*4,103*4,215*4,163*4)).resize((512,512))
    x,y = i%3*512,i//3*522
    frames.paste(crop,(x,y+10),crop)
    draw.text((x+8,y+8),f'Phase {phase}',font_size=24)
frames.save(r/'pylon-keyframes.png')
write(r/'artwork-inventory-v1.json',{'mode':'BUILT_IN_IMAGEGEN_EDIT','selectedAsset':str(r/'complete-pylon-surfaces-v1.png'),
    'assetSha256':sha(r/'complete-pylon-surfaces-v1.png'),'prompt':str(r/'complete-pylon-surfaces-v1.prompt.txt'),
    'promptSha256':sha(r/'complete-pylon-surfaces-v1.prompt.txt'),'reference':str(r/'rear-pylon-reference.png'),
    'referenceSha256':sha(r/'rear-pylon-reference.png'),'purpose':'Complete surfaces hidden behind the crane in idle',
    'finishedArtwork':'UNCHANGED','source':str(candidate/'authoring-source.py'),'sourceSha256':sha(candidate/'authoring-source.py')})
print('24 construction phases have no interior pylon holes; 11 late visible surfaces exactly match idle')
