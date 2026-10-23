"""Transfer the accepted complete R16 mechanical cycle into an isolated Snow candidate."""
import argparse
import copy
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
assert not args.output.exists() and not args.receipt.exists()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.local/environment-packs/snow-environment-m2-4-technology-v1')
donor = Path('.local/environment-packs/environment-m2-3-oil-paired-drive-complete-v31')
source_root = Path('.artifacts/m2-4/snow-native-technology-batch26-v1')
native = next(s for s in load(source_root / 'source.json')['sources'] if s['member'] == 'caoild_a.shp')
guide_root = Path('.artifacts/m2-4/snow-batch26-original-component-guides-v1')
original_donor = next(s for s in load(guide_root / 'source.json')['sources'] if s['member'] == 'ctoild_a.shp')
catalog = load(base / 'manifest.json')
donor_catalog = load(donor / 'manifest.json')
assert sha(base / 'manifest.json') == '6e819a5a2fe5495f26cea7304a091b0b87f2998907132bb240982ae665f26a64'
assert sha(donor / 'manifest.json') == '96d49880153aa1101704f15cca00c48afc28a9bb303c130c917f090c1952d447'
entry = next(m for m in catalog['families']['snow-caoild']['members'] if m['member'] == 'caoild_a.shp')
donor_entry = next(m for f in donor_catalog['families'].values() for m in f['members'] if m['member'] == 'ctoild_a.shp')
before_file, donor_file = base / entry['path'], donor / donor_entry['path']
assert sha(before_file) == entry['sha256'] and sha(donor_file) == donor_entry['sha256']
metadata, donor_metadata = load(before_file), load(donor_file)
assert metadata['source']['sha256'] == native['sha256']
assert donor_metadata['source']['sha256'] == original_donor['sha256']
assert native['canvas'] == original_donor['canvas'] == [166, 122]
assert len(native['frames']) == 128 and len(original_donor['frames']) == 64
assert all(a['origin'] == b['origin'] == [75, 37]
           for a, b in zip(native['frames'][:64], original_donor['frames'][:64]))
rig = donor_metadata['authored']['r16PairedDrive']
assert rig['rodWidth'] == 4.2 and len(rig['referencePhases']) == 8
assert len(metadata['logical']['frames']) == len(donor_metadata['logical']['frames']) == 64
shutil.copytree(base, args.output)
records = []
palette_file = source_root / 'native' / (native['palette']['sha256'] + '.pal')
assert sha(palette_file) == native['palette']['sha256']
palette = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4


def original_indices(source, root, number, width, height):
    frame = source['frames'][number]
    file = root / 'native' / frame['indexFile'] if 'indexFile' in frame else root / frame['file']
    assert sha(file) == frame['indexSha256']
    result = np.zeros((height, width), np.uint8)
    w, h = frame['size']
    result[:h, :w] = np.frombuffer(file.read_bytes(), np.uint8).reshape(h, w)
    return result


def atlas_frames(folder, variant, layer='base'):
    pages = {p['id']: np.array(Image.open(folder / str(variant['density']) / p['id'] / (layer + '.png')))
             for p in variant['pages']}
    values = {}
    for frame in variant['frames']:
        x, y, w, h = frame['contentRect']
        values[frame['nativeFrame']] = pages[frame['page']][y:y + h, x:x + w].copy()
    assert set(values) == set(range(64))
    return pages, values


