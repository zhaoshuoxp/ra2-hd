"""Reuse the verified accepted road lane as independent clean asphalt planes."""
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
parser.add_argument('road_sources', type=Path)
parser.add_argument('source_audit', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
document, roads, audit = read(args.regions), read(args.road_sources/'source.json'), read(args.source_audit)
source_pack, = [pack for pack in roads['packs'] if pack['theater'] == 'NEWURBAN']
source, = [row for row in source_pack['records'] if row['member'] == 'droads24.ubn']
native_frame = source['frames'][0]
native_file = args.road_sources/native_frame['file']
assert sha(native_file) == native_frame['sha256']
native = np.frombuffer(native_file.read_bytes(), np.uint8).reshape(30, 60, 4)
pack = Path('.local/terrain-packs')/source_pack['pointer']['revision']
assert sha(pack/'manifest.json') == source_pack['pointer']['sha256']
manifest = read(pack/'manifest.json')
group, = [group for group in manifest['groups'] if group['id'] == source['group']]
offset = 0
for member in group['members']:
    if member['member'] == source['member']:
        break
    offset += len(member['images'])
assert member['sourceHashes']['yr'] == source['sourceHashes']['yr']
sampling = dict(schema='accepted-road-asphalt-plane-v1', longitudinalRange=[.1, .9], nativeCrossRange=[-20, -12])
# Original RGB supplies palette/material controls only. Resource RGB comes from
# the independently authored accepted density atlases below.
yy, xx = np.indices((30, 60))
xx, yy = xx+.5, yy+.5
u = xx/60+yy/30-.5
repeat = (u-.1) % 1.6
u = .1+np.minimum(repeat, 1.6-repeat)
v = (30-(-20+(xx-2*yy) % 8))/60
sx = np.clip(np.floor(30+30*(u-v)).astype(int), 0, 59)
sy = np.clip(np.floor(15*(u+v)).astype(int), 0, 29)
controls = native[sy, sx]
assert np.all(controls[..., 3] == 255)
native_mean = controls[..., :3].mean((0, 1))
assert not args.output.exists()
args.output.mkdir(parents=True)
samples, source_densities = {}, {}
for density in [2, 4]:
    variant, = [variant for variant in group['variants'] if variant['density'] == density]
    file = pack/variant['file']; assert sha(file) == variant['sha256']
    atlas = np.memmap(file, dtype=np.uint8, mode='r', shape=(variant['size'][1], variant['size'][0], 4))
    x, y, width, height = variant['rects'][offset]
    assert [width, height] == [60*density, 30*density]
    pixels = sample_accepted_plane(atlas[y:y+height, x:x+width], sampling, density)
    red, green, blue = np.moveaxis(pixels[..., :3].astype(int), -1, 0)
    assert not np.any((red > 100) & (green > 85) & (red-blue > 45) & (green-blue > 35))
    assert not np.any((red > 150) & (green > 150) & (blue > 140))
    target = args.output/f'accepted-road-asphalt-{density}x.png'
    Image.fromarray(pixels).save(target)
    samples[density] = pixels
    source_densities[str(density)] = dict(file=str(target.resolve()), sha256=sha(target),
        rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest(), size=[width, height],
        sourceAtlas=variant['file'], sourceAtlasSha256=variant['sha256'], sourceRect=[x, y, width, height])
independent = float(np.mean(np.any(samples[4][..., :3] != samples[2][..., :3].repeat(2, 0).repeat(2, 1), axis=2)))
assert independent > .9
records = []
for name, roles in document['members'].items():
    if 'asphalt' not in roles:
        continue
    row, = [row for row in audit['records'] if row['member'] == name and row['role'] == 'asphalt']
    error = float(np.abs(native_mean-np.asarray(row['best'][0]['targetMean'])).mean())
    assert error <= 4, (name, error)
    roles['asphalt'] = dict(donor=dict(group=group['id'], member=source['member'], subTile=0, edition='yr',
        sourceSha256=source['sourceHashes']['yr']), acceptedSelection=source_pack['pointer'], donorTheater='NEWURBAN',
        sampling=sampling, densities=copy.deepcopy(source_densities),
        sourceRegionControls=dict(controlPixels=1800, exactFraction=None, meanChannelError=None,
            withinThreePaletteSteps=None, meanColorDifference=error, coverageFraction=1,
            nativeMaterialCoverage=1, requiredNativeMaterialCoverage=0, sourceSwatchMean=native_mean.tolist(),
            wholeImageReuseQualified=False))
    records.append(dict(member=name, sourceMeanColorDifference=error,
        independent4xTexelFraction=independent, interpolationOrFiltering=False, sourceRgbUsedAsOutputTexture=False))
document['cleanAsphaltPlanes'] = records
document['verifiedRoadLane'] = dict(sourceFile=str((args.road_sources/'source.json').resolve()),
    sourceSha256=sha(args.road_sources/'source.json'), acceptedSelection=source_pack['pointer'],
    sampling=sampling, reference='Road-slope R4 clean lane, validated across 143 available original road maps at 2X/4X.')
document['status'] = 'SOURCE_QUALIFIED_GENUINE_HD_ASPHALT_PLANES_EXPORT_AND_NATIVE_REVIEW_PENDING'
(args.output/'regions.json').write_text(json.dumps(document, indent=2)+'\n')
print(json.dumps(dict(targets=records, nativeMean=native_mean.tolist(), independent4xTexelFraction=independent)))
