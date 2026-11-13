"""Register each original YR loading world against the accepted relief atlas."""
import argparse
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('loading_recipes', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', default='r1')
args = parser.parse_args()
assert re.fullmatch(r'r[1-9][0-9]*', args.revision)
root = Path(__file__).resolve().parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
atlas = root / 'public/res/presentation/campaign-backdrop-world-r2a.png'
assert sha(atlas) == 'cac525710da77cac0c9be65917bf60c195f4934c1ca22f3701d42f857f0059f8'
args.output.mkdir(exist_ok=False)
index = json.loads((args.loading_recipes / 'index.json').read_text())
rows = []
for item in index['rows']:
    loading = json.loads((args.loading_recipes / item['file']).read_text())
    stem = loading['mission'][:-4]
    lunar = stem == 'sov06lmd'
    source = Path(loading['original'])
    assert sha(source) == loading['originalPngSha256']
    rgb = np.asarray(Image.open(source).convert('RGB')).astype(int)
    exclusions = [[344, 50, 298, 294], [230, 370, 302, 78], [538, 262, 245, 248],
        [638, 170, 90, 100], [231, 398, 311, 38],
        [35, 250, 205, 210] if lunar else [20, 298, 210, 208]]
    if lunar:
        exclusions.append([180, 10, 130, 130])
    allowed = np.ones((520, 800), bool)
    allowed[:8] = False; allowed[-8:] = False; allowed[:, :8] = False; allowed[:, -8:] = False
    for x, y, width, height in exclusions:
        allowed[y:y+height, x:x+width] = False
    allied = loading['faction'] == 'allied'
    channel = rgb[:, :, 2] - rgb[:, :, :2].mean(2) if allied else rgb[:, :, 0] - rgb[:, :, 1:].mean(2)

    def lines(counts):
        peaks = np.flatnonzero(counts > max(.55, counts.max() * .7))
        groups = np.split(peaks, np.flatnonzero(np.diff(peaks) > 2) + 1)
        return [float(group.mean()) for group in groups if len(group)]

    vertical = (channel - (np.roll(channel, 3, 1) + np.roll(channel, -3, 1)) / 2 > 12) & allowed
    horizontal = (channel - (np.roll(channel, 3, 0) + np.roll(channel, -3, 0)) / 2 > 12) & allowed
    xs = lines(vertical.sum(0) / np.maximum(1, allowed.sum(0)))
    ys = lines(horizontal.sum(1) / np.maximum(1, allowed.sum(1)))
    assert len(xs) >= 3 and len(ys) >= 2, (stem, xs, ys)
    step_x = float((xs[-1] - xs[0]) / (len(xs) - 1))
    step_y = float((ys[-1] - ys[0]) / (len(ys) - 1))
    assert 150 < step_x < 180 and 120 < step_y < 145, (stem, xs, ys)
    grid = np.zeros_like(allowed)
    for x in xs:
        grid[:, int(round(x))] = True
    for y in ys:
        grid[int(round(y)), :] = True
    grid &= allowed & (channel > 24) & (rgb.min(2) < 16)
    grid_colors = rgb[grid]
    ink = '#' + ''.join(f'{int(value):02x}' for value in np.median(grid_colors, axis=0))
    red, green, blue = [rgb[:, :, channel] for channel in range(3)]
    tone = ((blue > red * 1.2) & (blue > green * 1.1)) if allied else \
        ((red > green * 1.2) & (red > blue * 1.3))
    tone &= allowed & (rgb.max(2) > 32) & (rgb.min(2) >= 8) & (green >= 12)
    coordinates = np.argwhere(tone)
    assert len(coordinates) >= 100, (stem, 'Insufficient original world color samples')
    samples = [coordinates[index] for index in np.linspace(0, len(coordinates) - 1, 9, dtype=int)]
    coefficients = np.median(rgb[tone], axis=0) / 80
    monochrome = dict(schema='source-world-faction-monochrome-v1', faction=loading['faction'],
        coefficients=[round(float(value), 6) for value in coefficients], boundaryGain=2.4,
        sourceSamples=[dict(at=[int(x), int(y)], rgb=rgb[y, x].tolist()) for y, x in samples])
    native_locator = [320, 380] if lunar else [300, 240]
    recipe = dict(schema='source-pinned-loading-world-recipe-v1', original=str(source),
        originalPngSha256=loading['originalPngSha256'], source=loading['source'],
        atlas=str(atlas), atlasSha256=sha(atlas), sourceRegions=[[8, 8, 784, 504]],
        sourceExclusions=exclusions, wrapLongitude=True, politicalInkPolicy='source-mask',
        monochrome=monochrome,
        assetName='interface-world-yr-'+stem+'-'+args.revision+'.png',
        registration=dict(scale=.6328, sourceLocator=[700, 300], nativeLocator=native_locator,
            gridOrigin=[xs[0], ys[0]], gridStep=[step_x, step_y], gridInk=ink),
        registrationProbe=dict(sourceRegions=[[8, 8, 784, 504]], sourceExclusions=exclusions,
            nativeLocator=native_locator, bounds=[[.52, .74], [-1250, 450], [130, 330] if lunar else [-200, 180]]),
        originalGridEvidence=dict(vertical=xs, horizontal=ys, color=ink),
        scope='Reuse the accepted atlas. Fit only original visible world geography; exclude photos, focus map, emblem and UI pipes.')
    if stem == 'all05umd':
        # The original locator identifies southeastern Australia in this view.
        recipe['registrationProbe']['bounds'] = [[.61, .65], [-830, -740], [-90, -30]]
        recipe['registrationProbe']['sourceGeography'] = 'Original Sydney focus and Pacific-centered background.'
        recipe['atlasLandmark'] = dict(name='Southeastern Australia', at=[1648, 560],
            originalLocator=loading['sourceWorldLocator'], qualification='Region reference on the pinned accepted atlas; no exact geographic-coordinate claim.')
    target = args.output / (stem+'.json')
    target.write_text(json.dumps(recipe, indent=2)+'\n')
    rows.append(dict(mission=loading['mission'], file=target.name, sha256=sha(target), grid=recipe['originalGridEvidence']))
(args.output/'index.json').write_text(json.dumps(dict(schema='yr-loading-world-recipes-v1', rows=rows), indent=2)+'\n')
print(json.dumps(dict(missions=len(rows), reusedAtlasSha256=sha(atlas))))
