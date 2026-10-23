"""Pinned terrain atlas and native road assembly helpers."""
from functools import lru_cache
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')


@lru_cache(maxsize=24)
def atlas_pixels(file, digest, size):
    file = Path(file)
    assert sha(file) == digest
    return np.fromfile(file, np.uint8).reshape(*reversed(size), 4)


def crop(pointer, name, slot, density):
    root = Path('.local/terrain-packs') / pointer['revision']
    assert sha(root / 'manifest.json') == pointer['sha256']
    manifest = read(root / 'manifest.json')
    group, = [g for g in manifest['groups'] if any(m['member'] == name for m in g['members'])]
    variant, = [v for v in group['variants'] if v['density'] == density]
    index = 0
    for member in group['members']:
        if member['member'] == name:
            index += next(i for i, image in enumerate(member['images']) if image['subTile'] == slot)
            break
        index += len(member['images'])
    x, y, w, h = variant['rects'][index]
    pixels = atlas_pixels(str(root / variant['file']), variant['sha256'], tuple(variant['size']))
    return pixels[y:y + h, x:x + w].copy()


def native(source, image):
    file = GUIDE / 'native' / image['file']
    assert sha(file) == image['rgbaSha256']
    return np.fromfile(file, np.uint8).reshape(*reversed(image['size']), 4)


def assemble(frames, density=1):
    low = np.min([np.array(m['origin']) + m['offset'] for m, _ in frames], axis=0)
    high = np.max([np.array(m['origin']) + m['offset'] + np.array(p.shape[1::-1]) / density
                   for m, p in frames], axis=0)
    size = tuple(int(n * density) for n in high - low)
    canvas = Image.new('RGBA', size)
    for metadata, pixels in frames:
        offset = tuple(int(n * density) for n in np.array(metadata['origin']) + metadata['offset'] - low)
        canvas.alpha_composite(Image.fromarray(pixels), offset)
    return canvas, low
