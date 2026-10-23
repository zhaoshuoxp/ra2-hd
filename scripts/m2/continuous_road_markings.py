"""Reconstruct native road paint as whole-member lines and tangent circular arcs."""
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from showcase_road_geometry import fillet
from showcase_urban_roads import source_regions


def plane(x, y, ramp):
    if ramp == 1:
        y = 2*y+x/2
    elif ramp == 2:
        y = 2*y-x/2
    elif ramp == 3:
        y = 2*y/3-x/6
    elif ramp == 4:
        y = 2*y/3+x/6
    return x, y


def fit_member(native, origin, member, ramp):
    """Use native whole-member paint as anchors; never fit individual subtiles."""
    rgb = native[..., :3].astype(float)
    active, road, _ = source_regions(native, precise_paint=True)
    yellow = active & (rgb[..., 0] > 70) & (rgb[..., 1] > 60) & (rgb[..., 2] < 90)
    yellow &= (rgb[..., 0]-rgb[..., 2] > 35) & (abs(rgb[..., 0]-rgb[..., 1]) < 50)
    yy, xx = np.indices(native.shape[:2])
    gx, gy = xx+.5+origin[0], yy+.5+origin[1]
    if member in ['proad10.des', 'proad11.des', 'proad13.des', 'proad14.des']:
        core = yellow & (ndimage.distance_transform_edt(road) >= 8)
        y, x = np.where(core)
        q = np.column_stack([x+.5, (y+.5)*2])
        axis = 0 if member in ['proad13.des', 'proad14.des'] else 1
        bins = q[:, axis].astype(int)//2
        anchors = np.array([np.median(q[bins == b], axis=0) for b in sorted(set(bins))])
        fitted = fillet(anchors/[1, 2], endpoint_margin=0)
        assert fitted is not None
        curve, model = fitted
        assert model['error95'] < 3.2, (member, model)
        # Snap both ports to the same lattice as all straight variants, then
        # rebuild a true tangent circle. An interpolation of the old painted
        # pixels would retain its inconsistent port offsets.
        q = curve*[1, 2]
        normals, intercepts, port_signs = [], [], []
        for point, direction in [(q[0], q[1]-q[0]), (q[-1], q[-1]-q[-2])]:
            sign = -1 if direction[0]*direction[1] > 0 else 1
            base = -62.5 if sign == -1 else 122.5
            current = point[0]+sign*point[1]+origin[0]+sign*2*origin[1]
            canonical = base+60*round((current-base)/60)
            normals.append(np.array([1, sign])/np.sqrt(2))
            intercepts.append((canonical-origin[0]-sign*2*origin[1])/np.sqrt(2))
            port_signs.append(dict(sign=sign, before=float(current), after=canonical))
        matrix = np.stack(normals)
        corner = np.linalg.solve(matrix, intercepts)
        endpoints = np.array([point-normal*(point@normal-intercept)
            for point, normal, intercept in zip(q[[0, -1]], normals, intercepts, strict=True)])
        u, v = endpoints-corner
        u, v = u/np.linalg.norm(u), v/np.linalg.norm(v)
        radius = model['radius']
        center = corner+(u+v)/np.linalg.norm(u+v)*radius*np.sqrt(2)
        first, last = corner+u*radius, corner+v*radius
        angles = np.arctan2([first[1]-center[1], last[1]-center[1]],
            [first[0]-center[0], last[0]-center[0]])
        delta = (angles[1]-angles[0]+np.pi) % (2*np.pi)-np.pi
        theta = np.linspace(angles[0], angles[0]+delta, max(16, int(abs(delta)*radius*12)))
        arc = center+radius*np.column_stack([np.cos(theta), np.sin(theta)])
        q = np.concatenate([first[None]+u[None]*200, arc, last[None]+v[None]*200])
        model['ports'] = port_signs
        segments = []
        for a, b in zip(q[:-1], q[1:], strict=True):
            t = np.linspace(0, 1, max(2, int(np.linalg.norm(b-a)*12)), endpoint=False)
            segments.append(a+(b-a)*t[:, None])
        q = np.concatenate(segments+[q[-1:]])
        lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
        tangent = np.gradient(q, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1)[:, None], 1e-9)
        return dict(kind='curve', points=q, tangent=tangent, length=lengths,
            tree=cKDTree(q), origin=np.asarray(origin), audit=dict(member=member,
                anchorPixels=int(core.sum()), **model, portExtension=150))
    x, y = plane(gx, gy, ramp)
    negative = member.startswith(('proad01', 'prslpe01', 'prslpe03')) or member in ['proad06.des', 'proad08.des']
    sign = -1 if negative else 1
    cross = x+sign*2*y
    # The center pair is isolated from the two edge-yellow lines by its central
    # cross-section cluster, independently of the very short slope aspect ratio.
    values = cross[yellow]
    center = float(np.median(values))
    middle = values[abs(values-center) < 18]
    assert len(middle) > 10, member
    center = float(np.mean(np.quantile(middle, [.15, .85])))
    if ramp == 0:
        base = -62.5 if sign == -1 else 122.5
        center = base+60*round((center-base)/60)
    return dict(kind='strip', sign=sign, center=center, ramp=ramp,
        audit=dict(member=member, kind='source-plane-line', nativeCenterCross=center,
            centerAnchorPixels=len(middle), ramp=ramp, normal=[1, sign*2]))


