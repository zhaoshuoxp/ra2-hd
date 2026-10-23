"""Check six bounded opening repairs, source registration and preserved context."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from buildup import read, sha, write
from painted_rig import over, place

parser = argparse.ArgumentParser(description=__doc__)
for name in ['baseline', 'rigs', 'output']:
    parser.add_argument(name, type=Path)
args = parser.parse_args()
authority, rigs = read(args.baseline), read(args.rigs)
assert len(rigs) == 6
rows = []
for key, rig in rigs.items():
    record = next(r for r in authority['families'] if r['key'] == key)
    assert not rig['unselectedGeometryViolations'], (key, rig['unselectedGeometryViolations'])
    source = read(record['nativeSource'])
    member = record['newMember']
    logical = read(Path('.local/hd-packs')/member['packId']/member['revision']/'manifest.json')['logical']
    assert len(rig['phases']) == record['frames'] == 25
    assert rig['phases'][-1] == record['componentRig']['phases'][-1]
    checked = preserved = 0
    for p, nodes in enumerate(rig['phases'][:-1]):
        x, y = logical['frames'][p]['trimOrigin']
        w, h = logical['frames'][p]['trimSize']
        for node in nodes:
            assert sha(node['image']) == node['sha256']
            image = place(Image.open(node['image']), node['box'], source['canvas'])
            outside = image[...,3].copy()
            outside[y*4:(y+h)*4, x*4:(x+w)*4] = 0
            assert not outside.any(), (key,p,node['name'],'Outside original logical canvas')
            reference = node.get('rigidPart',{}).get('reference',{})
            for field in ['code','image','family']:
                if field in reference:
                    assert sha(reference[field]) == reference['sha256'], (key,p,'Changed source')
            if 'surfaceImage' in reference:
                assert sha(reference['surfaceImage']) == reference['surfaceSha256']
            checked += 1
        for old in record['componentRig']['phases'][p]:
            changed = old['name'] in {'sliding-curved-casing','pivoting-crane-housing'}
            changed |= record['identity'] == 'NAHAND' and p < 7 and old['name'].startswith(('front-opening-wall-','rear-opening-wall-'))
            if not changed:
                assert old in nodes, (key,p,old['name'],'Unchanged context lost')
                preserved += 1
        if record['identity'] == 'GAREFN' and p >= 11:
            arches = [n for n in nodes if n['name'].startswith('telescoping-curved-shell-')]
            assert len(arches) == 2
            assert all(n['rigidPart']['extension'] == {11:.16,12:.38,13:.62,14:.83}.get(p,1.) for n in arches)
            if p >= 16:
                assert all(n['rigidPart']['translation'] == [0.,0.] for n in arches)
        if record['identity'] == 'GAYARD':
            for n in nodes:
                if n['name'] == 'vertical-crane-housing':
                    assert n['rigidPart']['translation'][0] == 0
                    assert n['rigidPart']['rotationDegrees'] == 0
            assert not any(n['name'] == 'pivoting-crane-housing' for n in nodes)
        if record['identity'] == 'NAHAND':
            if 3 <= p <= 6:
                covers = [n for n in nodes if 'well-cover-' in n['name']]
                assert covers and all(n['rigidPart']['openingDegrees'] == {3:0,4:30,5:65,6:110}[p] for n in covers)
                assert not any(n['name'] == 'statue-from-open-well' for n in nodes)
            if 7 <= p <= 15:
                assert any(n['name'] == 'statue-from-open-well' for n in nodes)
                assert all(n['rigidPart']['openingDegrees'] == 110 for n in nodes if 'well-cover-' in n['name'])
    rows.append({'key':key, 'componentImagesChecked':checked, 'preservedContextNodes':preserved})
    if record['identity'] == 'GAREFN':
        old = next(n for n in record['componentRig']['phases'][23] if n['name'] == 'sliding-curved-casing')
        expected = place(Image.open(old['image']),old['box'],source['canvas'])
        composite = np.zeros_like(expected)
        for n in rig['phases'][23]:
            if n['name'].startswith('telescoping-curved-shell-') or n['name'] in {'preserved-rear-curved-casing','fixed-front-roof-connector'}:
                composite = over(composite,place(Image.open(n['image']),n['box'],source['canvas']))
        assert np.array_equal(composite[...,3],expected[...,3]), (key,'Completed shell coverage or registration changed')
        # Placing the saved straight-alpha parts adds one existing helper conversion.
        # Its measured rounding allowance never permits geometry/alpha differences.
        delta = np.abs(composite[...,:3].astype(int)-expected[...,:3].astype(int))
        assert delta.max() <= 1, (key,'Completed shell material changed')
        rows[-1]['completedShellAlphaDifferentPixels'] = 0
        rows[-1]['completedShellMaxRgbRounding'] = int(delta.max())
write(args.output, {'status':'PASS_SIX_OPENING_REPAIRS_BOUNDS_PROVENANCE_AND_PRESERVED_CONTEXT',
    'baseline':str(args.baseline), 'baselineSha256':sha(args.baseline),
    'rigs':str(args.rigs), 'rigsSha256':sha(args.rigs), 'rows':rows,
    'visualAcceptance':'PENDING', 'windows':'NOT_RUN'})
print('Six opening repairs pass source, geometry, stage order and unchanged-context checks')
