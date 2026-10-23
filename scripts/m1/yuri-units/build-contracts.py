"""Pin complete Yuri families and both independently authored densities."""
import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
a = p.parse_args()
root = Path('.artifacts/yuri-units')
staged = root / 'staged-packs'
shp = json.loads((root / 'shp-production-v2/worklist.json').read_text())['families']
boards = json.loads((root / 'vxl-production-v1/worklist.json').read_text())['boards']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
catalog = {'status': 'COMPLETE_ART_RUNTIME_AND_FINAL_ACCEPTANCE_PENDING', 'shp': {}, 'vxl': {}}

for identity in ['LTNK', 'YHVR', 'PCV', 'SMIN', 'YTNK', 'TELE', 'CAOS', 'BSUB', 'MIND', 'DISK']:
    required = [b for b in boards if b['family'] == identity]
    assert required and all(b.get('visualQa') == 'PASS' and not b.get('pendingCorrectionHeadings') for b in required)
    variants = []
    members = sorted({b['sourceMember'] for b in required})
    for density in [2, 4]:
        relative = f'yuri-{identity.lower()}-vxl/r1-{density}x/manifest.json'
        path = staged / relative
        m = json.loads(path.read_text())
        assert m['identity'] == identity and m['density'] == density
        assert sorted((b['identity'], b['part']) for b in required) == sorted((v['actor'], v['key']) for v in m['parts'])
        assert sorted(n for n in m['sources'] if n.endswith('.vxl')) == members
        assert all(len(part['frames']) == 8 and all(f['availableAuthoredDensity'] >= 4 for f in part['frames']) for part in m['parts'])
        variants.append({'density': density, 'path': 'hd-packs/' + relative, 'hash': sha(path)})
    catalog['vxl'][identity] = {'edition': 'yr', 'members': members, **variants[-1], 'variants': variants}

for actor in ['INIT', 'BRUTE', 'YURIPR', 'VIRUS', 'SLAV']:
    identity = 'SMIN' if actor == 'SLAV' else actor
    members, contracts = [], []
    for native in shp[actor]['members']:
        assert all(b.get('visualQa') == 'PASS' for b in native['batches'])
        source = json.loads(Path(native['sourceFile']).read_text())
        path = staged / f'yuri-{Path(native["sourceMember"]).stem}-authored/r1/manifest.json'
        m = json.loads(path.read_text())
        assert m['rulesIdentities'] == [identity] and m['source']['sha256'] == source['sha256'] == native['sourceSha256']
        assert m['source']['member'] == native['sourceMember']
        assert len(m['logical']['frames']) == native['requiredSlots']
        assert sorted(v['density'] for v in m['variants']) == [2, 4]
        members.append({'member': native['sourceMember'], 'packId': m['packId'], 'revision': m['packRevision'], 'sha256': sha(path)})
        contracts.append({'member': native['sourceMember'], 'frames': native['requiredSlots'],
                          'totalFrames': source['totalFrames'], 'canvas': source['canvas'],
                          'sourceHash': source['sha256'], 'manifestHash': sha(path)})
    family = {'identity': identity, 'theater': 'TEMPERATE', 'members': members}
    if identity == 'SMIN':
        vxl = catalog['vxl'][identity]
        family['requiredVxl'] = {'path': vxl['path'], 'sha256': vxl['hash'], 'variants': vxl['variants']}
    relative = f'yuri-{identity.lower()}-family/r1/family.json'
    path = staged / relative
    data = json.dumps(family, indent=2) + '\n'
    if path.exists():
        assert path.read_text() == data, 'Family revision is immutable'
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)
    catalog['shp'][identity] = {'identity': identity, 'edition': 'yr', 'selection': f'unit-yr-{identity.lower()}',
                              'familyPath': 'hd-packs/' + relative, 'hash': sha(path), 'familyHash': sha(path),
                              'members': contracts, 'projectiles': [], **({'sameDensity': True} if identity == 'SMIN' else {})}

a.output.parent.mkdir(parents=True, exist_ok=True)
with a.output.open('x') as file:
    file.write(json.dumps(catalog, indent=2) + '\n')
print(json.dumps({'shp': len(catalog['shp']), 'vxl': len(catalog['vxl']), 'newRoots': 14, 'children': ['SLAV', 'CMISL']}))
