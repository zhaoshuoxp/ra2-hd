"""Fit continuous material boundaries from pinned original flat TMP controls."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.optimize import minimize
from scipy.special import logsumexp

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('audit', type=Path)
parser.add_argument('authoring', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
audit, source = read(args.audit), read(args.authoring / 'source.json')
assert audit['theater'] == source['theater'] == 'NEWURBAN'
assert audit['materialSemanticsConstrained'] and audit['materialColorControls']
assert not args.output.exists()
args.output.mkdir(parents=True)
members = {member['member']: member for member in source['members']}
records = []
for name in dict.fromkeys(row['member'] for row in audit['records']):
    native = members[name]['native']
    assert len(native['images']) == 1
    assert native['images'][0]['logical'] == [60, 30] and native['images'][0]['rampType'] == 0
    png = args.authoring / (name + '-native.png')
    pixels = np.asarray(Image.open(png).convert('RGBA'))
    assert pixels.shape == (30, 60, 4)
    red, green, blue, alpha = np.moveaxis(pixels.astype(float), -1, 0)
    maximum, minimum = pixels[..., :3].max(2), pixels[..., :3].min(2)
    masks = {}
    if name.startswith(('pavefx', 'grfix')):
        masks['grass'] = (green-red > 8) & (green-blue > 8)
    if name.startswith(('rbfix', 'pavfxb')):
        masks['paving'] = (red-green > 32) & (red-blue > 32)
    masks['sidewalk'] = (red+green+blue > 420) & (maximum-minimum < 60)
    if name.startswith(('pavefx', 'pavfxb')):
        masks['asphalt'] = (maximum < 95) & (maximum-minimum < 24)
    assigned = np.zeros(alpha.shape, dtype=bool)
    for role, mask in masks.items():
        masks[role] = mask & (alpha > 0) & ~assigned
        assigned |= masks[role]
    rows = [row for row in audit['records'] if row['member'] == name]
    assert set(masks) == {row['role'] for row in rows}
    for row in rows:
        if window := row.get('controlWindow'):
            yy, xx = np.indices(alpha.shape)
            masks[row['role']] &= (xx >= window[0]) & (yy >= window[1]) & (xx < window[2]) & (yy < window[3])
        assert masks[row['role']].sum() == row['controls']
        assert row['targetSourceSha256'] == native['sha256']
    roles = list(masks)
    labels = np.full((30, 60), -1, dtype=int)
    for index, role in enumerate(roles):
        assert np.all(labels[masks[role]] == -1)
        labels[masks[role]] = index
    yy, xx = np.indices(labels.shape)
    x, y = (xx+.5-30)/30, (yy+.5-15)/15
    controls = labels >= 0
    targets = labels[controls]
    control_weights = np.asarray([1/masks[role].sum() for role in roles])[targets]
    control_weights /= control_weights.sum()
    models = []
    degrees = [1] if name.startswith(('pavefx', 'pavfxb')) else [1, 2]
    for degree in degrees:
        basis = [np.ones_like(x), x, y]
        if degree == 2:
            basis += [x*x, x*y, y*y]
        features = np.stack(basis, -1)[controls]
        shape = (len(roles), features.shape[1])

        def objective(flat):
            coefficients = flat.reshape(shape)
            scores = features @ coefficients.T
            norm = logsumexp(scores, axis=1)
            loss = ((norm-scores[np.arange(len(targets)), targets])*control_weights).sum()
            probabilities = np.exp(scores-norm[:, None])
            probabilities[np.arange(len(targets)), targets] -= 1
            gradient = (probabilities*control_weights[:, None]).T @ features
            regularized = coefficients.copy()
            regularized[:, 0] = 0
            loss += 1e-6*np.square(regularized).sum()
            gradient += 2e-6*regularized
            return loss, gradient.ravel()

        fit = minimize(objective, np.zeros(shape).ravel(), jac=True, method='L-BFGS-B',
            options={'maxiter': 4000, 'ftol': 1e-13, 'gtol': 1e-8})
        assert fit.success, fit.message
        coefficients = fit.x.reshape(shape)
        accuracy = float(np.mean((features @ coefficients.T).argmax(1) == targets))
        models.append(dict(degree=degree, coefficients=coefficients.tolist(), seedAgreement=accuracy))
        if accuracy >= .995:
            break
    model = max(models, key=lambda item: (item['seedAgreement'], -item['degree']))
    assert model['seedAgreement'] >= .97, (name, models)
    model.update(kind='polynomial-material-partition', roles=roles,
        boundaryDesign='ORIGINAL_STRAIGHT_MATERIAL_BANDS' if degrees == [1] else 'ORIGINAL_GRASS_OR_PAVING_CONTACT',
        coordinateCenter=[30, 15], coordinateScale=[30, 15],
        nativeRegionColors={role: pixels[..., :3][mask].mean(0).tolist() for role, mask in masks.items()})
    document = dict(schema='yr-source-pinned-urban-ground-geometry-v1', member=name,
        sourceSha256=native['sha256'], paletteSha256=native['palette']['sha256'],
        nativeRgbaSha256=sha(png), logical=[60, 30], model=model,
        originalControlPixels=int(controls.sum()), sourceRgbUsedAsNewDetail=False,
        status='CONTINUOUS_SOURCE_BOUNDARIES_FIT_EXPORT_AND_NATIVE_REVIEW_PENDING')
    file = args.output / (name.replace('.', '-') + '.json')
    file.write_text(json.dumps(document, indent=2)+'\n')
    records.append(dict(member=name, file=str(file.resolve()), sha256=sha(file),
        degree=model['degree'], seedAgreement=model['seedAgreement']))
    print(json.dumps(records[-1]), flush=True)
(args.output/'index.json').write_text(json.dumps(dict(schema='yr-flat-ground-geometry-fit-v1',
    sourceAudit=dict(file=str(args.audit.resolve()), sha256=sha(args.audit)), records=records,
    sourceRgbUsedAsOutputTexture=False, nativeGeometryChanged=False,
    qualification='Only continuous material boundaries are fitted. Original RGB supplies role controls and palette evidence; independent accepted HD pixels supply all output material detail.'), indent=2)+'\n')