def coordinates(model, gx, gy):
    if model['kind'] == 'strip':
        x, y = plane(gx, gy, model['ramp'])
        cross = (x+model['sign']*2*y-model['center'])/np.sqrt(2)
        length = (x-model['sign']*2*y)/np.sqrt(2)
        # Convert physical normal distance into screen distance for one-pixel AA.
        delta = .01
        _, py = plane(gx, gy+delta, model['ramp'])
        grad_y = model['sign']*2*(py-y)/delta/np.sqrt(2)
        px, py = plane(gx+delta, gy, model['ramp'])
        grad_x = ((px-x)+model['sign']*2*(py-y))/delta/np.sqrt(2)
        gradient = np.hypot(grad_x, grad_y)
        return cross, length, gradient
    local = np.stack([gx-model['origin'][0], (gy-model['origin'][1])*2], axis=-1)
    _, indices = model['tree'].query(local.reshape(-1, 2))
    nearest, tangent = model['points'][indices], model['tangent'][indices]
    normal = np.column_stack([-tangent[:, 1], tangent[:, 0]])
    signed = ((local.reshape(-1, 2)-nearest)*normal).sum(1)
    gradient = np.hypot(normal[:, 0], normal[:, 1]*2)
    return signed.reshape(gx.shape), model['length'][indices].reshape(gx.shape), gradient.reshape(gx.shape)


def reconstruct(authored, native, metadata, density, model, material, colors, curb_detail, plane_gain=1):
    """Render one shared road plane into a native-owned subtile rectangle."""
    yy, xx = np.indices(authored.shape[:2])
    gx = (xx+.5)/density+metadata['origin'][0]+metadata['offset'][0]
    gy = (yy+.5)/density+metadata['origin'][1]+metadata['offset'][1]
    distance, along, gradient = coordinates(model, gx, gy)
    aa = gradient/density
    band = lambda field, width: np.clip((width/2-np.abs(field))/aa+.5, 0, 1)
    x, y = plane(gx, gy, metadata['rampType'])
    u, v = (x/60+y/30-.5) % 1, (-x/60+y/30+.5) % 1
    coords = [v*material.shape[0]-.5, u*material.shape[1]-.5]
    asphalt = np.stack([ndimage.map_coordinates(material[..., c], coords, order=1, mode='grid-wrap')
        for c in range(3)], axis=2)*plane_gain
    rgb = authored[..., :3].astype(float)
    active = authored[..., 3] > 0
    light = rgb.mean(2)
    chroma = np.ptp(rgb, axis=2)
    old_paint = ((rgb[..., 0]-rgb[..., 2] > 25)
        & (rgb[..., 1]-rgb[..., 2] > 20) & (rgb[..., 2] < 125))
    old_paint |= (light > 140) & (chroma < 45)
    repair_width = 8 if model['kind'] == 'curve' else 54.8
    old_paint &= active & (np.abs(distance) < repair_width)
    removal = ndimage.binary_dilation(old_paint, iterations=max(1, density//2))
    removal &= np.abs(distance) < repair_width+.4
    clean = active & ~removal & (light < 135) & (chroma < 38)
    assert clean.any()
    nearest = ndimage.distance_transform_edt(~clean, return_distances=False, return_indices=True)
    rgb[removal] = rgb[tuple(nearest)][removal]
    # Retain the existing authored asphalt exactly outside obsolete paint. The
    # continuous projected material is used only under the replaced curb cuts.
    paint_gate = np.clip((53.0-np.abs(distance))/aa+.5, 0, 1)
    if model['kind'] == 'strip':
        if metadata['rampType']:
            rgb = rgb*(1-paint_gate[..., None])+asphalt*paint_gate[..., None]
        curb_gate = np.clip((np.abs(distance)-53.0)/aa+.5, 0, 1)
        # Sample the accepted straight curb in its own strip coordinates. The
        # donor is HD artwork, rather than native palette pixels or a flat fill.
        cross = 22+(np.abs(distance)-59)*np.sqrt(2)
        forward = 30+(along*np.sqrt(2)) % 60
        sx = (cross+forward)*density/2-.5
        sy = (forward-cross)*density/4-.5
        curb = np.stack([ndimage.map_coordinates(curb_detail[..., c], [sy, sx],
            order=1, mode='nearest') for c in range(3)], axis=2)
        rgb = rgb*(1-curb_gate[..., None])+curb*curb_gate[..., None]
    yellow = np.maximum(band(distance-2.12, 1.35), band(distance+2.12, 1.35))
    edges = np.maximum(band(distance-51.0, 1.05), band(distance+51.0, 1.05))
    if model['kind'] != 'curve':
        yellow = np.maximum(yellow, edges)
    yellow *= paint_gate
    phase = along % (10*np.sqrt(2))
    dash = np.clip(np.minimum(phase, 8.3-phase)/aa+.5, 0, 1)
    white = np.maximum(band(distance-25.45, 1.25), band(distance+25.45, 1.25))*dash*paint_gate
    if model['kind'] == 'curve':
        white *= 0
    grain = np.clip((asphalt-asphalt.mean((0, 1))).mean(2), -20, 20)
    yellow_rgb = colors['yellow']+grain[..., None]*.18
    white_rgb = colors['white']+grain[..., None]*.2
    rgb = rgb*(1-yellow[..., None])+yellow_rgb*yellow[..., None]
    rgb = rgb*(1-white[..., None])+white_rgb*white[..., None]
    result = authored.copy()
    result[..., :3] = np.rint(np.clip(rgb, 0, 255)).astype(np.uint8)
    opaque = result[..., 3] > 0
    nearest = ndimage.distance_transform_edt(~opaque, return_distances=False, return_indices=True)
    result[~opaque, :3] = result[tuple(nearest)][~opaque, :3]
    np.testing.assert_array_equal(result[..., 3], authored[..., 3])
    return result
