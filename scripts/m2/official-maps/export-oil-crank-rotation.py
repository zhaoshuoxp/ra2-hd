"""Keep the accepted beam and turn a constant crank around the fixed drive axle."""
import json
import runpy
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

edges = runpy.run_path(str(Path(__file__).with_name('export-oil-complete-edges.py')))
old_layers = edges['motion_layers']
AXLE = np.array([49., 36.])
# Orthographic projection of the vertical crank plane. Columns are its two
# perpendicular world axes, not a per-frame fit to apparent endpoint distance.
PROJECTION = np.array([[.85, 0.], [.42, -1.]])
RADIUS = 9.
START = np.arctan2(-6.47, -5.88)


def sample(image, xy, side):
    rgb = np.stack([ndimage.map_coordinates(image[..., c], [xy[..., 1], xy[..., 0]],
                    order=3, mode='constant') for c in range(3)], axis=-1)
    alpha = ndimage.map_coordinates(image[..., 3]/255., [xy[..., 1], xy[..., 0]], order=1, mode='constant')
    alpha *= (xy[..., 0] < 887) if side == 'left' else (xy[..., 0] >= 887)
    return np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)


def points(d):
    y, x = np.indices((69*d, 61*d))
    return np.stack([(x+.5)/d-.5, (y+.5)/d-.5], axis=-1)


def crank(image, phase, d):
    a, b = np.array([1445., 486.]), np.array([1205., 633.])
    u = (b-a)/np.linalg.norm(b-a)
    source_basis = np.column_stack([u, [-u[1], u[0]]])
    angle = START+phase*2*np.pi/32
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    transform = PROJECTION @ rotation @ source_basis.T * (RADIUS/np.linalg.norm(b-a))
    xy = (points(d)-AXLE) @ np.linalg.inv(transform).T + a
    pin = AXLE + PROJECTION @ rotation @ np.array([RADIUS, 0.])
    return sample(image, xy, 'right'), pin, transform


def rod(image, p, q, d, width=2.1):
    # Preserve the diameter of both eyes. Only the projected straight shaft span
    # changes between the moving joints; endpoint-based uniform scaling made
    # R13's bearing diameters breathe along with the mistaken crank length.
    a, b = np.array([547., 123.]), np.array([608., 778.])
    axis = (b-a)/np.linalg.norm(b-a); normal = np.array([-axis[1], axis[0]])
    direction = (q-p)/np.linalg.norm(q-p); transverse = np.array([-direction[1], direction[0]])
    delta = points(d)-p
    along = delta @ direction; span = np.linalg.norm(q-p)
    scale = 70./width; cap = 1.3
    source_span = np.linalg.norm(b-a)
    source_along = np.where(along < cap, along*scale,
        np.where(along > span-cap, source_span+(along-span)*scale,
                 cap*scale+(along-cap)*(source_span-2*cap*scale)/(span-2*cap)))
    xy = a+source_along[..., None]*axis+(delta @ transverse)[..., None]*scale*normal
    return sample(image, xy, 'left')


def motion_layers(master, coverage, target, old_pin, image, d):
    layers, anchors = old_layers(master, coverage, target, old_pin, image, d)
    # Symmetric beam poses occur twice, but the crank must continue through a
    # full revolution. The export loop supplies an explicit phase below.
    phase = motion_layers.phase % 32
    motion_layers.phase += 1
    rotating, pin, transform = crank(image, phase, d)
    bearing = np.array(anchors['beamBearing'])
    upper_joint = bearing+np.array([6., 3.])
    spacer = rod(image, bearing, upper_joint, d, width=1.55)
    connecting = rod(image, upper_joint, pin, d)
    anchors.update(crankPin=pin.tolist(), fixedAxle=AXLE.tolist(), upperRodJoint=upper_joint.tolist(),
                   crankPlaneRadius=RADIUS, crankTransform=transform.tolist(), crankPhase=phase,
                   crankAngle=START+phase*2*np.pi/32)
    return [layers[0], rotating, connecting, spacer, layers[-1]], anchors


motion_layers.phase = 0
if __name__ == '__main__':
    edges['main'].__globals__['motion_layers'] = motion_layers
    edges['main']()
    output, receipt = Path(sys.argv[2]), Path(sys.argv[3])
    member = output/'members/ctoild_a-shp/manifest.json'
    metadata = edges['load'](member)
    metadata['authored']['r14CrankRotation'] = dict(
        method='Constant projected rigid crank with a fixed shaft, full revolution and separate upper shaft spacer; fixed-diameter rod eyes',
        reference='.artifacts/m2-3/feedback-r14-v1/original-rear-cycle.png',
        acceptedBeam='R13 material, coverage, landmarks and front rod unchanged',
        fixedAxle=AXLE.tolist(), projection=PROJECTION.tolist(), radius=RADIUS)
    member.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
    catalog = edges['load'](output/'manifest.json')
    for item in catalog['families']['environment-ctoild']['members']:
        if item['member'] == 'ctoild_a.shp': item['sha256'] = edges['sha'](member)
    (output/'manifest.json').write_text(json.dumps(catalog, separators=(',', ':'))+'\n')
    result = edges['load'](receipt); result['manifestSha256'] = edges['sha'](output/'manifest.json')
    result['status'] = 'EXPORTED_RIGID_CRANK_PENDING_VISUAL_AND_NATIVE_CHECKS'
    receipt.write_text(json.dumps(result, indent=2)+'\n')
