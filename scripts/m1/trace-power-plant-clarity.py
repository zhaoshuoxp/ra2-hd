"""Read-only provenance and pixel accounting for the selected M1.2a frames."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path('.artifacts/m1-2')
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path('.artifacts/m1-2a/trace-v1'))
args = parser.parse_args()
out = args.output
out.mkdir(parents=True, exist_ok=False)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
reports = [root / 'art-samples-v1/export/review-export.json']
reports += sorted((root / 'full-art-v1').glob('batch-*/export/review-export.json'))
records = []
for member, index, role in [('ggpowr.shp', 0, 'body'), ('ggpowr_a.shp', 2, 'active'),
                            ('ggpowr.shp', 1, 'body'), ('ggpowr_a.shp', 8, 'active')]:
    found = [(p, f) for p in reports for f in json.loads(p.read_text())['frames']
             if f['member'] == member and f['nativeFrame'] == index]
    assert len(found) == 1
    report_path, record = found[0]
    generated = report_path.parent.parent / 'generated.png'
    art = Image.open(generated).convert('RGBA')
    f = record['frame']; x, y = record['origin']
    sx, sy = art.width / 1728, art.height / 960
    box = (round((x + f['x'] * 4) * sx), round((y + f['y'] * 4) * sy),
           round((x + (f['x'] + f['width']) * 4) * sx), round((y + (f['y'] + f['height']) * 4) * sy))
    crop = art.crop(box)
    prefix = f'{member[:-4]}-{index:03}'
    crop.save(out / f'{prefix}-generated-crop.png')
    source = np.asarray(crop).astype(np.float32)
    green = (source[:, :, 1] > source[:, :, 0] * 1.22) & (source[:, :, 1] > source[:, :, 2] * 1.10)
    source[:, :, 3][green] = 0
    source[:, :, :3] *= source[:, :, 3:4] / 255
    size = (f['width'] * 4, f['height'] * 4)
    pixels = np.stack([np.asarray(Image.fromarray(source[:, :, k]).resize(size, Image.Resampling.BOX))
                       for k in range(4)], axis=2)
    alpha = pixels[:, :, 3:4]
    pixels[:, :, :3] = np.divide(pixels[:, :, :3] * 255, alpha, out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0)
    unclipped = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
    Image.fromarray(unclipped).save(out / f'{prefix}-matte-before-native-mask.png')
    exported = root / f'full-art-review-v1/{prefix}-4x-base.png'
    data = root / f'full-art-review-v1/{prefix}-4x-data.png'
    base = np.array(Image.open(exported).convert('RGBA'))
    mask = np.array(Image.open(data).convert('RGBA'))
    raw = json.loads((root / f'source/{member}.json').read_text())
    indices = np.array(raw['frames'][index]['pixels']).reshape(f['height'], f['width'])
    allowed = np.repeat(np.repeat(indices != 0, 4, 0), 4, 1)
    pixels[:, :, 3] = np.minimum(pixels[:, :, 3], allowed * 255)
    reconstructed = np.zeros_like(base)
    reconstructed[:size[1], :size[0]] = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
    assert np.array_equal(reconstructed, base)
    pack = Path(f'.local/hd-packs/power-plant-authored-{role}/1')
    manifest = json.loads((pack / 'manifest.json').read_text())
    variant = next(v for v in manifest['variants'] if v['density'] == 4)
    frame = next(f for f in variant['frames'] if f['nativeFrame'] == index)
    page = next(p for p in variant['pages'] if p['id'] == frame['page'])
    ax, ay, aw, ah = frame['sampleRect']
    atlas = Image.open(pack / page['base']).convert('RGBA')
    atlas_crop = np.array(atlas.crop((ax, ay, ax + aw, ay + ah)))
    assert np.array_equal(atlas_crop, base)
    for path in [exported, data]:
        (out / path.name).write_bytes(path.read_bytes())
    Image.fromarray(atlas_crop).save(out / f'{prefix}-atlas-crop.png')
    records.append({'member': member, 'nativeFrame': index, 'source': str(generated), 'sourceSha256': sha(generated),
        'sourceSize': art.size, 'sourceCrop': box, 'generatedCropSize': crop.size, 'nativeTrim': record['frame'],
        'report': str(report_path), 'reportSha256': sha(report_path), 'export': str(exported), 'exportSha256': sha(exported),
        'manifest': str(pack / 'manifest.json'), 'manifestSha256': sha(pack / 'manifest.json'),
        'atlas': str(pack / page['base']), 'atlasSha256': sha(pack / page['base']), 'atlasSize': atlas.size,
        'sampleRect': frame['sampleRect'], 'exportSize': [base.shape[1], base.shape[0]],
        'reconstructedExportMaxDifference': int(np.abs(reconstructed.astype(int) - base).max()),
        'exportToAtlasMaxDifference': int(np.abs(atlas_crop.astype(int) - base).max()),
        'nativeMaskRemovedAlphaPixels': float((unclipped[:, :, 3].astype(float) - base[:size[1], :size[0], 3]).sum() / 255),
        'preMaskAlphaArea': float(unclipped[:, :, 3].sum() / 255),
        'partialAlphaPixels': int(((base[:, :, 3] > 0) & (base[:, :, 3] < 255)).sum()),
        'lowAlphaPixelsBelowHalf': int(((base[:, :, 3] > 0) & (base[:, :, 3] < 128)).sum()),
        'remapPixelCount': int((mask[:, :, 0] > 0).sum()),
        'nativeRemapAreaAt4x': int(((indices >= 16) & (indices <= 31)).sum() * 16),
        'authoredRedUnmappedPixels': int(((base[:, :, 0] > base[:, :, 1].astype(float) * 1.35)
            & (base[:, :, 0] > base[:, :, 2].astype(float) * 1.25) & (base[:, :, 3] > 0) & (mask[:, :, 0] == 0)).sum()),
        'visibleGreenDominantPixels': int(((base[:, :, 1] > base[:, :, 0].astype(float) * 1.22)
            & (base[:, :, 1] > base[:, :, 2].astype(float) * 1.10) & (base[:, :, 3] > 0)).sum())})
(out / 'trace.json').write_text(json.dumps({'status': 'PASS_EXPORT_AND_ATLAS_IDENTITY', 'referenceRun':
    '.artifacts/m1-2/game-combined-v1/result.json', 'referenceTick': 673, 'referenceFrames': [0, 2], 'frames': records}, indent=2) + '\n')
print(json.dumps(records, indent=2))
