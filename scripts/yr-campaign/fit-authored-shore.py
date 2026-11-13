"""Pin original shore geometry separately from immutable authored RGB detail."""
import argparse
import copy
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, optimize, special

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_registration import capacity, register, sha
from showcase_shore import MEMBERS, sample_authored_shore


def primary(mask):
    labels, count = ndimage.label(mask, np.ones((3, 3)))
    assert count
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    assert sizes.max() > 8
    return ndimage.binary_fill_holes(labels == sizes.argmax())


def material_ownership(rgb, active, reference_colors=()):
    red, green, blue = np.moveaxis(rgb.astype(float), -1, 0)
    sand = primary(active & (red-green > 15) & (red-blue > 28))
    sea = (blue-green > 6) & (blue-red > 6)
    for color in reference_colors:
        assert len(color) == 3 and all(0 <= int(value) <= 252 for value in color)
        sea |= np.all(rgb == color, axis=2)
    deep = primary(active & sea)
    assert not (sand & deep).any()
    return dict(sand=sand, deep=deep)


def fit_curve(along, across, target, active):
    s, t, labels = along[active], across[active], target[active].astype(float)
    features = np.polynomial.polynomial.polyvander(s, 5)
    initial = np.zeros(6)
    initial[0] = (t[labels == 0].mean() + t[labels == 1].mean()) / 2
    sigma, penalty = .65, .000003

    def loss(coefficients):
        z = (t-features @ coefficients) / sigma
        value = (np.logaddexp(0, z)-labels*z).mean() + penalty*np.square(coefficients[2:]).sum()
        gradient = features.T @ (labels-special.expit(z)) / (sigma*len(t))
        gradient[2:] += 2*penalty*coefficients[2:]
        return value, gradient

    result = optimize.minimize(loss, initial, jac=True, method='L-BFGS-B',
                               options=dict(maxiter=1500, ftol=1e-12, gtol=1e-8))
    assert result.success, result.message
    predicted = t > features @ result.x
    dice = 2*(predicted & (labels > 0)).sum() / (predicted.sum()+labels.sum())
    return result.x.tolist(), dict(dice=float(dice), loss=float(result.fun),
                                   categoricalPixels=int(len(t)), sourcePixelsRendered=0)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipe', type=Path)
parser.add_argument('geometry', type=Path)
parser.add_argument('output_recipe', type=Path)
parser.add_argument('--water-color-control', type=Path)
args = parser.parse_args()
recipe = json.loads(args.recipe.read_text())
authoring = Path(recipe['referenceAuthoring']['directory'])
source = json.loads((authoring / 'source.json').read_text())
layout = json.loads((authoring / 'layout.json').read_text())
masters = {master['member']: master for master in recipe['masters']}
assert recipe['theater'] == 'NEWURBAN' and recipe['editions'] == ['yr'] and set(masters) == MEMBERS
assert sha(authoring / 'source.json') == recipe['referenceAuthoring']['sourceSha256']
assert sha(authoring / 'layout.json') == recipe['referenceAuthoring']['layoutSha256']
assert not args.geometry.exists() and not args.output_recipe.exists()
args.geometry.mkdir()
models, mothers = {}, {}
water_control = None
if args.water_color_control:
    control = json.loads(args.water_color_control.read_text())
    assert control['schema'] == 'yr-original-water-palette-control-v1'
    assert control['source'] == dict(member='water04.ubn',
        sha256='77f2b0f40936fd936f3d36ee5ffbf01e5d39a152299fbc10046672588cc97c93')
    assert control['palette'] == dict(member='isoubn.pal',
        sha256='1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676')
    water_control = dict(file=str(args.water_color_control.resolve()), sha256=sha(args.water_color_control),
        source=control['source'], palette=control['palette'])
