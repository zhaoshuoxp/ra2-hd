"""Keep the rear bearing slender and give the Soviet main disk roof clearance."""
import hashlib
import json
import os
from pathlib import Path

root = Path.cwd()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
changes = []
for pack, old_revision, revision in [('allied-shad-vxl', 'mount-r6', 'mount-r7'),
                                     ('yr-soviet-schp-vxl', 'mount-r5', 'mount-r6')]:
    old = root / '.local/hd-packs' / pack / old_revision
    new = old.parent / revision
    new.mkdir(exist_ok=False)
    m = json.loads((old / 'manifest.json').read_text())
    m['revision'] = revision
    for p in m['parts']:
        if p['section'] == 'CYLINDER18':
            p['rotorMast']['baseRadius'] = 1.8
        if p['section'] == 'CYLINDER19':
            for f in p['frames']:
                f['rotorMountOffset'] = [0, 0, 6]
        for f in p['files'].values():
            assert sha(old / f['file']) == f['sha256']
            os.link(old / f['file'], new / f['file'])
    (new / 'manifest.json').write_text(json.dumps(m, indent=2) + '\n')
    changes.append((pack + '/' + old_revision, pack + '/' + revision, sha(old / 'manifest.json'), sha(new / 'manifest.json')))

old_family = root / '.local/hd-packs/yr-soviet-schp-family/mount-r5/family.json'
new_family = old_family.parent.parent / 'mount-r6/family.json'
new_family.parent.mkdir(exist_ok=False)
f = json.loads(old_family.read_text())
f['revision'] = 'mount-r6'
f['requiredVxl'] = {'path': 'hd-packs/' + changes[1][1] + '/manifest.json', 'sha256': changes[1][3]}
new_family.write_text(json.dumps(f, indent=2) + '\n')
changes.append(('yr-soviet-schp-family/mount-r5', 'yr-soviet-schp-family/mount-r6', sha(old_family), sha(new_family)))
for name in ['desktop/allied-unit-contracts.json', 'desktop/hd-profile.mjs',
             'src/engine/renderable/unitVxl/identities.ts', 'src/engine/renderable/builder/sovietUnitHdFamilies.ts']:
    p = root / name
    text = p.read_text()
    for old, new, old_hash, new_hash in changes:
        text = text.replace(old_hash, new_hash).replace(old + '/', new + '/')
    p.write_text(text)
print(json.dumps(changes))
