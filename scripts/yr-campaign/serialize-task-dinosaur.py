"""Store complete DNOB frames in the existing lossless 4px format within eight pages."""
import argparse
import copy
import hashlib
import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('receipt', type=Path)
parser.add_argument('evidence', type=Path)
parser.add_argument('--revision', default='native-r2')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
encode = lambda value: json.dumps(value, indent=2)+'\n'
original = json.loads((args.source/'manifest.json').read_text())
assert original['rulesIdentities'] == ['DNOB']
assert original['source'] == dict(member='dnob.shp',
    sha256='7b4de1dca68ccd2126052839d016d660285fa77440c01973954e46dd8da86f74',
    theater='NEWURBAN', kind='resolved-shp-member')
logical = original['logical']['frames']
assert original['logical']['canvas'] == [430, 396] and len(logical) == 251
assert [frame['nativeFrame'] for frame in logical] == list(range(251))
assert [frame['nativeFrame'] for frame in logical if frame['empty']] == [213, 214, 215, 250]
assert sorted(variant['density'] for variant in original['variants']) == [2, 4]
assert not args.output.exists() and not args.receipt.exists() and not args.evidence.exists()
assert args.revision.replace('-', '').isalnum()
args.output.mkdir(parents=True)
args.evidence.mkdir(parents=True)


@lru_cache(maxsize=4)
def read_page(filename, expected_hash, expected_size):
    file = args.source/filename
    assert sha(file) == expected_hash
    image = Image.open(file).convert('RGBA')
    assert list(image.size) == list(expected_size)
    return np.array(image)


def layout_frames(density):
    layouts, placements = [], {}
    order = sorted(logical, key=lambda frame: (-frame['legacyRenderSize'][1],
        -frame['legacyRenderSize'][0], frame['nativeFrame']))
    for frame in order:
        width, height = (value*density for value in frame['legacyRenderSize'])
        choices = [(shelf['height']-height-8, 4096-shelf['x']-width-8, pi, ri)
            for pi, rows in enumerate(layouts) for ri, shelf in enumerate(rows)
            if height+8 <= shelf['height'] and shelf['x']+width+8 <= 4096]
        if choices:
            _, _, pi, ri = min(choices)
            shelf = layouts[pi][ri]
        else:
            pi = next((pi for pi, rows in enumerate(layouts)
                if sum(shelf['height'] for shelf in rows)+height+8 <= 2400), len(layouts))
            if pi == len(layouts):
                layouts.append([])
            shelf = dict(x=0, y=sum(row['height'] for row in layouts[pi]), height=height+8)
            layouts[pi].append(shelf)
        x, y = shelf['x']+4, shelf['y']+4
        placements[frame['nativeFrame']] = dict(nativeFrame=frame['nativeFrame'], page=f'p{pi}',
            sampleRect=[x, y, width, height],
            contentRect=[x, y, frame['trimSize'][0]*density, frame['trimSize'][1]*density])
        shelf['x'] += width+8
    assert len(layouts) <= 8, 'Existing per-member page limit remains eight'
    return layouts, placements


