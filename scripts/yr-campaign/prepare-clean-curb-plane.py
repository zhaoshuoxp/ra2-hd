"""Compose a curb plane from genuine independent accepted HD interior texels."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'m2'))
from showcase_urban_ground import sample_accepted_plane

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('regions', type=Path)
parser.add_argument('swatch_audit', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
document, audit = read(args.regions), read(args.swatch_audit)
assert audit['regionsSha256'] == sha(args.regions)
assert audit['targetMember'] == 'pavfxb03.ubn'
assert document['theater'] == 'NEWURBAN' and document['semanticRoleControls']
source = document['members']['pavefx04.ubn']['sidewalk']
assert source['donor'] == audit['donor']
candidates = [row for row in audit['candidates'] if row['opaqueFraction'] == 1
    and row['materialCoverage'] >= .95 and row['meanColorDifference'] <= 4]
candidate = max(candidates, key=lambda row: row['rect'][2]*row['rect'][3])
specification = dict(schema='accepted-fixed-scale-plane-v1', nativeRect=candidate['rect'],
    quarterTurns=1, repeat='mirror')
originals = {}
for density in [2, 4]:
    sample = source['densities'][str(density)]
    file = Path(sample['file'])
    assert sha(file) == sample['sha256']
    originals[density] = np.asarray(Image.open(file).convert('RGBA'))
x, y, width, height = candidate['rect']
low = originals[2][y*2:(y+height)*2, x*2:(x+width)*2, :3].repeat(2, 0).repeat(2, 1)
high = originals[4][y*4:(y+height)*4, x*4:(x+width)*4, :3]
independent = float(np.mean(np.any(high != low, axis=2)))
assert independent > .9, 'A retained native-pixel border cannot supply the new HD material plane'
assert not args.output.exists()
args.output.mkdir(parents=True)
region = copy.deepcopy(source)
region['sampling'] = specification
region['sourceRegionControls'] = dict(controlPixels=width*height,
    exactFraction=None, meanChannelError=None, withinThreePaletteSteps=None,
    meanColorDifference=candidate['meanColorDifference'], coverageFraction=1,
    nativeMaterialCoverage=candidate['materialCoverage'], requiredNativeMaterialCoverage=.95,
    sourceSwatchMean=candidate['mean'], wholeImageReuseQualified=False,
    sourceSwatchAudit=dict(file=str(args.swatch_audit.resolve()), sha256=sha(args.swatch_audit)))
for density in [2, 4]:
    pixels = sample_accepted_plane(originals[density], specification, density)
    file = args.output/f'pavfxb03-ubn-sidewalk-{density}x.png'
    Image.fromarray(pixels).save(file)
    region['densities'][str(density)].update(file=str(file.resolve()), sha256=sha(file),
        rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest())
document['members']['pavfxb03.ubn']['sidewalk'] = region
document['cleanCurbPlane'] = dict(targetMember='pavfxb03.ubn', role='sidewalk',
    sourceRegions=dict(file=str(args.regions.resolve()), sha256=sha(args.regions)),
    sampling=specification, independent4xTexelFraction=independent,
    nativePixelBorderEnlarged=False, interpolationOrFiltering=False, sourceRgbUsedAsOutputTexture=False)
document['status'] = 'ACCEPTED_HD_INTERIOR_CURB_PLANE_PREPARED_EXPORT_AND_NATIVE_REVIEW_PENDING'
(args.output/'regions.json').write_text(json.dumps(document, indent=2)+'\n')
print(json.dumps(dict(output=str(args.output), sourceNativeRect=candidate['rect'],
    sourceMeanColorDifference=candidate['meanColorDifference'], independent4xTexelFraction=independent)))
