"""Export a complete, non-activatable Conscript candidate for local visual review."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_image(image, path):
    image.save(path)
    return {'file': str(path.relative_to(args.output)), 'sha256': digest(path)}


parser = argparse.ArgumentParser()
parser.add_argument('boards', type=Path)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--source', type=Path, default=Path('.artifacts/m1-1/conscript-source.json'))
parser.add_argument('--approved', type=Path, default=Path('.artifacts/m1-1/resolution-review-v1'))
parser.add_argument('--issues', type=Path, required=True)
parser.add_argument('--user-authorized-image-processing', action='store_true')
args = parser.parse_args()
if not args.user_authorized_image_processing:
    parser.error('Explicit authorization for local image processing is required.')
if '.artifacts' not in args.output.resolve().parts:
    parser.error('Local source derivatives must remain under .artifacts.')
source = json.loads(args.source.read_text())
work = json.loads((args.boards / 'worklist.json').read_text())
issues = json.loads(args.issues.read_text())
assert work['source'] == source['source'] and work['activationAllowed'] is False
assert sorted(s['nativeFrame'] for b in work['batches'] for s in b['samples']) == list(range(301))
approved = set(work['approvedSampleFrames'])
assert approved == {0, 2, 8, 11, 164, 167}
# Validate every board before creating output; never resize a mismatched board silently.
for batch in work['batches']:
    path = args.boards / batch['id'] / batch.get('selectedArt', 'authored-v1.png')
    assert Image.open(path).size == tuple(batch['size']), path
args.output.mkdir(parents=True, exist_ok=False)
for folder in ('original', '2x', '4x', 'detail', 'cells'):
    (args.output / folder).mkdir()
ramp = np.array([c[0] for c in source['palette'][16:32]], dtype=np.int16)
records, provenance = [], []
for batch in work['batches']:
    folder = args.boards / batch['id']
    art_path = folder / batch.get('selectedArt', 'authored-v1.png')
    prompt_path = folder / batch.get('selectedPrompt', 'prompt.txt')
    board = Image.open(art_path).convert('RGB')
    provenance.append({'batch': batch['id'], 'mode': 'built-in image_gen',
                       'art': str(art_path), 'artSha256': digest(art_path),
                       'prompt': str(prompt_path), 'promptSha256': digest(prompt_path),
                       'initialArtSha256': digest(folder / 'authored-v1.png'),
                       'initialPromptSha256': digest(folder / 'prompt.txt'),
                       'nativeReferenceSha256': digest(folder / 'native-poses.png')})
    for sample in batch['samples']:
        fid = sample['nativeFrame']
        f = source['frames'][fid]
        w, h = f['width'], f['height']
        index = np.array(f['pixels'], dtype=np.uint8).reshape(h, w)
        pixels = np.array(source['palette'], dtype=np.uint8)[index]
        original = Image.fromarray(np.dstack((pixels, (index != 0).astype(np.uint8) * 255)))
        original_file = save_image(original, args.output / 'original' / f'{fid:03d}.png')
        scale = sample['sourceScale']
        left, top = sample['contentOrigin']
        crop = np.array(board.crop((left, top, left + w * scale, top + h * scale)))
        r, g, b = (crop[:, :, i].astype(np.int16) for i in range(3))
        matte = (r < 85) & (g >= r + 3) & (b >= r + 1) & (g >= b)
        rgba = Image.fromarray(np.dstack((crop, (~matte).astype(np.uint8) * 255)))
        x, y, cw, ch = sample['cell']
        cell_file = save_image(board.crop((x, y, x + cw, y + ch)), args.output / 'cells' / f'{fid:03d}.png')
        remap_native = Image.fromarray(((index >= 16) & (index <= 31)).astype(np.uint8) * 255)
        remap_region = np.array(remap_native.filter(ImageFilter.MaxFilter(5))) != 0
        item = {'nativeFrame': fid, 'group': batch['group'], 'batch': batch['id'],
                'trimOrigin': [f['x'], f['y']], 'nativeSize': [w, h],
                'approvedSample': fid in approved, 'original': original_file, 'cell': cell_file,
                'issues': [i['id'] for i in issues if fid in i['frames']], 'variants': {}}
        for variant, density in [('2x', 2), ('4x', 4), ('detail', 10 if fid in approved else scale)]:
            prefix = args.output / variant / f'{fid:03d}'
            if fid in approved:
                # Preserve user-accepted base and remap files byte-for-byte.
                ap = args.approved / f'{density}x'
                base_path = ap / f'frame-{fid:03d}-{density}x-base.png'
                data_path = ap / f'frame-{fid:03d}-{density}x-data.png'
                for path, suffix in [(base_path, 'base'), (data_path, 'data')]:
                    shutil.copyfile(path, f'{prefix}-{suffix}.png')
                base = Image.open(base_path).convert('RGBA')
                data = Image.open(data_path).convert('RGBA')
                clipped = None
            else:
                small = np.array(rgba.resize((w * density, h * density), Image.Resampling.BOX))
                allowed = np.repeat(np.repeat(index != 0, density, axis=0), density, axis=1)
                clipped = round(float(small[:, :, 3][~allowed].sum()) / 255 / density ** 2, 3)
                small[~allowed] = 0
                pw, ph = (w + w % 2) * density, (h + h % 2) * density
                base_array = np.zeros((ph, pw, 4), dtype=np.uint8)
                base_array[:h * density, :w * density] = small
                base = Image.fromarray(base_array)
                region = np.zeros((ph, pw), dtype=bool)
                region[:h * density, :w * density] = np.repeat(np.repeat(remap_region, density, 0), density, 1)
                rr, gg, bb, aa = (base_array[:, :, i].astype(np.int16) for i in range(4))
                mask = region & (aa > 0) & (rr > 40) & (rr > 1.5 * gg) & (rr > 1.3 * bb)
                data_array = np.zeros_like(base_array)
                data_array[:, :, 3] = 255
                data_array[:, :, 0][mask] = 255
                data_array[:, :, 1][mask] = np.abs(rr[mask, None] - ramp).argmin(axis=1)
                data = Image.fromarray(data_array)
                base.save(f'{prefix}-base.png')
                data.save(f'{prefix}-data.png')
            ba, da = np.array(base), np.array(data)
            allowed = np.zeros(ba.shape[:2], dtype=bool)
            allowed[:h * density, :w * density] = np.repeat(np.repeat(index != 0, density, 0), density, 1)
            assert not np.any(ba[:, :, 3][~allowed])
            assert set(np.unique(da[:, :, 0])).issubset({0, 255})
            assert da[:, :, 1].max() <= 15 and not np.any(da[:, :, 2]) and np.all(da[:, :, 3] == 255)
            mask = da[:, :, 0] != 0
            assert not np.any(mask & (ba[:, :, 3] == 0)) and np.any(ba[:, :, 3])
            blue = ba.copy()
            factors = ramp[da[:, :, 1][mask]]
            blue[:, :, :3][mask] = np.column_stack((factors * 64 // 255, factors * 128 // 255, factors))
            paths = {'base': Path(f'{prefix}-base.png'), 'data': Path(f'{prefix}-data.png')}
            files = {k: {'file': str(p.relative_to(args.output)), 'sha256': digest(p)} for k, p in paths.items()}
            files['blue'] = save_image(Image.fromarray(blue), Path(f'{prefix}-blue.png'))
            item['variants'][variant] = {'density': density, 'size': list(base.size), 'files': files,
                'sourceCoverageRetained': round(float(ba[:, :, 3].sum()) / 255 / density ** 2 / np.count_nonzero(index), 4),
                'clippedAuthoredAreaInNativePixels': clipped, 'remapPixels': int(mask.sum())}
        records.append(item)
records.sort(key=lambda f: f['nativeFrame'])
report = {'kind': 'complete-candidate-review-NOT-A-RUNTIME-PACK', 'source': source['source'],
          'canvas': source['canvas'], 'sequences': source['sequences'], 'frames': records,
          'provenance': provenance, 'issues': issues, 'visibleFrameCount': len(records),
          'structuralStatus': 'PASS_STRUCTURAL_ONLY', 'artAcceptance': 'FAIL_NEEDS_CORRECTION',
          'gameplayAcceptance': 'NOT_RUN', 'activationAllowed': False,
          'approvedStyle': work['styleReference'], 'approvedStyleSha256': work['styleSha256'],
          'method': 'green matte removal, direct-density BOX export, original alpha intersection, red cloth inside dilated source remap area',
          'limitations': ['Board alignment and pose errors remain visible in the unclipped cell and constrained export.',
                         'No synthetic padding of missing frames; all 301 candidate cells have generated provenance.',
                         'Matte and remap extraction are heuristics and require visual review.',
                         'Original index-12 pixels are preserved where authored alpha overlaps; baked black ground remains a known art issue.',
                         'Preview playback speed is adjustable and does not certify engine animation timing.',
                         'Six previously accepted samples are copied byte-for-byte; new batch versions of those frames are not promoted.']}
(args.output / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
template = Path(__file__).with_name('full-art-review.html').read_text()
(args.output / 'review.html').write_text(template.replace('__REVIEW_DATA__', json.dumps(report).replace('</', '<\\/')))
print(json.dumps({'frames': len(records), 'exports': len(records) * 3, 'issues': len(issues),
                  'status': report['artAcceptance'], 'review': str(args.output / 'review.html')}))