proofs, summaries, variants = [], [], []
for variant in sorted(original['variants'], key=lambda value: value['density']):
    density = variant['density']
    assert 'storage' not in variant
    sources = {page['id']: page for page in variant['pages']}
    records = {frame['nativeFrame']: frame for frame in variant['frames']}
    assert sorted(records) == list(range(251))
    layouts, placements = layout_frames(density)
    pages = []
    for pi, rows in enumerate(layouts):
        width = math.ceil(max(shelf['x'] for shelf in rows)/4)*4
        height = math.ceil(sum(shelf['height'] for shelf in rows)/4)*4
        base = np.zeros((height, width, 4), np.uint8)
        data = base.copy()
        data[..., 3] = 255
        for index, placement in placements.items():
            if placement['page'] != f'p{pi}':
                continue
            x, y, w, h = placement['sampleRect']
            record = records[index]
            old_x, old_y, old_w, old_h = record['sampleRect']
            assert [old_w, old_h] == [w, h]
            page = sources[record['page']]
            hashes = []
            for role, target in [('base', base), ('data', data)]:
                source = read_page(page[role], page[role+'Sha256'], tuple(page['size']))
                patch = source[old_y:old_y+h, old_x:old_x+w]
                assert patch.shape == (h, w, 4)
                if role == 'data':
                    assert not patch[..., :3].any() and np.all(patch[..., 3] == 255)
                target[y:y+h, x:x+w] = patch
                hashes.append(hashlib.sha256(patch.tobytes()).hexdigest())
            proofs.append(dict(density=density, frame=index, baseRgbaSha256=hashes[0],
                dataRgbaSha256=hashes[1], empty=logical[index]['empty']))
        columns, row_count = width//4, height//4

        def tiles(array):
            return array.reshape(row_count, 4, columns, 4, array.shape[2]).transpose(
                0, 2, 1, 3, 4).reshape(-1, 16*array.shape[2])

        keys = np.ascontiguousarray(np.concatenate([tiles(base), tiles(data[..., :2])], axis=1))
        unique, inverse = np.unique(keys.view(np.dtype((np.void, 96))).reshape(-1), return_inverse=True)
        pixels = unique.view(np.uint8).reshape(-1, 96)
        count = len(unique)
        pool_columns = min(512, math.ceil(math.sqrt(count)))
        pool_rows = math.ceil(count/pool_columns)
        assert pool_rows <= 512, 'Existing physical texture dimension limit remains2048'
        colors = np.zeros((pool_columns*pool_rows, 4, 4, 4), np.uint8)
        remap = colors.copy()
        remap[..., 3] = 255
        colors[:count] = pixels[:, :64].reshape(-1, 4, 4, 4)
        remap[:count, :, :, :2] = pixels[:, 64:].reshape(-1, 4, 4, 2)

        def atlas(array):
            return array.reshape(pool_rows, pool_columns, 4, 4, 4).transpose(
                0, 2, 1, 3, 4).reshape(pool_rows*4, pool_columns*4, 4)

        lookup = np.zeros((row_count, columns, 4), np.uint8)
        lookup[..., 0] = (inverse & 255).reshape(row_count, columns)
        lookup[..., 1] = ((inverse >> 8) & 255).reshape(row_count, columns)
        lookup[..., 2] = ((inverse >> 16) & 255).reshape(row_count, columns)
        lookup[..., 3] = 255
        assert np.array_equal(pixels[inverse, :64], tiles(base))
        assert np.array_equal(pixels[inverse, 64:], tiles(data[..., :2]))
        page = dict(id=f'p{pi}', size=[pool_columns*4, pool_rows*4],
            virtualSize=[width, height], mapSize=[columns, row_count], tileCount=count)
        for role, array in [('base', atlas(colors)), ('data', atlas(remap)), ('map', lookup)]:
            filename = f'{density}x-p{pi}-{role}.png'
            Image.fromarray(array).save(args.output/filename)
            assert np.array_equal(np.array(Image.open(args.output/filename)), array)
            page.update({role: filename, role+'Sha256': sha(args.output/filename),
                role+'Bytes': (args.output/filename).stat().st_size})
        pages.append(page)
    decoded_bytes = sum(page['size'][0]*page['size'][1]*6
        + page['mapSize'][0]*page['mapSize'][1]*4 for page in pages)
    assert decoded_bytes <= 8*24*1024**2, 'Existing bounded decode allocation remains unchanged'
    summaries.append(dict(density=density, pages=len(pages), unchangedRgbaFrames=251,
        boundedDecodedBytes=decoded_bytes, virtualSizeLimit=8192, textureSizeLimit=2048, pageLimit=8))
    variants.append(dict(density=density, storage='lossless-four-pixel-pool-v1', pages=pages,
        frames=[placements[index] for index in range(251)]))
    read_page.cache_clear()

assert len(proofs) == 502
proof_file = args.evidence/'frame-proof.json'
proof_file.write_text(encode(sorted(proofs, key=lambda value: (value['density'], value['frame']))))
manifest = copy.deepcopy(original)
manifest.update(packRevision=args.revision, variants=variants)
manifest['provenance']['losslessStorage'] = dict(sourceManifestSha256=sha(args.source/'manifest.json'),
    exactRgbaFrameProofSha256=sha(proof_file), independentDensityFrames=502,
    format='lossless-four-pixel-pool-v1', limitsChanged=False)
(args.output/'manifest.json').write_text(encode(manifest))
receipt = dict(schema='yr-task-dinosaur-lossless-storage-v1',
    status='PASS_LOSSLESS_SERIALIZED_DNOB_STORAGE_WITH_UNCHANGED_LIMITS', identity='DNOB',
    sourceManifest=str(args.source/'manifest.json'), sourceManifestSha256=sha(args.source/'manifest.json'),
    outputManifest=str(args.output/'manifest.json'), outputManifestSha256=sha(args.output/'manifest.json'),
    frameProof=str(proof_file), frameProofSha256=sha(proof_file), independentRgbaFrames=502,
    nativeBodySlots=251, originalEmptySlots=[213, 214, 215, 250], variants=summaries,
    artworkChanged=False, logicalGeometryChanged=False, densityReduced=False,
    pageLimitChanged=False, textureLimitChanged=False, worldBudgetChanged=False,
    selectedResourcesChanged=False, nativeRuntime='PENDING', userVisualAcceptance='PENDING')
args.receipt.write_text(encode(receipt))
(args.evidence/'report.json').write_text(encode(receipt))
print(json.dumps({'status': receipt['status'], 'variants': summaries,
    'manifestSha256': receipt['outputManifestSha256']}))
