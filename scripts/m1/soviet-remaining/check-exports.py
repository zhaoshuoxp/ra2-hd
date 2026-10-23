"""Check complete metadata, empty slots, owner shades and preserved source identities."""
import hashlib
import json
import sys
import os
from pathlib import Path
import numpy as np
from PIL import Image

root=Path('.artifacts/soviet-remaining')
revision=os.environ.get('SOVIET_VALIDATION', 'production-v1')
selection=json.loads((root/os.environ.get('SOVIET_SELECTION', 'production-selection-v1.json')).read_text())
check=json.loads((root/'production-checklist-v2.json').read_text())['families']
results={}
for family,info in check.items():
    members=info['members']
    if len(sys.argv)>2 and family not in sys.argv[2:]:continue
    directory=Path(selection[family]['exports'])
    report=json.loads((directory/'candidate-review.json').read_text())
    expected={(m['member'],n) for m in members for n in m['authorFrames']}
    assert {(f['member'],f['nativeFrame']) for f in report['frames']}==expected
    for path,registration in report['registrations'].items():
        if path == 'previous-candidate':
            prior = json.loads((root/'production-selection-v1.json').read_text())[family]['exports']
            assert Path(registration['path']).resolve() == Path(prior).resolve()
            binding = json.loads((Path('.local/hd-packs')/f'soviet-{family.lower()}-authored/1/family.json').read_text())
            assert hashlib.sha256((Path(prior)/'candidate-review.json').read_bytes()).hexdigest() == binding['candidateSha256']
            continue
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==registration['sha256']
        assert all(use['sourceDensity']>=2 for use in registration['uses'])
    sources={m['member']:json.loads((root/'source-v1'/family/(m['member']+'.json')).read_text()) for m in members}
    records=[]
    for frame in report['frames']:
        raw=sources[frame['member']]
        native=raw['frames'][frame['nativeFrame']]
        for e in frame['exports']:
            a=np.asarray(Image.open(directory/e['base']));data=np.asarray(Image.open(directory/e['data']));d=e['density']
            assert a.shape==(max(1,(native['height']+native['height']%2)*d),max(1,(native['width']+native['width']%2)*d),4)
            assert data.shape==a.shape
            assert np.all(data[...,2]==0) and np.all(data[...,3]==255) and np.all(data[...,1]<=15)
            assert not np.any((a[...,3]==0)&(data[...,0]>0))
            if native['empty']:assert not np.any(a[...,3])
            else:assert np.any(a[...,3]), (family,frame['member'],frame['nativeFrame'],'blank visible slot')
            # Logical padding is transparent; it must not become owner-colored.
            if native['height']%2:assert not np.any(a[-d:,:,3])
            if native['width']%2:assert not np.any(a[:,-d:,3])
            remap=data[...,0]>0
            for owner in ([24,80,255],[255,235,24]):
                ramp=np.floor(np.array(owner)[None,:]/255*np.array([63,59,55,52,48,44,41,37,33,30,26,22,19,15,11,8])[:,None]*4)
                recolored=a.copy();recolored[remap,:3]=ramp[data[...,1][remap]]
                assert np.array_equal(recolored[~remap],a[~remap])
            records.append(dict(member=frame['member'],frame=frame['nativeFrame'],density=d,empty=native['empty'],
                                ownerPixels=int(remap.sum()),shades=np.unique(data[...,1][remap]).tolist(),neutralUnchanged=True))
    results[family]=dict(status='PASS_EXPORT_CONTRACT',slots=len(expected),exports=len(records),checks=records)
    print(f'{family}: {len(expected)} native slots, {len(records)} exports checked',flush=True)
out=root/f'export-validation-{revision}.json'
out.write_text(json.dumps(dict(status='PASS_EXPORT_CONTRACT',families=results,visualAcceptance='PENDING_COMPLETE_FAMILY_REVIEW'),indent=2)+'\n')
