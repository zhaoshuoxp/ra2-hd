"""Assemble eight complete families with newly verified rubble and exact accepted animations."""
import copy
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
encode = lambda d: json.dumps(d, indent=2) + '\n'
root = Path('.artifacts/m2-4/urban-building-rubble-native-batch52-v1')
authoring = Path('.artifacts/m2-4/urban-building-rubble-authoring-batch52-v1')
verified_file = authoring / 'verify-bodies-r1.json'
verified = read(verified_file)
assert verified['status'] == 'PASS' and verified['counts']['densityFrames'] == 64
assert verified['counts']['exactAcceptedBodyFrames'] == 48 and verified['counts']['nativeToneFrames'] == 16
body_root = Path(verified['pack'])
assert sha(body_root / 'manifest.json') == verified['sha256']
body_pack = read(body_root / 'manifest.json')
contract = read(root / 'contract-bodies.json')
sources = {s['member']: s for s in read(root / 'source.json')['sources']}
accepted_file = Path('desktop/environment-hd-contract.json')
accepted = read(accepted_file)
donor_root = Path('.local/environment-packs') / accepted['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == accepted['selectedPack']['sha256']
donor_pack = read(donor_root / 'manifest.json')
proof_file = Path('.artifacts/m2-4/urban-civilian-batch51-preflight-v1/linked-original-sources-v2.json')
proof = read(proof_file)
assert proof['donorSelectedPack'] == accepted['selectedPack']
revision = 'urban-civilian-rubble-m2-4-batch52-r1'
destination = Path('.local/environment-packs') / revision
assert not destination.exists() and not (root / 'contract.json').exists()
pack = copy.deepcopy(body_pack)
pack['revision'] = revision
copies, metadata, associated = {}, {}, []
for family, entry in pack['families'].items():
    for member in entry['members']:
        file = body_root / member['path']
        assert sha(file) == member['sha256']
        hd = read(file)
        hd['packId'], hd['packRevision'] = family, revision
        metadata[member['path']] = hd
        for candidate in file.parent.rglob('*.png'):
            copies[str(candidate.relative_to(body_root))] = candidate
for name, source in sources.items():
    if name in contract['sources']:
        continue
    rows = [r for r in proof['rows'] if r['actualName'] == name and r['sourceSha256'] == source['sha256']]
    assert rows and all(r['status'] == 'EXACT_ORIGINAL_MEMBER_AND_PALETTE_CANDIDATE'
        and not r['paletteDifferences'] and r['paletteSha256'] == source['palette']['sha256'] for r in rows)
    assert len({r['donorName'] for r in rows}) == 1
    row = rows[0]
    old_name = row['donorName']
    old = accepted['sources'][old_name]
    assert all(source[k] == old[k] for k in ['sha256', 'canvas', 'totalFrames', 'hasShadow', 'remapable'])
    assert all(b['role'] == 'ACTIVE' and b['hasShadow'] == source['hasShadow']
        and b['remapable'] == source['remapable'] for b in source['bindings'])
    assert sha(root / 'native' / source['nativeFile']) == source['sha256']
    families = {contract['identities'][b['edition']][b['id']] for b in source['bindings']}
    family, = families
    descriptor = copy.deepcopy(old)
    descriptor['palette'] = source['palette']
    assert not descriptor.get('framePalettes'), 'Associated per-frame palettes require separate proof.'
    donor, = [m for f in donor_pack['families'].values() for m in f['members'] if m['member'] == old_name]
    file = donor_root / donor['path']
    assert str(file) == row['acceptedManifestFile'] and sha(file) == row['acceptedManifestSha256'] == donor['sha256']
    hd = read(file)
    assert hd['source']['member'] == old_name and hd['source']['sha256'] == source['sha256']
    assert hd['logical']['canvas'] == source['canvas'] and len(hd['logical']['frames']) == old['bodyFrames']
    for frame, logical in zip(source['frames'][:old['bodyFrames']], hd['logical']['frames'], strict=True):
        assert frame['slot'] == logical['nativeFrame'] and frame['origin'] == logical['trimOrigin']
        assert frame['size'] == logical['trimSize'] and frame['empty'] == logical['empty']
        assert sha(root / 'native' / frame['indexFile']) == frame['indexSha256']
    if name == 'cuoild_a.shp':
        assert hd['authored']['r16PairedDrive']['masterSha256'] == '5f092b59cadd87ef1754d86162fda215424024428bb113376d72eb7930f026c0'
        assert hd['authored']['r13CompleteEdges']['beamMasterSha256'] == 'c2df994d6465b1200c184a6aaa493f25ef5c0257dc91326d5ca7027dc646fdd3'
    pages = []
    directory = Path('members') / name.replace('.', '-')
    for variant in hd['variants']:
        assert variant['density'] in (2, 4) and len(variant['frames']) == descriptor['bodyFrames']
        for page in variant['pages']:
            for role in ['base', 'data']:
                old_file = file.parent / str(variant['density']) / page['id'] / (role + '.png')
                assert sha(old_file) == page[role + 'Sha256'] and old_file.stat().st_size == page[role + 'Bytes']
                assert list(Image.open(old_file).size) == page['size']
                relative = str(directory / str(variant['density']) / page['id'] / (role + '.png'))
                assert relative not in copies
                copies[relative] = old_file
                pages.append(dict(path=relative, donor=str(old_file), sha256=sha(old_file)))
    hd['source']['member'], hd['source']['theater'] = name, 'URBAN'
    hd['packId'], hd['packRevision'] = family, revision
    relative = str(directory / 'manifest.json')
    metadata[relative] = hd
    contract['sources'][name] = descriptor
    contract['families'][family]['members'].append(name)
    pack['families'][family]['members'].append(dict(member=name, path=relative))
    associated.append(dict(member=name, donorMember=old_name, family=family, sourceSha256=source['sha256'],
        donorMetadata=str(file), donorMetadataSha256=sha(file), path=relative, pages=pages,
        densityFrames=descriptor['bodyFrames'] * 2,
        policy='Exact accepted PNGs and all authored coverage, poses and owner data retained. Only source member/theater and pack identity change.'))
assert len(associated) == 7 and sum(r['densityFrames'] for r in associated) == 376
inventory = read(Path(read(root / 'source.json')['inventoryFile']))
for family, declaration in contract['families'].items():
    declaration['members'].sort()
    for row in inventory['rows']:
        if row['theater'] == 'URBAN' and row['id'] in declaration['identities']:
            assert {r['source']['member'] for r in [row, *row['dependencies']]} == set(declaration['members'])
    basis = dict(theater='URBAN', members={n:contract['sources'][n] for n in declaration['members']},
        identities=declaration['identities'])
    digest = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    declaration['familyHash'] = pack['families'][family]['familyHash'] = digest
assert set(contract['sources']) == set(sources) and len(metadata) == 15
destination.mkdir()
for relative, old_file in copies.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(old_file, target)
    assert sha(target) == sha(old_file)
for relative, hd in metadata.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(encode(hd))
for family in pack['families'].values():
    for member in family['members']:
        member['sha256'] = sha(destination / member['path'])
(destination / 'manifest.json').write_text(encode(pack))
(root / 'contract.json').write_text(encode(contract))
receipt = dict(status='STATIC_COMPLETE_ASSOCIATED_SOURCE_AND_EXACT_ACCEPTED_PAGES_VERIFIED_NATIVE_PENDING',
    bodyVerification=dict(file=str(verified_file), sha256=sha(verified_file)),
    sourceProof=dict(file=str(proof_file), sha256=sha(proof_file)), associated=associated,
    pack=dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json')),
    counts=dict(families=8, members=15, densityFrames=440, exactAcceptedBodyFrames=48,
        exactAcceptedAssociatedFrames=376, newRubbleDensityFrames=16), windows='NOT_RUN', m24Complete=False)
(root / 'linked-assembly-v1.json').write_text(encode(receipt))
print(json.dumps(dict(pack=receipt['pack'], counts=receipt['counts'])))
