"""Verify R3's bounded corrections against delivered R2 pixels and accepted art."""
import hashlib
import json
from pathlib import Path
from PIL import Image
import numpy as np

root = Path('.artifacts/soviet-remaining')
selection = json.loads((root/'production-selection-r4.json').read_text())
prior = json.loads((root/'production-selection-r3.json').read_text())
changed_rgb = {'NAPSIS': {'ngpsis.shp', 'ngpsis_a.shp'}, 'TESLA': {'ngtsla_a.shp', 'ngtsla_b.shp'},
               'NADEPT': {'ngdept.shp', 'ngdeptbb.shp', 'ngdept_b.shp', 'ngdept_c.shp'},
               'NAYARD': {'ngyard.shp', 'ngyard_a.shp', 'ngyard_d.shp', 'ngyard_s.shp'}}
first = ['NAHAND','NAREFN','NAWEAP','NACNST']
for name in first:
    selection[name] = {'exports': f'.artifacts/m1-6b/full-exports-animation-r5/{name}'}
    prior[name] = {'exports': f'.artifacts/m1-6b/full-exports-animation-r4/{name}'}
report = {'status':'PASS_BOUNDED_R3_EXPORTS', 'families':{}, 'constructionRgbPreserved':0, 'otherRgbPreserved':0}
for name, info in selection.items():
    directory=Path(info['exports']); old=Path(prior[name]['exports']); data=json.loads((directory/'candidate-review.json').read_text())
    rgb_same=rgb_changed=builds=0
    for row in data['frames']:
        for e in row['exports']:
            same=(directory/e['base']).read_bytes()==(old/e['base']).read_bytes()
            if row['member'] not in changed_rgb.get(name,set()):assert same,(name,e['base'],'out of scope RGB change')
            if 'mk.shp' in row['member']:assert same;builds+=1
            rgb_same+=int(same);rgb_changed+=int(not same)
    if name in ['NADEPT','NAYARD']:
        rows=data['correctionScope']['metrics'];assert max(v['hookClippedPixels'] for v in rows)==0
    report['families'][name]={'rgbPreserved':rgb_same,'rgbChanged':rgb_changed,'constructionFramesPreserved':builds}
    report['constructionRgbPreserved']+=builds;report['otherRgbPreserved']+=rgb_same-builds
# Compare full-canvas fixed socket pixels, independent of changing native trims.
dir=Path(selection['NAPSIS']['exports']);raw=json.loads((root/'source-v1/NAPSIS/ngpsis_a.shp.json').read_text())
for start in [0,40]:
    reference=None;hashes=[]
    for n in range(start,start+40):
        frame=raw['frames'][n];im=Image.new('RGBA',tuple(v*2 for v in raw['canvas']));im.alpha_composite(Image.open(dir/f'ngpsis_a-{n:02}-2x.png'),(frame['x']*2,frame['y']*2))
        socket=np.array(im)[180:206,244:282]
        if reference is None:reference=socket
        assert np.array_equal(socket,reference),(n,'socket displacement')
        hashes.append(hashlib.sha256(im.tobytes()).hexdigest())
    assert len(set(hashes[:39]))==39,'nearest-pose holds remain'
report['sensor']={'normalAndDamagedSocketPixels':'IDENTICAL_ALL_80_FRAMES','uniqueNativePosesPerLoop':39,'wholeMastTranslation':[0,0]}
feedback=json.loads((root/'feedback-r3/feedback.json').read_text())
for row in feedback['preservedArt']:
    path,sha=row['path'],row['sha256']
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==sha,path
report['acceptedArtFiles']=len(feedback['preservedArt'])
(root/'feedback-r3/export-scope-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
