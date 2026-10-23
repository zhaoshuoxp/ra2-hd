"""Restore fixed helicopter joints and raise the Soviet main rotor clearance."""
import hashlib
import json
import os
from pathlib import Path

root = Path.cwd()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def revise(pack, previous, revision, adjust):
    old = root / '.local/hd-packs' / pack / previous
    new = old.parent / revision
    new.mkdir(exist_ok=False)
    m = json.loads((old / 'manifest.json').read_text())
    m['revision'] = revision
    adjust(m)
    for part in m['parts']:
        for file in part['files'].values():
            assert sha(old / file['file']) == file['sha256']
            os.link(old / file['file'], new / file['file'])
    m['mountCorrection'] = {'previousSha256': sha(old / 'manifest.json'),
        'policy': 'Fixed native-parent mount; no height changes with body bearing',
        'atlasBytes': 'UNCHANGED', 'bodyRegistration': 'UNCHANGED'}
    (new / 'manifest.json').write_text(json.dumps(m, indent=2) + '\n')
    return new, sha(new / 'manifest.json')


def allied(m):
    for p in m['parts']:
        if p['section'] == 'CYLINDER18':
            for f in p['frames']:
                f['rotorMountOffset'] = [9.75, 0, -3.5]


def soviet(m):
    for p in m['parts']:
        if p['member'] == 'schp.vxl' and p['section'] == 'CYLINDER19':
            p['frames'][0]['rotorAnchor'] = [174 / 350, 79 / 180]
            for f in p['frames']:
                f['rotorMountOffset'] = [0, 0, 3]


ap, ah = revise('allied-shad-vxl', 'rotor-r2', 'mount-r5', allied)
sp, sh = revise('yr-soviet-schp-vxl', 'owner-r3', 'mount-r4', soviet)
catalog_path = root / 'desktop/allied-unit-contracts.json'
catalog = json.loads(catalog_path.read_text())
catalog['vxl']['SHAD'].update(hash=ah, path=str(ap.relative_to(root / '.local')) + '/manifest.json')
catalog_path.write_text(json.dumps(catalog, indent=2) + '\n')

old_family = root / '.local/hd-packs/yr-soviet-schp-family/owner-r3/family.json'
new_family = old_family.parent.parent / 'mount-r4/family.json'
new_family.parent.mkdir(exist_ok=False)
family = json.loads(old_family.read_text())
family['revision'] = 'mount-r4'
family['requiredVxl'] = {'path': 'hd-packs/yr-soviet-schp-vxl/mount-r4/manifest.json', 'sha256': sh}
new_family.write_text(json.dumps(family, indent=2) + '\n')
fh = sha(new_family)
for name in ['desktop/hd-profile.mjs', 'src/engine/renderable/unitVxl/identities.ts',
             'src/engine/renderable/builder/sovietUnitHdFamilies.ts']:
    p = root / name
    text = p.read_text().replace('5f3f37a2b5c8f0b7015223e3c0183fd3ea779184343bb423651b60f5a2e3f882', sh)
    text = text.replace('af23dfd7221207e22558804350173e93d80c2710cc02623155037270b1f781de', fh)
    text = text.replace('yr-soviet-schp-vxl/owner-r3/', 'yr-soviet-schp-vxl/mount-r4/')
    text = text.replace('yr-soviet-schp-family/owner-r3/', 'yr-soviet-schp-family/mount-r4/')
    p.write_text(text)
print(json.dumps({'SHAD': ah, 'SCHP': sh, 'SCHP-family': fh}))
