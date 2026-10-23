"""Register existing authored texels to native canvas coordinates across linked loops."""
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
root = Path('.artifacts/m2-4/urban-linked-alignment-r1-v1')
guide = Path('.artifacts/m2-4/urban-linked-native-batch61-v1')
sources = {s['member']: s for s in read(guide / 'source.json')['sources']}
contract_file = Path('desktop/environment-urban-hd-contract.json')
contract = read(contract_file)
base = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(base / 'manifest.json') == contract['selectedPack']['sha256']
assert base.name == 'urban-environment-m2-4-linked-batch61-v1'
destination = base.parent / 'urban-environment-m2-4-linked-alignment-r1-v1'
destination.mkdir()
catalog = read(base / 'manifest.json')
catalog['revision'] = destination.name
for file in base.rglob('*'):
    if file.is_file():
        target = destination / file.relative_to(base)
        target.parent.mkdir(parents=True, exist_ok=True)
        os.link(file, target)


def replace_bytes(file, data):
    temporary = file.with_name(file.name + '.new')
    with temporary.open('xb') as stream:
        stream.write(data)
    os.replace(temporary, file)


def replace_png(file, array):
    temporary = file.with_name(file.name + '.new')
    Image.fromarray(array).save(temporary, format='PNG')
    os.replace(temporary, file)


def indices(name, number):
    source = sources[name]
    frame = source['frames'][number]
    x, y = frame['origin']
    w, h = frame['size']
    file = guide / 'native' / frame['indexFile']
    assert sha(file) == frame['indexSha256']
    result = np.zeros(source['canvas'][::-1], np.uint8)
    result[y:y + h, x:x + w] = np.frombuffer(file.read_bytes(), np.uint8).reshape(h, w)
    return result


def load_frames(name, density):
    family = next(f for f in catalog['families'].values() if any(m['member'] == name for m in f['members']))
    entry = next(m for m in family['members'] if m['member'] == name)
    metadata = read(base / entry['path'])
    assert sha(base / entry['path']) == entry['sha256']
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    folder = (base / entry['path']).parent
    pages = {p['id']: np.asarray(Image.open(folder / str(density) / p['id'] / 'base.png').convert('RGBA')).copy()
        for p in variant['pages']}
    frames = {}
    for frame in variant['frames']:
        number = frame['nativeFrame']
        x, y, w, h = frame['contentRect']
        ox, oy = sources[name]['frames'][number]['origin']
        canvas = np.zeros((*[n * density for n in sources[name]['canvas'][::-1]], 4), np.uint8)
        canvas[oy * density:oy * density + h, ox * density:ox * density + w] = pages[frame['page']][y:y + h, x:x + w]
        frames[number] = canvas
    return entry, metadata, variant, pages, frames


