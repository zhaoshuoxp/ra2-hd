"""Rebuild deficient Soviet families with accepted R2/R3/R4 motion at true 4x."""
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image

root = Path('.artifacts/4x-regeneration')
names = ['NARADR', 'NADEPT', 'NATECH', 'NANRCT', 'NACLON', 'NAPSIS', 'NAMISL', 'NAWALL']
stages = {k: root / ('soviet-' + k + '-exports-v1') for k in ['base', 'motion', 'parts', 'remap', 'final']}
env = {**os.environ, 'RA2_EXPORT_DENSITY': '4',
       'RA2_REGENERATED_MASTERS': str(root / 'building-master-map-v1.json')}
commands = {'NARADR': 'compose-scanners.py', 'NAPSIS': 'compose-scanners.py',
            'NADEPT': 'compose-cranes.py', 'NAMISL': 'compose-silo.py',
            'NATECH': 'compose-simple.py', 'NAWALL': 'compose-simple.py',
            'NANRCT': 'compose-energy.py', 'NACLON': 'compose-energy.py'}


def run(script, name, stage, previous=None, **extra):
    out = stages[stage] / name
    if out.exists():
        assert (out / 'candidate-review.json').exists(), ('Incomplete stage', out)
        return out
    task_env = {**env, 'RA2_EXPORT_OUTPUT': str(stages[stage]), **extra}
    if previous:
        task_env['SOVIET_PREVIOUS_EXPORTS'] = str(previous)
    args = [] if script == 'compose-silo.py' else [name]
    with (root / (name + '-' + stage + '-v1.log')).open('w') as log:
        subprocess.run(['python3', 'scripts/m1/soviet-remaining/' + script, *args],
                       env=task_env, stdout=log, stderr=subprocess.STDOUT, check=True)
    print(name, stage, 'PASS', flush=True)
    return out


selection = {}
for name in names:
    base = run(commands[name], name, 'base', SOVIET_RIGID_BUILD_PENDING='1')
    previous = base
    if name != 'NAWALL':
        previous = run('correct-motion-r2.py', name, 'motion', stages['base'])
    if name in ['NADEPT', 'NAPSIS']:
        previous = run('correct-parts-r3.py', name, 'parts', stages['motion'])
    target = stages['remap'] / name
    if not target.exists():
        shutil.copytree(previous, target)
    report = json.loads((target / 'candidate-review.json').read_text())
    if name == 'NAWALL':
        assert all(not r['member'].endswith('mk.shp') for r in report['frames'])
        report['status'] = 'COMPLETE_EXPORT_CANDIDATE_VISUAL_QA_PENDING'
    assert report['density'] == 4 and report['status'] != 'BASE_EXPORT_RIGID_BUILD_CORRECTION_REQUIRED'
    rows = []
    for row in report['frames']:
        if name == 'NAWALL' or (not row['member'].endswith('mk.shp') and name not in ['NARADR', 'NADEPT', 'NAPSIS', 'NAMISL']):
            continue
        for e in row['exports']:
            image = np.array(Image.open(target / e['base']).convert('RGBA'))
            red, green, blue = np.moveaxis(image[..., :3].astype(float), 2, 0)
            data = np.array(Image.open(target / e['data']).convert('RGBA'))
            paint = ((red > green * 1.65) & (red > blue * 1.65) & (red - np.maximum(green, blue) > 14)
                     & ((blue > green * .48) | (green < red * .32)) & (image[..., 3] > 0))
            paint |= (data[..., 0] > 0) & (image[..., 3] > 0)
            shades = np.abs(red[..., None] - np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4).argmin(2)
            data[..., :3] = 0
            data[..., 3] = 255
            data[..., 0][paint] = 255
            data[..., 1][paint] = shades[paint]
            Image.fromarray(data).save(target / e['data'])
            assert (target / e['base']).read_bytes() == (previous / e['base']).read_bytes()
            e.update(remapPixels=int(paint.sum()), shades=np.unique(shades[paint]).tolist())
            rows.append({'member': row['member'], 'nativeFrame': row['nativeFrame'], 'remapPixels': int(paint.sum())})
    report['ownerMaterialCorrection'] = {'method': 'Accepted R3 authored paint chroma; RGB byte preserved', 'previous': str(previous)}
    (target / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
    (root / (name + '-remap-validation-v1.json')).write_text(json.dumps({'status': 'PASS', 'frames': rows}, indent=2) + '\n')
    if name == 'NAMISL':
        target = run('correct-silo-r4.py', name, 'final', stages['remap'],
                     SOVIET_SELECTION_OUTPUT=str(root / 'silo-selection-v1.json'),
                     SOVIET_SCOPE_OUTPUT=str(root / 'silo-scope-v1.json'))
    selection[name] = {'exports': str(target), 'sha256': hashlib.sha256((target / 'candidate-review.json').read_bytes()).hexdigest()}
    print(name, 'FINAL_TRUE_4X_EXPORT_PASS', flush=True)
(root / 'soviet-production-selection-v1.json').write_text(json.dumps(selection, indent=2) + '\n')