for member in source['members']:
    name = member['member']
    if name not in masters:
        continue
    master, info = masters[name], layout[name]
    assert sha(master['file']) == master['sha256'] and master['sourceSha256'] == member['native']['sha256']
    info = {**info, 'slotRect': master['slotRect'], 'occupied': master['occupied'], 'alphaCutoff': 180}
    rect, plate = register(Image.open(master['file']).convert('RGBA'), info, master['boardSize'],
                           isolated=info['occupied'] == 1)
    assert capacity(rect, info['nativeAlphaBounds']) >= 4
    native_file = authoring / (name + '-native.png')
    native = np.asarray(Image.open(native_file).convert('RGBA'))
    active = native[..., 3] > 0
    original = material_ownership(native[..., :3], active, control['colors'] if water_control else ())
    left, top, right, bottom = info['nativeAlphaBounds']
    center = np.asarray(native.shape[1::-1]) / 2
    yy, xx = np.indices(active.shape) + .5
    water_center = np.asarray([xx[original['deep']].mean(), yy[original['deep']].mean()])
    land_center = np.asarray([xx[original['sand']].mean(), yy[original['sand']].mean()])
    normal = water_center-land_center
    normal /= np.linalg.norm(normal)
    x, y = xx-center[0], yy-center[1]
    along = -normal[1]*x + normal[0]*y
    along_scale = max(abs(along[active]).max(), 1)
    along /= along_scale
    across = normal[0]*x + normal[1]*y
    model = dict(schema='yr-source-pinned-shore-contact-v1', member=name,
        sourceSha256=member['native']['sha256'], paletteSha256=member['native']['palette']['sha256'],
        nativeAssemblySha256=sha(native_file), masterSha256=master['sha256'], registeredSourceRect=rect,
        nativeAlphaBounds=info['nativeAlphaBounds'], logical=info['bounds'][2:],
        center=center.tolist(), normal=normal.tolist(), alongScale=float(along_scale),
        sourceCurves={}, transitionWidth=4, roleColorOffsets={},
        samplingPolicy=dict(schema='yr-source-pinned-shore-contacts-v1', shapeWarp=False),
        fitEvidence={}, sourceRgbUsedAsOutputTexture=False, visualReview='PENDING')
    if water_control:
        model.update(originalWaterColorControl=water_control,
            seaContactPolicy='INDEPENDENT_SOURCE_SAND_AND_DEEP_CURVES',
            seaSampling='REPEAT_PINNED_INDEPENDENT_DENSITY_HD_INTERIOR')
    for key, ownership in [('sourceCurves', original)]:
        model['fitEvidence'][key] = {}
        for role in ['sand', 'deep']:
            target = ~ownership['sand'] if role == 'sand' else ownership['deep']
            coefficients, evidence = fit_curve(along, across, target, active)
            model[key][role] = coefficients
            model['fitEvidence'][key][role] = evidence
    sample = sample_authored_shore(model, plate, 4)
    colors = {}
    for role, mask in [('sand', active & original['sand']),
                       ('shallow', active & ~original['sand'] & ~original['deep'])]:
        assert mask.sum() > 8
        source_mean = native[..., :3][mask].mean(0)
        painted_mean = sample[mask.repeat(4, 0).repeat(4, 1)].mean(0)
        model['roleColorOffsets'][role] = (source_mean-painted_mean).tolist()
        colors[role] = dict(sourceMean=source_mean.tolist(), authoredMean=painted_mean.tolist())
    model['broadRoleColorRegistration'] = colors
    model['method'] = ('Fit continuous original sea contacts from categorical material ownership. '
        'Sample every immutable mother independently at each density without shape warping. Source RGB supplies '
        'two broad role colors only; no retail pixels, native cell means, blur, sharpening or added grain are rendered. '
        'Use the accepted independent-density sea interior beyond the original sea contact. Preserve all native metadata and alpha.')
    file = args.geometry / (name.replace('.', '-') + '.json')
    file.write_text(json.dumps(model, indent=2) + '\n')
    models[name] = dict(sourceSha256=model['sourceSha256'], paletteSha256=model['paletteSha256'],
                        file=str(file.resolve()), sha256=sha(file))
    mothers[name] = {key: master[key] for key in ['file', 'sha256', 'boardSize']}
    print(json.dumps(dict(member=name, sourceDice={role: round(value['dice'], 4)
        for role, value in model['fitEvidence']['sourceCurves'].items()},
        broadRoleOffsets={role: np.round(value, 1).tolist() for role, value in model['roleColorOffsets'].items()})))
assert set(models) == MEMBERS
previous = json.loads(Path('docs/campaign-art/yr-v1/terrain-newurban-shore-recipe-r4.json').read_text())
result = copy.deepcopy(recipe)
result['materialProfile'] = dict(sourcePinnedShoreMaterials=models, shoreAuthoredMothers=mothers,
    acceptedShoreWater=previous['materialProfile']['acceptedShoreWater'])
result['policy'] = ('Reconstruct all eleven source shorelines with immutable authored mothers and continuous '
    'original sea-contact geometry. Retain all native metadata and alpha, original colors and '
    'source event behavior, and every accepted terrain payload. Source categorical geometry is separate from '
    'new RGB texture. Match the existing independent 2X/4X sea material at deep-water contacts.')
args.output_recipe.write_text(json.dumps(result, indent=2) + '\n')
(args.geometry / 'index.json').write_text(json.dumps(dict(schema='yr-source-pinned-shore-contact-index-v1',
    inputRecipe=str(args.recipe.resolve()), inputRecipeSha256=sha(args.recipe), members=models,
    outputRecipe=str(args.output_recipe.resolve()), outputRecipeSha256=sha(args.output_recipe),
    sourcePixelsRendered=0, visualReview='PENDING'), indent=2) + '\n')
