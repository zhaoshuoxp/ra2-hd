"""Audit all beam overlays, including an independent retail highlight regression."""
import argparse
import hashlib
import json
import runpy
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

parser = argparse.ArgumentParser(description=__doc__)
for name in ('before', 'after', 'export', 'output'):
    parser.add_argument(name, type=Path)
args = parser.parse_args()
assert not args.output.exists()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
records = load(args.export)['frames']
guide = Path('.artifacts/m2-3/native-guides-v3')
source = next(s for s in load(guide/'source.json')['sources'] if s['member'] == 'ctoild_a.shp')
indices = np.stack([np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                    for f in source['frames'][:64]])
original = np.stack([np.frombuffer((guide/'native'/f['file']).read_bytes(), np.uint8).reshape(69, 61, 4)
                    for f in source['frames'][:64]])
beam_mask = runpy.run_path(str(Path(__file__).with_name('export-oil-native-rig.py')))['beam_mask']


def frames(root, density):
    folder = root/'members/ctoild_a-shp'; m = load(folder/'manifest.json')
    v = next(v for v in m['variants'] if v['density'] == density)
    pages = {p['id']: np.array(Image.open(folder/str(density)/p['id']/'base.png')) for p in v['pages']}
    result = {}
    for f in v['frames']:
        x, y, w, h = f['contentRect']
        result[f['nativeFrame']] = pages[f['page']][y:y+h, x:x+w]
    return result, v


report = dict(status='RUNNING', cases=[], acceptedRigCoordinates='EXACT_R9_EXPORT_V11', visualAcceptance='PENDING_R10')
for member in ('ctoild-shp', 'ctoild_f-shp'):
    old = args.before/'members'/member; new = args.after/'members'/member
    assert {p.relative_to(old) for p in old.rglob('*') if p.is_file()} == {p.relative_to(new) for p in new.rglob('*') if p.is_file()}
    assert all(sha(p) == sha(new/p.relative_to(old)) for p in old.rglob('*') if p.is_file())
report['bodyAndFlag'] = 'ALL_FILES_BYTE_IDENTICAL_R9'
for density in (2, 4):
    before, old = frames(args.before, density); after, new = frames(args.after, density)
    assert old['frames'] == new['frames'], 'Accepted registration must remain exact'
    for state in (0, 1):
        row = dict(density=density, state='normal' if state == 0 else 'damaged', phases=32,
                   changedPixels=0, changedOutsideOverlay=0, oldBlackHighlightPixels=0, newBlackHighlightPixels=0)
        fixed = np.all(indices[state*32:(state+1)*32] == indices[state*32], axis=0)
        for n in range(state*32, (state+1)*32):
            overlay = np.array(next(r['mask'] for r in records if r['frame'] == n and r['density'] == density), bool)
            overlay = overlay.repeat(density, 0).repeat(density, 1)
            changed = np.any(before[n] != after[n], axis=2)
            assert np.array_equal(before[n][..., 3], after[n][..., 3])
            assert not (changed & ~overlay).any(), (density, n, 'non-beam RGB')
            assert not (changed & fixed.repeat(density, 0).repeat(density, 1)).any(), (density, n, 'fixed material')
            row['changedPixels'] += int(changed.sum())
            # Independent regression uses Original RGB, not the export's declared mask.
            rgb = original[n, ..., :3].astype(int); r, g, b = rgb.transpose(2, 0, 1)
            highlighted = (r >= 190) & (g >= 150) & (r-b >= 15)
            accepted = beam_mask(indices[n])
            highlighted &= (distance_transform_edt(~accepted) <= 3.25) & ~accepted & ~fixed
            y, x = np.indices(highlighted.shape)
            highlighted &= (x >= 5) & (x < 47) & (y < 50)
            highlighted = highlighted.repeat(density, 0).repeat(density, 1) & (after[n][..., 3] > 0)
            row['oldBlackHighlightPixels'] += int((highlighted & (before[n][..., :3].mean(axis=2) < 45)).sum())
            row['newBlackHighlightPixels'] += int((highlighted & (after[n][..., :3].mean(axis=2) < 45)).sum())
        assert row['oldBlackHighlightPixels'] > 0, 'The regression must fail on rejected R9'
        assert row['newBlackHighlightPixels'] == 0, row
        report['cases'].append(row)
    # HD manifests contain only the 64 body poses; runtime shadows stay native.
    assert set(before) == set(after) == set(range(64))
    for f in source['frames'][64:128]:
        assert sha(guide/'native'/f['indexFile']) == f['indexSha256']
        assert sha(guide/'native'/f['file']) == f['rgbaSha256']
report['nativeShadows'] = 'ORIGINAL_GUIDE_BYTES_AND_UNCHANGED_RUNTIME_SHADOW_PATH'
report['status'] = 'PASS_BEAM_ONLY_RGB_ALL_PHASES_AND_NEGATIVE_CONTROL'
args.output.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
