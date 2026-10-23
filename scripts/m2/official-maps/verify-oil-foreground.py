"""Audit Original foreground samples, accepted registration and occlusion changes."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

parser = argparse.ArgumentParser(description=__doc__)
for name in ('before', 'rejected', 'after', 'export', 'output'):
    parser.add_argument(name, type=Path)
args = parser.parse_args()
assert not args.output.exists()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
records = {(r['density'], r['frame']): r for r in load(args.export)['frames']}
rig = {(r['density'], r['frame']): r for r in load(Path('.artifacts/m2-3/feedback-r9-v1/oil-export-v11.json'))['frames']
       if r['member'] == 'ctoild_a.shp'}
guide = Path('.artifacts/m2-3/native-guides-v3')
source = next(s for s in load(guide/'source.json')['sources'] if s['member'] == 'ctoild_a.shp')
indices, original = [], []
for f in source['frames'][:64]:
    assert sha(guide/'native'/f['indexFile']) == f['indexSha256']
    assert sha(guide/'native'/f['file']) == f['rgbaSha256']
    indices.append(np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61))
    original.append(np.frombuffer((guide/'native'/f['file']).read_bytes(), np.uint8).reshape(69, 61, 4))
indices, original = np.stack(indices), np.stack(original)


def frames(root, density):
    folder = root/'members/ctoild_a-shp'
    v = next(v for v in load(folder/'manifest.json')['variants'] if v['density'] == density)
    pages = {p['id']: np.array(Image.open(folder/str(density)/p['id']/'base.png')) for p in v['pages']}
    return {f['nativeFrame']: pages[f['page']][f['contentRect'][1]:f['contentRect'][1]+f['contentRect'][3],
            f['contentRect'][0]:f['contentRect'][0]+f['contentRect'][2]] for f in v['frames']}, v


for member in ('ctoild-shp', 'ctoild_f-shp'):
    old, new = [root/'members'/member for root in (args.before, args.after)]
    paths = {p.relative_to(old) for p in old.rglob('*') if p.is_file()}
    assert paths == {p.relative_to(new) for p in new.rglob('*') if p.is_file()}
    assert all(sha(old/p) == sha(new/p) for p in paths)
report = dict(status='RUNNING', bodyAndFlag='ALL_FILES_BYTE_IDENTICAL_R9',
              rigCoordinates='EXACT_R9_ALL_128_FRAMES', cases=[], visualAcceptance='PENDING_R11')
y, x = np.indices((69, 61))
for density in (2, 4):
    old, ov = frames(args.before, density)
    rejected, _ = frames(args.rejected, density)
    new, nv = frames(args.after, density)
    assert ov['frames'] == nv['frames'] and set(new) == set(range(64))
    for state in (0, 1):
        row = dict(density=density, state='normal' if state == 0 else 'damaged', phases=32,
                   changedPixels=0, originalBrightSamples=0, oldBlackBrightPixels=0, newBlackBrightPixels=0,
                   interiorDarkMetalSamples=0,
                   restoredPaletteCollisionPixels=0, rejectedPaintOutsideForeground=0)
        native = indices[state*32:(state+1)*32]
        fixed = np.all(native == native[0], axis=0)
        pipe = fixed & (x < 10) & (y > 35)
        for n in range(state*32, (state+1)*32):
            r = records[(density, n)]
            for key in ('fixedAxle', 'crankPin', 'beamBearing', 'frontRodTop', 'frontRodFoot', 'rodCoveredFraction'):
                assert r[key] == rig[(density, n)][key], (density, n, key)
            mask = np.array(r['foreground'], bool)
            allowed = np.array(r['allowed'], bool).repeat(density, 0).repeat(density, 1)
            changed = np.any(old[n] != new[n], axis=2)
            assert np.array_equal(old[n][..., 3], new[n][..., 3])
            assert not (changed & ~allowed).any(), (density, n, 'outside beam RGB')
            assert not (mask & ((indices[n] >= 16) & (indices[n] <= 31))).any(), 'owner occlusion'
            assert not (mask & pipe).any(), 'fixed front pipe'
            assert not (changed & pipe.repeat(density, 0).repeat(density, 1)).any()
            row['changedPixels'] += int(changed.sum())
            # Original bright metal outside R9's old foreground catches the
            # rejected black edge; the raw source drives this negative control.
            rgb = original[n, ..., :3].astype(int)
            bright = (rgb[..., 0] >= 190) & (rgb[..., 1] >= 150) & (rgb[..., 0]-rgb[..., 2] >= 15)
            bright &= mask & (x >= 10) & (x < 47) & (y < 50)
            boundary = (distance_transform_edt(mask) <= 1.5).repeat(density, 0).repeat(density, 1)
            bright = bright.repeat(density, 0).repeat(density, 1) & (new[n][..., 3] > 0)
            row['originalBrightSamples'] += int(bright.sum())
            row['oldBlackBrightPixels'] += int((bright & boundary & (old[n][..., :3].mean(axis=2) < 45)).sum())
            row['newBlackBrightPixels'] += int((bright & boundary & (new[n][..., :3].mean(axis=2) < 45)).sum())
            row['interiorDarkMetalSamples'] += int((bright & ~boundary & (new[n][..., :3].mean(axis=2) < 45)).sum())
            # Palette collisions are inspected separately from visible fixed
            # tank material: identical white indices cannot punch beam holes.
            collision = mask & fixed & (indices[n] >= 32) & (indices[n] <= 63)
            collision &= (x >= 14) & (x < 24) & (y >= 26) & (y < 47)
            row['restoredPaletteCollisionPixels'] += int((changed & collision.repeat(density, 0).repeat(density, 1)).sum())
            extra = ~mask & (distance_transform_edt(~mask) <= 3.25) & (y < 55) & (x >= 5) & (x < 47)
            row['rejectedPaintOutsideForeground'] += int((np.any(rejected[n] != old[n], axis=2) &
                extra.repeat(density, 0).repeat(density, 1)).sum())
        assert row['oldBlackBrightPixels'] > 0, 'R9 must fail the edge negative control'
        assert row['newBlackBrightPixels'] == 0, row
        assert row['restoredPaletteCollisionPixels'] == 0, 'Visible fixed tank remains exact in this source'
        assert row['rejectedPaintOutsideForeground'] > 0, 'Exercise rejected R10 expansion'
        report['cases'].append(row)
for f in source['frames'][64:128]:
    assert sha(guide/'native'/f['indexFile']) == f['indexSha256']
    assert sha(guide/'native'/f['file']) == f['rgbaSha256']
report['nativeShadows'] = 'ORIGINAL_GUIDE_BYTES_AND_UNCHANGED_RUNTIME_PATH'
report['status'] = 'PASS_FOREGROUND_NEGATIVE_CONTROLS_AND_ACCEPTED_REGISTRATION'
args.output.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
