#!/usr/bin/env python3
"""Validate an independent terrain batch against its actual copied evidence."""
import argparse
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('delivery', type=Path)
parser.add_argument('--batch', type=int, required=True)
parser.add_argument('--base-receipt', type=Path, required=True)
args = parser.parse_args()
root = args.delivery.resolve()
package = read(root / 'package-receipt.json')
handoff = read(root / 'artwork-source-handoff.json')
receipt = read(args.base_receipt)
receipt.pop('authorizedRepair', None)
delta = read(root / f'Evidence/snow-batch{args.batch}-coverage-delta-v1.json')
selection = read(Path(package['resources']) / 'terrain-snow-selection.json')
assert selection == delta['selectedTerrain'], 'Copied terrain selection differs from coverage evidence'
manifest = Path(package['resources']) / 'terrain-packs' / selection['revision'] / 'manifest.json'
assert sha(manifest) == selection['sha256']
for row in handoff['files']:
    path = root / row['file']
    assert path.stat().st_size == row['bytes'] and sha(path) == row['sha256'], row['file']
app = Path(package['app'])
links = [path for path in app.rglob('*') if path.is_symlink()]
assert all(path.resolve().is_relative_to(app.resolve()) for path in links), 'External app dependency'
receipt.update(
    schema=f'm2-4-snow-batch{args.batch}-delivery-validation-v1',
    technicalStatus='PASS', visualStatus='PENDING_USER_REVIEW', windowsStatus='NOT_RUN',
    milestoneStatus='INCOMPLETE', sourceHead=package['sourceHead'],
    runtimeSourceHead=package['runtimeSourceHead'], sourceDirtyAtPackage=package['sourceDirty'],
    target=package['target'], app=package['app'], resources=package['resources'],
    profile=package['profile'], packageReceiptSha256=sha(root / 'package-receipt.json'),
    resourceFiles=package['resourceFiles'], uiResourceFiles=package['uiResourceFiles'],
    noExternalSymlinks=True, internalFrameworkSymlinks=len(links),
    terrainManifestSha256=selection['sha256'],
    authoringHandoffSha256=sha(root / 'artwork-source-handoff.json'),
    authoringFiles=len(handoff['files']))
receipt.pop('sourceDirtyAtBuild', None)
receipt['evidence'] = [{key: row[key] for key in ('file', 'bytes', 'sha256')}
                       for row in handoff['files'] if row['file'].startswith('Evidence/')]
receipt['native'] = {}
routes = []
for density in ('2x', '4x', 'original'):
    relative = f'Evidence/native-snow-batch{args.batch}-{density}-v1/report.json'
    path = root / relative
    report = read(path)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    allocation = report.get('combinedWorldAllocation')
    if density != 'original':
        assert allocation and allocation['total'] <= allocation['limit']
    else:
        fallback = report['fallback']
        assert fallback['glError'] == 0
        for kind in ('terrain', 'environment'):
            assert fallback[kind]['gpuBytes'] == fallback[kind]['worldChargeBytes'] == 0
    routes.append(report['captureRoute'])
    receipt['native'][density] = dict(report=relative, sha256=sha(path),
                                     status=report['status'], allocation=allocation, errors=0)
assert routes[0] == routes[1] == routes[2], 'Review camera routes differ'
ui = read(root / f'Evidence/snow-batch{args.batch}-review-ui-v1/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS'
assert not ui['errors']
review = root / 'Review/index-embedded.html'
review_manifest = read(root / 'Review/review-manifest.json')
for row in review_manifest['files']:
    assert not row['rescaled'] and sha(root / 'Review' / row['file']) == row['sha256']
receipt['review'] = dict(file='Review/index-embedded.html', sha256=sha(review),
                         bytes=review.stat().st_size, embeddedImages=len(review_manifest['files']),
                         uiStatus=ui['status'])
receipt['remaining']['SNOW'] = delta['remainingSnow']['total']
output = root / 'validation-receipt.json'
with output.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', receiptSha256=sha(output), files=len(handoff['files']),
                      internalSymlinks=len(links), review=receipt['review'])))
