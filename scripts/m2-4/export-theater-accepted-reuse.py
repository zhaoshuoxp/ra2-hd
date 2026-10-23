"""Copy qualified complete accepted families with fresh theater metadata and exact PNGs."""
import argparse
import copy
import hashlib
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import register_contours


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, indent=2) + '\n'


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('audit', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('revision')
args = parser.parse_args()
audit = read(args.audit)
assert audit['status'] == 'STATIC_SOURCE_PALETTE_AND_COMPLETE_FAMILY_AUDIT_ONLY'
accepted_path = Path(audit['acceptedContract'])
assert sha(accepted_path) == audit['acceptedContractSha256']
accepted = read(accepted_path)
assert accepted['selectedPack'] == audit['donorSelectedPack']
native_path = Path(audit['nativeGuideFile'])
assert sha(native_path) == audit['nativeGuideSha256']
native_root, native = native_path.parent, read(native_path)
native_sources = {source['key']: source for source in native['sources']}
donor_root = Path('.local/environment-packs') / audit['donorSelectedPack']['revision']
assert sha(donor_root / 'manifest.json') == audit['donorSelectedPack']['sha256']
donor = read(donor_root / 'manifest.json')
destination = Path('.local/environment-packs') / args.revision
assert not args.output.exists() and not destination.exists()
theater = audit['theater']
contract = dict(schema=accepted['schema'], theater=theater,
    preparedSourceSha256=audit['nativeGuideSha256'], sources={}, families={},
    identities={'ra2': {}, 'yr': {}}, aliases={})
pack = dict(schema=donor['schema'], revision=args.revision, theater=theater, editions=donor['editions'], families={})
pages_to_copy, metadata_to_write, records = {}, {}, []
for qualified in audit['qualified']:
    old_family = qualified['donorFamily']
    donor_prefix = accepted['theater'].lower() + '-'
    family = theater.lower() + '-' + old_family.removeprefix('environment-').removeprefix(donor_prefix)
    assert donor['families'][old_family]['familyHash'] == accepted['families'][old_family]['familyHash']
    member_records = []
    for record in qualified['members']:
        name, old_name = record['member'], record['donorMember']
        source, descriptor = native_sources[record['nativeKey']], record['descriptor']
        assert not record['colorDifferences'] and sha(native_root / 'native' / source['nativeFile']) == descriptor['sha256']
        donor_entry = record['donorEntry']
        old_path = donor_root / donor_entry['path']
        assert sha(old_path) == donor_entry['sha256']
        hd = read(old_path)
        accepted_motion = old_name == 'ctoild_a.shp' and audit['donorSelectedPack'] == dict(
            schemaVersion=1, revision='environment-m2-3-oil-paired-drive-complete-v31',
            sha256='96d49880153aa1101704f15cca00c48afc28a9bb303c130c917f090c1952d447')
        if accepted_motion:
            assert source['sha256'] == '4fd9eaa31932c475b0940c7c52181965e8e6b52b1d6e99c7c05abefe27d1efcd'
            assert old_family == 'environment-ctoild' and descriptor['bodyFrames'] == 64
            assert qualified['identities'] == ['CAOILD']
            assert sorted(member['donorMember'] for member in qualified['members']) == [
                'ctoild.shp', 'ctoild_a.shp', 'ctoild_f.shp']
            assert hd['authored']['r16PairedDrive']['masterSha256'] == \
                '5f092b59cadd87ef1754d86162fda215424024428bb113376d72eb7930f026c0'
            assert hd['authored']['r13CompleteEdges']['beamMasterSha256'] == \
                'c2df994d6465b1200c184a6aaa493f25ef5c0257dc91326d5ca7027dc646fdd3'
        target_dir = Path('members') / name.replace('.', '-')
        assert name not in contract['sources']
        contract['sources'][name] = descriptor
        frames_verified = 0
        for variant in hd['variants']:
            density, pages = variant['density'], {}
            assert density in (2, 4) and len(variant['frames']) == descriptor['bodyFrames']
            for page in variant['pages']:
                images = []
                for role in ('base', 'data'):
                    file = old_path.parent / str(density) / page['id'] / (role + '.png')
                    assert sha(file) == page[role + 'Sha256'] and file.stat().st_size == page[role + 'Bytes']
                    pixels = np.asarray(Image.open(file).convert('RGBA'))
                    assert list(pixels.shape[1::-1]) == page['size']
                    images.append(pixels)
                    relative = target_dir / str(density) / page['id'] / (role + '.png')
                    assert relative not in pages_to_copy
                    pages_to_copy[relative] = file
                pages[page['id']] = images
            for source_frame, logical, frame in zip(source['frames'], hd['logical']['frames'], variant['frames']):
                assert logical['nativeFrame'] == frame['nativeFrame'] == source_frame['slot']
                assert logical['trimOrigin'] == source_frame['origin'] and logical['trimSize'] == source_frame['size']
                assert logical['empty'] == source_frame['empty']
                if source_frame['empty']:
                    if frame.get('empty') is not True:
                        # Earlier accepted metadata represents zero-size original
                        # slots with zero-size atlas rectangles instead of a flag.
                        assert source_frame['size'] == [0, 0]
                        assert frame['page'] in pages
                        for field in ('contentRect', 'sampleRect'):
                            x, y, w, h = frame[field]
                            assert w == h == 0 and x >= 0 and y >= 0
                            page = pages[frame['page']][0]
                            assert x <= page.shape[1] and y <= page.shape[0]
                    continue
                width, height = source_frame['size']
                raw = native_root / 'native' / source_frame['indexFile']
                assert sha(raw) == source_frame['indexSha256']
                indices = np.frombuffer(raw.read_bytes(), np.uint8).reshape(height, width)
                expanded = indices.repeat(density, 0).repeat(density, 1)
                base, data = pages[frame['page']]
                x, y, w, h = frame['contentRect']
                assert [w, h] == [width * density, height * density]
                base, data = base[y:y+h, x:x+w], data[y:y+h, x:x+w]
                remapable = descriptor.get('framePalettes', {}).get(str(source_frame['slot']), descriptor)['remapable']
                policy = hd['color'].get('structuralCoverage')
                if policy:
                    assert policy['schema'] == 'native-structural-subpixel-coverage-v1'
                    assert policy['toleranceNativePixels'] == .7 and policy['maximumContourAreaChangeFraction'] == .025
                    expected_base, expected_data = register_contours(base.copy(), data.copy(), indices, density, remapable)
                    if not accepted_motion:
                        assert np.array_equal(base[..., 3], expected_base[..., 3]), (name, density, source_frame['slot'])
                    # R13/R16 explicitly reconstruct complete moving edges. Their
                    # exact accepted PNG coverage is pinned above and copied intact;
                    # recomputing it from the clipped retail mask would undo that fix.
                    assert np.array_equal(data[..., :2], expected_data[..., :2]), (name, density, source_frame['slot'])
                else:
                    assert np.array_equal(base[..., 3], (expanded != 0).astype(np.uint8) * 255)
                    owner = (expanded >= 16) & (expanded <= 31) if remapable else np.zeros_like(expanded, dtype=bool)
                    assert np.array_equal(data[..., 0], owner.astype(np.uint8) * 255)
                    assert np.array_equal(data[..., 1], np.where(owner, expanded - 16, 0))
                frames_verified += 1
        hd['source']['member'], hd['source']['theater'] = name, theater
        hd['packId'], hd['packRevision'] = family, args.revision
        relative = target_dir / 'manifest.json'
        assert relative not in metadata_to_write
        metadata_to_write[relative] = hd
        member_records.append(dict(member=name, path=str(relative)))
        records.append(dict(family=family, member=name, donorFamily=old_family, donorMember=old_name,
            donorMetadataSha256=donor_entry['sha256'], sourceSha256=source['sha256'],
            coveragePolicy='EXACT_USER_ACCEPTED_R13_R16_MOVING_COVERAGE' if accepted_motion
                else 'ORIGINAL_MASK_OR_ACCEPTED_STRUCTURAL_COVERAGE_RECOMPUTED',
            path=str(relative), verifiedDensityFrames=frames_verified))
    names = sorted(record['member'] for record in qualified['members'])
    basis = dict(theater=theater, members={name: contract['sources'][name] for name in names}, identities=qualified['identities'])
    family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    contract['families'][family] = dict(members=names, identities=qualified['identities'],
        editions=qualified['editions'], kinds=qualified['kinds'], familyHash=family_hash)
    for edition, identity in qualified['bindings']:
        assert contract['identities'][edition].get(identity) in (None, family)
        contract['identities'][edition][identity] = family
    pack['families'][family] = dict(familyHash=family_hash, members=member_records)
args.output.mkdir(parents=True, exist_ok=False)
destination.mkdir(exist_ok=False)
for relative, source in pages_to_copy.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert sha(target) == sha(source)
for relative, metadata in metadata_to_write.items():
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('x') as stream:
        stream.write(encode(metadata))
for family in pack['families'].values():
    for member in family['members']:
        member['sha256'] = sha(destination / member['path'])
(destination / 'manifest.json').write_text(encode(pack))
pointer = dict(schemaVersion=1, revision=args.revision, sha256=sha(destination / 'manifest.json'))
contract['selectedPack'] = pointer
contract['extensions'] = dict(milestone='M2.4', acceptedContractSha256=audit['acceptedContractSha256'],
    reuseAuditSha256=sha(args.audit), inventorySha256=audit['inventorySha256'],
    newFamilies=sorted(pack['families']), state='STATIC_EXACT_ACCEPTED_REUSE_VERIFIED_NATIVE_PENDING')
(args.output / 'contract.json').write_text(encode(contract))
receipt = dict(status='PASS_COMPLETE_ACCEPTED_FAMILY_REUSE_PAYLOAD_AND_MASKS', theater=theater,
    audit=str(args.audit), auditSha256=sha(args.audit), pack=pointer,
    families=records, copiedPages=len(pages_to_copy), acceptedSource=accepted['selectedPack'],
    nativeStatus='NOT_RUN', windowsStatus='NOT_RUN', visualStatus='ACCEPTED_ART_REUSED',
    policy='Only source member, theater, pack identity and revision change in member metadata. All accepted PNG bytes remain identical. Fresh metadata requires normal fresh preparation; no old cache is relabeled.')
(args.output / 'reuse-receipt.json').write_text(encode(receipt))
print(json.dumps(dict(families=len(pack['families']), members=len(records), pngs=len(pages_to_copy),
    verifiedDensityFrames=sum(record['verifiedDensityFrames'] for record in records), pack=pointer)))
