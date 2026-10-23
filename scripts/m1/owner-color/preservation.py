"""Verify every selected frame retains base pixels, native geometry and data coverage."""
import hashlib
import json
from pathlib import Path
import numpy as np
from audit import world_manifests, frames, load_pair

root = Path('.artifacts/owner-remap-r1')
before = json.loads((root / 'registered-before.json').read_text())
after = json.loads((root / 'registered-final.json').read_text())
mapping = json.loads((root / 'correction-map-final.json').read_text())
assert before['availability'] == after['availability']
assert len(before['routes']) == len(after['routes'])
local = Path('.local').resolve()
checked, pairs, bases = [], {}, {}
for old in world_manifests(before):
    relative = str(old.relative_to(local))
    new = local / mapping['paths'].get(relative, relative)
    a, b = json.loads(old.read_text()), json.loads(new.read_text())
    old_frames, new_frames = list(frames(a, old.parent)), list(frames(b, new.parent))
    assert len(old_frames) == len(new_frames)
    for x, y in zip(old_frames, new_frames):
        assert {k:v for k,v in x.items() if k not in ('base','data')} == {k:v for k,v in y.items() if k not in ('base','data')}
        base_key = (x['base'], y['base'])
        if base_key not in bases:
            bases[base_key] = hashlib.sha256(x['base'].read_bytes()).hexdigest()
            assert bases[base_key] == hashlib.sha256(y['base'].read_bytes()).hexdigest()
        key = (x['base'],x['data'],y['data'])
        if key not in pairs:
            _, d0 = load_pair(x['base'],x['data']); _, d1 = load_pair(y['base'],y['data'])
            assert d0.shape == d1.shape
            assert np.array_equal(d0[...,2:],d1[...,2:]), key
            assert np.all((d0[...,0] < 128) | (d1[...,0] >= 128)), key
            assert np.array_equal(d0[...,1][d0[...,0] >= 128],d1[...,1][d0[...,0] >= 128]), key
            assert np.all(d1[...,1][d1[...,0] >= 128] <= 15), key
            pairs[key] = True
    if 'source' in a: assert a['source'] == b['source']
    checked.append({'before':str(old),'after':str(new),'frames':len(old_frames)})
report = {'status':'PASS_IMMUTABLE_BASE_GEOMETRY_AND_COVERAGE', 'manifests':len(checked),
    'frames':sum(x['frames'] for x in checked),'basePairs':len(bases),'dataPairs':len(pairs),
    'routes':len(before['routes']),'availability':'UNCHANGED',
    'preserved':'Base bytes, original masks and their shade indices, native frame/heading rectangles, alpha and depth channels, retail source identity',
    'rows':checked}
(root / 'preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k != 'rows'}))
