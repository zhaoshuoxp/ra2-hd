"""Validate actual exported pixels, native contracts, selected pins and preservation."""
import json
import subprocess
import numpy as np
from pathlib import Path
from PIL import Image
from atlas import Member, read, write, sha

base = 'ee35fcf04de2d24c1bce2ee7497e4156483b21f1'
catalog = read('desktop/allied-building-coverage.json')
units = read('desktop/allied-unit-contracts.json')
baseline_catalog = json.loads(subprocess.check_output(['git','show',base+':desktop/allied-building-coverage.json']))
baseline_units = json.loads(subprocess.check_output(['git','show',base+':desktop/allied-unit-contracts.json']))
rows = []
for key in ('gaairc-temperate','gaairc-snow','atesla-temperate','atesla-snow','E1'):
    entry = units['shp']['E1'] if key == 'E1' else catalog[key]
    original = baseline_units['shp']['E1'] if key == 'E1' else baseline_catalog[key]
    family = read(Path('.local')/entry['familyPath']); old = read(Path('.local')/original['familyPath'])
    assert sha(Path('.local')/entry['familyPath']) == entry['familyHash']
    for member, previous in zip(family['members'],old['members'],strict=True):
        current = Member(Path('.local/hd-packs')/member['packId']/member['revision'])
        accepted = Member(Path('.local/hd-packs')/previous['packId']/previous['revision'])
        assert current.manifest['source'] == accepted.manifest['source']
        assert current.manifest['logical'] == accepted.manifest['logical']
        assert sha(current.root/'manifest.json') == member['sha256']
        changed_slots = {2:[],4:[]}
        for variant in current.manifest['variants']:
            density = variant['density']
            for page in variant['pages']:
                base_pixels = np.asarray(current.pages[density,page['id'],'base'])
                data = np.asarray(current.pages[density,page['id'],'data'])
                assert (data[...,1] <= 15).all() and (data[...,2] == 0).all() and (data[...,3] == 255).all()
                assert not ((base_pixels[...,3]==0)&(data[...,0]>0)).any()
                mask = np.zeros(base_pixels.shape[:2],dtype=bool)
                for frame in variant['frames']:
                    if frame['page'] != page['id']: continue
                    x,y,w,h = frame['contentRect']; logical = current.manifest['logical']['frames'][frame['nativeFrame']]
                    if not logical['empty']: mask[y:y+h,x:x+w] = True
                assert not ((base_pixels[...,3]>0)&~mask).any(), (key,member['member'],density,'padding')
                assert not ((data[...,0]>0)&~mask).any()
                for role in ('base','data'): assert sha(current.root/page[role]) == page[role+'Sha256']
            for n in range(len(current.manifest['logical']['frames'])):
                if current.frame(density,n).tobytes() != accepted.frame(density,n).tobytes(): changed_slots[density].append(n)
                if key == 'E1' and (n<315 or n>362):
                    for role in ('base','data'): assert current.frame(density,n,role).tobytes() == accepted.frame(density,n,role).tobytes(), (n,density,role)
            if key == 'E1':
                assert changed_slots[density] == list(range(315,363))
                for n in range(315,363):
                    new,old=np.asarray(current.frame(density,n)),np.asarray(accepted.frame(density,n))
                    black=lambda a:(a[...,3]>0)&(a[...,:3].max(axis=2)<8)
                    assert not (black(new)&~black(old)).any(),(n,density,'expanded embedded ground patch')
            if member['revision'] == previous['revision']: assert sha(current.root/'manifest.json') == previous['sha256']
        rows.append(dict(family=key,member=member['member'],revision=member['revision'],changedSlots=changed_slots))
for key,entry in catalog.items():
    if key not in ('gaairc-temperate','gaairc-snow','atesla-temperate','atesla-snow'): assert entry==baseline_catalog[key]
for kind in ('shp','vxl'):
    for key,entry in units[kind].items():
        if key!='E1': assert entry==baseline_units[kind][key]
write('.artifacts/allied-corrections/resource-validation.json',dict(status='PASS_SELECTED_RESOURCE_AND_PRESERVATION_CONTRACTS',base=base,rows=rows))
print('PASS: selected pins, native geometry, actual RGBA/data, empty slots, untouched families and GI controls')
