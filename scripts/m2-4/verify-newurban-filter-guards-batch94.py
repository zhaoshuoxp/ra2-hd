"""Verify inherited samples including their complete two-texel filtering guards."""
from pathlib import Path
import hashlib
import numpy as np
from newurban_batch94_io import ROOT, read, write
from newurban_batch93_io import atlas_pixels

export = read(ROOT / 'export-and-preservation-v4.json')
pointers = [export['baseline'], export['candidate']]
roots = [Path('.local/terrain-packs') / pointer['revision'] for pointer in pointers]
manifests = [read(root / 'manifest.json') for root in roots]
samples = []
for index, old in enumerate(manifests[0]['groups']):
    for density in [2, 4]:
        variants = [next(v for v in manifest['groups'][index]['variants'] if v['density'] == density)
                    for manifest in manifests]
        pages = [atlas_pixels(str(root / variant['file']), variant['sha256'], tuple(variant['size']))
                 for root, variant in zip(roots, variants, strict=True)]
        for slot, rects in enumerate(zip(variants[0]['rects'], variants[1]['rects'], strict=True)):
            crops = [page[y - 2:y + h + 2, x - 2:x + w + 2]
                     for page, (x, y, w, h) in zip(pages, rects, strict=True)]
            assert np.array_equal(*crops), (old['id'], density, slot)
            samples.append(dict(group=old['id'], density=density, atlasSlot=slot,
                guardedRgbaSha256=hashlib.sha256(crops[0].tobytes()).hexdigest()))
write(ROOT / 'inherited-filter-guards-v1.json', dict(
    status='PASS_ALL_2372_INHERITED_SAMPLES_AND_TWO_TEXEL_GUARDS_BYTE_EXACT',
    baseline=pointers[0], candidate=pointers[1], samples=samples, count=len(samples),
    policy='Retained visible artwork and linear-filter edge inputs remain exact; no new visual acceptance is required for atlas placement alone.'))
print(dict(status='PASS_FILTER_GUARDS', samples=len(samples)))