# These are source-coordinate registration regions, never replacements for
# native alpha, silhouettes, owner indices, depth, timing or moving geometry.
specifications = {
    'nupsya_a.shp': [('normal', list(range(14)), 'nupsya.shp', 0),
        ('damaged', list(range(14, 28)), 'nupsya.shp', 1)],
    'ngpsyb_a.shp': [('damaged', list(range(15, 30)), 'ngpsyb.shp', 1)],
    'cgla10_a.shp': [('normal-and-damaged', list(range(45)), 'cgla10.shp', 0)],
}
records, maps, modified_files = [], {}, set()
for name, states in specifications.items():
    source = sources[name]
    native = {n: indices(name, n) for _, numbers, _, _ in states for n in numbers}
    palette_file = guide / 'native' / (source['palette']['sha256'] + '.pal')
    assert sha(palette_file) == source['palette']['sha256']
    palette = np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.float32) * 4
    yy, xx = np.indices(tuple(source['canvas'][::-1]))
    for density in [2, 4]:
        entry, metadata, variant, pages, authored = load_frames(name, density)
        for state, numbers, body_name, body_number in states:
            canonical = numbers[0]
            _, _, _, _, body_frames = load_frames(body_name, density)
            original = native[canonical]
            body_index = indices(body_name, body_number)
            common = authored[canonical].copy()
            shared = (original == body_index) & (original != 0) & (original != 12)
            shared_hd = np.repeat(np.repeat(shared, density, 0), density, 1)
            visible_body = body_frames[body_number][..., 3] > 0
            shared_hd &= visible_body
            common[..., :3][shared_hd] = body_frames[body_number][..., :3][shared_hd]
            # Equal original indices at equal canvas coordinates always select
            # the same authored texel. Pose changes keep their original masks.
            seen = np.zeros((256, *original.shape), bool)
            material = {}
            for number in numbers:
                index = native[number]
                for value in np.unique(index):
                    if value in [0, 12]:
                        continue
                    mask = (index == value) & ~seen[value]
                    if not mask.any():
                        continue
                    seen[value] |= mask
                    hd_mask = np.repeat(np.repeat(mask, density, 0), density, 1)
                    material.setdefault(int(value), np.zeros_like(common[..., :3]))
                    pixels = common if number == canonical else authored[number]
                    material[int(value)][hd_mask] = pixels[..., :3][hd_mask]
            # The lower amplifier assembly, damaged beacon pedestal and
            # billboard frame/support are rigid. Original shade changes remain
            # illumination of one coordinate-locked material, not new poses.
            if name == 'nupsya_a.shp':
                rigid_region = yy >= 110
            elif name == 'ngpsyb_a.shp':
                rigid_region = yy >= 110
            else:
                panel = (xx >= 12) & (xx <= 91) & (yy + .5 * xx >= 53) & (yy + .5 * xx <= 90)
                rigid_region = ~panel
            always_visible = (original != 0) & (original != 12)
            for number in numbers:
                always_visible &= (native[number] != 0) & (native[number] != 12)
            rigid = rigid_region & always_visible
            rigid_hd = np.repeat(np.repeat(rigid, density, 0), density, 1)
            for number in numbers:
                index = native[number]
                before = authored[number]
                changed = before.copy()
                for value, texels in material.items():
                    mask = np.repeat(np.repeat(index == value, density, 0), density, 1)
                    changed[..., :3][mask] = texels[mask]
                # Match native palette illumination with bounded gains. The
                # resolved 2X and 4X detail remains authored at each density.
                gain = np.clip((palette[index] + 24) / (palette[original] + 24), .45, 2.2)
                gain_hd = np.repeat(np.repeat(gain, density, 0), density, 1)
                lit = np.rint(common[..., :3].astype(np.float32) * gain_hd).clip(0, 255).astype(np.uint8)
                changed[..., :3][rigid_hd] = lit[rigid_hd]
                # Exact original body/animation overlaps use one body texture,
                # including the amplifier's lower-right join in every phase.
                seam = (index == body_index) & (index != 0) & (index != 12)
                seam_hd = np.repeat(np.repeat(seam, density, 0), density, 1) & visible_body
                changed[..., :3][seam_hd] = body_frames[body_number][..., :3][seam_hd]
                assert np.array_equal(changed[..., 3], before[..., 3])
                frame = next(f for f in variant['frames'] if f['nativeFrame'] == number)
                x, y, w, h = frame['contentRect']
                ox, oy = source['frames'][number]['origin']
                crop = changed[oy * density:oy * density + h, ox * density:ox * density + w]
                pages[frame['page']][y:y + h, x:x + w] = crop
                maps[f'rigid_{name}_{density}_{number}'] = rigid_hd
                maps[f'seam_{name}_{density}_{number}'] = seam_hd
                records.append(dict(member=name, state=state, density=density, sourceFrame=number,
                    rigidNativePixels=int(rigid.sum()), sharedBodyTexels=int(seam_hd.sum()),
                    changedRgbTexels=int(np.any(changed[..., :3] != before[..., :3], axis=2).sum()),
                    alphaUnchanged=True, nativeDataUnchanged=True))
        for page in variant['pages']:
            file = destination / Path(entry['path']).parent / str(density) / page['id'] / 'base.png'
            replace_png(file, pages[page['id']])
            page['baseSha256'], page['baseBytes'] = sha(file), file.stat().st_size
            modified_files.add(file.relative_to(destination).as_posix())
        # Carry metadata across densities without reopening the original.
        pending = root / (name.replace('.', '-') + '-metadata.json')
        if density == 2:
            pending.write_text(json.dumps(metadata) + '\n')
        else:
            prior = read(pending)
            metadata['variants'][0] = prior['variants'][0]
            metadata['packRevision'] = destination.name
            metadata.setdefault('authored', {})['nativeLinkedCoordinateRegistration'] = dict(
                baselineMetadata=pin(base / entry['path']), sourceSha256=source['sha256'],
                bodyMember=states[0][2], policy='Common native-coordinate authored texels, rigid support illumination, exact shared body joins. Original motion, alpha, owner data, slots and shadows unchanged.',
                changedSourceFrames=[n for _, numbers, _, _ in states for n in numbers], visual='PENDING_SCOPED_REVIEW')
            replace_bytes(destination / entry['path'], (json.dumps(metadata, separators=(',', ':')) + '\n').encode())
            entry['sha256'] = sha(destination / entry['path'])
            modified_files.add(entry['path'])
replace_bytes(destination / 'manifest.json', (json.dumps(catalog, separators=(',', ':')) + '\n').encode())
np.savez_compressed(root / 'registration-masks.npz', **maps)
preserved = 0
for file in base.rglob('*'):
    if file.is_file() and file != base / 'manifest.json' and file.relative_to(base).as_posix() not in modified_files:
        assert sha(file) == sha(destination / file.relative_to(base))
        preserved += 1
receipt = dict(schema='m2-4-urban-linked-coordinate-registration-v1', status='EXPORTED_REGISTRATION_CANDIDATE_NOT_YET_VERIFIED',
    before=pin(base / 'manifest.json'), output=pin(destination / 'manifest.json'), source=pin(guide / 'source.json'),
    selectedPack=dict(schemaVersion=1, revision=destination.name, sha256=sha(destination / 'manifest.json')),
    records=records, preservedFiles=preserved, modifiedFiles=sorted(modified_files),
    registrationMasks=pin(root / 'registration-masks.npz'), newArtworkGenerated=False,
    sourceGeometryShadowOwnerTimingUnchanged=True, windows='NOT_RUN', visual='PENDING', m24Complete=False)
with (root / 'export.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], densityFrames=len(records), preservedFiles=preserved,
    selectedPack=receipt['selectedPack'])))
