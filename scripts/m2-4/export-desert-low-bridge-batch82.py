"""Close all Desert low-wood bridge members, preserving four distinct broken ends."""
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours

root = Path('.artifacts/m2-4/desert-low-bridge-batch82-20261019')
root.mkdir(exist_ok=True)
version = 2
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
guide_file = Path('.artifacts/m2-4/desert-native-v1/source.json')
guide = read(guide_file)
proof_file = Path('.artifacts/m2-4/remaining-overlays-batch82-preparation-20261019/complete-original-raster-equivalence-v2.json')
proof = read(proof_file)
old_contract_file = Path('desktop/environment-desert-hd-contract.json')
if not (root / 'baseline-contract.json').exists():
    write(root / 'baseline-contract.json', read(old_contract_file))
contract = read(root / 'baseline-contract.json')
baseline = contract['selectedPack']
base = Path('.local/environment-packs') / baseline['revision']
assert sha(base / 'manifest.json') == baseline['sha256']
manifest = read(base / 'manifest.json')
donor_contract_file = Path('desktop/environment-hd-contract.json')
donor_contract = read(donor_contract_file)
donor_root = Path('.local/environment-packs') / donor_contract['selectedPack']['revision']
assert sha(donor_root / 'manifest.json') == donor_contract['selectedPack']['sha256']
donor_manifest = read(donor_root / 'manifest.json')
donor_family = donor_manifest['families']['environment-lobrdg']
family = 'desert-bridge-low-wood'
revision = f'desert-environment-low-bridge-batch82-v{version}-combined'
assert family not in contract['families']
destination = Path('.local/environment-packs') / revision
destination.mkdir(exist_ok=False)
preserved = {}
for file in base.rglob('*'):
    if not file.is_file() or file == base / 'manifest.json':
        continue
    target = destination / file.relative_to(base)
    target.parent.mkdir(parents=True, exist_ok=True)
    os.link(file, target)
    assert sha(target) == sha(file)
    preserved[str(file.relative_to(base))] = sha(file)

