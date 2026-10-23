"""Bind generated blank concrete only behind displaced airport tower numerals."""
import copy
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path('scripts/m2').resolve()))
from showcase_registration import independently_sample

ROOT = Path('.artifacts/m2-4/desert-airport-markings-r1-20261020')
SOURCE = Path('.artifacts/m2-4/desert-final-buildings-native-batch86-v1')
REVISION = 'desert-m2-4-airport-markings-r1-v2'
DEST = Path('.local/environment-packs') / REVISION
EVIDENCE = ROOT / 'export-v2'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


contract = read(Path('desktop/environment-desert-hd-contract.json'))
assert contract['selectedPack']['sha256'] == '83f3e56e6b43b158ac7e3110f68ad65120eec4e44e899c6a0a877b0f2a4cc637'
old_root = Path('.local/environment-packs') / contract['selectedPack']['revision']
assert sha(old_root / 'manifest.json') == contract['selectedPack']['sha256']
manifest = read(old_root / 'manifest.json')
source = next(s for s in read(SOURCE / 'source.json')['sources'] if s['member'] == 'cdairp.shp')
assert source['sha256'] == '829c3a4cb7cd91c97324ff472c42d835711d6e2012dd568dcec3a57c17f628bc'
assert sha(SOURCE / 'native' / source['nativeFile']) == source['sha256']
feedback = read(ROOT / 'feedback-and-root-cause-v1.json')
mothers = read(ROOT / 'mother-retention-v1.json')['outputs']
pack = dict(schema=manifest['schema'], revision=REVISION, theater='DESERT', editions=manifest['editions'],
    families={'desert-caairp': copy.deepcopy(manifest['families']['desert-caairp'])})
