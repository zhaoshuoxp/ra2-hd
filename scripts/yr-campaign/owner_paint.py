"""Keep fixed materials outside explicitly source-bound owner-red paint."""
import numpy as np


def owner_paint_declaration(source, declaration):
    assert source['remapable']
    assert all(binding['kind'] == 'building' for binding in source['bindings'])
    if declaration.get('schema') == 'yr-source-pinned-owner-region-v2':
        assert set(declaration) == {'schema', 'maximumNeutralChannelFraction', 'maximumNativeOwnerDistance',
            'sourceSha256', 'paletteSha256', 'originalIndices'}
        assert declaration['maximumNeutralChannelFraction'] in [.22, .67]
        assert declaration['maximumNativeOwnerDistance'] in [2, 4]
        assert declaration['sourceSha256'] == source['sha256']
        assert declaration['paletteSha256'] == source['palette']['sha256']
        assert declaration['originalIndices'] == [frame['indexSha256']
            for frame in source['frames'][:source['bodyFrames']]]
        assert len(declaration['originalIndices']) == source['bodyFrames'] > 0
        return dict(declaration)
    assert declaration == dict(schema='yr-authored-owner-red-v1', maximumNeutralChannelFraction=.22)
    assert source['bodyFrames'] == 4
    return dict(declaration, sourceSha256=source['sha256'],
        paletteSha256=source['palette']['sha256'],
        originalIndices=[frame['indexSha256'] for frame in source['frames'][:source['bodyFrames']]])


def owner_red_candidates(rgba, declaration):
    assert declaration['schema'] in ['yr-authored-owner-red-v1', 'yr-source-pinned-owner-region-v2']
    assert declaration['maximumNeutralChannelFraction'] in (
        [.22] if declaration['schema'] == 'yr-authored-owner-red-v1' else [.22, .67])
    red, green, blue = [rgba[..., channel].astype(float) for channel in range(3)]
    limit = red * declaration['maximumNeutralChannelFraction']
    return (rgba[..., 3] > 0) & (red > 35) & (green < limit) & (blue < limit)


def limit_owner_region(paint, indices, density, declaration):
    """Retain authored red edges only near the original ownership controls."""
    if declaration.get('schema') != 'yr-source-pinned-owner-region-v2':
        return paint
    assert declaration['maximumNativeOwnerDistance'] in [2, 4] and density in [2, 4]
    controls = np.argwhere((indices >= 16) & (indices <= 31)).astype(float) + .5
    result = paint.copy()
    if not len(controls):
        result[:] = False
        return result
    pixels = np.argwhere(paint)
    for offset in range(0, len(pixels), 256):
        block = pixels[offset:offset + 256]
        points = (block.astype(float) + .5) / density
        distances = ((points[:, None] - controls[None]) ** 2).sum(2).min(1)
        result[block[:, 0], block[:, 1]] &= distances <= declaration['maximumNativeOwnerDistance'] ** 2
    return result
