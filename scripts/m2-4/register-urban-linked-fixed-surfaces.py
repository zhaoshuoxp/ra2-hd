"""Anchor only rigid authored surfaces; retain moving artwork without per-index mixing."""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--version', default='v4')
args = parser.parse_args()
root = Path('.artifacts/m2-4/urban-linked-alignment-r1-v1')
guide = Path('.artifacts/m2-4/urban-linked-native-batch61-v1')
sources = {s['member']: s for s in read(guide / 'source.json')['sources']}
before = Path('.local/environment-packs/urban-environment-m2-4-linked-batch61-v1')
after = before.with_name('urban-environment-m2-4-linked-alignment-r1-' + args.version)
after.mkdir()
for file in before.rglob('*'):
    if file.is_file():
        target = after / file.relative_to(before)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.link(file, target)
catalog = read(before / 'manifest.json')
catalog['revision'] = after.name


def native_canvas(name, number):
    source = sources[name]
    f = source['frames'][number]
    x, y = f['origin']
    w, h = f['size']
    file = guide / 'native' / f['indexFile']
    assert sha(file) == f['indexSha256']
    result = np.zeros(source['canvas'][::-1], np.uint8)
    result[y:y + h, x:x + w] = np.frombuffer(file.read_bytes(), np.uint8).reshape(h, w)
    return result


def load(name, density):
    entry = next(m for f in catalog['families'].values() for m in f['members'] if m['member'] == name)
    metadata = read(before / entry['path'])
    assert sha(before / entry['path']) == entry['sha256']
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    pages = {p['id']: np.array(Image.open((before / entry['path']).parent / str(density) / p['id'] / 'base.png').convert('RGBA'))
        for p in variant['pages']}
    canvases = {}
    for frame in variant['frames']:
        n = frame['nativeFrame']
        x, y, w, h = frame['sampleRect']
        ox, oy = sources[name]['frames'][n]['origin']
        canvas = np.zeros((*[v * density for v in sources[name]['canvas'][::-1]], 4), np.uint8)
        canvas[oy * density:oy * density + h, ox * density:ox * density + w] = pages[frame['page']][y:y + h, x:x + w]
        canvases[n] = canvas
    return entry, metadata, variant, pages, canvases


def replace_json(file, value):
    temporary = file.with_name(file.name + '.new')
    with temporary.open('x') as stream:
        stream.write(json.dumps(value, separators=(',', ':')) + '\n')
    os.replace(temporary, file)