records, member_entries = [], []
adapted = {f'lobrdg{i:02d}.des' for i in [20, 22, 24, 26]}
for number in range(1, 27):
    name, donor_name = f'lobrdg{number:02d}.des', f'lobrdg{number:02d}.tem'
    source, = [s for s in guide['sources'] if s['member'] == name]
    assert source['format'] == 'shp' and source['hasShadow'] and not source['remapable']
    assert source['canvas'] == [180, 120] and source['totalFrames'] == 6
    assert all(f['empty'] for f in source['frames'][3:]), 'Unexpected native shadow change'
    assert sha(guide_file.parent / 'native' / source['nativeFile']) == source['sha256']
    entry, = [e for e in donor_family['members'] if e['member'] == donor_name]
    donor_file = donor_root / entry['path']
    assert sha(donor_file) == entry['sha256']
    hd = read(donor_file)
    assert hd['source']['sha256'] == donor_contract['sources'][donor_name]['sha256']
    target_dir = destination / 'members' / name.replace('.', '-')
    target_dir.mkdir(parents=True)
    frame_proofs = []
    if name not in adapted:
        row, = [r for r in proof['rows'] if r['theater'] == 'DESERT' and r['member'] == name]
        assert any(m['donorTheater'] == 'TEMPERATE' and m['donorFamily'] == 'environment-lobrdg'
                   and m['donorMember'] == donor_name and m['allOriginalRgbaAndOwnerFramesExact']
                   for m in row['completeOriginalRasterMatches'])
    for variant in hd['variants']:
        density = variant['density']
        assert density in [2, 4] and len(variant['frames']) == 3
        if name not in adapted:
            for page in variant['pages']:
                folder = target_dir / str(density) / page['id']
                folder.mkdir(parents=True)
                for role in ['base', 'data']:
                    old = donor_file.parent / str(density) / page['id'] / (role + '.png')
                    assert sha(old) == page[role + 'Sha256']
                    os.link(old, folder / (role + '.png'))
            for frame, logical in zip(source['frames'][:3], hd['logical']['frames'], strict=True):
                assert logical['trimOrigin'] == frame['origin'] and logical['trimSize'] == frame['size']
            continue
        original_pages = {}
        pieces, sample_sizes = [], []
        for frame, logical, target in zip(variant['frames'], hd['logical']['frames'], source['frames'][:3], strict=True):
            slot = frame['nativeFrame']
            assert slot == logical['nativeFrame'] == target['slot']
            assert logical['empty'] == target['empty']
            w, h = target['size']
            sw, sh = (w + w % 2) * density, (h + h % 2) * density
            sample_sizes.append((sw, sh))
            if target['empty']:
                pieces.append(None)
                continue
            page, = [p for p in variant['pages'] if p['id'] == frame['page']]
            if page['id'] not in original_pages:
                images = []
                for role in ['base', 'data']:
                    file = donor_file.parent / str(density) / page['id'] / (role + '.png')
                    assert sha(file) == page[role + 'Sha256']
                    images.append(np.array(Image.open(file).convert('RGBA')))
                original_pages[page['id']] = images
            old_base, _ = original_pages[page['id']]
            x, y, ow, oh = frame['contentRect']
            old = old_base[y:y + oh, x:x + ow]
            ox, oy = logical['trimOrigin']
            tx, ty = target['origin']
            assert tx >= ox and ty >= oy and tx + w <= ox + logical['trimSize'][0]
            assert ty + h <= oy + logical['trimSize'][1]
            # Preserve accepted wood at the same absolute native canvas coordinates.
            dx, dy = (tx - ox) * density, (ty - oy) * density
            piece = old[dy:dy + h * density, dx:dx + w * density].copy()
            assert piece.shape == (h * density, w * density, 4)
            index_file = guide_file.parent / 'native' / target['indexFile']
            assert sha(index_file) == target['indexSha256']
            indices = np.fromfile(index_file, np.uint8).reshape(h, w)
            original_mask = indices != 0
            old_mask = piece[..., 3] > 0
            assert old_mask.any()
            nearest = ndimage.distance_transform_edt(~old_mask, return_distances=False, return_indices=True)
            piece[..., :3] = piece[tuple(nearest)][..., :3]
            piece[..., 3] = original_mask.repeat(density, 0).repeat(density, 1) * 255
            data = np.zeros_like(piece)
            data[..., 3] = 255
            piece, data = register_contours(piece, data, indices, density, False)
            assert not data[..., :2].any(), 'Bridge cannot gain owner color'
            pieces.append((piece, data))
            frame_proofs.append(dict(slot=slot, density=density, originalTrim=target['origin'] + target['size'],
                donorTrim=logical['trimOrigin'] + logical['trimSize'], nativeIndexSha256=target['indexSha256'],
                registration='SAME_ABSOLUTE_NATIVE_CANVAS_NO_RESCALE', material='ACCEPTED_TEMPERATE_HD',
                alpha='TARGET_STRUCTURAL_SUBPIXEL_COVERAGE', shadows='UNCHANGED_ORIGINAL_EMPTY_SLOTS'))
        width = sum(sw + 4 for sw, _ in sample_sizes)
        height = max(sh for _, sh in sample_sizes) + 4
        pages = [np.zeros((height, width, 4), np.uint8) for _ in range(2)]
        pages[1][..., 3] = 255
        frames, cursor = [], 2
        for slot, (piece_pair, (sw, sh), target) in enumerate(zip(pieces, sample_sizes, source['frames'][:3], strict=True)):
            w, h = target['size']
            frames.append(dict(nativeFrame=slot, page='p0', sampleRect=[cursor, 2, sw, sh],
                contentRect=[cursor, 2, w * density, h * density]))
            if piece_pair is not None:
                for atlas, piece in zip(pages, piece_pair, strict=True):
                    ph, pw = piece.shape[:2]
                    padded = np.pad(piece, ((2, sh - ph + 2), (2, sw - pw + 2), (0, 0)), mode='edge')
                    if atlas is pages[0]:
                        padded[..., 3] = 0
                        padded[2:2 + ph, 2:2 + pw] = piece
                    atlas[:, cursor - 2:cursor + sw + 2] = padded
            cursor += sw + 4
        folder = target_dir / str(density) / 'p0'
        folder.mkdir(parents=True)
        page = dict(id='p0', size=[width, height])
        for role, atlas in zip(['base', 'data'], pages, strict=True):
            file = folder / (role + '.png')
            Image.fromarray(atlas).save(file)
            page.update({role: f'{density}-p0-{role}.png', role + 'Sha256': sha(file), role + 'Bytes': file.stat().st_size})
        variant.update(pages=[page], frames=frames)
    if name in adapted:
        hd['logical']['frames'] = [dict(nativeFrame=f['slot'], trimOrigin=f['origin'], trimSize=f['size'],
            legacyRenderSize=[n + n % 2 for n in f['size']], empty=f['empty']) for f in source['frames'][:3]]
        hd['color']['structuralCoverage'] = dict(schema='native-structural-subpixel-coverage-v1',
            toleranceNativePixels=.7, maximumContourAreaChangeFraction=.025)
    hd.update(packId=family, packRevision=revision)
    hd['source'].update(member=name, sha256=source['sha256'], theater='DESERT')
    hd.setdefault('authored', {})['desertBridgeBatch82'] = dict(donorMember=donor_name,
        donorMetadataSha256=entry['sha256'], originalRasterProofSha256=sha(proof_file),
        policy='FOUR_DISTINCT_BROKEN_ENDS_TARGET_CONTOURS' if name in adapted else 'EXACT_ACCEPTED_PNG_BYTES')
    write(target_dir / 'manifest.json', hd)
    member_entries.append(dict(member=name, path=str((target_dir / 'manifest.json').relative_to(destination)),
        sha256=sha(target_dir / 'manifest.json')))
    descriptor = {k: copy.deepcopy(source[k]) for k in ['sha256', 'canvas', 'totalFrames', 'palette', 'hasShadow', 'remapable']}
    descriptor['bodyFrames'] = 3
    assert name not in contract['sources']
    contract['sources'][name] = descriptor
    records.append(dict(member=name, donorMember=donor_name, sourceSha256=source['sha256'],
        donorMetadataSha256=entry['sha256'], adapted=name in adapted, frameProofs=frame_proofs))