DEST.mkdir(exist_ok=False)
EVIDENCE.mkdir(exist_ok=False)
changes, preserved = [], []
for entry in pack['families']['desert-caairp']['members']:
    original_file = old_root / entry['path']
    assert sha(original_file) == entry['sha256']
    target_file = DEST / entry['path']
    shutil.copytree(original_file.parent, target_file.parent)
    if entry['member'] != 'cdairp.shp':
        for f in target_file.parent.rglob('*'):
            if f.is_file():
                assert sha(f) == sha(old_root / f.relative_to(DEST))
                preserved.append(pin(f))
        continue
    hd = read(target_file)
    old_hd = copy.deepcopy(hd)
    for variant in hd['variants']:
        density = variant['density']
        pages = {p['id']: p for p in variant['pages']}
        for number in [0, 1]:
            frame = source['frames'][number]
            region, = [r for r in variant['frames'] if r['nativeFrame'] == number]
            x, y, width, height = region['contentRect']
            assert [width, height] == [n * density for n in frame['size']]
            page_file = target_file.parent / str(density) / region['page'] / 'base.png'
            data_file = page_file.with_name('data.png')
            pixels = np.asarray(Image.open(page_file).convert('RGBA')).copy()
            prior = pixels.copy()
            data = np.asarray(Image.open(data_file).convert('RGBA'))[y:y + height, x:x + width]
            base = pixels[y:y + height, x:x + width]
            before = base.copy()
            original, = [m for m in feedback['baselineMothers'] if m['slot'] == number]
            edited, = [m for m in mothers if m['job'] == f'cdairp-{number}-blank-tower-r1']
            assert sha(Path(original['mother'])) == original['sha256']
            assert sha(Path(edited['file'])) == edited['sha256']
            old_image, new_image = Image.open(original['mother']).convert('RGBA'), Image.open(edited['file']).convert('RGBA')
            assert old_image.size == new_image.size == (1536, 1024)
            ox, oy, mw, mh = original['registeredRect']
            old = np.asarray(old_image.crop((ox, oy, ox + mw, oy + mh)))
            material = independently_sample(np.asarray(new_image.crop((ox, oy, ox + mw, oy + mh)))[..., :3], (width, height))
            assert min(mw / frame['size'][0], mh / frame['size'][1]) >= 4
            red = (old[..., 0] > old[..., 1] * 1.6) & (old[..., 0] > old[..., 2] * 1.6) & (old[..., 0] > 60)
            gate = np.zeros(red.shape, bool)
            # Source-pinned marking surfaces exclude the cabin bands, ladder and cracks.
            rect = [23, 60, 34, 98] if number == 0 else [24, 60, 30, 70]
            left, top, right, bottom = rect
            gate[round(top * mh / 163):round(bottom * mh / 163),
                 round(left * mw / 176):round(right * mw / 176)] = True
            red &= gate
            assert red.sum() > 100
            mask = np.asarray(Image.fromarray(red.astype(np.uint8) * 255).resize((width, height), Image.Resampling.NEAREST)) > 0
            distance = ndimage.distance_transform_edt(~mask)
            weight = np.clip((1.4 * density - distance) / (.7 * density), 0, 1)
            weight *= base[..., 3] == 255
            changed = weight > 0
            ring = (distance > 1.5 * density) & (distance < 3 * density) & (base[..., 3] == 255) & (data[..., 0] == 0)
            assert ring.sum() > 20
            offset = np.median(before[..., :3][ring].astype(float) - material[ring].astype(float), axis=0)
            assert np.abs(offset).max() < 40
            material = np.clip(material.astype(float) + offset, 0, 255)
            base[..., :3] = np.clip(np.rint(before[..., :3] * (1 - weight[..., None])
                + material * weight[..., None]), 0, 255).astype(np.uint8)
            assert np.array_equal(base[..., 3], before[..., 3])
            assert np.array_equal(base[~changed], before[~changed])
            assert changed.sum() < width * height * .025
            Image.fromarray(pixels).save(page_file)
            page = pages[region['page']]
            page.update(baseSha256=sha(page_file), baseBytes=page_file.stat().st_size)
            assert sha(data_file) == page['dataSha256']
            mask_file = EVIDENCE / f'cdairp-{number}-{density}x-authorized-surface-mask.png'
            Image.fromarray(changed.astype(np.uint8) * 255).save(mask_file)
            Image.fromarray(before).save(EVIDENCE / f'cdairp-{number}-{density}x-before.png')
            Image.fromarray(base).save(EVIDENCE / f'cdairp-{number}-{density}x-after.png')
            changed_atlas = np.any(prior[..., :3] != pixels[..., :3], axis=2)
            authorized = np.zeros(changed_atlas.shape, bool)
            authorized[y:y + height, x:x + width] = changed
            assert not np.any(changed_atlas & ~authorized)
            changes.append(dict(member=entry['member'], nativeFrame=number, density=density,
                originalIndexSha256=frame['indexSha256'], mother=edited, sourceNativeRect=rect,
                authorizedPixels=int(changed.sum()), changedPixels=int(changed_atlas.sum()),
                sourceCapacity=min(mw / 176, mh / 163), materialColorOffset=offset.tolist(),
                mask=pin(mask_file), alpha='EXACT', ownerData='EXACT', outsideSurface='EXACT'))
    hd.setdefault('authored', {})['towerMarkingCorrection'] = dict(schema='desert-airport-blank-marking-surface-r1',
        feedback=pin(ROOT / 'feedback-and-root-cause-v1.json'), mothers=pin(ROOT / 'mother-retention-v1.json'),
        sourceSha256=source['sha256'], frames=[0, 1],
        policy='Only generated numeral-shaped residue on concrete changes. Native owner colors and shades remain authoritative; all other slots, alpha, data, geometry, shadows and linked motion are exact.')
    assert hd['source'] == old_hd['source'] and hd['logical'] == old_hd['logical'] and hd['color'] == old_hd['color']
    target_file.write_text(json.dumps(hd, indent=2) + '\n')
    entry['sha256'] = sha(target_file)
write(DEST / 'manifest.json', pack)
write(ROOT / 'export-and-scope-v1.json', dict(status='PASS_BOUNDED_GENERATED_CONCRETE_AND_EXACT_NATIVE_OWNER_DATA',
    baseline=contract['selectedPack'], pack=dict(schemaVersion=1, revision=REVISION, sha256=sha(DEST / 'manifest.json')),
    completeFamilies=1, members=3, changedFrames=changes, exactLinkedFiles=preserved,
    state='STATIC_EXPORTED_NATIVE_AND_VISUAL_PENDING', windows='NOT_RUN', m24Complete=False))
print(json.dumps(dict(pack=REVISION, changedDensityFrames=len(changes),
    changedPixels=sum(r['changedPixels'] for r in changes), exactLinkedFiles=len(preserved))))