for density in (2, 4):
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    donor_variant = next(v for v in donor_metadata['variants'] if v['density'] == density)
    pages, current = atlas_frames(before_file.parent, variant)
    _, accepted = atlas_frames(donor_file.parent, donor_variant)
    data_pages, current_data = atlas_frames(before_file.parent, variant, 'data')
    _, accepted_data = atlas_frames(donor_file.parent, donor_variant, 'data')
    w = max(f['size'][0] for f in native['frames'][:64])
    h = max(f['size'][1] for f in native['frames'][:64])
    for state in (0, 1):
        numbers = list(range(state * 32, (state + 1) * 32))
        a = np.stack([original_indices(native, source_root, n, w, h) for n in numbers])
        t = np.stack([original_indices(original_donor, guide_root, n, w, h) for n in numbers])
        old = np.zeros((32, h * density, w * density, 4), np.uint8)
        r16 = old.copy()
        old_data, r16_data = old.copy(), old.copy()
        for phase, n in enumerate(numbers):
            image, accepted_image = current[n], accepted[n]
            old[phase, :image.shape[0], :image.shape[1]] = image
            r16[phase, :accepted_image.shape[0], :accepted_image.shape[1]] = accepted_image
            image_data, accepted_image_data = current_data[n], accepted_data[n]
            old_data[phase, :image_data.shape[0], :image_data.shape[1]] = image_data
            r16_data[phase, :accepted_image_data.shape[0], :accepted_image_data.shape[1]] = accepted_image_data
        donor_motion = np.any(r16 != r16[0], axis=(0, 3)) & np.any(r16[..., 3] > 0, axis=0)
        yy, xx = np.indices((h * density, w * density))
        transfer = (yy < 54 * density) | ((xx >= 6 * density) & (xx < 11 * density)
                                         & (yy < 67 * density))
        labels, count = ndimage.label(donor_motion & ~transfer, np.ones((3, 3)))
        extensions = []
        for label in range(1, count + 1):
            py, px = np.where(labels == label)
            left, top = int(px.min() // density), int(py.min() // density)
            right, bottom = int(px.max() // density + 1), int(py.max() // density + 1)
            transfer[top * density:bottom * density, left * density:right * density] = True
            extensions.append([left, top, right - left, bottom - top])
        original_owner = lambda pixels: np.where((pixels >= 16) & (pixels < 32), pixels, 0)
        native_transfer = transfer.reshape(h, density, w, density).any(axis=(1, 3))
        owner_delta = np.any(original_owner(a) != original_owner(t), axis=0)
        expected_delta = np.zeros((h, w), bool)
        if state:
            expected_delta[39, 0] = True
            assert np.all(a[:, 39, 0] == 111) and set(t[:, 39, 0]) == {29, 30}
        assert np.array_equal(owner_delta, expected_delta), 'Unexpected original owner-source disagreement'
        assert np.array_equal(original_owner(a)[:, native_transfer & ~owner_delta],
                              original_owner(t)[:, native_transfer & ~owner_delta])
        owner_delta_hd = owner_delta.repeat(density, 0).repeat(density, 1)
        # Copy coherent surfaces and their accepted owner material together.
        # Original Snow foundation outside the complete rig remains canonical.
        static = np.all(a == a[0], axis=0) & np.all(t == t[0], axis=0)
        colors = palette[a[0]]
        weather = static & (a[0] != 0) & (np.min(colors, axis=2) > 185) & (np.ptp(colors, axis=2) < 45)
        weather = weather.repeat(density, 0).repeat(density, 1) & ~transfer
        assert not (donor_motion & ~transfer).any(), 'Do not clip the accepted moving cycle'
        owner = ((a >= 16) & (a < 32)).repeat(density, 1).repeat(density, 2)
        contacts = (a == 12).repeat(density, 1).repeat(density, 2)
        forbidden = owner | contacts
        # Original owner/contact foreground remains authoritative, just as in
        # R16. Record its occlusion explicitly; invisible RGB is not motion.
        overlap = forbidden & donor_motion
        mechanical = donor_motion & ~owner_delta_hd
        for phase, n in enumerate(numbers):
            target = old[0].copy()
            target[transfer] = r16[phase][transfer]
            target[owner_delta_hd] = old[0][owner_delta_hd]
            assert np.array_equal(target[mechanical], r16[phase][mechanical])
            assert np.array_equal(target[weather], old[0][weather])
            frame = next(f for f in variant['frames'] if f['nativeFrame'] == n)
            x, y, fw, fh = frame['contentRect']
            assert target[fh:, :, 3].sum() == target[:, fw:, 3].sum() == 0
            pages[frame['page']][y:y + fh, x:x + fw] = target[:fh, :fw]
            target_data = old_data[phase].copy()
            target_data[transfer] = r16_data[phase][transfer]
            target_data[owner_delta_hd] = old_data[phase][owner_delta_hd]
            data_pages[frame['page']][y:y + fh, x:x + fw] = target_data[:fh, :fw]
        records.append(dict(density=density, state=state, phases=32,
            exactAcceptedMovingPixels=int(mechanical.sum()), transferredEnvelopePixels=int(transfer.sum()),
            protectedStaticSnowPixels=int(weather.sum()), nativeForegroundOcclusionSamples=int(overlap.sum()),
            nativeMechanicalSurfaceExtensions=extensions,
            nativeStaticForegroundOwnerDifferences=int(owner_delta.sum()),
            nativeStaticForegroundPolicy='Damaged Original Snow (0,39) is fixed palette index111; temperate uses owner indices29/30. Preserve the verified Snow material/data for this original foreground pixel.',
            actualIndependentDonorDensity=density, rigidMechanismSource='Accepted complete R16 pixels, no new phase fit or resizing'))
    folder = args.output / entry['path']
    for page, pixels in pages.items():
        Image.fromarray(pixels).save(folder.parent / str(density) / page / 'base.png')
        Image.fromarray(data_pages[page]).save(folder.parent / str(density) / page / 'data.png')
        declaration = next(p for p in variant['pages'] if p['id'] == page)
        for layer in ['base', 'data']:
            file = folder.parent / str(density) / page / (layer + '.png')
            declaration[layer + 'Sha256'] = sha(file)
            declaration[layer + 'Bytes'] = file.stat().st_size

metadata.setdefault('authored', {})['snowR16MotionTransfer'] = dict(
    donorManifestSha256=sha(donor / 'manifest.json'), donorMetadataSha256=sha(donor_file),
    nativeSnowSourceSha256=native['sha256'], originalTemperateSourceSha256=original_donor['sha256'],
    sourceBytesIdentical=False, inheritedRigidMechanism=rig,
    method='Exact-density complete accepted rig and owner material within original registered mechanical surfaces. Original native owner indices match throughout the reused region; Snow foundation, body, flag, original shadows, logical geometry and timing remain target-native.',
    visualAcceptance='PENDING_ANIMATION_ONLY_REVIEW')
metadata['packRevision'] = args.output.name
new_metadata_file = args.output / entry['path']
new_metadata_file.write_text(json.dumps(metadata, separators=(',', ':')) + '\n')
entry['sha256'] = sha(new_metadata_file)
catalog['revision'] = args.output.name
(args.output / 'manifest.json').write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
preserved = []
for file in base.rglob('*'):
    if not file.is_file() or file == base / 'manifest.json' or file == before_file:
        continue
    if file.is_relative_to(before_file.parent) and file.name in ['base.png', 'data.png']:
        continue
    assert sha(file) == sha(args.output / file.relative_to(base)), file
    preserved.append(str(file.relative_to(base)))
receipt = dict(schema='m2-4-snow-oil-r16-motion-candidate-v1',
    status='EXPORTED_CANDIDATE_STATIC_NATIVE_VISUAL_VALIDATION_PENDING',
    selectedPackUnchanged=True, before=str(base.resolve()), beforeSha256=sha(base / 'manifest.json'),
    donor=str(donor.resolve()), donorSha256=sha(donor / 'manifest.json'),
    output=str(args.output.resolve()), outputSha256=sha(args.output / 'manifest.json'),
    modifiedMembers=['caoild_a.shp'], preservedFiles=len(preserved), cases=records,
    originalSourcesUnchanged=True, sourceShadowAndTimingUnchanged=True,
    userAcceptedOtherFamiliesUnchanged=True, Windows='NOT_RUN')
with args.receipt.open('x') as stream:
    json.dump(receipt, stream, indent=2)
    stream.write('\n')
print(json.dumps(dict(status=receipt['status'], cases=records, sha256=receipt['outputSha256'])))
