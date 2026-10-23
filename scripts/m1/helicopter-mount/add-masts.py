"""Add stationary bearing housings without altering any accepted atlas."""
import hashlib
import json
import os
from pathlib import Path

root = Path.cwd()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
changes = {}
for pack, old_revision, new_revision, masts in [
    ('allied-shad-vxl', 'mount-r5', 'mount-r6', {'CYLINDER18': [12, 4.2], 'CYLINDER09': [4, 2.6]}),
    ('yr-soviet-schp-vxl', 'mount-r4', 'mount-r5', {'CYLINDER19': [5, 2.6]}),
]:
    old = root / '.local/hd-packs' / pack / old_revision
    new = old.parent / new_revision
    new.mkdir(exist_ok=False)
    m = json.loads((old / 'manifest.json').read_text())
    m['revision'] = new_revision
    for p in m['parts']:
        if p['section'] in masts:
            height, radius = masts[p['section']]
            p['rotorMast'] = {'height': height, 'baseRadius': radius}
        for f in p['files'].values():
            assert sha(old / f['file']) == f['sha256']
            os.link(old / f['file'], new / f['file'])
    m['stationaryMastCorrection'] = {'previousSha256': sha(old / 'manifest.json'),
        'policy': 'Stationary housing joins the airframe to the rotating hub; atlas pixels remain unchanged'}
    (new / 'manifest.json').write_text(json.dumps(m, indent=2) + '\n')
    changes[pack] = (old, new, sha(old / 'manifest.json'), sha(new / 'manifest.json'))

old, new, oh, nh = changes['allied-shad-vxl']
p = root / 'desktop/allied-unit-contracts.json'
m = json.loads(p.read_text())
assert m['vxl']['SHAD']['hash'] == oh
m['vxl']['SHAD'].update(hash=nh, path=str(new.relative_to(root / '.local')) + '/manifest.json')
p.write_text(json.dumps(m, indent=2) + '\n')

old, new, oh, nh = changes['yr-soviet-schp-vxl']
old_family = root / '.local/hd-packs/yr-soviet-schp-family/mount-r4/family.json'
new_family = old_family.parent.parent / 'mount-r5/family.json'
new_family.parent.mkdir(exist_ok=False)
family = json.loads(old_family.read_text())
family['revision'] = 'mount-r5'
family['requiredVxl'] = {'path': str(new.relative_to(root / '.local')) + '/manifest.json', 'sha256': nh}
new_family.write_text(json.dumps(family, indent=2) + '\n')
for name in ['desktop/hd-profile.mjs', 'src/engine/renderable/unitVxl/identities.ts',
             'src/engine/renderable/builder/sovietUnitHdFamilies.ts']:
    p = root / name
    text = p.read_text().replace(oh, nh).replace(sha(old_family), sha(new_family))
    text = text.replace('yr-soviet-schp-vxl/mount-r4/', 'yr-soviet-schp-vxl/mount-r5/')
    text = text.replace('yr-soviet-schp-family/mount-r4/', 'yr-soviet-schp-family/mount-r5/')
    p.write_text(text)
print(json.dumps({pack: values[3] for pack, values in changes.items()}))
