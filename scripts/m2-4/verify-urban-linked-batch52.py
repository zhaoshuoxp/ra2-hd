"""Independently verify the assembled patch against exact accepted pages and body proof."""
import copy
import hashlib
import json
from pathlib import Path

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-building-rubble-native-batch52-v1')
authoring = Path('.artifacts/m2-4/urban-building-rubble-authoring-batch52-v1')
assembly_file = root / 'linked-assembly-v1.json'
assembly = read(assembly_file)
body_file = Path(assembly['bodyVerification']['file'])
assert sha(body_file) == assembly['bodyVerification']['sha256']
body = read(body_file)
assert body['status'] == 'PASS' and body['counts']['densityFrames'] == 64
body_root = Path(body['pack'])
assert sha(body_root / 'manifest.json') == body['sha256']
body_pack = read(body_root / 'manifest.json')
source = {s['member']:s for s in read(root / 'source.json')['sources']}
contract_file = root / 'contract.json'
contract = read(contract_file)
pack_root = Path('.local/environment-packs') / assembly['pack']['revision']
assert sha(pack_root / 'manifest.json') == assembly['pack']['sha256']
pack = read(pack_root / 'manifest.json')
associated = {r['member']:r for r in assembly['associated']}
expected_files = {'manifest.json'}
members, density_frames, exact_pngs = 0, 0, 0
for family, group in pack['families'].items():
    declaration = contract['families'][family]
    assert sorted(m['member'] for m in group['members']) == sorted(declaration['members'])
    basis = dict(theater='URBAN', members={n:contract['sources'][n] for n in declaration['members']},
        identities=declaration['identities'])
    digest = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert digest == declaration['familyHash'] == group['familyHash']
    for member in group['members']:
        name = member['member']
        file = pack_root / member['path']
        assert sha(file) == member['sha256']
        hd = read(file)
        if name in associated:
            row = associated[name]
            old_file = Path(row['donorMetadata'])
            assert sha(old_file) == row['donorMetadataSha256']
            old = read(old_file)
            assert old['source']['sha256'] == source[name]['sha256'] == hd['source']['sha256']
        else:
            old_member, = [m for m in body_pack['families'][family]['members'] if m['member'] == name]
            old_file = body_root / old_member['path']
            assert sha(old_file) == old_member['sha256']
            old = read(old_file)
        expected = copy.deepcopy(old)
        expected['source']['member'], expected['source']['theater'] = name, 'URBAN'
        expected['packId'], expected['packRevision'] = family, pack['revision']
        assert hd == expected, (name, 'Only source labels and pack identity may change.')
        assert hd['logical']['canvas'] == source[name]['canvas']
        assert len(hd['logical']['frames']) == contract['sources'][name]['bodyFrames']
        for frame, logical in zip(source[name]['frames'][:len(hd['logical']['frames'])], hd['logical']['frames'], strict=True):
            assert frame['size'] == logical['trimSize'] and frame['origin'] == logical['trimOrigin']
            assert frame['slot'] == logical['nativeFrame'] and frame['empty'] == logical['empty']
        for variant in hd['variants']:
            density_frames += len(variant['frames'])
            for page in variant['pages']:
                for role in ['base', 'data']:
                    relative = str(Path(member['path']).parent / str(variant['density']) / page['id'] / (role + '.png'))
                    old_page = old_file.parent / str(variant['density']) / page['id'] / (role + '.png')
                    assert sha(pack_root / relative) == sha(old_page) == page[role + 'Sha256']
                    expected_files.add(relative)
                    exact_pngs += 1
        expected_files.add(member['path'])
        members += 1
assert len(pack['families']) == 8 and members == 15 and density_frames == 440
assert {str(p.relative_to(pack_root)) for p in pack_root.rglob('*') if p.is_file()} == expected_files
report = dict(status='PASS_COMPLETE_LINKED_BODY_AND_ACCEPTED_ANIMATION_FAMILIES', pack=str(pack_root),
    sha256=sha(pack_root / 'manifest.json'), contractSha256=sha(contract_file),
    sourceSha256=sha(root / 'source.json'), assemblySha256=sha(assembly_file),
    counts=dict(families=8, members=15, densityFrames=440, exactAcceptedBodyFrames=48,
        exactAcceptedAssociatedFrames=376, nativeToneFrames=16, files=len(expected_files), exactAssemblyPngFiles=exact_pngs),
    runtimeAcceptance=False, wholeMapComplete=False)
with (authoring / 'verify-linked-r1.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
