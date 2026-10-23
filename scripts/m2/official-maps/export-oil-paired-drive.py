"""Project paired rigid oil cranks around the fixed housing, retaining R13 beam art."""
import json
import runpy
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

rotation = runpy.run_path(str(Path(__file__).with_name('export-oil-crank-rotation.py')))
edges = rotation['edges']
MASTER = Path('.artifacts/m2-3/feedback-r16-v1/authoring/rotor-front-v3.png')
MASTER_SHA = '5f092b59cadd87ef1754d86162fda215424024428bb113376d72eb7930f026c0'
assert edges['sha'](MASTER) == MASTER_SHA
SHAFT = np.array([286., 630.])
PIN = np.array([888., 642.])
# Eight independently inspected retail poses constrain the projected pin orbit.
# Intermediate frames are evaluated from one rigid revolution, never resized.
REFERENCE_PHASES = np.arange(0, 32, 4)
REFERENCE_PINS = np.array([[43.5,40], [47.5,44], [52,43], [56,37],
                           [55,29.5], [51.5,24], [47,24.5], [43.5,30.5]])
angles = REFERENCE_PHASES*2*np.pi/32
FIT = np.linalg.lstsq(np.column_stack([np.ones(8), np.cos(angles), np.sin(angles)]),
                      REFERENCE_PINS, rcond=None)[0]
AXLE = FIT[0]
ORBIT = FIT[1:].T
SEPARATION = np.array([11., 5.5])
THICKNESS = np.array([1.15, .575])
ROD_WIDTH = 4.2
rgba = np.array(Image.open(MASTER).convert('RGBA'))
rgba[..., :3] = edges['extrude'](rgba[..., :3], rgba[..., 3] > 180)


def sampled(xy):
    rgb = np.stack([ndimage.map_coordinates(rgba[..., c], [xy[..., 1], xy[..., 0]],
                    order=3, mode='constant') for c in range(3)], axis=-1)
    alpha = ndimage.map_coordinates(rgba[..., 3]/255., [xy[..., 1], xy[..., 0]], order=1, mode='constant')
    return np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)


def crank(phase, d, center):
    angle = phase*2*np.pi/32
    turn = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    axis = (PIN-SHAFT)/np.linalg.norm(PIN-SHAFT)
    basis = np.column_stack([axis, [-axis[1], axis[0]]])
    transform = ORBIT @ turn @ basis.T/np.linalg.norm(PIN-SHAFT)
    inverse = np.linalg.inv(transform)
    xy = (rotation['points'](d)-center) @ inverse.T+SHAFT
    rgb, alpha = sampled(xy)
    # A constant camera-axis extrusion, independent of crank angle. The old
    # sprite rotated an already projected sidewall and changed its perspective.
    side_alpha = np.zeros_like(alpha)
    for offset in np.linspace(0, 1, 9):
        side_xy = xy + (THICKNESS*offset) @ inverse.T
        layer = ndimage.map_coordinates(rgba[..., 3]/255., [side_xy[..., 1], side_xy[..., 0]],
                                       order=1, mode='constant')
        side_alpha = np.maximum(side_alpha, layer)
    side_rgb = np.full_like(rgb, [70., 73., 79.])
    side = (side_rgb, side_alpha)
    face = (rgb, alpha)
    pin = center+ORBIT @ turn @ np.array([1., 0.])
    return [side, face], pin, transform


def housing_occlusion(d):
    # Silhouette of the unchanged fixed housing and the A-frame in the shared
    # R13 donor, in native active-layer coordinates. Only the far side is cut.
    mask = Image.new('L', (61*d*4, 69*d*4))
    draw = ImageDraw.Draw(mask)
    polygons = [
        [(39,29), (43,26), (48,28), (51,31), (58,47), (49,51), (41,46)],
        [(33,18), (36,17), (40,49), (45,64), (40,66), (34,38)],
        [(30,26), (33,25), (30,53), (27,57)],
    ]
    for polygon in polygons:
        draw.polygon([(round((x+.5)*d*4), round((y+.5)*d*4)) for x,y in polygon], fill=255)
    return np.array(mask.resize((61*d, 69*d), Image.Resampling.LANCZOS))/255.


def motion_layers(master, coverage, target, old_pin, image, d):
    old, anchors = rotation['old_layers'](master, coverage, target, old_pin, image, d)
    phase = motion_layers.phase % 32
    motion_layers.phase += 1
    bearing = np.array(anchors['beamBearing'])
    near_upper = bearing+np.array([8., 6.5])
    far_upper = near_upper-SEPARATION
    far, far_pin, transform = crank(phase, d, AXLE-SEPARATION)
    near, near_pin, _ = crank(phase, d, AXLE)
    far.append(rotation['rod'](image, far_upper, far_pin, d, width=ROD_WIDTH))
    occlusion = housing_occlusion(d)
    far = [(rgb*.84, alpha*(1-occlusion)) for rgb, alpha in far]
    near.append(rotation['rod'](image, near_upper, near_pin, d, width=ROD_WIDTH))
    cross_shaft = rotation['rod'](image, far_upper, near_upper, d, width=2.8)
    anchors.update(phase=phase, crankAngle=phase*2*np.pi/32, crankTransform=transform.tolist(),
        nearFixedAxle=AXLE.tolist(), farFixedAxle=(AXLE-SEPARATION).tolist(),
        nearCrankPin=near_pin.tolist(), farCrankPin=far_pin.tolist(),
        nearUpperJoint=near_upper.tolist(), farUpperJoint=far_upper.tolist(),
        rodWidth=ROD_WIDTH, rotorCount=2, rearRodCount=2,
        thickness=THICKNESS.tolist(), farHousingOcclusionPixels=int((occlusion>.5).sum()))
    return [old[0], *far, *near, cross_shaft, old[-1]], anchors


motion_layers.phase = 0
if __name__ == '__main__':
    edges['main'].__globals__['motion_layers'] = motion_layers
    edges['main']()
    output, receipt = Path(sys.argv[2]), Path(sys.argv[3])
    file = output/'members/ctoild_a-shp/manifest.json'
    metadata = edges['load'](file)
    metadata['authored']['r16PairedDrive'] = dict(masterSha256=MASTER_SHA,
        method='Two rigid eccentric rotors and two thick rods, constant projected shaft separation, fixed camera-axis extrusion and far-side housing occlusion',
        referencePhases=REFERENCE_PHASES.tolist(), referencePins=REFERENCE_PINS.tolist(),
        nearAxle=AXLE.tolist(), farAxle=(AXLE-SEPARATION).tolist(), orbit=ORBIT.tolist(),
        sourceShaft=SHAFT.tolist(), sourcePin=PIN.tolist(), rodWidth=ROD_WIDTH,
        preserved='R13 walking beam/front rod/fixed donor; body/flag, owner data, logical geometry, shadows and timing')
    file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
    catalog = edges['load'](output/'manifest.json')
    for member in catalog['families']['environment-ctoild']['members']:
        if member['member'] == 'ctoild_a.shp': member['sha256'] = edges['sha'](file)
    (output/'manifest.json').write_text(json.dumps(catalog, separators=(',', ':'))+'\n')
    record = edges['load'](receipt);record['manifestSha256'] = edges['sha'](output/'manifest.json')
    record['status'] = 'EXPORTED_PAIRED_DRIVE_PENDING_REFERENCE_AND_NATIVE_REVIEW'
    receipt.write_text(json.dumps(record, indent=2)+'\n')
