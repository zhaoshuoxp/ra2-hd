"""Read-only original coastline registration using the retained bounded-fit method."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, optimize

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipe', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
recipe = json.loads(args.recipe.read_text())
resolve = lambda name: (args.recipe.resolve().parent / name).resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
original_file, atlas_file = resolve(recipe['original']), resolve(recipe['atlas'])
assert sha(original_file) == recipe['originalPngSha256']
assert sha(atlas_file) == recipe['atlasSha256'] == 'cac525710da77cac0c9be65917bf60c195f4934c1ca22f3701d42f857f0059f8'
original = np.array(Image.open(original_file).convert('RGB'))
master = np.array(Image.open(atlas_file).convert('RGB'))
assert original.shape == (520, 800, 3) and master.shape == (821, 1915, 3)
source_land = ndimage.binary_opening(original.max(2) > 32, np.ones((3, 3)))
wrapped = recipe.get('wrapLongitude', False)
master_land = ndimage.binary_opening((master[:, 155:] if wrapped else master).max(2) > 24, np.ones((3, 3))).astype(float)
probe = recipe['registrationProbe']
allowed = np.zeros((520, 800), bool)
for x, y, width, height in probe['sourceRegions']:
    assert 0 < x < x + width < 800 and 0 < y < y + height < 520
    allowed[y:y + height, x:x + width] = True
for x, y, width, height in probe.get('sourceExclusions', []):
    allowed[y:y + height, x:x + width] = False
yy, xx = np.nonzero(allowed & (np.indices(allowed.shape)[0] % 2 == 0) & (np.indices(allowed.shape)[1] % 2 == 0))
target = source_land[yy, xx].astype(float)
assert len(target) > 1000 and target.any()


def sample(parameters, x, y):
    scale, tx, ty = parameters
    sx = ((x - tx) / scale - 155) % 1760 if wrapped else (x - tx) / scale
    return ndimage.map_coordinates(master_land, [(y - ty) / scale, sx], order=1, mode='constant')


def score(parameters):
    mapped = sample(parameters, xx, yy)
    return 1 - (2 * (mapped * target).sum() + 1) / (mapped.sum() + target.sum() + 1)


fit = optimize.differential_evolution(score, probe['bounds'], seed=0, tol=1e-8, popsize=14, maxiter=120, polish=True)
scale, tx, ty = map(float, fit.x)
locator = probe['nativeLocator']
source_locator = [155 + (((locator[0] - tx) / scale - 155) % 1760) if wrapped else (locator[0] - tx) / scale,
                  (locator[1] - ty) / scale]
assert 155 <= source_locator[0] <= 1915 and 0 <= source_locator[1] <= 821
args.output.mkdir(exist_ok=False)
report = dict(status='READ_ONLY_BOUNDED_LANDMASK_REGISTRATION_PROBE', originalPngSha256=sha(original_file),
    atlasSha256=sha(atlas_file), recipeSha256=sha(args.recipe), uniformScale=scale, offset=[tx, ty],
    landDice=float(1 - fit.fun), sourceRegions=probe['sourceRegions'], targetLocator=locator,
    masterLocator=source_locator, wrapLongitude=wrapped, uniqueCycle=[155, 1915] if wrapped else None,
    qualification='Retained bounded coast/land-mask fit. Original political-state samples and native layout require separate validation; whole-world pixel identity and pristine equivalence are not inferred.')
(args.output / 'uniform-fit.json').write_text(json.dumps(report, indent=2) + '\n')
yy, xx = np.indices((520, 800)); mapped = sample(fit.x, xx, yy) > .5
board = np.zeros((520, 800, 3), np.uint8)
board[allowed & source_land] = [210, 75, 65]
board[allowed & mapped] = [65, 110, 210]
board[allowed & source_land & mapped] = [215, 215, 215]
Image.fromarray(board).save(args.output / 'fit-land-overlap.png')
print(json.dumps(report))
