"""Package an explicitly accepted complete review into bounded local HD atlases."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument('--review', type=Path, required=True)
parser.add_argument('--acceptance', type=Path, required=True)
parser.add_argument('--revision', required=True)
args = parser.parse_args()
review_path = args.review / 'candidate-review.json'
review = json.loads(review_path.read_text())
approval = json.loads(args.acceptance.read_text())
assert approval['artAccepted'] is True and approval['reviewSha256'] == sha(review_path)
assert sorted(f['nativeFrame'] for f in review['frames']) == list(range(301))
assert args.revision.replace('-', '').replace('.', '').isalnum() and args.revision not in ('.', '..')
raw = json.loads(Path('.artifacts/m1-1/conscript-source.json').read_text())
assert raw['source'] == review['source']
root = Path('.local/hd-packs/conscript-authored') / args.revision
root.mkdir(parents=True, exist_ok=False)
logical = [{'nativeFrame': f['nativeFrame'], 'trimOrigin': [f['x'], f['y']],
            'trimSize': [f['width'], f['height']],
            'legacyRenderSize': [f['width'] + f['width'] % 2, f['height'] + f['height'] % 2],
            'empty': not any(f['pixels'])} for f in raw['frames'][:301]]
variants = []
for density in (2, 4):
    layouts, frames = [[]], []
    x, y, row_h = 2, 2, 0
    for f, item in zip(logical, review['frames']):
        assert f['nativeFrame'] == item['nativeFrame'] and f['trimOrigin'] == item['trimOrigin']
        w, h = [n * density for n in f['legacyRenderSize']]
        if x + w + 2 > 2048:
            x, y, row_h = 2, y + row_h + 4, 0
        if y + h + 2 > 2048:
            layouts.append([])
            x, y, row_h = 2, 2, 0
        frame = {'nativeFrame': f['nativeFrame'], 'page': f'p{len(layouts)-1}',
                 'sampleRect': [x, y, w, h],
                 'contentRect': [x, y, f['trimSize'][0] * density, f['trimSize'][1] * density]}
        layouts[-1].append((frame, item['variants'][f'{density}x']))
        frames.append(frame)
        x += w + 4
        row_h = max(row_h, h)
    pages = []
    for p, layout in enumerate(layouts):
        height = ((max(f['sampleRect'][1] + f['sampleRect'][3] + 2 for f, _ in layout) + 15) // 16) * 16
        page = {'id': f'p{p}', 'size': [2048, height]}
        for role in ('base', 'data'):
            atlas = Image.new('RGBA', tuple(page['size']), (0, 0, 0, 255 if role == 'data' else 0))
            for f, v in layout:
                info = v['files'][role]
                file = args.review / info['file']
                assert sha(file) == info['sha256']
                sprite = Image.open(file)
                assert sprite.mode == 'RGBA' and list(sprite.size) == f['sampleRect'][2:]
                atlas.paste(sprite, tuple(f['sampleRect'][:2]))
            name = f'{density}x-p{p}-{role}.png'
            atlas.save(root / name)
            page.update({role: name, f'{role}Sha256': sha(root / name), f'{role}Bytes': (root / name).stat().st_size})
        pages.append(page)
    gpu_bytes = sum(p['size'][0] * p['size'][1] * 8 for p in pages)
    assert len(pages) <= 8 and gpu_bytes <= 64 * 1024 ** 2
    variants.append({'density': density, 'pages': pages, 'frames': frames})
manifest = {'schemaVersion': 2, 'packId': 'conscript-authored', 'packRevision': args.revision,
            'purpose': 'User-accepted authored Conscript; local gameplay acceptance pending',
            'source': raw['source'], 'logical': {'canvas': raw['canvas'], 'frames': logical},
            'color': {'representation': 'authored-sRGB-RGBA8-plus-RGBA8-data'}, 'variants': variants,
            'provenance': {'reviewSha256': sha(review_path), 'artAcceptanceSha256': sha(args.acceptance)}}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'root': str(root), 'manifestSha256': sha(root / 'manifest.json'),
                  'variants': [{'density': v['density'], 'pages': len(v['pages']),
                                'gpuBytes': sum(p['size'][0] * p['size'][1] * 8 for p in v['pages'])} for v in variants]}))
