"""Add the missing large eccentric counterweight to the accepted oil mechanism."""
import json
import runpy
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

rotation = runpy.run_path(str(Path(__file__).with_name('export-oil-crank-rotation.py')))
edges = rotation['edges']
MASTER = Path('.artifacts/m2-3/feedback-r15-v1/authoring/eccentric-counterweight-v2.png')
MASTER_SHA = '9dd56025b77160643d8ace0019ffcd5da97475af4cc6f3e12d7f8aace583c1ff'
SHAFT = np.array([210., 634.])
PIN = np.array([803., 639.])
RADIUS = 7.9


def material():
    assert edges['sha'](MASTER) == MASTER_SHA
    rgba = np.array(Image.open(MASTER).convert('RGBA'))
    rgba[..., :3] = edges['extrude'](rgba[..., :3], rgba[..., 3] > 180)
    return rgba


rotor = material()


def crank(unused_link, phase, density):
    direction = (PIN-SHAFT)/np.linalg.norm(PIN-SHAFT)
    source_basis = np.column_stack([direction, [-direction[1], direction[0]]])
    angle = rotation['START']+phase*2*np.pi/32
    turn = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    transform = rotation['PROJECTION'] @ turn @ source_basis.T * (RADIUS/np.linalg.norm(PIN-SHAFT))
    xy = (rotation['points'](density)-rotation['AXLE']) @ np.linalg.inv(transform).T+SHAFT
    rgb = np.stack([ndimage.map_coordinates(rotor[..., c], [xy[..., 1], xy[..., 0]],
                    order=3, mode='constant') for c in range(3)], axis=-1)
    alpha = ndimage.map_coordinates(rotor[..., 3]/255., [xy[..., 1], xy[..., 0]], order=1, mode='constant')
    pin = rotation['AXLE']+rotation['PROJECTION'] @ turn @ np.array([RADIUS, 0.])
    return (np.clip(rgb, 0, 255), np.clip(alpha, 0, 1)), pin, transform


if __name__ == '__main__':
    globals_ = rotation['motion_layers'].__globals__
    globals_.update(crank=crank, RADIUS=RADIUS)
    edges['main'].__globals__['motion_layers'] = rotation['motion_layers']
    edges['main']()
    output, receipt = Path(sys.argv[2]), Path(sys.argv[3])
    file = output/'members/ctoild_a-shp/manifest.json'
    metadata = edges['load'](file)
    metadata['authored']['r15EccentricRotor'] = dict(masterSha256=MASTER_SHA,
        method='A complete large eccentric counterweight and crank rotate rigidly around the fixed shaft; the eccentric pin connects to the posterior rod.',
        fixedAxle=rotation['AXLE'].tolist(), projection=rotation['PROJECTION'].tolist(), radius=RADIUS,
        sourceShaft=SHAFT.tolist(), sourcePin=PIN.tolist(),
        preserved='Accepted R13 beam, front rod, fixed background, body, flag, ownership, logical geometry and timing')
    file.write_text(json.dumps(metadata, separators=(',', ':'))+'\n')
    catalog = edges['load'](output/'manifest.json')
    for member in catalog['families']['environment-ctoild']['members']:
        if member['member'] == 'ctoild_a.shp': member['sha256'] = edges['sha'](file)
    (output/'manifest.json').write_text(json.dumps(catalog, separators=(',', ':'))+'\n')
    record = edges['load'](receipt);record['manifestSha256'] = edges['sha'](output/'manifest.json')
    record['status'] = 'EXPORTED_ECCENTRIC_COUNTERWEIGHT_PENDING_VISUAL_AND_NATIVE_CHECKS'
    receipt.write_text(json.dumps(record, indent=2)+'\n')
