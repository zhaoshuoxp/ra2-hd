"""Qualify authored body shades that share the native index-12 color."""
import numpy as np
from showcase_registration import sha


class BodyIndex12Material:
    def __init__(self, declarations, sources, native_root):
        self.declarations, self.frames = declarations, set()
        for name, declaration in declarations.items():
            source = sources[name]
            animation = declaration['schema'] == 'source-pinned-animation-index12-material-v1'
            if animation:
                assert declaration['classification'] == 'AUTHORED_BUILDING_ANIMATION_SHADE_WITHOUT_SHADOW_SLOTS'
                assert name == 'cgtime_a.shp'
                assert source['sha256'] == 'db367177b14ae4eba27ed15ca8aefc1e63832497e6ad41ef34a695a4116f89cd'
                assert not source['hasShadow'] and source['totalFrames'] == source['bodyFrames']
                assert all(binding['kind'] == 'building' and binding['role'] == 'ACTIVE' for binding in source['bindings'])
            else:
                assert declaration['schema'] in ('source-pinned-body-index12-material-v1',
                                                'source-pinned-body-index12-material-v2')
                assert declaration['classification'] == 'AUTHORED_BODY_SHADE_WITH_SEPARATE_NATIVE_SHADOWS'
                assert source['hasShadow'] and source['totalFrames'] == source['bodyFrames'] * 2
                assert all(binding['kind'] == 'building' and binding['role'] == 'body' for binding in source['bindings'])
                if declaration['schema'].endswith('-v2'):
                    assert declaration['contourPolicy'] == 'AUTHORED_BODY_SHADE_COVERAGE_SEPARATE_NATIVE_SHADOWS'
                    assert source['member'] in ('ylcomd.shp', 'cllunr01.shp')
                    assert source['palette']['member'] == 'unitlun.pal'
            assert declaration['sourceSha256'] == source['sha256']
            assert declaration['paletteSha256'] == source['palette']['sha256']
            for slot, expected in declaration['frames'].items():
                slot = int(slot)
                assert 0 <= slot < source['bodyFrames']
                frame = source['frames'][slot]
                assert expected['indexSha256'] == frame['indexSha256']
                palette = source.get('framePalettes', {}).get(str(slot), source['palette'])
                assert expected['paletteSha256'] == palette['sha256']
                file = native_root / frame['indexFile']
                assert sha(file) == frame['indexSha256']
                pixels = np.frombuffer(file.read_bytes(), np.uint8)
                assert int((pixels == 12).sum()) == expected['bodyShadePixels'] > 0
                self.frames.add((name, slot))

    def owns(self, name, frame):
        return (name, frame) in self.frames

    def smooths_contours(self, name, frame):
        return self.owns(name, frame) and self.declarations[name]['schema'] == 'source-pinned-body-index12-material-v2'