names = [record['member'] for record in records]
identities = [name[:-4].upper() for name in names]
rows = [row for row in read(Path(proof['inventoryFile']))['rows']
        if row['theater'] == 'DESERT' and row['kind'] == 'overlay' and row.get('source', {}).get('member') in names]
assert {row['source']['member'] for row in rows} == set(names)
assert all(not row['dependencies'] for row in rows)
assert {row['id'] for row in rows} == set(identities)
for row in rows:
    assert row['source']['sha256'] == contract['sources'][row['source']['member']]['sha256']
    table = contract['identities'][row['edition']]
    assert row['id'] not in table
    table[row['id']] = family
basis = dict(theater='DESERT', members={n: contract['sources'][n] for n in names}, identities=identities)
family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
contract['families'][family] = dict(members=names, identities=identities, editions=['yr'], kinds=['overlay'], familyHash=family_hash)
manifest['families'][family] = dict(familyHash=family_hash, members=member_entries)
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
pointer = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer
contract['preparedSourceSha256'] = sha(guide_file)
contract['extensions'] = dict(milestone='M2.4', baselineSelectedPack=baseline, newFamilies=[family],
    state='STATIC_COMPLETE_FAMILY_NATIVE_AND_VISUAL_PENDING')
write(root / f'contract-candidate-v{version}.json', contract)
write(root / f'export-and-preservation-v{version}.json', dict(status='EXPORTED_COMPLETE_FAMILY_VALIDATION_PENDING',
    baseline=baseline, candidate=pointer, records=records, preservedPayloadHashes=preserved,
    donorContract=dict(file=str(donor_contract_file), sha256=sha(donor_contract_file)),
    guide=dict(file=str(guide_file), sha256=sha(guide_file)), sourceProof=dict(file=str(proof_file), sha256=sha(proof_file)),
    newVisualMembers=sorted(adapted), exactAcceptedMembers=22, completeMembers=26, runtime='NOT_RUN', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(candidate=pointer, completeMembers=26, exactAcceptedMembers=22, newAdaptedMembers=4,
    priorPayloadsPreserved=len(preserved), selected=False)))
