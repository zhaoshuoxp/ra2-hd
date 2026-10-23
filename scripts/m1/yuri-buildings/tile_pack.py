"""Lossless serialized four-pixel pools for measured heavy new building members."""
import math
import numpy as np
from PIL import Image
from production_common import sha


def pack_tiled(member, density, records, source_dir, output, raw, virtual_height=4800):
    assert density == 4
    pages, placements, layouts = [], {}, []
    # Virtual rectangles retain complete independent native buffers; only their
    # encoded physical storage changes. The existing shader already uses 4px pools.
    for n, record in enumerate(records):
        width, height = (v * density for v in raw['frames'][n]['legacyRenderSize'])
        choices = [(s['height'] - height - 8, 4096 - s['x'] - width - 8, pi, ri)
                   for pi, rows in enumerate(layouts) for ri, s in enumerate(rows)
                   if height + 8 <= s['height'] and s['x'] + width + 8 <= 4096]
        if choices:
            _, _, pi, ri = min(choices); shelf = layouts[pi][ri]
        else:
            pi = next((i for i, rows in enumerate(layouts) if sum(s['height'] for s in rows) + height + 8 <= virtual_height), len(layouts))
            if pi == len(layouts): layouts.append([])
            shelf = {'x': 0, 'y': sum(s['height'] for s in layouts[pi]), 'height': height + 8}
            layouts[pi].append(shelf)
        x, y = shelf['x'] + 4, shelf['y'] + 4
        placements[n] = {'nativeFrame': n, 'page': f'p{pi}', 'sampleRect': [x, y, width, height],
                         'contentRect': [x, y, raw['frames'][n]['width'] * density, raw['frames'][n]['height'] * density]}
        shelf['x'] += width + 8
    assert len(layouts) <= 8, 'Physical member page bound remains eight'
    for pi, rows in enumerate(layouts):
        width, height = max(s['x'] for s in rows), sum(s['height'] for s in rows)
        width, height = math.ceil(width / 4) * 4, math.ceil(height / 4) * 4
        base = np.zeros((height, width, 4), np.uint8)
        data = base.copy(); data[..., 3] = 255
        for n, placement in placements.items():
            if placement['page'] != f'p{pi}' or not all(placement['sampleRect'][2:]): continue
            x, y, w, h = placement['sampleRect']
            for role, array in [('base', base), ('data', data)]:
                patch = np.array(Image.open(source_dir / records[n][role]).convert('RGBA'))
                assert patch.shape == (h, w, 4)
                array[y:y+h, x:x+w] = patch
        columns, row_count = width // 4, height // 4
        def tiles(array):
            return array.reshape(row_count, 4, columns, 4, array.shape[2]).transpose(0, 2, 1, 3, 4).reshape(-1, 16 * array.shape[2])
        keys = np.ascontiguousarray(np.concatenate([tiles(base), tiles(data[..., :2])], axis=1))
        unique, inverse = np.unique(keys.view(np.dtype((np.void, 96))).reshape(-1), return_inverse=True)
        pixels = unique.view(np.uint8).reshape(-1, 96)
        count = len(unique); pool_columns = min(512, math.ceil(math.sqrt(count)))
        pool_rows = math.ceil(count / pool_columns)
        if pool_rows > 512:
            raise OverflowError(('Physical tile atlas limit', member['source']['member'], count))
        color_tiles = np.zeros((pool_columns * pool_rows, 4, 4, 4), np.uint8)
        remap_tiles = color_tiles.copy(); remap_tiles[..., 3] = 255
        color_tiles[:count] = pixels[:, :64].reshape(-1, 4, 4, 4)
        remap_tiles[:count, :, :, :2] = pixels[:, 64:].reshape(-1, 4, 4, 2)
        def atlas(array):
            return array.reshape(pool_rows, pool_columns, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(pool_rows * 4, pool_columns * 4, 4)
        lookup = np.zeros((row_count, columns, 4), np.uint8)
        lookup[..., 0] = (inverse & 255).reshape(row_count, columns)
        lookup[..., 1] = ((inverse >> 8) & 255).reshape(row_count, columns)
        lookup[..., 2] = ((inverse >> 16) & 255).reshape(row_count, columns)
        lookup[..., 3] = 255
        # Exact reconstruction of every RGBA base and both categorical data
        # channels proves this is a storage transform, never lossy art reduction.
        assert np.array_equal(pixels[inverse, :64], tiles(base))
        assert np.array_equal(pixels[inverse, 64:], tiles(data[..., :2]))
        page = {'id': f'p{pi}', 'size': [pool_columns * 4, pool_rows * 4], 'virtualSize': [width, height], 'tileCount': count}
        for role, array in [('base', atlas(color_tiles)), ('data', atlas(remap_tiles)), ('map', lookup)]:
            name = f'{density}x-p{pi}-{role}.png'; Image.fromarray(array).save(output / name)
            page.update({role: name, role + 'Sha256': sha(output / name), role + 'Bytes': (output / name).stat().st_size})
        page['mapSize'] = [columns, row_count]
        page['gpuBytes'] = page['size'][0] * page['size'][1] * 6 + columns * row_count * 4
        pages.append(page)
    return {'density': density, 'storage': 'lossless-four-pixel-pool-v1', 'pages': pages,
            'frames': [placements[n] for n in range(len(records))]}
