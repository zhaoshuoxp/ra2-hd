"""Audit accepted 2x preservation and create native-coordinate 2x/4x comparisons."""
import base64
import hashlib
import io
import json
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path('.artifacts/4x-regeneration')
packs = root / 'staged-packs-v1'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text())
out = root / 'comparison-images-v1'
out.mkdir(exist_ok=True)


@lru_cache(maxsize=8)
def atlas(path):
    return Image.open(path).convert('RGBA')


def frame(folder, manifest, density, n):
    variant = next(v for v in manifest['variants'] if v['density'] == density)
    item = variant['frames'][n]
    page = next(p for p in variant['pages'] if p['id'] == item['page'])
    x, y, w, h = item['sampleRect']
    image = atlas(str(folder / page['base'])).crop((x, y, x + w, y + h))
    logical = manifest['logical']['frames'][n]
    canvas = Image.new('RGBA', tuple(v * density for v in manifest['logical']['canvas']))
    canvas.paste(image, tuple(v * density for v in logical['trimOrigin']))
    return canvas


records, panels = [], []
unit_work = read(root / 'production-shp-work-v1.json')['families']
manifests = set()
for catalog in ['allied-unit-contracts', 'allied-building-coverage', 'soviet-building-coverage']:
    rows = read('desktop/' + catalog + '.json')
    rows = rows['shp'].values() if catalog == 'allied-unit-contracts' else rows.values()
    for entry in rows:
        if '/regen4x' not in entry['familyPath']:
            continue
        family = read(Path('.local') / entry['familyPath'])
        manifests.update(Path('.local/hd-packs') / m['packId'] / m['revision'] / 'manifest.json' for m in family['members'])
soviet_bindings = root / 'candidate-soviet-bindings-v2.json'
if not soviet_bindings.exists():
    soviet_bindings = root / 'candidate-soviet-bindings-v1.json'
for name, revision in read(soviet_bindings)['sovietBatchRevisions'].items():
    if not revision.startswith('regen4x'):
        continue
    family = read(Path('.local/hd-packs') / f'soviet-{name}-authored' / revision / 'family.json')
    manifests.update(Path('.local/hd-packs') / m['packId'] / m['revision'] / 'manifest.json' for m in family['members'])
for filename in sorted(manifests):
    manifest = read(filename)
    evidence = manifest['densityRegeneration']
    old_path = Path(evidence['accepted2xManifest'])
    old = read(old_path)
    assert sha(old_path) == evidence['accepted2xSha256']
    assert old['source'] == manifest['source'] and old['logical'] == manifest['logical']
    low = next(v for v in old['variants'] if v['density'] == 2)
    assert low == manifest['variants'][0]
    preserved = []
    for v in manifest['variants']:
        assert len(v['pages']) <= 8 and v['density'] in [2, 4]
        for item, logical in zip(v['frames'], manifest['logical']['frames']):
            assert item['sampleRect'][2:] == [n * v['density'] for n in logical['legacyRenderSize']], (filename, item['nativeFrame'])
            assert item['contentRect'][2:] == [n * v['density'] for n in logical['trimSize']], (filename, item['nativeFrame'])
        for page in v['pages']:
            assert max(page['size']) <= 2048
            for role in ['base', 'data']:
                p = filename.parent / page[role]
                assert sha(p) == page[role + 'Sha256']
                if v['density'] == 2:
                    assert p.read_bytes() == (old_path.parent / page[role]).read_bytes()
                    preserved.append(page[role])
    member = manifest['source']['member']
    nframes = len(manifest['logical']['frames'])
    identities = manifest.get('rulesIdentities', [])
    unit = next((n for n in identities if n in unit_work), None)
    selected = {0, min(1, nframes - 1), nframes // 2, nframes - 1}
    if unit:
        selected = {b['samples'][0]['frame'] for b in unit_work[unit]['members'][0]['batches']
                    if b['action'] in ['Ready', 'Walk', 'Crawl', 'FireUp', 'FireProne', 'Deployed', 'Swim', 'Fly', 'WetAttack', 'Die1']}
        selected.update(j['frames'][0] for j in read(root / 'unit-generation-jobs-v1.json')['jobs'] if j['identity'] == unit)
    panels_here, metrics = [], []
    for n in sorted(selected):
        low_image = frame(filename.parent, manifest, 2, n)
        high_image = frame(filename.parent, manifest, 4, n)
        a = np.array(low_image.getchannel('A')) > 64
        b = np.array(high_image.getchannel('A').resize(low_image.size, Image.Resampling.BOX)) > 64
        union = (a | b).sum()
        metrics.append({'nativeFrame': n, 'alphaIoU': float((a & b).sum() / union) if union else 1,
                        'alphaAreaRatio': float(b.sum() / a.sum()) if a.sum() else None})
        stem = filename.parent.parent.name + f'-{n:04}'
        low_image.save(out / (stem + '-2x.png'))
        high_image.save(out / (stem + '-4x.png'))
        # Comparison preview uses a disclosed common scale; full 4x PNG remains separate.
        border, title = 16, 42
        w, h = low_image.size
        preview = Image.new('RGB', (2 * w + 3 * border, h + title + border), '#24332c')
        draw = ImageDraw.Draw(preview)
        for side, image in enumerate([low_image, high_image.resize(low_image.size, Image.Resampling.LANCZOS)]):
            draw.text((border + side * (w + border), 10), ('Accepted 2x' if side == 0 else 'Authored 4x') + f' / frame {n}', fill='white')
            preview.paste(image, (border + side * (w + border), title), image)
        path = out / (stem + '-comparison.png')
        preview.save(path)
        panels_here.append({'frame': n, 'comparison': str(path), 'fourX': str(out / (stem + '-4x.png'))})
    records.append({'manifest': str(filename), 'member': member, 'frames': nframes,
                    'nativeContract': 'BYTE_IDENTICAL', 'accepted2xFiles': preserved, 'comparisons': metrics})
    panels.append({'pack': manifest['packId'], 'unit': unit, 'member': member, 'panels': panels_here})
    atlas.cache_clear()
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
write(root / 'resource-audit-v1.json', {'status': 'PASS_NATIVE_CONTRACT_AND_2X_BYTES', 'manifests': records,
                                      'artAcceptance': 'PENDING_USER_REVIEW'})
write(root / 'comparison-index-v1.json', panels)
print(len(records), 'manifests;', sum(r['frames'] for r in records), 'native slots;', len(panels), 'comparison sections')
