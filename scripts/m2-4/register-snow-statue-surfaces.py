"""Repair transparent statue registration gutters with same-row authored material."""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import independently_sample

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
assert not args.output.exists() and not args.receipt.exists()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/snow-batch27-statue-repair-authoring-v1')
jobs = [load(root / 'imagegen-jobs-normal-v3.json')['jobs'][0],
        load(root / 'imagegen-jobs-v2.json')['jobs'][1]]
catalog = load(args.source / 'manifest.json')
entry, = catalog['families']['snow-caeuro05']['members']
source_file = args.source / entry['path']
assert sha(source_file) == entry['sha256']
metadata = load(source_file)
native = load(Path('.artifacts/m2-4/snow-native-russian-row-batch27-v1/source.json'))
source, = [s for s in native['sources'] if s['member'] == 'caeuro05.shp']
assert metadata['source']['sha256'] == source['sha256']
assert source['totalFrames'] == 6 and metadata['logical']['canvas'] == source['canvas']
plates = []
for job in jobs:
    file = Path(job['destination'])
    assert sha(file) == load(file.with_name(job['id'] + '-imagegen.json'))['masterSha256']
    rgba = np.asarray(Image.open(file).convert('RGBA'))
    valid = rgba[..., 3] > 180
    labels, count = ndimage.label(valid)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    selected = sizes[labels] >= max(50, sizes.max() * .005)
    yy, xx = np.where(selected)
    assert count and len(xx) > 100
    crop = rgba[yy.min():yy.max() + 1, xx.min():xx.max() + 1].copy()
    mask = crop[..., 3] > 180
    nearest = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    crop[~mask, :3] = crop[tuple(nearest[:, ~mask])][:, :3]
    plates.append((crop, mask))
shutil.copytree(args.source, args.output)
records = []
for variant in metadata['variants']:
    density = variant['density']
    assert density in (2, 4)
    pages = {p['id']: np.asarray(Image.open(source_file.parent / str(density) / p['id'] / 'base.png')).copy()
             for p in variant['pages']}
    for frame in variant['frames']:
        number = frame['nativeFrame']
        state = 1 if number == 1 else 0
        plate, mask = plates[state]
        x, y, w, h = frame['contentRect']
        previous = pages[frame['page']][y:y + h, x:x + w].copy()
        assert min(plate.shape[1] / (w / density), plate.shape[0] / (h / density)) >= 4.2
        material = independently_sample(plate[..., :3], (w, h))
        sampled_mask = independently_sample(np.uint8(mask) * 255, (w, h)) > 180
        gutter = (previous[..., 3] > 0) & ~sampled_mask
        mapped = previous.copy()
        for row in range(h):
            src = np.flatnonzero(sampled_mask[row])
            dst = np.flatnonzero(gutter[row])
            if not len(dst) or not len(src):
                continue
            # Extrusion follows the existing authored surface row. It cannot
            # bend tiers, move anatomy or repaint valid material interiors.
            closest = src[np.abs(dst[:, None] - src[None, :]).argmin(axis=1)]
            bounded = np.abs(dst - closest) <= 3 * density
            mapped[row, dst[bounded], :3] = material[row, closest[bounded]]
        indices_path = Path('.artifacts/m2-4/snow-native-russian-row-batch27-v1/native') / source['frames'][number]['indexFile']
        assert sha(indices_path) == source['frames'][number]['indexSha256']
        indices = np.frombuffer(indices_path.read_bytes(), np.uint8).reshape(h // density, w // density)
        contact = (indices == 12).repeat(density, 0).repeat(density, 1)
        mapped[contact] = previous[contact]
        assert np.array_equal(mapped[..., 3], previous[..., 3])
        assert np.array_equal(mapped[~gutter], previous[~gutter])
        pages[frame['page']][y:y + h, x:x + w] = mapped
        records.append(dict(density=density, frame=number, exactAlpha=True,
                            exactOwnerData=True, exactNativeContactPixels=int(contact.sum())))
    for page in variant['pages']:
        file = (args.output / entry['path']).parent / str(density) / page['id'] / 'base.png'
        Image.fromarray(pages[page['id']]).save(file)
        page['baseSha256'], page['baseBytes'] = sha(file), file.stat().st_size
metadata['packRevision'] = args.output.name
metadata.setdefault('authored', {})['statueSurfaceRegistration'] = dict(
    sourceSha256=source['sha256'], motherSha256s=[sha(Path(j['destination'])) for j in jobs],
    method='Same-row material extrusion only in transparent authoring gutters, bounded to three native pixels. Valid material interiors, native alpha/owner/contact geometry and all other members remain exact.')
file = args.output / entry['path']
file.write_text(json.dumps(metadata, separators=(',', ':')) + '\n')
entry['sha256'] = sha(file)
catalog['revision'] = args.output.name
(args.output / 'manifest.json').write_text(json.dumps(catalog, separators=(',', ':')) + '\n')
preserved = 0
for p in args.source.rglob('*'):
    if not p.is_file() or p == args.source / 'manifest.json' or p == source_file:
        continue
    if p.is_relative_to(source_file.parent) and p.name == 'base.png':
        continue
    assert sha(p) == sha(args.output / p.relative_to(args.source)), p
    preserved += 1
with args.receipt.open('x') as stream:
    json.dump(dict(status='REGISTERED_SURFACE_CANDIDATE_VISUAL_NATIVE_PENDING',
        source=str(args.source.resolve()), output=str(args.output.resolve()),
        outputSha256=sha(args.output / 'manifest.json'), cases=records,
        preservedFiles=preserved, modifiedMembers=['caeuro05.shp'], Windows='NOT_RUN'), stream, indent=2)
print(json.dumps(dict(cases=len(records), preservedFiles=preserved, sha256=sha(args.output / 'manifest.json'))))
