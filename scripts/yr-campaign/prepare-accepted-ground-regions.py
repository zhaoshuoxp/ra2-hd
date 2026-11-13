"""Retain exact accepted density crops for source-scoped ground composition."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('audit', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--geometry', type=Path,
    help='Validate NewUrban flat material coverage and exclude road paint from asphalt joins.')
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
audit = read(args.audit)
assert audit['materialSemanticsConstrained'] and audit['runtimeSelectionsChanged'] == 0
selected = audit['acceptedSelection']
root = Path('.local/terrain-packs') / selected['revision']
assert sha(root / 'manifest.json') == selected['sha256']
manifest = read(root / 'manifest.json')
assert manifest['theater'] == audit['theater'] and audit['theater'] in {'URBAN', 'NEWURBAN'}
assert not args.output.exists()
args.output.mkdir(parents=True)
cache, members, selections = {}, {}, {selected['sha256']: manifest}
geometry = {}
if args.geometry:
    assert audit['theater'] == 'NEWURBAN' and audit.get('materialColorControls')
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
    from showcase_urban_ground import partition_weights
    geometry = {row['member']: read(Path(row['file'])) for row in read(args.geometry)['records']}
for row in audit['records']:
    donor = row['best'][0]
    candidate_checks = []
    if geometry and row['role'] == 'asphalt':
        document = geometry[row['member']]
        assert document['sourceSha256'] == row['targetSourceSha256']
        native = np.asarray(Image.open(args.geometry.parent.parent / 'authoring-r1'
            / (row['member']+'-native.png')).convert('RGBA'))
        for candidate in row['best']:
            if candidate['coverageFraction'] != 1 or candidate['meanColorDifference'] > 4:
                continue
            pointer = candidate['acceptedSelection']
            candidate_root = Path('.local/terrain-packs') / pointer['revision']
            assert sha(candidate_root/'manifest.json') == pointer['sha256']
            candidate_manifest = read(candidate_root/'manifest.json')
            group, = [group for group in candidate_manifest['groups'] if group['id'] == candidate['group']]
            offset = 0
            for member in group['members']:
                if member['member'] == candidate['member']:
                    break
                offset += len(member['images'])
            checks = []
            for variant in group['variants']:
                density = variant['density']
                file = candidate_root/variant['file']
                if file not in cache:
                    assert sha(file) == variant['sha256']
                    cache[file] = np.memmap(file, dtype=np.uint8, mode='r',
                        shape=(variant['size'][1], variant['size'][0], 4))
                x, y, width, height = variant['rects'][offset+candidate['subTile']]
                pixels = cache[file][y:y+height, x:x+width]
                active = native[..., 3].repeat(density, 0).repeat(density, 1) > 0
                assigned = (partition_weights(document['model'], density)['asphalt'] > 0) & active
                red, green, blue = np.moveaxis(pixels[..., :3].astype(int), -1, 0)
                paint = (red > 100) & (green > 85) & (red-blue > 45) & (green-blue > 35)
                checks.append(dict(density=density, assignedPixels=int(assigned.sum()),
                    foreignPaintPixels=int((paint & assigned).sum()),
                    missingOpaquePixels=int((assigned & (pixels[..., 3] != 255)).sum())))
            accepted = all(not check['foreignPaintPixels'] and not check['missingOpaquePixels'] for check in checks)
            candidate_checks.append(dict(member=candidate['member'], subTile=candidate['subTile'],
                accepted=accepted, densities=checks))
            if accepted:
                donor = candidate
                break
        else:
            raise AssertionError(('No paint-free accepted asphalt region', row['member'], candidate_checks))
    if audit.get('materialColorControls'):
        assert audit['theater'] == 'NEWURBAN'
        assert donor['coverageFraction'] == 1 and donor['meanColorDifference'] <= 4
        minimum_coverage = row['requiredNativeMaterialCoverage']
        assert minimum_coverage == (0 if row['role'] in {'grass', 'asphalt'} else .95)
        assert donor['nativeMaterialCoverage'] >= minimum_coverage
        if row['role'] == 'grass':
            assert donor['member'].startswith('clear01') and donor['donorTheater'] == 'NEWURBAN'
        if row['role'] == 'asphalt':
            assert donor['member'].startswith('droads') and donor['donorTheater'] == 'NEWURBAN'
    else:
        assert donor['meanChannelError'] <= 4
    donor_selection = donor.get('acceptedSelection', selected)
    donor_root = Path('.local/terrain-packs') / donor_selection['revision']
    if donor_selection['sha256'] not in selections:
        assert sha(donor_root / 'manifest.json') == donor_selection['sha256']
        selections[donor_selection['sha256']] = read(donor_root / 'manifest.json')
    donor_manifest = selections[donor_selection['sha256']]
    assert donor_manifest['theater'] == donor.get('donorTheater', audit['theater'])
    group, = [group for group in donor_manifest['groups'] if group['id'] == donor['group']]
    offset = 0
    for member in group['members']:
        if member['member'] == donor['member']:
            break
        offset += len(member['images'])
    else:
        raise AssertionError('Accepted donor member absent')
    assert donor['sourceSha256'] == member['sourceHashes'][donor['edition']]
    metadata = member['images'][donor['subTile']]
    assert metadata['logical'] == [60, 30] and metadata['offset'] == [0, 0]
    assert metadata['rampType'] == 0 and not metadata['hasExtraData']
    densities = {}
    for density in [2, 4]:
        variant, = [variant for variant in group['variants'] if variant['density'] == density]
        file = donor_root / variant['file']
        if file not in cache:
            assert sha(file) == variant['sha256']
            cache[file] = np.memmap(file, dtype=np.uint8, mode='r',
                shape=(variant['size'][1], variant['size'][0], 4))
        x, y, width, height = variant['rects'][offset + donor['subTile']]
        assert [width, height] == [60*density, 30*density]
        pixels = np.array(cache[file][y:y+height, x:x+width])
        name = row['member'].replace('.', '-') + '-' + row['role'] + f'-{density}x.png'
        target = args.output / name
        Image.fromarray(pixels).save(target)
        densities[str(density)] = dict(file=str(target.resolve()), sha256=sha(target),
            rgbaSha256=hashlib.sha256(pixels.tobytes()).hexdigest(), size=[width, height],
            sourceAtlas=variant['file'], sourceAtlasSha256=variant['sha256'],
            sourceRect=[x, y, width, height])
    members.setdefault(row['member'], {})[row['role']] = dict(
        donor={key: donor[key] for key in ['group', 'member', 'subTile', 'edition', 'sourceSha256']},
        sourceRegionControls=dict(controlPixels=row['controls'], exactFraction=donor['exactFraction'],
            meanChannelError=donor['meanChannelError'], withinThreePaletteSteps=donor['withinThreePaletteSteps'],
            meanColorDifference=donor.get('meanColorDifference'), coverageFraction=donor.get('coverageFraction'),
            nativeMaterialCoverage=donor.get('nativeMaterialCoverage'),
            requiredNativeMaterialCoverage=row.get('requiredNativeMaterialCoverage'),
            wholeImageReuseQualified=False), candidateMaterialChecks=candidate_checks,
        acceptedSelection=donor_selection,
        donorTheater=donor_manifest['theater'], densities=densities)
document = dict(schema='yr-accepted-ground-pixel-regions-v1',
    status='EXACT_ACCEPTED_DENSITY_PIXELS_EXTRACTED_SOURCE_TARGET_AND_VISUAL_PENDING',
    acceptedSelection=selected, sourceRegionAudit=dict(file=str(args.audit.resolve()), sha256=sha(args.audit)),
    theater=audit['theater'], materialColorControls=audit.get('materialColorControls', False),
    semanticRoleControls=audit.get('materialColorControls', False),
    flatGeometrySource=dict(file=str(args.geometry.resolve()), sha256=sha(args.geometry)) if args.geometry else None,
    members=members, newArtwork=0, nativeRgbUsedAsOutputTexture=False,
    qualification='Source material roles and palette controls select accepted HD crops. Complete original-image equality is not claimed. Target source/geometry, accepted pixel provenance and native visual context remain separate checks.')
(args.output / 'regions.json').write_text(json.dumps(document, indent=2) + '\n')
print(json.dumps(dict(members=len(members), materialRegions=sum(len(row) for row in members.values()),
    independentDensities=[2, 4], output=str(args.output))))
