"""Create complete native-pixel calibration packs, never authored-art candidates."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

members = [('ggpowr.shp', 'body', 3), ('ggpowr_a.shp', 'active', 16), ('gtpowrmk.shp', 'buildup', 25)]
summary = []
for member, role, count in members:
    raw = json.loads(Path('.artifacts/m1-2/source', member + '.json').read_text())
    pack_id = f'power-plant-calibration-{role}'
    root = Path('.local/hd-packs', pack_id, '1')
    root.mkdir(parents=True, exist_ok=False)
    logical = [{'nativeFrame': f['nativeFrame'], 'trimOrigin': [f['x'], f['y']],
                'trimSize': [f['width'], f['height']],
                'legacyRenderSize': [f['width'] + f['width'] % 2, f['height'] + f['height'] % 2],
                'empty': f['empty']} for f in raw['frames'][:count]]
    variants = []
    for density in [2, 4]:
        frames, x, y, row_height = [], 2, 2, 0
        for frame in logical:
            width, height = [n * density for n in frame['legacyRenderSize']]
            if x + width + 2 > 2048:
                x, y, row_height = 2, y + row_height + 4, 0
            frames.append({'nativeFrame': frame['nativeFrame'], 'page': 'p0',
                           'sampleRect': [x, y, width, height],
                           'contentRect': [x, y, *[n * density for n in frame['trimSize']]]})
            x, row_height = x + width + 4, max(row_height, height)
        size = (2048, ((y + row_height + 17) // 16) * 16)
        assert size[1] <= 2048
        base = Image.new('RGBA', size)
        data = Image.new('RGBA', size, (0, 0, 0, 255))
        for frame in frames:
            f = raw['frames'][frame['nativeFrame']]
            indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
            rgb = np.array(raw['palette'], dtype=np.uint8)[indices]
            pixels = np.dstack((rgb, (indices != 0).astype(np.uint8) * 255))
            mask = np.zeros_like(pixels)
            mask[:, :, 3] = 255
            remap = (indices >= 16) & (indices <= 31)
            mask[:, :, 0][remap] = 255
            mask[:, :, 1][remap] = indices[remap] - 16
            x, y, width, height = frame['contentRect']
            base.paste(Image.fromarray(pixels).resize((width, height), Image.Resampling.NEAREST), (x, y))
            data.paste(Image.fromarray(mask).resize((width, height), Image.Resampling.NEAREST), (x, y))
        page = {'id': 'p0', 'size': size}
        for channel, image in [('base', base), ('data', data)]:
            filename = f'{density}x-{channel}.png'
            image.save(root / filename)
            payload = (root / filename).read_bytes()
            page[channel] = filename
            page[channel + 'Sha256'] = hashlib.sha256(payload).hexdigest()
            page[channel + 'Bytes'] = len(payload)
        variants.append({'density': density, 'pages': [page], 'frames': frames})
    manifest = {'schemaVersion': 2, 'packId': pack_id, 'packRevision': '1', 'source': raw['source'],
                'purpose': 'CALIBRATION_ONLY: nearest original pixels; not authored HD',
                'logical': {'canvas': raw['canvas'], 'frames': logical},
                'color': {'representation': 'authored-sRGB-RGBA8-plus-RGBA8-data'}, 'variants': variants}
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    summary.append({'packId': pack_id, 'member': member, 'frames': count,
                    'gpuBytes': {v['density']: v['pages'][0]['size'][0] * v['pages'][0]['size'][1] * 8 for v in variants}})
Path('.artifacts/m1-2/calibration-packs.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary))
