"""Register source-pinned authored components without changing native masks."""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image
from showcase_registration import authored_coverage, extrude, independently_sample, sha


class AuthoredRegions:
    def __init__(self, declarations, native, native_root=None):
        self.declarations, self.materials = declarations, {}
        for name, declaration in declarations.items():
            source = native[name]
            assert declaration['schema'] in ['source-pinned-authored-regions-v1',
                'source-pinned-unowned-authored-regions-v2', 'source-pinned-owned-authored-regions-v3']
            assert declaration['sourceSha256'] == source['sha256']
            assert declaration['paletteSha256'] == source['palette']['sha256']
            unowned = declaration['schema'] == 'source-pinned-unowned-authored-regions-v2'
            owned = declaration['schema'] == 'source-pinned-owned-authored-regions-v3'
            if not unowned and not owned:
                assert not source['remapable'] and not source.get('framePalettes')
            for region in declaration['regions']:
                frame = source['frames'][region['nativeFrame']]
                assert frame['slot'] < source['bodyFrames']
                assert region['indexSha256'] == frame['indexSha256']
                left, top, right, bottom = region['nativeBounds']
                assert 0 <= left < right <= frame['size'][0]
                assert 0 <= top < bottom <= frame['size'][1]
                if unowned or owned:
                    palette = source.get('framePalettes', {}).get(str(frame['slot']), source['palette'])
                    assert region['paletteSha256'] == palette['sha256']
                    index_file = native_root / frame['indexFile']
                    assert sha(index_file) == frame['indexSha256']
                    indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
                    owner = (indices[top:bottom, left:right] >= 16) & (indices[top:bottom, left:right] < 32)
                    if owned:
                        assert palette.get('remapable', source['remapable'])
                        assert region['nativeOwnerPixels'] == int(owner.sum())
                        assert region['nativeOwnerMaskSha256'] == hashlib.sha256(owner.astype(np.uint8).tobytes()).hexdigest()
                    else:
                        assert not (palette.get('remapable', source['remapable']) and owner.any()), 'An unowned component cannot cover owner pixels'
                file = Path(region['master'])
                assert sha(file) == region['masterSha256']
                with Image.open(file) as image:
                    x, y, width, height = region['masterRect']
                    assert 0 <= x < x + width <= image.width and 0 <= y < y + height <= image.height
                    assert width >= (right - left) * 4 and height >= (bottom - top) * 4
                    pixels = np.asarray(image.convert('RGBA').crop((x, y, x + width, y + height)))
                valid = authored_coverage(pixels, 180, fringe_guard=True)
                assert valid.any(), 'The component requires real authored material'
                self.materials[name, region['nativeFrame'], tuple(region['nativeBounds'])] = extrude(pixels[..., :3], valid)

    def register(self, rgb, name, frame, density):
        for region in self.declarations.get(name, {}).get('regions', []):
            if region['nativeFrame'] != frame['slot']:
                continue
            left, top, right, bottom = region['nativeBounds']
            material = self.materials[name, frame['slot'], tuple(region['nativeBounds'])]
            rgb[top * density:bottom * density, left * density:right * density] = independently_sample(
                material, ((right - left) * density, (bottom - top) * density))
