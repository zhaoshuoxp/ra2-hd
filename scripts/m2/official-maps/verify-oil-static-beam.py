"""Verify minimal background erasure and exact R8 moving foreground preservation."""
import argparse
import hashlib
import json
import runpy
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
for name in ('before', 'after', 'output'):
    parser.add_argument(name, type=Path)
args = parser.parse_args()
assert not args.output.exists()
args.output.mkdir()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
guide = Path('.artifacts/m2-3/native-guides-v3')
source = next(s for s in load(guide/'source.json')['sources'] if s['member'] == 'ctoild_a.shp')
for f in source['frames']:
    assert sha(guide/'native'/f['indexFile']) == f['indexSha256']
    assert sha(guide/'native'/f['file']) == f['rgbaSha256']
native = np.stack([np.frombuffer((guide/'native'/f['indexFile']).read_bytes(), np.uint8).reshape(69, 61)
                   for f in source['frames'][:64]])
r8 = runpy.run_path(str(Path(__file__).with_name('export-oil-stationary.py')))
foreground_rows = load(Path('.artifacts/m2-3/feedback-r11-v1/oil-export-v7.json'))['frames']
foreground = {r['frame']: np.array(r['foreground'], bool) for r in foreground_rows if r['density'] == 4}


def frames(root, member, density):
    folder = root/'members'/member
    metadata = load(folder/'manifest.json')
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    pages = {p['id']: np.array(Image.open(folder/str(density)/p['id']/'base.png')) for p in variant['pages']}
    result = {}
    for f in variant['frames']:
        x, y, w, h = f['contentRect']
        result[f['nativeFrame']] = pages[f['page']][y:y+h, x:x+w]
    return result, metadata, variant


for member in ('ctoild-shp', 'ctoild_f-shp'):
    old, new = [r/'members'/member for r in (args.before, args.after)]
    paths = {p.relative_to(old) for p in old.rglob('*') if p.is_file()}
    assert paths == {p.relative_to(new) for p in new.rglob('*') if p.is_file()}
    assert all(sha(old/p) == sha(new/p) for p in paths), member
report = dict(status='RUNNING', baseline=str(args.before), cases=[], bodyAndFlag='ALL_FILES_BYTE_IDENTICAL_R8',
              originalGeometryAndTiming='UNCHANGED_APPLICATION_SOURCE_AND_EXACT_FRAME_RECORDS', visualAcceptance='PENDING_R12')
yy, xx = np.indices((69, 61))
for d in (2, 4):
    before, bm, bv = frames(args.before, 'ctoild_a-shp', d)
    after, am, av = frames(args.after, 'ctoild_a-shp', d)
    body, _, _ = frames(args.after, 'ctoild-shp', d)
    assert bv['frames'] == av['frames'] and set(before) == set(after) == set(range(64))
    for key in ('source', 'logical', 'color', 'sampler'):
        assert bm.get(key) == am.get(key), key
    for state in (0, 1):
        numbers = list(range(state*32, (state+1)*32))
        originals = native[numbers]
        stable = np.all(originals == originals[0], axis=0)
        gray = ((originals[0] >= 32) & (originals[0] <= 79)) | (originals[0] == 15)
        structures = ((xx < 24) & (yy < 49) & gray) | ((xx >= 20) & (xx < 31) & (yy >= 30)) | (yy >= 54)
        protected = stable & structures
        changed_total, moving_total, old_ghost, new_ghost = 0, 0, 0, 0
        changed_union = np.zeros((69*d, 61*d), bool)
        cleaned_rgb = np.zeros((69*d, 61*d, 3), np.uint8)
        for n in numbers:
            moving = (r8['moving_parts'](native[n]) & ~protected) | foreground[n]
            moving = moving.repeat(d, 0).repeat(d, 1)
            changed = np.any(before[n] != after[n], axis=2)
            assert not (changed & moving).any(), (d, n, 'R8 moving foreground changed')
            assert np.array_equal(before[n][..., 3], after[n][..., 3]), (d, n, 'alpha')
            assert not (changed & ((native[n] == 0) | (native[n] == 12)).repeat(d, 0).repeat(d, 1)).any()
            # Warm duplicated beam material in the changed background is the
            # negative control; this cannot pass just by relabeling the baseline.
            warm = lambda pixels: (pixels[..., 0].astype(float) > pixels[..., 2]*1.15+5) & (pixels[..., 1].astype(float) > pixels[..., 2]*1.05+5)
            old_ghost += int((warm(before[n]) & changed).sum())
            new_ghost += int((warm(after[n]) & changed).sum())
            changed_total += int(changed.sum()); moving_total += int(moving.sum())
            common = changed & changed_union
            assert np.array_equal(cleaned_rgb[common], after[n][..., :3][common]), (d, n, 'cleaned RGB changes between visible poses')
            cleaned_rgb[changed] = after[n][..., :3][changed]
            changed_union |= changed
        assert changed_total > 5000 and old_ghost > 3000, 'Exercise the old stationary duplicate'
        assert new_ghost < old_ghost*.35, (d, state, old_ghost, new_ghost)
        # Cleaned background must stay identical wherever it is visible across
        # the cycle. Exclude all Original foreground and retained R8 drive poses.
        fixed = stable.repeat(d, 0).repeat(d, 1) & changed_union
        for n in numbers:
            moving = (r8['moving_parts'](native[n]) & ~protected) | foreground[n]
            fixed &= ~moving.repeat(d, 0).repeat(d, 1) & (after[n][..., 3] > 0)
        fixed_changed = np.any(np.stack([after[n][..., :3] for n in numbers]) != after[numbers[0]][..., :3], axis=(0, 3)) & fixed
        assert not fixed_changed.any(), (d, state, 'cleaned background moves')
        report['cases'].append(dict(density=d, state='damaged' if state else 'normal', phases=32,
            changedStationaryRgbPixels=changed_total, protectedMovingSamples=moving_total, movingRgbChanges=0,
            oldWarmDuplicateSamples=old_ghost, newWarmBackgroundSamples=new_ghost, cleanedStableSamples=int(fixed.sum()),
            allCleanedBackgroundCoordinates=int(changed_union.sum()), cleanedVisiblePoseRgbChanges=0,
            cleanedBackgroundMovingPixels=0))
        for half in (0, 1):
            board = Image.new('RGBA', (4*664, 4*488), (28, 28, 28, 255))
            for cell, n in enumerate(numbers[half*16:(half+1)*16]):
                canvas = Image.new('RGBA', (166*d, 122*d))
                canvas.alpha_composite(Image.fromarray(body[state]), (29*d, (12 if state == 0 else 26)*d))
                canvas.alpha_composite(Image.fromarray(after[n]), (75*d, 37*d))
                canvas = canvas.resize((664, 488), Image.Resampling.NEAREST)
                ox, oy = cell%4*664, cell//4*488
                board.alpha_composite(canvas, (ox, oy))
                ImageDraw.Draw(board).text((ox+12, oy+12), f"R12 | {d}X | {'damaged' if state else 'normal'} | phase {n%32}", font_size=24, fill='white')
            board.save(args.output/f"oil-{'damaged' if state else 'normal'}-{d}x-half{half}.png")
report.update(status='PASS_MINIMAL_BACKGROUND_ERASURE_EXACT_R8_FOREGROUND', nativeShadows='ORIGINAL_SOURCE_BYTES_UNCHANGED')
(args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report))
