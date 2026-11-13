"""Register new scenery paint while retaining the original SHP gameplay geometry."""
import hashlib

import numpy as np
from PIL import Image
from scipy import ndimage
from showcase_registration import authored_coverage


def authored_scenery(declaration, source, frame, image, indices):
    assert declaration['schema'] == 'yr-source-pinned-authored-scenery-v1'
    assert declaration['sourceSha256'] == source['sha256']
    assert declaration['paletteSha256'] == source['palette']['sha256']
    assert declaration['indexSha256'] == frame['indexSha256']
    assert source['bodyFrames'] == 1 and source['totalFrames'] == 2 and source['hasShadow']
    assert not source['remapable'] and not source.get('framePalettes')
    allowed = ['terrain']
    if source['identity'] in ['TROCK03', 'SROCK05'] and source.get('nativeObjectType') == 4:
        allowed.append('overlay')
    assert all(binding['kind'] in allowed and binding['role'] == 'body' for binding in source['bindings'])
    assert declaration['masterRgbaSha256'] == hashlib.sha256(image.tobytes()).hexdigest()
    assert declaration['alphaCutoff'] == 180 and declaration['rejectFluorescentFringe'] is True
    pixels = np.array(image)
    covered = authored_coverage(pixels, 180, fringe_guard=True)
    labels, _ = ndimage.label(covered, np.ones((3, 3)))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    assert sizes.max() > 100
    # Keep substantial separately drawn leaves and lamp parts, together with
    # the main subject. Tiny matte flecks are excluded at master resolution.
    retained = sizes >= max(25, sizes.max() * .0005)
    retained[0] = False
    covered = retained[labels]
    pixels[..., 3] = np.where(covered, pixels[..., 3], 0)
    pixels[..., :3][~covered] = 0
    clean = Image.fromarray(pixels)
    bounds = clean.getchannel('A').getbbox()
    assert bounds
    detail = clean.crop(bounds)
    native_bounds = Image.fromarray((indices != 0).astype(np.uint8) * 255).getbbox()
    assert native_bounds
    left, top, right, bottom = native_bounds
    capacity = min(detail.width / (right - left), detail.height / (bottom - top))
    assert capacity >= 4, 'Scenery needs independently drawn detail for both densities'
    preview = detail.getchannel('A').resize(((right - left) * 16, (bottom - top) * 16), Image.Resampling.LANCZOS)
    alpha_area = np.asarray(preview, dtype=float).sum() / 255 / 256
    proof = dict(alphaAuthority='NEWLY_DRAWN_MASTER_WITH_SUBSTANTIAL_AUTHORED_PARTS',
        nativeBodyBounds=list(native_bounds), masterBodyBounds=list(bounds),
        independentDensityCapacity=capacity, originalVisibleBodyPixels=int(np.count_nonzero(indices)),
        authoredVisibleBodyAreaNativePixels=float(alpha_area),
        originalIndex12Pixels=int(np.count_nonzero(indices == 12)),
        index12Policy='Visible neutral body material; retain the separate original indexed shadow.',
        qualification='Native canvas, trim, pivot, foundation, ownership and shadows remain exact. '
            'The original indexed silhouette is measured as a reference. Authored leaf gaps and antialiased '
            'edges require actual 2X/4X export and native visual inspection; this is separate from the existing '
            'source-pinned-authored-terrain-contours-v1 area and connectivity policy.',
        userVisualAcceptance='PENDING')
    return detail, native_bounds, proof