specifications = {
    'nupsya_a.shp': [('normal', list(range(14)), 'nupsya.shp', 0),
        ('damaged', list(range(14, 28)), 'nupsya.shp', 1)],
    'ngpsyb_a.shp': [('damaged', list(range(15, 30)), 'ngpsyb.shp', 1)],
    'cgla10_a.shp': [('normal-and-damaged', list(range(45)), 'cgla10.shp', 0)],
}
records, masks, modified = [], {}, set()
for name, groups in specifications.items():
    source = sources[name]
    native = {n: native_canvas(name, n) for _, numbers, _, _ in groups for n in numbers}
    yy, xx = np.indices(tuple(source['canvas'][::-1]))
    palette_file = guide / 'native' / (source['palette']['sha256'] + '.pal')
    assert sha(palette_file) == source['palette']['sha256']
    palette = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.float32) * 4
    metadata_versions = []
    for density in [2, 4]:
        entry, metadata, variant, pages, authored = load(name, density)
        for state, numbers, body_name, body_number in groups:
            canonical = numbers[0]
            _, _, _, _, body = load(body_name, density)
            body_index, reference = native_canvas(body_name, body_number), native[canonical]
            common = authored[canonical].copy()
            shared = (reference == body_index) & (reference != 0) & (reference != 12)
            shared_hd = np.repeat(np.repeat(shared, density, 0), density, 1) & (body[body_number][..., 3] > 0)
            common[..., :3][shared_hd] = body[body_number][..., :3][shared_hd]
            occupied = (reference != 0) & (reference != 12)
            for number in numbers:
                occupied &= (native[number] != 0) & (native[number] != 12)
            if name == 'nupsya_a.shp':
                # The central shaft/coils and lower assembly share rigid
                # supports. The rotating cap above this boundary is retained.
                region = yy >= 40
            elif name == 'ngpsyb_a.shp':
                region = np.ones(occupied.shape, bool)
            else:
                panel = (xx >= 12) & (xx <= 91) & (yy + .5 * xx >= 53) & (yy + .5 * xx <= 90)
                region = ~panel
            fixed = occupied & region
            fixed_hd = np.repeat(np.repeat(fixed, density, 0), density, 1) & (common[..., 3] > 0)
            for number in numbers:
                index, original = native[number], authored[number]
                changed = original.copy()
                allowed = fixed_hd & (original[..., 3] > 0)
                gain = np.clip((palette[index] + 24) / (palette[reference] + 24), .45, 2.2)
                gain_hd = np.repeat(np.repeat(gain, density, 0), density, 1)
                lit = np.rint(common[..., :3].astype(np.float32) * gain_hd).clip(0, 255).astype(np.uint8)
                changed[..., :3][allowed] = lit[allowed]
                # Only source-identical body overlaps can supply seam pixels.
                # Moving regions outside these masks remain byte exact.
                seam = (index == body_index) & (index != 0) & (index != 12) & region
                seam_hd = np.repeat(np.repeat(seam, density, 0), density, 1)
                seam_hd &= (body[body_number][..., 3] > 0) & (original[..., 3] > 0)
                changed[..., :3][seam_hd] = body[body_number][..., :3][seam_hd]
                changed[..., :3][changed[..., 3] == 0] = 0
                allowed |= seam_hd
                assert np.array_equal(changed[~allowed], original[~allowed])
                assert np.array_equal(changed[..., 3], original[..., 3])
                frame = next(f for f in variant['frames'] if f['nativeFrame'] == number)
                x, y, w, h = frame['sampleRect']
                ox, oy = source['frames'][number]['origin']
                tile = changed[oy * density:oy * density + h, ox * density:ox * density + w]
                padded = np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode='edge')
                padded[..., 3] = 0
                padded[2:h + 2, 2:w + 2] = tile
                pages[frame['page']][y - 2:y + h + 2, x - 2:x + w + 2] = padded
                masks[f'allowed_{name}_{density}_{number}'] = allowed
                masks[f'seam_{name}_{density}_{number}'] = seam_hd
                records.append(dict(member=name, state=state, density=density, sourceFrame=number,
                    fixedNativePixels=int(fixed.sum()), allowedTexels=int(allowed.sum()),
                    sharedBodyTexels=int(seam_hd.sum()), movingTexelsOutsideMaskByteExact=True,
                    changedRgbTexels=int(np.any(changed[..., :3] != original[..., :3], axis=2).sum())))
        for page in variant['pages']:
            relative = Path(entry['path']).parent / str(density) / page['id'] / 'base.png'
            file = after / relative
            temporary = file.with_name(file.name + '.new')
            Image.fromarray(pages[page['id']]).save(temporary, format='PNG')
            os.replace(temporary, file)
            page['baseSha256'], page['baseBytes'] = sha(file), file.stat().st_size
            modified.add(relative.as_posix())
        metadata_versions.append(metadata)
    metadata = metadata_versions[1]
    metadata['variants'][0] = metadata_versions[0]['variants'][0]
    metadata['packRevision'] = after.name
    metadata.setdefault('authored', {})['nativeLinkedFixedSurfaceRegistration'] = dict(
        baselineMetadata=pin(before / entry['path']), sourceSha256=source['sha256'],
        policy='Common rigid surface and exact source-identical body seams. Moving artwork outside the declared source-coordinate masks is byte exact. Native shade changes remain bounded illumination.',
        changedSourceFrames=[n for _, numbers, _, _ in groups for n in numbers], visual='PENDING_SCOPED_REVIEW')
    replace_json(after / entry['path'], metadata)
    entry['sha256'] = sha(after / entry['path'])
    modified.add(entry['path'])
replace_json(after / 'manifest.json', catalog)
mask_file = root / ('fixed-surface-masks-' + args.version + '.npz')
np.savez_compressed(mask_file, **masks)
preserved = {}
for file in before.rglob('*'):
    relative = file.relative_to(before).as_posix()
    if file.is_file() and relative != 'manifest.json' and relative not in modified:
        assert sha(file) == sha(after / relative)
        preserved[relative] = sha(file)
patch = root / ('complete-family-patch-' + args.version)
patch.mkdir()
os.symlink((after / 'members').resolve(), patch / 'members')
subset = dict(catalog, families={k: v for k, v in catalog['families'].items()
    if k in ['urban-napsya', 'urban-napsyb', 'urban-cala10']})
(patch / 'manifest.json').write_text(json.dumps(subset, separators=(',', ':')) + '\n')
receipt = dict(schema='m2-4-urban-linked-fixed-surface-registration-v1', status='EXPORTED_FIXED_SURFACE_CANDIDATE_PENDING_VERIFICATION',
    before=pin(before / 'manifest.json'), output=pin(after / 'manifest.json'), source=pin(guide / 'source.json'),
    selectedPack=dict(schemaVersion=1, revision=after.name, sha256=sha(after / 'manifest.json')),
    records=records, modifiedFiles=sorted(modified), preservedPayloadHashes=preserved,
    masks=pin(mask_file), completeFamilyPatch=str(patch),
    newArtworkGenerated=False, sourceGeometryShadowOwnerTimingUnchanged=True,
    notSelectedDiagnostics=pin(root / 'rejected-candidates.json'), visual='PENDING', windows='NOT_RUN', m24Complete=False)
with (root / ('export-fixed-' + args.version + '.json')).open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], densityFrames=len(records), preservedFiles=len(preserved),
    selectedPack=receipt['selectedPack'])))
