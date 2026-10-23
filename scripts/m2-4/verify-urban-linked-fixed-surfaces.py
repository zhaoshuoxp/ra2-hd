"""Verify rigid drift controls, body seams, native data and untouched moving texels."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-linked-alignment-r1-v1')
guide = Path('.artifacts/m2-4/urban-linked-native-batch61-v1')
sources = {s['member']: s for s in read(guide / 'source.json')['sources']}
before = Path('.local/environment-packs/urban-environment-m2-4-linked-batch61-v1')
after = before.with_name('urban-environment-m2-4-linked-alignment-r1-v4')
export = read(root / 'export-fixed-v4.json')
masks = np.load(root / 'fixed-surface-masks-v4.npz')
assert sha(after / 'manifest.json') == export['selectedPack']['sha256']
assert read(root / 'independent-verification-v4.json')['status'] == 'PASS'
old_pack, new_pack = read(before / 'manifest.json'), read(after / 'manifest.json')
cases, drift = [], []


def frames(pack, name, density):
    entry = next(m for f in read(pack / 'manifest.json')['families'].values() for m in f['members'] if m['member'] == name)
    metadata = read(pack / entry['path'])
    assert sha(pack / entry['path']) == entry['sha256']
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    folder = (pack / entry['path']).parent
    pages = {p['id']: np.asarray(Image.open(folder / str(density) / p['id'] / 'base.png').convert('RGBA')) for p in variant['pages']}
    result = {}
    for f in variant['frames']:
        n = f['nativeFrame']
        x, y, w, h = f['sampleRect']
        ox, oy = sources[name]['frames'][n]['origin']
        canvas = np.zeros((*[v * density for v in sources[name]['canvas'][::-1]], 4), np.uint8)
        canvas[oy * density:oy * density + h, ox * density:ox * density + w] = pages[f['page']][y:y + h, x:x + w]
        result[n] = canvas
    return metadata, result


def native_canvas(name, number):
    source = sources[name]
    f = source['frames'][number]
    x, y = f['origin']
    w, h = f['size']
    result = np.zeros(source['canvas'][::-1], np.uint8)
    file = guide / 'native' / f['indexFile']
    assert sha(file) == f['indexSha256']
    result[y:y + h, x:x + w] = np.frombuffer(file.read_bytes(), np.uint8).reshape(h, w)
    return result


for name, body_name, ranges in [('nupsya_a.shp', 'nupsya.shp', [(0, 14, 0), (14, 28, 1)]),
        ('ngpsyb_a.shp', 'ngpsyb.shp', [(15, 30, 1)]), ('cgla10_a.shp', 'cgla10.shp', [(0, 45, 0)])]:
    for density in [2, 4]:
        old_meta, old = frames(before, name, density)
        new_meta, new = frames(after, name, density)
        _, body = frames(before, body_name, density)
        assert old_meta['source'] == new_meta['source'] and old_meta['logical'] == new_meta['logical']
        for ov, nv in zip(old_meta['variants'], new_meta['variants']):
            assert ov['frames'] == nv['frames']
            for op, npg in zip(ov['pages'], nv['pages']):
                assert op['id'] == npg['id'] and op['size'] == npg['size']
                assert op['dataSha256'] == npg['dataSha256']
        changed_numbers = {n for lo, hi, _ in ranges for n in range(lo, hi)}
        for n in old:
            if n not in changed_numbers:
                assert np.array_equal(old[n], new[n])
        for lo, hi, body_number in ranges:
            native = np.stack([native_canvas(name, n) for n in range(lo, hi)])
            stationary = (native[0] != 0) & (native[0] != 12) & np.all(native == native[0], axis=0)
            fixed = np.repeat(np.repeat(stationary, density, 0), density, 1)
            old_stack, new_stack = np.stack([old[n] for n in range(lo, hi)]), np.stack([new[n] for n in range(lo, hi)])
            fixed &= np.all(old_stack[..., 3] > 0, axis=0)
            for n in range(lo, hi):
                allowed = masks[f'allowed_{name}_{density}_{n}']
                seam = masks[f'seam_{name}_{density}_{n}']
                fixed &= allowed
                assert np.array_equal(old[n][~allowed], new[n][~allowed])
                assert np.array_equal(old[n][..., 3], new[n][..., 3])
                assert np.array_equal(new[n][..., :3][seam], body[body_number][..., :3][seam])
                cases.append(dict(member=name, density=density, frame=n, outsideRegistrationMaskExact=True,
                    alphaExact=True, categoricalDataExact=True, sharedBodyMismatchTexels=0,
                    sharedBodyTexels=int(seam.sum())))
            old_drift = np.any(old_stack[..., :3] != old_stack[0, ..., :3], axis=(0, 3)) & fixed
            new_drift = np.any(new_stack[..., :3] != new_stack[0, ..., :3], axis=(0, 3)) & fixed
            assert fixed.any() and old_drift.any() and not new_drift.any()
            drift.append(dict(member=name, density=density, frames=[lo, hi], fixedVisibleTexels=int(fixed.sum()),
                driftingTexelsBefore=int(old_drift.sum()), driftingTexelsAfter=0))
modified = {'nupsya_a.shp', 'ngpsyb_a.shp', 'cgla10_a.shp'}
preserved_families = []
for family, old in old_pack['families'].items():
    new = new_pack['families'][family]
    assert old['familyHash'] == new['familyHash']
    assert [m['member'] for m in old['members']] == [m['member'] for m in new['members']]
    if not any(m['member'] in modified for m in old['members']):
        assert old == new
        preserved_families.append(family)
assert len(preserved_families) == 281 and len(cases) == 176
for relative, digest in export['preservedPayloadHashes'].items():
    assert sha(before / relative) == sha(after / relative) == digest
report = dict(status='PASS_FIXED_SURFACE_DRIFT_BODY_JOINS_AND_UNCHANGED_NATIVE_MOTION',
    selectedPack=export['selectedPack'], densityFrameCases=cases, stationaryDriftControls=drift,
    exactPreservedFamilies=281, exactPreservedPayloadFiles=len(export['preservedPayloadHashes']),
    untouchedBeaconNormalFrames=list(range(15)), geometryOwnerDataShadowTimingChanged=False,
    fullNativeLoops='PENDING', visual='PENDING_THREE_REPORTED_FAMILIES', windows='NOT_RUN', m24Complete=False)
with (root / 'registration-verification-v4.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(status=report['status'], cases=len(cases), preservedFamilies=281, drift=drift)))
