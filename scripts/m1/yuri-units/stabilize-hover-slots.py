"""Register a rigid hovering body across native walk phases without changing shadows."""
import hashlib
import json
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path.cwd().resolve()
ART = ROOT / '.artifacts/yuri-units/feedback-r10'
OLD = ROOT / '.local/hd-packs/yuri-yurix-authored/r1'
parser = argparse.ArgumentParser()
parser.add_argument('--revision', default='r2')
parser.add_argument('--evidence', type=int, default=1)
parser.add_argument('--prior-receipt', type=Path, default=ROOT / '.artifacts/yuri-units/feedback-r3/installed-resources-v1.json')
args = parser.parse_args()
assert args.revision.replace('-', '').isalnum()
NEW = ROOT / '.local/hd-packs/yuri-yurix-authored' / args.revision
FAMILY = ROOT / '.local/hd-packs/yuri-yuripr-family' / args.revision / 'family.json'
source = json.loads((ROOT / '.artifacts/yuri-units/source-v2/yurix.shp.json').read_text())
manifest = json.loads((OLD / 'manifest.json').read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert not FAMILY.exists()
assert not NEW.exists() or not any(NEW.iterdir())
NEW.mkdir(parents=True, exist_ok=True)
changes = []


def full_frame(pages, variant, index, kind):
    frame = variant['frames'][index]
    x, y, w, h = frame['sampleRect']
    crop = pages[frame['page']][kind].crop((x, y, x + w, y + h))
    density = variant['density']
    native = source['frames'][index]
    out = Image.new('RGBA', tuple(value * density for value in source['canvas']))
    out.paste(crop, (native['x'] * density, native['y'] * density))
    return np.array(out)


def ground(index, density):
    frame = source['frames'][index]
    indices = np.array(frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
    native_ground = indices == 12
    # Only the ground below the colored body is a changing cast shadow. Black
    # pixels beside or inside the platform belong to its rigid silhouette.
    native_ground[:color_bounds(index)[3] - frame['y']] = False
    mask = np.zeros((source['canvas'][1] * density, source['canvas'][0] * density), bool)
    x, y = frame['x'] * density, frame['y'] * density
    mask[y:y + frame['height'] * density, x:x + frame['width'] * density] = np.repeat(
        np.repeat(native_ground, density, axis=0), density, axis=1)
    return mask


def color_bounds(index):
    frame = source['frames'][index]
    indices = np.array(frame['pixels'], np.uint8).reshape(frame['height'], frame['width'])
    bounds = Image.fromarray(((indices != 0) & (indices != 12)).astype(np.uint8) * 255).getbbox()
    return tuple(value + (frame['x'] if axis % 2 == 0 else frame['y'])
                 for axis, value in enumerate(bounds))


for variant in manifest['variants']:
    density = variant['density']
    pages = {page['id']: {kind: Image.open(OLD / page[kind]).convert('RGBA') for kind in ['base', 'data']}
             for page in variant['pages']}
    originals = {index: {kind: full_frame(pages, variant, index, kind) for kind in ['base', 'data']}
                 for index in range(8, 56)}
    for heading in range(8):
        reference = 8 + heading * 6
        rgba = originals[reference]['base'].copy()
        data = originals[reference]['data'].copy()
        rgba[ground(reference, density)] = 0
        data[ground(reference, density)] = [0, 0, 0, 255]
        # Native walk trims bounce by one or two pixels. A single proportional
        # fit inside their shared body bounds keeps the complete rigid platform
        # and its crown visible without altering any native render geometry.
        bounds = [(frame['x'], frame['y'], frame['x'] + frame['width'], color_bounds(index)[3])
                  for index, frame in enumerate(source['frames'][reference:reference + 6], reference)]
        left, top = max(b[0] for b in bounds), max(b[1] for b in bounds)
        right, bottom = min(b[2] for b in bounds), min(b[3] for b in bounds)
        native = source['frames'][reference]
        crop = (native['x'], native['y'], native['x'] + native['width'], color_bounds(reference)[3])
        scale = min((right - left) / (crop[2] - crop[0]), (bottom - top) / (crop[3] - crop[1]))
        logical_size = [min(right - left, round((crop[2] - crop[0]) * scale)),
                        min(bottom - top, round((crop[3] - crop[1]) * scale))]
        origin = [left + (right - left - logical_size[0]) / 2, bottom - logical_size[1]]
        size = tuple(value * density for value in logical_size)
        pixel_crop = tuple(value * density for value in crop)
        for kind, full in [('base', rgba), ('data', data)]:
            patch = Image.fromarray(full).crop(pixel_crop)
            patch = (patch.convert('RGBa').resize(size, Image.Resampling.LANCZOS).convert('RGBA')
                     if kind == 'base' else patch.resize(size, Image.Resampling.NEAREST))
            canvas = Image.new('RGBA', tuple(value * density for value in source['canvas']),
                               (0, 0, 0, 255 if kind == 'data' else 0))
            canvas.paste(patch, tuple(round(value * density) for value in origin))
            if kind == 'base':
                rgba = np.array(canvas)
            else:
                data = np.array(canvas)
        data[rgba[:, :, 3] == 0, :3] = 0
        for index in range(reference, reference + 6):
            native = source['frames'][index]
            x, y = native['x'] * density, native['y'] * density
            w, h = native['width'] * density, native['height'] * density
            outside = rgba[:, :, 3].copy()
            outside[y:y + h, x:x + w] = 0
            assert not outside.any(), ('Rigid body exceeds native trim', density, index)
            body = rgba.copy()
            owner = data.copy()
            native_ground = ground(index, density)
            body[native_ground] = originals[index]['base'][native_ground]
            owner[native_ground] = originals[index]['data'][native_ground]
            frame = variant['frames'][index]
            ax, ay, aw, ah = frame['sampleRect']
            for kind, full in [('base', body), ('data', owner)]:
                crop = Image.fromarray(full[y:y + ah, x:x + aw])
                assert crop.size == (aw, ah)
                pages[frame['page']][kind].paste(crop, (ax, ay))
            changes.append({'density': density, 'frame': index, 'bodyReference': reference,
                            'nativeGroundPixelsPreserved': int(native_ground.sum()),
                            'bodyScale': scale, 'bodySize': logical_size, 'bodyOrigin': origin})
    for page in variant['pages']:
        for kind in ['base', 'data']:
            output = NEW / page[kind]
            pages[page['id']][kind].save(output)
            page[kind + 'Sha256'] = sha(output)
            page[kind + 'Bytes'] = output.stat().st_size

manifest['packRevision'] = args.revision
manifest['provenance']['rigidHoverRegistration'] = {
    'sourceManifest': str(OLD / 'manifest.json'), 'sourceSha256': sha(OLD / 'manifest.json'),
    'walkSlots': [8, 55], 'referencePhase': 0,
    'retained': 'Native slot indices, trims, timings, owner data and per-phase indexed ground shadows',
    'method': 'Proportionally fit the accepted phase-zero body into the shared native body bounds; retain each native ground patch.',
}
(NEW / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
family = json.loads((ROOT / '.local/hd-packs/yuri-yuripr-family/r1/family.json').read_text())
family['members'][0].update({'revision': args.revision, 'sha256': sha(NEW / 'manifest.json')})
FAMILY.parent.mkdir(parents=True)
FAMILY.write_text(json.dumps(family, indent=2) + '\n')
catalog_path = ROOT / 'desktop/yuri-unit-contracts.json'
catalog = json.loads(catalog_path.read_text())
entry = catalog['shp']['YURIPR']
entry.update({'familyPath': f'hd-packs/yuri-yuripr-family/{args.revision}/family.json',
              'hash': sha(FAMILY), 'familyHash': sha(FAMILY)})
entry['members'][0]['manifestHash'] = sha(NEW / 'manifest.json')
catalog_path.write_text(json.dumps(catalog, indent=2) + '\n')
prior = json.loads(args.prior_receipt.read_text())
new_files = []
for path in sorted([*NEW.iterdir(), FAMILY]):
    relative = path.relative_to(ROOT / '.local').as_posix()
    new_files.append({'path': relative, 'sha256': sha(path), 'bytes': path.stat().st_size})
prior['files'].extend(new_files)
prior['status'] = 'INSTALLED_R10_RIGID_HOVER_WITH_PRIOR_RESOURCES_RETAINED'
(ART / f'installed-resources-v{args.evidence}.json').write_text(json.dumps(prior, indent=2) + '\n')
receipt = {'status': 'PASS_RIGID_HOVER_NATIVE_TRIMS_AND_GROUND_PRESERVED',
           'newFamily': str(FAMILY), 'newManifest': str(NEW / 'manifest.json'),
           'newFiles': new_files, 'walkRegistration': changes,
           'priorManifestSha256': sha(OLD / 'manifest.json'), 'masterArtworkChanged': False,
           'nativeLogicalMetadataUnchanged': True}
(ART / f'hover-registration-v{args.evidence}.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': receipt['status'], 'slots': len(changes), 'newFiles': len(new_files)}))
