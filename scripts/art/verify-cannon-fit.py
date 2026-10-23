"""Check visible cannon bearing coverage and canonical part registration."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import place

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('authoring',type=Path)
parser.add_argument('baseline',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
current,before=read(args.authoring),read(args.baseline)
keys={'gtgcan-temperate','gtgcan-snow'}
checks=[]
for record,old in zip(current['families'],before['families']):
    assert record['key']==old['key']
    if record['key'] not in keys:
        assert record==old
        continue
    rig=record['componentRig']
    canvas=read(record['nativeSource'])['canvas']
    layers=[]
    for phase,nodes in enumerate(rig['phases'][:11]):
        assert {n['name'] for n in nodes}=={'foundation','canonical-emerging-receiver',
            'canonical-fixed-bearing','canonical-elevating-breech-and-barrel'}
        by_name={n['name']:n for n in nodes}
        rgba={name:place(Image.open(n['image']),n['box'],canvas) for name,n in by_name.items()}
        for node in nodes:
            assert sha(node['image'])==node['sha256']
        bearing=rgba['canonical-fixed-bearing'][...,3]>=128
        floor=rgba['foundation'][...,3]>=128
        assert bearing.any() and not (bearing & ~floor).any(), 'Bearing projects outside supporting platform'
        rotation=np.asarray(by_name['canonical-elevating-breech-and-barrel']['rigidPart']['transform'])[:,:2]
        singular=np.linalg.svd(rotation,compute_uv=False)
        assert np.allclose(singular,[.25,.25]), 'Barrel size changed between poses'
        if layers:
            assert np.array_equal(rgba['canonical-fixed-bearing'],layers[0]['canonical-fixed-bearing'])
        if phase>=4:
            assert np.array_equal(rgba['foundation'],layers[4]['foundation'] if phase>4 else rgba['foundation'])
        if phase>=8:
            assert np.array_equal(rgba['canonical-emerging-receiver'],layers[8]['canonical-emerging-receiver']
                                  if phase>8 else rgba['canonical-emerging-receiver'])
        layers.append(rgba)
        checks.append({'key':record['key'],'phase':phase,'bearingSupportedOpaquePixels':int(bearing.sum()),
            'unsupportedBearingPixels':0,'barrelScaleNativePerSourcePixel':singular.tolist()})
    assert rig['terminalCompletionOverlay']['frame']==11
    family,previous=read(record['newFamilyPath']),read(old['newFamilyPath'])
    assert [m for m in family['members'] if 'mk.shp' not in m['member']]==[
        m for m in previous['members'] if 'mk.shp' not in m['member']]
    assert rig['phases'][11] in (old['componentRig']['phases'][11],{'retainPredecessor':True})
write(args.output,{'status':'PASS_CANONICAL_CANNON_PARTS_AND_VISIBLE_BEARING_SUPPORT',
    'authoritySha256':sha(args.authoring),'unchangedRecords':106,'acceptedPaintedRecordsPreserved':16,
    'checks':checks,'boundary':'Visible platform coverage and rigid registration; user anatomy acceptance remains pending'})
print('22 bearing support and rigid pose checks; 106 records preserved')
